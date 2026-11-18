import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  DOCUMENT_MIME_EXTENSION,
  PRIVATE_FILE_PURPOSE,
  PRIVATE_FILE_STATUS,
  VEHICLE_DOCUMENT_TYPE,
  VEHICLE_REGISTRATION_UPLOAD_MAX_BYTES,
  VEHICLE_REGISTRATION_UPLOAD_STATUS,
  VEHICLE_REGISTRATION_UPLOAD_TTL_HOURS,
  VEHICLE_REGISTRATION_UPLOADS_PER_DAY,
  type ImageUploadMimeType,
  type VehicleRegistrationReading,
} from '@xeprime/types';
import { FILE_SIGNATURE_PREFIX_BYTES, matchesFileSignature } from '../../../common/file-signature';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { R2Service } from '../../storage/r2.service';
import { validateDocumentMetadata } from '../documents/document-metadata';
import type {
  CreateVehicleRegistrationDto,
  PresignVehicleRegistrationDto,
  VehicleRegistrationPresignDto,
  VehicleRegistrationReadResultDto,
} from './dto/vehicle-registration.dto';
import { VEHICLE_REGISTRATION_READER, type VehicleRegistrationReader } from './registration-reader';

const HOUR_MS = 60 * 60_000;

const EMPTY_READING: VehicleRegistrationReading = {
  plateNumber: null,
  holderName: null,
  holderAddress: null,
  chassisNumber: null,
  engineNumber: null,
  color: null,
};

const uploadInvalid = () =>
  new BadRequestException({
    code: API_ERROR_CODE.VEHICLE_REGISTRATION_UPLOAD_INVALID,
    message: 'Ảnh cà vẹt không còn dùng được - vui lòng tải lại ảnh cà vẹt.',
  });

const imageInvalid = () =>
  new BadRequestException({
    code: API_ERROR_CODE.VEHICLE_REGISTRATION_IMAGE_INVALID,
    message: 'Tệp tải lên không phải ảnh hợp lệ - hãy chọn ảnh JPG, PNG hoặc WEBP.',
  });

/** Đọc lại `reading_json` đã lưu — chỉ giữ các trường chuỗi đã biết, mọi thứ khác về `null`. */
function storedReading(value: Prisma.JsonValue | null): VehicleRegistrationReading {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_READING;
  const record = value as Record<string, unknown>;
  const text = (key: keyof VehicleRegistrationReading) =>
    typeof record[key] === 'string' && (record[key] as string).trim()
      ? (record[key] as string)
      : null;
  return {
    plateNumber: text('plateNumber'),
    holderName: text('holderName'),
    holderAddress: text('holderAddress'),
    chassisNumber: text('chassisNumber'),
    engineNumber: text('engineNumber'),
    color: text('color'),
  };
}

/**
 * Cà vẹt lúc TẠO ô tô (ADR 0089) — writer DUY NHẤT của `vehicle_registration_uploads`.
 *
 *  1. `presign`: lượt tải `uploading`, key do server sinh, URL PUT riêng tư sống ngắn.
 *  2. `read`: xác minh tệp (HEAD + chữ ký byte đầu), chạy máy đọc ĐỒNG BỘ (vài giây — chủ xe đang
 *     chờ ở wizard), lưu kết quả ⇒ `read`. Máy đọc hỏng/bận ⇒ vẫn `read` với mọi trường trống: ảnh
 *     là bằng chứng, chủ xe nhập tay — không bao giờ chặn tạo xe vì máy đọc.
 *  3. `attachToNewVehicleWithinTx`: trong transaction TẠO XE — giành lượt tải (`FOR UPDATE`), tạo
 *     tệp riêng tư của xe trỏ CÙNG object, giấy tờ `registration` + phiên bản 1, chuyển `consumed`.
 *     Lỗi ở bất kỳ bước nào ⇒ cả xe không được tạo.
 *
 * Lượt tải bỏ dở quá `VEHICLE_REGISTRATION_UPLOAD_TTL_HOURS`: worker (`retention`) xoá ảnh + dòng.
 */
@Injectable()
export class VehicleRegistrationUploadsService implements OnApplicationShutdown {
  private readonly logger = new Logger(VehicleRegistrationUploadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
    private readonly audit: AuditService,
    @Inject(VEHICLE_REGISTRATION_READER) private readonly reader: VehicleRegistrationReader,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.reader.dispose();
  }

