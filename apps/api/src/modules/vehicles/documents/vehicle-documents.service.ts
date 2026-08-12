import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  PRIVATE_FILE_PURPOSE,
  PRIVATE_FILE_STATUS,
  VEHICLE_DOCUMENT_OCR_FIELD,
  VEHICLE_DOCUMENT_OCR_STATUS,
  VEHICLE_DOCUMENT_TYPE,
  vehicleDocumentPresentation,
  type VehicleDocumentOcrField,
  type VehicleDocumentOcrStatus,
} from '@xeprime/types';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { parseCalendarDate } from '../../../common/calendar-date';
import { VehicleContractsService } from '../vehicle-contracts.service';
import { VehiclesService } from '../vehicles.service';
import {
  ApplyOcrFieldsDto,
  AttachDocumentVersionDto,
  PresignVehicleDocumentDto,
  SaveVehicleDocumentDto,
  VehicleDocumentDetailDto,
  VehicleDocumentOcrJobDto,
  VehicleDocumentSummaryDto,
  VehicleDocumentVersionDto,
} from './dto/vehicle-document.dto';
import { SourceContractDownloadDto, SourceContractPresignDto } from '../dto/vehicle-source.dto';
import { validateDocumentMetadata, type DocumentMetadataState } from './document-metadata';
import {
  VEHICLE_DOCUMENT_OCR_PROVIDER,
  type OcrExtractedField,
  type VehicleDocumentOcrProvider,
} from './ocr-provider';

/** Trường OCR là DATE — áp vào phải qua validate ngày lịch, không nhận chuỗi tuỳ ý. */
const DATE_FIELDS: readonly VehicleDocumentOcrField[] = [
  VEHICLE_DOCUMENT_OCR_FIELD.ISSUED_AT,
  VEHICLE_DOCUMENT_OCR_FIELD.EXPIRES_AT,
];

type StoredOcrFields = Partial<Record<VehicleDocumentOcrField, OcrExtractedField>>;

/** Nhận diện vi phạm unique của Prisma bằng duck-typing (cùng lý do all-exceptions.filter). */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Giấy tờ xe (Wave 5 + đóng an ninh Wave 5.1) — writer duy nhất của
 * `vehicle_documents(_versions|_ocr_jobs)`.
 *
 * Nguyên tắc đóng đinh từ docs/design/12 §2+§8+§10:
 *  - Giấy tờ TUỲ CHỌN; hết hạn chỉ tạo CẢNH BÁO — service này không bao giờ đụng
 *    operation/public status hay lịch xe.
 *  - Quyền tách bốn mức: `view` chỉ thấy TRẠNG THÁI (DTO summary, không PII);
 *    `view_details` thấy metadata nhạy cảm; `view_files` mở file/lịch sử phiên bản;
 *    `manage` ghi + OCR. Mapper summary/detail là hai hàm RIÊNG — không dùng chung một
 *    DTO to rồi bỏ trống trường.
 *  - Kết quả OCR là BẢN NHÁP: chỉ người dùng chọn TỪNG trường mới được áp, giá trị lấy từ
 *    job trên server (client không nộp giá trị). Áp biển số vào XE đi qua
 *    `VehiclesService.applyUpdate` TRONG CÙNG transaction để hưởng nguyên luật
 *    sửa-nhạy-cảm/duyệt lại (ADR 0008) và rollback trọn gói.
 *  - File riêng tư tái dùng nguyên hạ tầng Wave 4.1 (purpose `vehicle_document`).
 */
