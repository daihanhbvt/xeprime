import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  DOCUMENT_MIME_EXTENSION,
  DOCUMENT_UPLOAD_MAX_BYTES,
  PRIVATE_FILE_PURPOSE,
  PRIVATE_FILE_STATUS,
  type DocumentUploadMimeType,
} from '@xeprime/types';
import { AuditService } from '../audit/audit.service';
import { R2Service } from '../storage/r2.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  SourceContractDownloadDto,
  SourceContractPresignDto,
  PresignSourceContractDto,
  VehicleSourceContractFileDto,
} from './dto/vehicle-source.dto';

/** Signed GET sống ngắn — đủ cho một cú click tải, không đủ để chia sẻ lại có ý nghĩa. */
const DOWNLOAD_URL_TTL_SECONDS = 120;

/**
 * Chữ ký byte đầu (magic bytes) của các định dạng được duyệt — Content-Type do CLIENT khai
 * lúc PUT, không tin được; đối chiếu nội dung thật trước khi cho file thành `ready`.
 * WebP: RIFF....WEBP (4 byte offset 8), kiểm hai đoạn.
 */
const FILE_SIGNATURES: Record<DocumentUploadMimeType, (bytes: Uint8Array) => boolean> = {
  'application/pdf': (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]), // %PDF
  'image/jpeg': (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  'image/png': (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/webp': (b) =>
    startsWith(b, [0x52, 0x49, 0x46, 0x46]) && // RIFF
    b.length >= 12 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50, // WEBP
};

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * Tài liệu hợp đồng RIÊNG TƯ của xe (Wave 4.1) — writer duy nhất của `vehicle_private_files`.
 *
 * Kiến trúc: nhị phân ở bucket R2 riêng tư (không URL public), metadata do server sở hữu.
 * Vòng đời: presign (tạo bản ghi `pending`, id + object key server sinh) → client PUT →
 * complete (HEAD + magic bytes xác minh) → `ready` → đính vào hồ sơ nguồn. File `pending`
 * không tải về được; file gỡ khỏi hồ sơ chuyển `deleted` (object KHÔNG xoá tự động).
 *
 * Fail-closed: thiếu `R2_PRIVATE_BUCKET` là 503 — không bao giờ rơi về bucket public.
 */
@Injectable()
export class VehicleContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
    private readonly audit: AuditService,
  ) {}

  async presign(
    tenantId: string,
    vehicleId: string,
    userId: string,
    dto: PresignSourceContractDto,
  ): Promise<SourceContractPresignDto> {
    this.assertPrivateStorage();
    const vehicle = await this.findVehicle(tenantId, vehicleId);

    const fileId = newId();
    const extension = DOCUMENT_MIME_EXTENSION[dto.contentType as DocumentUploadMimeType];
    // Key hoàn toàn từ dữ liệu server sở hữu: id ULID + đuôi suy từ MIME đã duyệt.
    // Tên file người dùng KHÔNG tham gia định danh — chỉ lưu để hiển thị.
    const objectKey = `tenants/${tenantId}/vehicles/${vehicle.id}/contracts/${fileId}.${extension}`;

    await this.prisma.vehiclePrivateFile.create({
      data: {
        id: fileId,
        tenantId,
        vehicleId: vehicle.id,
        purpose: PRIVATE_FILE_PURPOSE.SOURCE_CONTRACT,
        objectKey,
        originalName: dto.fileName,
        mimeType: dto.contentType,
        sizeBytes: dto.fileSize,
        status: PRIVATE_FILE_STATUS.PENDING,
        createdBy: userId,
      },
    });

    const ticket = await this.r2.presignPrivateUpload({
      key: objectKey,
      contentType: dto.contentType,
      contentLength: dto.fileSize,
    });

    return { fileId, uploadUrl: ticket.uploadUrl, expiresIn: ticket.expiresIn };
  }

  /**
   * Hoàn tất upload: PUT thành công lên R2 CHƯA phải bằng chứng file hợp lệ. Xác minh bằng
   * HEAD (tồn tại, size khớp khai báo và trong trần, content-type được duyệt) + chữ ký byte
   * đầu khớp MIME. Sai bất kỳ điểm nào → 4xx có kiểm soát, file KHÔNG thành `ready`.
   */
  async complete(
    tenantId: string,
    vehicleId: string,
    userId: string,
    fileId: string,
  ): Promise<VehicleSourceContractFileDto> {
    this.assertPrivateStorage();
    await this.findVehicle(tenantId, vehicleId);

    const file = await this.prisma.vehiclePrivateFile.findFirst({
      // Điều kiện tenant + vehicle nằm TRONG câu truy vấn — id của tenant khác là 404, không lộ.
      where: { id: fileId, tenantId, vehicleId, purpose: PRIVATE_FILE_PURPOSE.SOURCE_CONTRACT },
    });
    if (!file) throw fileNotFound();
    if (file.status !== PRIVATE_FILE_STATUS.PENDING) {
      if (file.status === PRIVATE_FILE_STATUS.READY) return toContractFileDto(file);
      throw fileNotFound(); // deleted: không hồi sinh
    }

    const head = await this.r2.headPrivateObject(file.objectKey);
    if (!head) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Chưa nhận được tệp trên kho lưu trữ — hãy tải lên rồi thử lại',
      });
    }
    const allowedMime = file.mimeType as DocumentUploadMimeType;
    if (
      head.size !== file.sizeBytes ||
      head.size > DOCUMENT_UPLOAD_MAX_BYTES ||
      (head.contentType !== null && head.contentType !== file.mimeType)
    ) {
      throw invalidObject();
    }

    const prefix = await this.r2.readPrivateObjectPrefix(file.objectKey, 12);
    if (!prefix || !FILE_SIGNATURES[allowedMime]?.(prefix)) {
      throw invalidObject();
    }

    const updated = await this.prisma.vehiclePrivateFile.update({
      where: { id: file.id },
      data: { status: PRIVATE_FILE_STATUS.READY, completedAt: new Date() },
    });

    // Tài liệu nhạy cảm vào hệ thống — để lại vết (không log URL/nội dung).
    await this.audit.record({
      tenantId,
      actorUserId: userId,
      actorScope: 'tenant',
      action: 'vehicle.contract.upload',
      targetType: 'vehicle_private_file',
      targetId: file.id,
      after: { vehicleId, name: file.originalName, mimeType: file.mimeType, size: file.sizeBytes },
    });

    return toContractFileDto(updated);
  }

  /**
   * Phát signed GET URL ngắn hạn — CHỈ sau khi đã xác thực + kiểm scope (guard) và bản ghi
   * thuộc đúng tenant + xe + đang `ready`. Sai bất kỳ điều kiện nào là 404 (chống IDOR,
   * không phân biệt "không tồn tại" với "của người khác").
   */
  async download(
    tenantId: string,
    vehicleId: string,
    fileId: string,
  ): Promise<SourceContractDownloadDto> {
    this.assertPrivateStorage();
    await this.findVehicle(tenantId, vehicleId);

    const file = await this.prisma.vehiclePrivateFile.findFirst({
      where: {
        id: fileId,
        tenantId,
        vehicleId,
        purpose: PRIVATE_FILE_PURPOSE.SOURCE_CONTRACT,
        status: PRIVATE_FILE_STATUS.READY,
        deletedAt: null,
      },
    });
    if (!file) throw fileNotFound();

    const ticket = await this.r2.presignPrivateDownload(
      file.objectKey,
      file.originalName,
      DOWNLOAD_URL_TTL_SECONDS,
    );
    return {
      downloadUrl: ticket.downloadUrl,
      expiresAt: new Date(Date.now() + ticket.expiresIn * 1000).toISOString(),
    };
  }

  /**
   * Xác minh danh sách id sắp ĐÍNH vào hồ sơ nguồn (gọi từ VehicleSourceService, trong
   * transaction của nó): từng id phải thuộc đúng tenant + xe + purpose + `ready`.
   * Id lạ/tenant khác/xe khác/pending/deleted → 400 kèm danh sách id không hợp lệ.
   */
  async assertAttachable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    vehicleId: string,
    fileIds: string[],
  ): Promise<void> {
    if (fileIds.length === 0) return;
    const unique = [...new Set(fileIds)];
    const rows = await tx.vehiclePrivateFile.findMany({
      where: {
        id: { in: unique },
        tenantId,
        vehicleId,
        purpose: PRIVATE_FILE_PURPOSE.SOURCE_CONTRACT,
        status: PRIVATE_FILE_STATUS.READY,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (rows.length !== unique.length) {
      const found = new Set(rows.map((row) => row.id));
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Tệp hợp đồng không hợp lệ hoặc chưa sẵn sàng để đính vào hồ sơ',
        details: { invalid: unique.filter((id) => !found.has(id)) },
      });
    }
  }

  /** Gỡ file khỏi hồ sơ → đánh dấu `deleted` (soft) trong transaction của caller. */
  async markDetached(
    tx: Prisma.TransactionClient,
    tenantId: string,
    vehicleId: string,
    fileIds: string[],
  ): Promise<void> {
    if (fileIds.length === 0) return;
    await tx.vehiclePrivateFile.updateMany({
      where: { id: { in: fileIds }, tenantId, vehicleId },
      data: { status: PRIVATE_FILE_STATUS.DELETED, deletedAt: new Date() },
    });
  }

  /** Metadata an toàn của các file đã đính (theo thứ tự id truyền vào). */
  async listByIds(
    tenantId: string,
    vehicleId: string,
    fileIds: string[],
  ): Promise<VehicleSourceContractFileDto[]> {
    if (fileIds.length === 0) return [];
    const rows = await this.prisma.vehiclePrivateFile.findMany({
      where: {
        id: { in: fileIds },
        tenantId,
        vehicleId,
        status: PRIVATE_FILE_STATUS.READY,
        deletedAt: null,
      },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return fileIds
      .map((id) => byId.get(id))
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .map(toContractFileDto);
  }

  private async findVehicle(tenantId: string, id: string): Promise<{ id: string }> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy xe',
      });
    }
    return vehicle;
  }

  /** Thiếu bucket riêng tư → 503 fail-closed. TUYỆT ĐỐI không rơi về bucket public. */
  private assertPrivateStorage(): void {
    if (!this.r2.privateEnabled) {
      throw new ServiceUnavailableException({
        code: API_ERROR_CODE.UPLOADS_NOT_CONFIGURED,
        message: 'Kho tài liệu riêng tư chưa được cấu hình (thiếu R2_PRIVATE_BUCKET)',
      });
    }
  }
}

type PrivateFileRow = Prisma.VehiclePrivateFileGetPayload<Record<string, never>>;

export function toContractFileDto(row: PrivateFileRow): VehicleSourceContractFileDto {
  return {
    id: row.id,
    name: row.originalName,
    mimeType: row.mimeType,
    size: row.sizeBytes,
    status: 'ready',
  };
}

function fileNotFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy tệp hợp đồng',
  });
}

function invalidObject(): BadRequestException {
  return new BadRequestException({
    code: API_ERROR_CODE.VALIDATION_FAILED,
    message: 'Tệp tải lên không khớp khai báo (loại hoặc dung lượng) — hãy tải lên lại',
  });
}