  async presign(
    tenantId: string,
    userId: string,
    dto: PresignVehicleRegistrationDto,
  ): Promise<VehicleRegistrationPresignDto> {
    this.assertStorage();
    const recent = await this.prisma.vehicleRegistrationUpload.count({
      where: { createdBy: userId, createdAt: { gte: new Date(Date.now() - 24 * HOUR_MS) } },
    });
    if (recent >= VEHICLE_REGISTRATION_UPLOADS_PER_DAY) {
      throw new HttpException(
        {
          code: API_ERROR_CODE.VEHICLE_REGISTRATION_UPLOAD_LIMIT,
          message: 'Bạn đã tải ảnh cà vẹt quá nhiều lần trong 24 giờ qua - vui lòng thử lại sau.',
          details: { limit: VEHICLE_REGISTRATION_UPLOADS_PER_DAY },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const id = newId();
    const mimeType = dto.contentType as ImageUploadMimeType;
    const objectKey = `tenants/${tenantId}/registration-uploads/${id}.${DOCUMENT_MIME_EXTENSION[mimeType]}`;
    await this.prisma.vehicleRegistrationUpload.create({
      data: {
        id,
        tenantId,
        createdBy: userId,
        status: VEHICLE_REGISTRATION_UPLOAD_STATUS.UPLOADING,
        objectKey,
        mimeType,
        sizeBytes: dto.fileSize,
      },
    });
    const ticket = await this.r2.presignPrivateUpload({
      key: objectKey,
      contentType: mimeType,
      contentLength: dto.fileSize,
    });
    return { uploadId: id, uploadUrl: ticket.uploadUrl, expiresIn: ticket.expiresIn };
  }

  /** Xác minh ảnh đã tải rồi đọc. Gọi lại sau khi đã đọc là idempotent (trả kết quả đã lưu). */
  async read(
    tenantId: string,
    userId: string,
    uploadId: string,
  ): Promise<VehicleRegistrationReadResultDto> {
    this.assertStorage();
    // Điều kiện tenant + người tải nằm TRONG câu truy vấn — id của người khác là 400, không lộ.
    const row = await this.prisma.vehicleRegistrationUpload.findFirst({
      where: { id: uploadId, tenantId, createdBy: userId },
    });
    if (!row || row.status === VEHICLE_REGISTRATION_UPLOAD_STATUS.CONSUMED) throw uploadInvalid();
    if (row.status === VEHICLE_REGISTRATION_UPLOAD_STATUS.READ) {
      return {
        uploadId,
        reading: storedReading(row.readingJson),
        readerAvailable: row.readingJson !== null,
      };
    }

    const head = await this.r2.headPrivateObject(row.objectKey);
    if (!head) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VEHICLE_REGISTRATION_IMAGE_INVALID,
        message: 'Chưa nhận được ảnh - vui lòng tải lên lại.',
      });
    }
    const prefix = await this.r2.readPrivateObjectPrefix(
      row.objectKey,
      FILE_SIGNATURE_PREFIX_BYTES,
    );
    if (
      head.size !== row.sizeBytes ||
      head.size > VEHICLE_REGISTRATION_UPLOAD_MAX_BYTES ||
      (head.contentType !== null && head.contentType !== row.mimeType) ||
      !matchesFileSignature(row.mimeType, prefix)
    ) {
      throw imageInvalid();
    }

    let reading: VehicleRegistrationReading | null = null;
    try {
      const image = await this.r2.readPrivateObject(
        row.objectKey,
        VEHICLE_REGISTRATION_UPLOAD_MAX_BYTES,
      );
      if (image) reading = await this.reader.read(image);
    } catch (error) {
      // Máy đọc tắt / quá tải / ảnh không giải mã được: chủ xe nhập tay, ảnh vẫn hợp lệ.
      this.logger.warn(
        `Không đọc được ảnh cà vẹt ${uploadId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await this.prisma.vehicleRegistrationUpload.updateMany({
      where: { id: uploadId, status: VEHICLE_REGISTRATION_UPLOAD_STATUS.UPLOADING },
      data: {
        status: VEHICLE_REGISTRATION_UPLOAD_STATUS.READ,
        readAt: new Date(),
        readingJson: reading ? { ...reading } : Prisma.JsonNull,
        readerName: this.reader.name,
      },
    });
    return { uploadId, reading: reading ?? EMPTY_READING, readerAvailable: reading !== null };
  }

  /**
   * Gắn cà vẹt vào ô tô VỪA tạo — gọi TRONG transaction tạo xe. Lượt tải phải của chính người tạo,
   * cùng gian hàng, đã `read`, chưa quá hạn; nếu không ⇒ 400 và cả lượt tạo xe rollback.
   */
  async attachToNewVehicleWithinTx(
    tx: Prisma.TransactionClient,
    input: {
      tenantId: string;
      userId: string;
      vehicleId: string;
      vehiclePlate: string | null;
      registration: CreateVehicleRegistrationDto;
    },
  ): Promise<void> {
    const { tenantId, userId, vehicleId, registration } = input;
    const freshSince = new Date(Date.now() - VEHICLE_REGISTRATION_UPLOAD_TTL_HOURS * HOUR_MS);
    const uploadId = registration.uploadId;
    // Ảnh cà vẹt TUỲ CHỌN (18/11/2026): không có ảnh thì giấy tờ vẫn lưu các trường chủ xe nhập.
    // Khoá dòng: hai lượt tạo xe song song không thể cùng giành một ảnh.
    const locked = !uploadId
      ? []
      : await tx.$queryRaw<{ objectKey: string; mimeType: string; sizeBytes: number }[]>`
      SELECT "object_key" AS "objectKey", "mime_type" AS "mimeType", "size_bytes" AS "sizeBytes"
      FROM "vehicle_registration_uploads"
      WHERE "id" = ${uploadId} AND "tenant_id" = ${tenantId}
        AND "created_by" = ${userId} AND "status" = ${VEHICLE_REGISTRATION_UPLOAD_STATUS.READ}
        AND "created_at" >= ${freshSince}
      FOR UPDATE`;
    const upload = locked[0];
    if (uploadId && !upload) throw uploadInvalid();

    const state = {
      type: VEHICLE_DOCUMENT_TYPE.REGISTRATION,
      customTypeName: null,
      documentNumber: null,
      holderName: registration.holderName,
      holderAddress: registration.holderAddress?.trim() || null,
      plateNumber: registration.plateNumber?.trim() || input.vehiclePlate?.trim() || null,
      chassisNumber: registration.chassisNumber,
      engineNumber: registration.engineNumber,
      issuedAt: null,
      // Cà vẹt không có thời hạn.
      expiresAt: null,
      notes: null,
    };
    validateDocumentMetadata(state);

    const now = new Date();
    const documentId = newId();
    await tx.vehicleDocument.create({
      data: { id: documentId, tenantId, vehicleId, ...state, createdBy: userId },
    });
    let fileId: string | null = null;
    if (upload && uploadId) {
      fileId = newId();
      const versionId = newId();
      const extension = DOCUMENT_MIME_EXTENSION[upload.mimeType as ImageUploadMimeType] ?? 'jpg';
      // Tệp riêng tư của XE trỏ cùng object đã tải — không chép, không di chuyển.
      await tx.vehiclePrivateFile.create({
        data: {
          id: fileId,
          tenantId,
          vehicleId,
          purpose: PRIVATE_FILE_PURPOSE.VEHICLE_DOCUMENT,
          objectKey: upload.objectKey,
          originalName: `ca-vet.${extension}`,
          mimeType: upload.mimeType,
          sizeBytes: upload.sizeBytes,
          status: PRIVATE_FILE_STATUS.READY,
          createdBy: userId,
          completedAt: now,
        },
      });
      await tx.vehicleDocumentVersion.create({
        data: {
          id: versionId,
          tenantId,
          vehicleId,
          documentId,
          privateFileId: fileId,
          version: 1,
          uploadedBy: userId,
        },
      });
      await tx.vehicleDocument.update({
        where: { id: documentId },
        data: { activeVersionId: versionId },
      });
      await tx.vehicleRegistrationUpload.update({
        where: { id: uploadId },
        data: { status: VEHICLE_REGISTRATION_UPLOAD_STATUS.CONSUMED, vehicleId, consumedAt: now },
      });
    }
    // Không ghi số khung / tên chủ xe vào audit — chỉ vết "có cà vẹt kèm lượt tạo xe".
    await this.audit.record(
      {
        tenantId,
        actorUserId: userId,
        actorScope: AUDIT_ACTOR_SCOPE.TENANT,
        action: 'vehicle.document.create',
        targetType: 'vehicle_document',
        targetId: documentId,
        after: {
          vehicleId,
          type: VEHICLE_DOCUMENT_TYPE.REGISTRATION,
          source: 'vehicle_create',
          fileId,
        },
      },
      tx,
    );
  }

  /**
   * Xoá lượt tải bỏ dở (chưa gắn vào xe) quá `VEHICLE_REGISTRATION_UPLOAD_TTL_HOURS` — ảnh trước,
   * dòng sau. Lượt gắn chỉ nhận lượt tải CÒN hạn, nên hai việc không bao giờ giành cùng một dòng.
   * Trả số lượt đã xoá. `VehicleRegistrationUploadsSweeper` gọi định kỳ.
   */
  async purgeStale(now: Date = new Date(), batch = 100): Promise<number> {
    if (!this.r2.privateEnabled) return 0;
    const cutoff = new Date(now.getTime() - VEHICLE_REGISTRATION_UPLOAD_TTL_HOURS * HOUR_MS);
    const stale = await this.prisma.vehicleRegistrationUpload.findMany({
      where: {
        status: { not: VEHICLE_REGISTRATION_UPLOAD_STATUS.CONSUMED },
        createdAt: { lt: cutoff },
      },
      orderBy: { createdAt: 'asc' },
      take: batch,
      select: { id: true, objectKey: true },
    });
    let purged = 0;
    for (const row of stale) {
      // Xoá ảnh hỏng (mạng) thì giữ dòng để lượt sau thử lại — không để ảnh mồ côi không dấu vết.
      if (!(await this.r2.deletePrivateObject(row.objectKey))) continue;
      const { count } = await this.prisma.vehicleRegistrationUpload.deleteMany({
        where: { id: row.id, status: { not: VEHICLE_REGISTRATION_UPLOAD_STATUS.CONSUMED } },
      });
      purged += count;
    }
    return purged;
  }

  private assertStorage(): void {
    if (!this.r2.privateEnabled) {
      throw new ServiceUnavailableException({
        code: API_ERROR_CODE.UPLOADS_NOT_CONFIGURED,
        message: 'Kho lưu trữ riêng tư chưa được cấu hình',
      });
    }
  }
}