@Injectable()
export class VehicleDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: VehicleContractsService,
    private readonly vehicles: VehiclesService,
    private readonly audit: AuditService,
    @Inject(VEHICLE_DOCUMENT_OCR_PROVIDER) private readonly ocr: VehicleDocumentOcrProvider,
  ) {}

  // ── Đọc ────────────────────────────────────────────────────────────────────

  /** Danh sách TÓM TẮT cho `vehicles.documents.view` — không PII, không tên file, không OCR. */
  async list(tenantId: string, vehicleId: string): Promise<VehicleDocumentSummaryDto[]> {
    const vehicle = await this.findVehicle(tenantId, vehicleId);
    const [rows, warningDays] = await Promise.all([
      this.prisma.vehicleDocument.findMany({
        where: { tenantId, vehicleId: vehicle.id, archivedAt: null },
        include: SUMMARY_INCLUDE,
        orderBy: { createdAt: 'asc' },
      }),
      this.warningDays(tenantId),
    ]);
    return rows.map((row) => toSummaryDto(row, warningDays));
  }

  /** Chi tiết metadata nhạy cảm cho `vehicles.documents.view_details` — KHÔNG kèm lịch sử file/OCR. */
  async getOne(
    tenantId: string,
    vehicleId: string,
    documentId: string,
  ): Promise<VehicleDocumentDetailDto> {
    await this.findVehicle(tenantId, vehicleId);
    const row = await this.prisma.vehicleDocument.findFirst({
      where: { id: documentId, tenantId, vehicleId },
      include: DETAIL_INCLUDE,
    });
    if (!row) throw docNotFound();
    return toDetailDto(row, await this.warningDays(tenantId));
  }

  /** Lịch sử phiên bản — sau quyền `view_files` (tên file là metadata của file riêng tư). */
  async listVersions(
    tenantId: string,
    vehicleId: string,
    documentId: string,
  ): Promise<VehicleDocumentVersionDto[]> {
    await this.findVehicle(tenantId, vehicleId);
    const document = await this.prisma.vehicleDocument.findFirst({
      where: { id: documentId, tenantId, vehicleId },
      select: { id: true },
    });
    if (!document) throw docNotFound();
    const versions = await this.prisma.vehicleDocumentVersion.findMany({
      where: { documentId, tenantId, vehicleId },
      include: { privateFile: true },
      orderBy: { version: 'desc' },
    });
    return versions.map(toVersionDto);
  }

  // ── Metadata ───────────────────────────────────────────────────────────────

  async create(
    tenantId: string,
    vehicleId: string,
    userId: string,
    dto: SaveVehicleDocumentDto,
  ): Promise<VehicleDocumentDetailDto> {
    const vehicle = await this.findVehicle(tenantId, vehicleId);
    const state = createState(dto);
    validateDocumentMetadata(state);

    // Loại chuẩn: mỗi xe một bản ghi đang hoạt động — partial unique của DB là chốt cuối,
    // check trước để trả 409 tử tế thay vì P2002.
    if (dto.type !== VEHICLE_DOCUMENT_TYPE.OTHER) {
      const existing = await this.prisma.vehicleDocument.findFirst({
        where: { vehicleId: vehicle.id, type: dto.type, archivedAt: null },
        select: { id: true },
      });
      if (existing) throw docTypeConflict();
    }

    let row;
    try {
      row = await this.prisma.vehicleDocument.create({
        data: {
          id: newId(),
          tenantId,
          vehicleId: vehicle.id,
          ...state,
          createdBy: userId,
        },
        include: DETAIL_INCLUDE,
      });
    } catch (err) {
      // Hai người cùng tạo một loại chuẩn: partial unique nổ — trả 409 ổn định, không 500.
      if (isUniqueViolation(err)) throw docTypeConflict();
      throw err;
    }

    await this.audit.record({
      tenantId,
      actorUserId: userId,
      actorScope: 'tenant',
      action: 'vehicle.document.create',
      targetType: 'vehicle_document',
      targetId: row.id,
      after: { vehicleId: vehicle.id, type: row.type, customTypeName: row.customTypeName },
    });

    return toDetailDto(row, await this.warningDays(tenantId));
  }

  async update(
    tenantId: string,
    vehicleId: string,
    userId: string,
    documentId: string,
    dto: SaveVehicleDocumentDto,
  ): Promise<VehicleDocumentDetailDto> {
    await this.findVehicle(tenantId, vehicleId);
    if (dto.expectedRowVersion == null) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Thiếu expectedRowVersion — cần cho phát hiện sửa đè',
      });
    }

    const current = await this.prisma.vehicleDocument.findFirst({
      where: { id: documentId, tenantId, vehicleId, archivedAt: null },
    });
    if (!current) throw docNotFound();
    if (current.type !== dto.type) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Không đổi được loại giấy tờ — tạo bản ghi mới cho loại khác',
      });
    }

    // Patch GIỮ NGUYÊN trường không gửi (undefined ≠ null): undefined = không đụng,
    // null/chuỗi rỗng = xoá giá trị. Validate TRẠNG THÁI GỘP, không chỉ patch.
    const patch = patchState(dto);
    validateDocumentMetadata({ ...currentState(current), ...patch });

    // Optimistic concurrency: updateMany có điều kiện rowVersion — 0 dòng = ai đó vừa sửa.
    const result = await this.prisma.vehicleDocument.updateMany({
      where: { id: documentId, tenantId, vehicleId, rowVersion: dto.expectedRowVersion },
      data: { ...patch, rowVersion: { increment: 1 } },
    });
    if (result.count === 0) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: 'Giấy tờ vừa được người khác cập nhật — tải lại rồi sửa tiếp',
      });
    }

    await this.audit.record({
      tenantId,
      actorUserId: userId,
      actorScope: 'tenant',
      action: 'vehicle.document.update',
      targetType: 'vehicle_document',
      targetId: documentId,
      before: metadataAudit(currentState(current)),
      after: metadataAudit({ ...currentState(current), ...patch }),
    });

    return this.readDetail(tenantId, vehicleId, documentId);
  }

  async archive(
    tenantId: string,
    vehicleId: string,
    userId: string,
    documentId: string,
  ): Promise<{ id: string }> {
    await this.findVehicle(tenantId, vehicleId);
    const result = await this.prisma.vehicleDocument.updateMany({
      where: { id: documentId, tenantId, vehicleId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (result.count === 0) throw docNotFound();
    await this.audit.record({
      tenantId,
      actorUserId: userId,
      actorScope: 'tenant',
      action: 'vehicle.document.archive',
      targetType: 'vehicle_document',
      targetId: documentId,
    });
    return { id: documentId };
  }

  // ── File riêng tư (tái dùng hạ tầng Wave 4.1) ─────────────────────────────

  async presignVersion(
    tenantId: string,
    vehicleId: string,
    userId: string,
    documentId: string,
    dto: PresignVehicleDocumentDto,
  ): Promise<SourceContractPresignDto> {
    await this.requireActiveDocument(tenantId, vehicleId, documentId);
    return this.files.presignFor(tenantId, vehicleId, userId, dto, {
      purpose: PRIVATE_FILE_PURPOSE.VEHICLE_DOCUMENT,
      keyOf: (vId, fileId, extension) =>
        `tenants/${tenantId}/vehicles/${vId}/documents/${documentId}/${fileId}.${extension}`,
    });
  }

  /**
   * Hoàn tất + GẮN file thành phiên bản mới trong MỘT transaction: xác minh object
   * (HEAD + magic bytes — completeFor), khoá dòng giấy tờ (`FOR UPDATE`) để hai lượt gắn
   * đồng thời xếp hàng thay vì cùng tính một số version, tạo version kế tiếp, chuyển
   * active, bản cũ lưu trữ. Unique DB (document_id, version) + (private_file_id) là chốt
   * cuối — nổ thì trả 409 ổn định, không P2002 → 500.
   */
  async attachVersion(
    tenantId: string,
    vehicleId: string,
    userId: string,
    documentId: string,
    dto: AttachDocumentVersionDto,
  ): Promise<VehicleDocumentDetailDto> {
    await this.requireActiveDocument(tenantId, vehicleId, documentId);

    // Xác minh object thật trước khi đụng DB giấy tờ (file sai là 400, giấy tờ không đổi).
    await this.files.completeFor(tenantId, vehicleId, userId, dto.fileId, {
      purpose: PRIVATE_FILE_PURPOSE.VEHICLE_DOCUMENT,
      auditAction: 'vehicle.document.upload',
    });

    try {
      await this.prisma.$transaction(async (tx) => {
        // Khoá dòng giấy tờ: serialize các lượt gắn; đọc lại active TRONG transaction —
        // giá trị đọc ngoài có thể đã cũ nếu một lượt gắn khác vừa hoàn tất.
        const locked = await tx.$queryRaw<{ activeVersionId: string | null }[]>`
          SELECT "active_version_id" AS "activeVersionId"
          FROM "vehicle_documents"
          WHERE "id" = ${documentId} AND "tenant_id" = ${tenantId}
            AND "vehicle_id" = ${vehicleId} AND "archived_at" IS NULL
          FOR UPDATE`;
        const documentRow = locked[0];
        if (!documentRow) throw docNotFound();

        // File phải là của ĐÚNG xe này + đúng mục đích + `ready` — id xe khác/tenant khác 400.
        const file = await tx.vehiclePrivateFile.findFirst({
          where: {
            id: dto.fileId,
            tenantId,
            vehicleId,
            purpose: PRIVATE_FILE_PURPOSE.VEHICLE_DOCUMENT,
            status: PRIVATE_FILE_STATUS.READY,
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!file) {
          throw new BadRequestException({
            code: API_ERROR_CODE.VALIDATION_FAILED,
            message: 'Tệp không hợp lệ hoặc chưa sẵn sàng để gắn vào giấy tờ',
          });
        }
        // Một file chỉ gắn được một lần — unique DB trên private_file_id là chốt cuối.
        const used = await tx.vehicleDocumentVersion.findFirst({
          where: { privateFileId: dto.fileId },
          select: { id: true },
        });
        if (used) {
          throw new BadRequestException({
            code: API_ERROR_CODE.VALIDATION_FAILED,
            message: 'Tệp này đã được gắn vào một phiên bản khác',
          });
        }

        const latest = await tx.vehicleDocumentVersion.findFirst({
          where: { documentId },
          orderBy: { version: 'desc' },
          select: { version: true },
        });

        const version = await tx.vehicleDocumentVersion.create({
          data: {
            id: newId(),
            tenantId,
            vehicleId,
            documentId,
            privateFileId: dto.fileId,
            version: (latest?.version ?? 0) + 1,
            uploadedBy: userId,
          },
        });

        // Bản đang dùng cũ (nếu có) chuyển thành lịch sử — KHÔNG xoá, không mất dấu.
        if (documentRow.activeVersionId) {
          await tx.vehicleDocumentVersion.update({
            where: { id: documentRow.activeVersionId },
            data: { archivedAt: new Date() },
          });
        }
        await tx.vehicleDocument.update({
          where: { id: documentId },
          data: { activeVersionId: version.id, rowVersion: { increment: 1 } },
        });

        await this.audit.record(
          {
            tenantId,
            actorUserId: userId,
            actorScope: 'tenant',
            action: 'vehicle.document.version.attach',
            targetType: 'vehicle_document',
            targetId: documentId,
            before: { activeVersionId: documentRow.activeVersionId },
            after: { activeVersionId: version.id, version: version.version, fileId: dto.fileId },
          },
          tx,
        );
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException({
          code: API_ERROR_CODE.CONFLICT,
          message: 'Một lượt gắn file khác vừa hoàn tất trên giấy tờ này — tải lại rồi thử lại',
        });
      }
      throw err;
    }

    return this.readDetail(tenantId, vehicleId, documentId);
  }

  /** Signed URL ngắn hạn cho MỘT phiên bản — quyền mở file đã được guard kiểm trước đó. */
  async downloadVersion(
    tenantId: string,
    vehicleId: string,
    documentId: string,
    versionId: string,
  ): Promise<SourceContractDownloadDto> {
    await this.findVehicle(tenantId, vehicleId);
    const version = await this.prisma.vehicleDocumentVersion.findFirst({
      where: { id: versionId, tenantId, vehicleId, documentId },
      select: { privateFileId: true },
    });
    if (!version) throw docNotFound();
    return this.files.downloadFor(
      tenantId,
      vehicleId,
      version.privateFileId,
      PRIVATE_FILE_PURPOSE.VEHICLE_DOCUMENT,
    );
  }

  // ── OCR ────────────────────────────────────────────────────────────────────

  /**
   * Yêu cầu trích xuất trên bản active. Chưa cấu hình provider → 503 `OCR_NOT_CONFIGURED`
   * có kiểm soát (KHÔNG giả kết quả) — người dùng nhập tay.
   */
  async requestOcr(
    tenantId: string,
    vehicleId: string,
    userId: string,
    documentId: string,
  ): Promise<VehicleDocumentOcrJobDto> {
    const document = await this.requireActiveDocument(tenantId, vehicleId, documentId);
    if (!this.ocr.enabled) {
      throw new ServiceUnavailableException({
        code: API_ERROR_CODE.OCR_NOT_CONFIGURED,
        message: 'Trích xuất tự động chưa khả dụng — vui lòng nhập thông tin thủ công',
      });
    }
    if (!document.activeVersionId) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Giấy tờ chưa có file để trích xuất',
      });
    }

    const running = await this.prisma.vehicleDocumentOcrJob.findFirst({
      where: { documentId, status: VEHICLE_DOCUMENT_OCR_STATUS.PROCESSING },
      select: { id: true },
    });
    if (running) throw ocrProcessingConflict();

    const version = await this.prisma.vehicleDocumentVersion.findUnique({
      where: { id: document.activeVersionId },
      include: { privateFile: true },
    });
    if (!version) throw docNotFound();

    const attempts = await this.prisma.vehicleDocumentOcrJob.count({ where: { documentId } });
    let job;
    try {
      job = await this.prisma.vehicleDocumentOcrJob.create({
        data: {
          id: newId(),
          tenantId,
          vehicleId,
          documentId,
          documentVersionId: version.id,
          status: VEHICLE_DOCUMENT_OCR_STATUS.PROCESSING,
          provider: this.ocr.name,
          attemptCount: attempts + 1,
          createdBy: userId,
        },
      });
    } catch (err) {
      // Partial unique "một job processing / giấy tờ" (Wave 5.1) — race giữa hai người bấm
      // cùng lúc ra 409 ổn định thay vì P2002 → 500.
      if (isUniqueViolation(err)) throw ocrProcessingConflict();
      throw err;
    }

    // Provider chạy đồng bộ trong request (provider thật nên là async job — ghi ở báo cáo wave).
    let updated;
    try {
      const result = await this.ocr.extract({
        objectKey: version.privateFile.objectKey,
        mimeType: version.privateFile.mimeType,
        documentType: document.type,
      });
      updated = await this.prisma.vehicleDocumentOcrJob.update({
        where: { id: job.id },
        data: {
          status:
            result.status === 'unreadable'
              ? VEHICLE_DOCUMENT_OCR_STATUS.UNREADABLE
              : VEHICLE_DOCUMENT_OCR_STATUS.NEEDS_REVIEW,
          confidence: result.confidence ?? null,
          extractedFields: result.fields as unknown as Prisma.InputJsonValue,
          errorCode: result.status === 'unreadable' ? API_ERROR_CODE.OCR_UNREADABLE : null,
          completedAt: new Date(),
        },
      });
    } catch {
      updated = await this.prisma.vehicleDocumentOcrJob.update({
        where: { id: job.id },
        data: {
          status: VEHICLE_DOCUMENT_OCR_STATUS.FAILED,
          errorCode: API_ERROR_CODE.OCR_FAILED,
          completedAt: new Date(),
        },
      });
    }

    return toOcrJobDto(updated);
  }

  /**
   * Áp kết quả OCR — client CHỌN TRƯỜNG, giá trị lấy từ job trên server. `fields` rỗng =
   * đánh dấu đã đối soát (Bỏ qua).
   *
   * MỘT transaction cho tất cả (Wave 5.1): claim job có điều kiện (chỉ MỘT người đối soát
   * thắng — người sau nhận 409), validate trạng thái gộp, ghi metadata giấy tờ, áp biển số
   * vào XE qua `VehiclesService.applyUpdate` (nguyên luật knockback/duyệt lại/đồng bộ
   * listing ADR 0008), audit. Fail ở bất kỳ bước nào → rollback TẤT CẢ, job trở lại
   * `needs_review` nên đối soát lại được.
   */
  async applyOcr(
    tenantId: string,
    vehicleId: string,
    userId: string,
    documentId: string,
    jobId: string,
    dto: ApplyOcrFieldsDto,
  ): Promise<VehicleDocumentDetailDto> {
    await this.requireActiveDocument(tenantId, vehicleId, documentId);

    await this.prisma.$transaction(async (tx) => {
      const job = await tx.vehicleDocumentOcrJob.findFirst({
        where: { id: jobId, tenantId, vehicleId, documentId },
      });
      if (!job) throw docNotFound();
      if (job.status !== VEHICLE_DOCUMENT_OCR_STATUS.NEEDS_REVIEW) throw ocrStaleConflict();

      // Claim có điều kiện: hai người cùng bấm "Cập nhật" thì chỉ một update trúng dòng
      // còn `needs_review`; người kia nhận 409 ổn định — không bao giờ áp đôi.
      const claimed = await tx.vehicleDocumentOcrJob.updateMany({
        where: { id: job.id, status: VEHICLE_DOCUMENT_OCR_STATUS.NEEDS_REVIEW },
        data: { status: VEHICLE_DOCUMENT_OCR_STATUS.REVIEWED },
      });
      if (claimed.count === 0) throw ocrStaleConflict();

      const current = await tx.vehicleDocument.findFirst({
        where: { id: documentId, tenantId, vehicleId, archivedAt: null },
      });
      if (!current) throw docNotFound();

      const stored = (job.extractedFields ?? {}) as StoredOcrFields;
      const selected = [...new Set(dto.fields)] as VehicleDocumentOcrField[];

      const patch: Partial<DocumentMetadataState> = {};
      const auditChanges: Record<string, string> = {};
      for (const field of selected) {
        const extracted = stored[field];
        // Trường không có bằng chứng trong job thì không áp được — chống bịa giá trị.
        if (!extracted?.value) {
          throw new BadRequestException({
            code: API_ERROR_CODE.VALIDATION_FAILED,
            message: 'Trường được chọn không có giá trị nhận dạng',
            details: { field },
          });
        }
        const value = extracted.value.trim();
        if (DATE_FIELDS.includes(field)) {
          // Giá trị OCR phải qua validate lại như nhập tay — ngày không tồn tại là 400.
          const parsed = parseCalendarDate(value);
          if (!parsed) {
            throw new BadRequestException({
              code: API_ERROR_CODE.VALIDATION_FAILED,
              message: 'Giá trị ngày nhận dạng không hợp lệ',
              details: { field, value },
            });
          }
          patch[field] = parsed as never;
        } else {
          patch[field] = value as never;
        }
        auditChanges[field] = value;
      }

      // Cùng một luật với nhập tay: giá trị OCR quá dài/đảo thứ tự ngày là 400 có kiểm
      // soát TRƯỚC khi chạm Prisma — trạng thái gộp, không chỉ phần được chọn.
      validateDocumentMetadata({ ...currentState(current), ...patch });

      if (selected.length > 0) {
        await tx.vehicleDocument.update({
          where: { id: documentId },
          data: { ...patch, rowVersion: { increment: 1 } },
        });
      }

      // Biển số vào HỒ SƠ XE trong CÙNG transaction: xe public sửa nhạy cảm tự knockback
      // về chờ duyệt + đồng bộ listing (ADR 0008); fail thì cả giấy tờ + job rollback.
      if (dto.applyPlateToVehicle && selected.includes(VEHICLE_DOCUMENT_OCR_FIELD.PLATE_NUMBER)) {
        const plate = (stored.plateNumber?.value ?? '').trim();
        await this.vehicles.applyUpdate(tx, tenantId, vehicleId, userId, { plateNumber: plate });
      }

      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: 'tenant',
          action: 'vehicle.document.ocr.apply',
          targetType: 'vehicle_document',
          targetId: documentId,
          after: { jobId: job.id, applied: auditChanges, skipped: selected.length === 0 },
        },
        tx,
      );
    });

    return this.readDetail(tenantId, vehicleId, documentId);
  }

  // ── Nội bộ ─────────────────────────────────────────────────────────────────

  private async readDetail(
    tenantId: string,
    vehicleId: string,
    documentId: string,
  ): Promise<VehicleDocumentDetailDto> {
    const row = await this.prisma.vehicleDocument.findFirst({
      where: { id: documentId, tenantId, vehicleId },
      include: DETAIL_INCLUDE,
    });
    if (!row) throw docNotFound();
    return toDetailDto(row, await this.warningDays(tenantId));
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

  private async requireActiveDocument(tenantId: string, vehicleId: string, documentId: string) {
    await this.findVehicle(tenantId, vehicleId);
    const document = await this.prisma.vehicleDocument.findFirst({
      where: { id: documentId, tenantId, vehicleId, archivedAt: null },
    });
    if (!document) throw docNotFound();
    return document;
  }

  /**
   * Ngưỡng "sắp hết hạn" — sản phẩm CHƯA chốt (docs §8, không hard-code 30). Đọc từ
   * `tenant_profiles.settings_json.documentExpiryWarningDays`; chưa cấu hình → null →
   * chỉ suy được còn hạn/hết hạn.
   */
  private async warningDays(tenantId: string): Promise<number | null> {
    const profile = await this.prisma.tenantProfile.findUnique({
      where: { tenantId },
      select: { settings: true },
    });
    const settings = profile?.settings as { documentExpiryWarningDays?: unknown } | null;
    const value = settings?.documentExpiryWarningDays;
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null;
  }
}

// ── Mapping ──────────────────────────────────────────────────────────────────

/** Cho summary: chỉ cần status job OCR gần nhất (suy presentation) — KHÔNG kéo extracted fields. */
const SUMMARY_INCLUDE = {
  ocrJobs: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { status: true } },
} satisfies Prisma.VehicleDocumentInclude;

const DETAIL_INCLUDE = {
  activeVersion: { include: { privateFile: true } },
  ocrJobs: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { status: true } },
} satisfies Prisma.VehicleDocumentInclude;

type SummaryRow = Prisma.VehicleDocumentGetPayload<{ include: typeof SUMMARY_INCLUDE }>;
type DetailRow = Prisma.VehicleDocumentGetPayload<{ include: typeof DETAIL_INCLUDE }>;
type VersionRow = Prisma.VehicleDocumentVersionGetPayload<{ include: { privateFile: true } }>;
type OcrRow = Prisma.VehicleDocumentOcrJobGetPayload<Record<string, never>>;

/**
 * Mapper TÓM TẮT — dùng cho quyền `view`. Danh sách trường là TẤT CẢ những gì mức quyền
 * này được thấy; thêm trường mới vào đây phải trả lời được "staff có được thấy nó không".
 */
function toSummaryDto(row: SummaryRow, warningDays: number | null): VehicleDocumentSummaryDto {
  const ocrStatus = row.ocrJobs[0] ? (row.ocrJobs[0].status as VehicleDocumentOcrStatus) : null;
  return {
    id: row.id,
    type: row.type,
    customTypeName: row.customTypeName,
    expiresAt: toDateString(row.expiresAt),
    presentation: vehicleDocumentPresentation({
      hasActiveVersion: Boolean(row.activeVersionId),
      // Job đã reviewed không còn là workflow dở — chỉ job dang dở mới đổi trạng thái.
      ocrStatus: ocrStatus === VEHICLE_DOCUMENT_OCR_STATUS.REVIEWED ? null : ocrStatus,
      expiresAt: toDateString(row.expiresAt),
      warningDays,
      today: new Date().toISOString().slice(0, 10),
    }),
    warningDays,
    hasFile: Boolean(row.activeVersionId),
    activeVersionId: row.activeVersionId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Mapper CHI TIẾT — quyền `view_details`: summary + metadata nhạy cảm + bản active. KHÔNG OCR. */
function toDetailDto(row: DetailRow, warningDays: number | null): VehicleDocumentDetailDto {
  return {
    ...toSummaryDto(row, warningDays),
    documentNumber: row.documentNumber,
    holderName: row.holderName,
    holderAddress: row.holderAddress,
    plateNumber: row.plateNumber,
    chassisNumber: row.chassisNumber,
    engineNumber: row.engineNumber,
    issuedAt: toDateString(row.issuedAt),
    notes: row.notes,
    rowVersion: row.rowVersion,
    activeVersion: row.activeVersion ? toVersionDto(row.activeVersion) : null,
  };
}

function toVersionDto(row: VersionRow): VehicleDocumentVersionDto {
  return {
    id: row.id,
    version: row.version,
    file: {
      id: row.privateFile.id,
      name: row.privateFile.originalName,
      mimeType: row.privateFile.mimeType,
      size: row.privateFile.sizeBytes,
    },
    uploadedAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
  };
}

function toOcrJobDto(row: OcrRow): VehicleDocumentOcrJobDto {
  const stored = (row.extractedFields ?? {}) as StoredOcrFields;
  return {
    id: row.id,
    status: row.status,
    provider: row.provider,
    confidence: row.confidence,
    fields: Object.entries(stored).map(([field, extracted]) => ({
      field,
      value: extracted?.value ?? '',
      confidence: extracted?.confidence ?? null,
      evidence: extracted?.evidence ?? null,
    })),
    errorCode: row.errorCode,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

/** Trạng thái ĐẦY ĐỦ từ dto create — trường không gửi chuẩn hoá thành null. */
function createState(dto: SaveVehicleDocumentDto): DocumentMetadataState {
  return {
    type: dto.type,
    customTypeName: trimOrNull(dto.customTypeName),
    documentNumber: trimOrNull(dto.documentNumber),
    holderName: trimOrNull(dto.holderName),
    holderAddress: trimOrNull(dto.holderAddress),
    plateNumber: trimOrNull(dto.plateNumber),
    chassisNumber: trimOrNull(dto.chassisNumber),
    engineNumber: trimOrNull(dto.engineNumber),
    issuedAt: toDate(dto.issuedAt),
    expiresAt: toDate(dto.expiresAt),
    notes: trimOrNull(dto.notes),
  };
}

/**
 * Patch cho update — CHỈ gồm trường client thật sự gửi: undefined = giữ nguyên giá trị cũ,
 * null/rỗng = xoá. Không bao giờ để undefined biến thành null phá dữ liệu (Wave 5.1).
 */
function patchState(dto: SaveVehicleDocumentDto): Partial<DocumentMetadataState> {
  return {
    ...(dto.customTypeName !== undefined ? { customTypeName: trimOrNull(dto.customTypeName) } : {}),
    ...(dto.documentNumber !== undefined ? { documentNumber: trimOrNull(dto.documentNumber) } : {}),
    ...(dto.holderName !== undefined ? { holderName: trimOrNull(dto.holderName) } : {}),
    ...(dto.holderAddress !== undefined ? { holderAddress: trimOrNull(dto.holderAddress) } : {}),
    ...(dto.plateNumber !== undefined ? { plateNumber: trimOrNull(dto.plateNumber) } : {}),
    ...(dto.chassisNumber !== undefined ? { chassisNumber: trimOrNull(dto.chassisNumber) } : {}),
    ...(dto.engineNumber !== undefined ? { engineNumber: trimOrNull(dto.engineNumber) } : {}),
    ...(dto.issuedAt !== undefined ? { issuedAt: toDate(dto.issuedAt) } : {}),
    ...(dto.expiresAt !== undefined ? { expiresAt: toDate(dto.expiresAt) } : {}),
    ...(dto.notes !== undefined ? { notes: trimOrNull(dto.notes) } : {}),
  };
}

/** Trạng thái hiện tại của dòng DB dưới dạng state gộp được. */
function currentState(row: {
  type: string;
  customTypeName: string | null;
  documentNumber: string | null;
  holderName: string | null;
  holderAddress: string | null;
  plateNumber: string | null;
  chassisNumber: string | null;
  engineNumber: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  notes: string | null;
}): DocumentMetadataState {
  return {
    type: row.type,
    customTypeName: row.customTypeName,
    documentNumber: row.documentNumber,
    holderName: row.holderName,
    holderAddress: row.holderAddress,
    plateNumber: row.plateNumber,
    chassisNumber: row.chassisNumber,
    engineNumber: row.engineNumber,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    notes: row.notes,
  };
}

/** Audit chỉ chứa metadata chữ — không bao giờ có URL/object key (kỷ luật Wave 4.1). */
function metadataAudit(state: DocumentMetadataState): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(state).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString().slice(0, 10) : (value ?? null),
    ]),
  );
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toDate(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function toDateString(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

function docNotFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy giấy tờ',
  });
}

function docTypeConflict(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.CONFLICT,
    message: 'Xe đã có giấy tờ loại này — hãy cập nhật hoặc thay file bản hiện có',
  });
}

function ocrProcessingConflict(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.OCR_PROCESSING,
    message: 'Đang có một lượt trích xuất chạy trên giấy tờ này',
  });
}

/** Job đã được người khác đối soát / không còn ở trạng thái chờ — 409 ổn định, thử lại được bằng job mới. */
function ocrStaleConflict(): ConflictException {
  return new ConflictException({
    code: API_ERROR_CODE.CONFLICT,
    message: 'Kết quả OCR này đã được đối soát hoặc không còn hiệu lực — tải lại rồi chạy lại nếu cần',
  });
}
