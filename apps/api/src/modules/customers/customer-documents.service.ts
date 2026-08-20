import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  CUSTOMER_DOCUMENT_EXPIRING_SOON_DAYS,
  CUSTOMER_DOCUMENT_EXPIRY,
  CUSTOMER_DOCUMENT_STATUS,
  CUSTOMER_DOCUMENT_TYPE,
  DOCUMENT_MIME_EXTENSION,
  DOCUMENT_UPLOAD_MAX_BYTES,
  type CustomerDocumentExpiry,
  type DocumentUploadMimeType,
} from '@xeprime/types';
import { fromDateOnly, toDateOnly } from '../../common/date-only';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { R2Service } from '../storage/r2.service';
import { CustomersService } from './customers.service';
import {
  CustomerDocumentDownloadDto,
  CustomerDocumentDto,
  CustomerDocumentPresignDto,
  PresignCustomerDocumentDto,
  VerifyCustomerDocumentDto,
} from './dto/customer.dto';

/** Signed GET sống ngắn — đủ cho một cú click mở giấy tờ, không đủ để chia sẻ lại có ý nghĩa. */
const DOWNLOAD_URL_TTL_SECONDS = 120;

/**
 * Chữ ký byte đầu của các định dạng được duyệt. Content-Type do CLIENT khai lúc PUT nên không
 * tin được; đối chiếu nội dung thật trước khi cho file thành `ready`.
 */
const FILE_SIGNATURES: Record<DocumentUploadMimeType, (bytes: Uint8Array) => boolean> = {
  'application/pdf': (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]),
  'image/jpeg': (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  'image/png': (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/webp': (b) =>
    startsWith(b, [0x52, 0x49, 0x46, 0x46]) &&
    b.length >= 12 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50,
};

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

const SELECT = {
  id: true,
  documentType: true,
  verifiedAt: true,
  verifiedByUserId: true,
  verifyMethod: true,
  verifyNote: true,
  customTypeName: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  expiresAt: true,
  uploadedBy: true,
  createdAt: true,
} satisfies Prisma.TenantCustomerDocumentSelect;

type DocumentRow = Prisma.TenantCustomerDocumentGetPayload<{ select: typeof SELECT }>;

/**
 * Giấy tờ tuỳ thân của khách (CCCD / GPLX) — writer DUY NHẤT của `tenant_customer_documents`.
 *
 * Kiến trúc giống file riêng tư của xe (Wave 4.1) và vì cùng một lý do: nhị phân nằm ở bucket
 * R2 RIÊNG TƯ (không URL public), metadata do server sở hữu, và vòng đời là
 * presign (`pending`) → client PUT → complete (HEAD + magic bytes) → `ready`.
 *
 * Khác biệt duy nhất đáng nói: đây là PII của NGƯỜI THỨ BA mà gian hàng chỉ giữ hộ. Vì vậy
 *  - danh sách giấy tờ chỉ cần `customers.view` (nhân viên phải biết đã có CCCD hay chưa),
 *  - còn MỞ file là quyền riêng `customers.documents.view_files` và ghi audit TỪNG LẦN;
 *  - `object_key` không bao giờ rời khỏi backend.
 *
 * Fail-closed: thiếu `R2_PRIVATE_BUCKET` là 503 — không bao giờ rơi về bucket public.
 */
@Injectable()
export class CustomerDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customers: CustomersService,
    private readonly r2: R2Service,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string, customerId: string): Promise<CustomerDocumentDto[]> {
    await this.customers.findOne(tenantId, customerId);
    const rows = await this.prisma.tenantCustomerDocument.findMany({
      where: {
        tenantId,
        tenantCustomerId: customerId,
        status: CUSTOMER_DOCUMENT_STATUS.READY,
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: SELECT,
    });

    // Một lượt tra tên cho CẢ người tải lên lẫn người đối chiếu — hai vai thường khác nhau
    // (nhân viên nhận xe tải ảnh, quản lý mới là người soi VNeID).
    const actorNames = await this.actorNames([
      ...rows.map((row) => row.uploadedBy),
      ...rows.map((row) => row.verifiedByUserId),
    ]);
    return rows.map((row) => toDto(row, actorNames));
  }

  /**
   * Ghi nhận ĐỐI CHIẾU giấy tờ — thao tác thủ công (nhân viên soi VNeID/bản gốc), hệ thống
   * không gọi API định danh quốc gia nên đây là lời khai có truy vết, không phải xác thực máy.
   *
   * Chỉ đối chiếu được giấy tờ đã `ready`: một hàng `pending` là bản ghi chưa có file thật.
   * Gọi lại trên giấy tờ đã đối chiếu = ghi đè (soi lại lần nữa), và audit giữ cả giá trị cũ.
   */
  async verify(
    tenantId: string,
    customerId: string,
    userId: string,
    documentId: string,
    dto: VerifyCustomerDocumentDto,
  ): Promise<CustomerDocumentDto> {
    await this.customers.findOne(tenantId, customerId);
    const before = await this.prisma.tenantCustomerDocument.findFirst({
      where: {
        id: documentId,
        tenantId,
        tenantCustomerId: customerId,
        status: CUSTOMER_DOCUMENT_STATUS.READY,
        deletedAt: null,
      },
      select: SELECT,
    });
    if (!before) throw documentNotFound();

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenantCustomerDocument.update({
        where: { id: documentId },
        data: {
          verifiedAt: new Date(),
          verifiedByUserId: userId,
          verifyMethod: dto.verifyMethod,
          verifyNote: dto.verifyNote?.trim() || null,
        },
        select: SELECT,
      });

      // Đối chiếu danh tính là hành vi cần truy vết (database_design §bảo mật giấy tờ).
      await this.audit.record(
        {
          tenantId,
          actorUserId: userId,
          actorScope: AUDIT_ACTOR_SCOPE.TENANT,
          action: 'customer_document.verify',
          targetType: 'tenant_customer_document',
          targetId: documentId,
          before: {
            verifiedAt: before.verifiedAt?.toISOString() ?? null,
            verifiedByUserId: before.verifiedByUserId,
            verifyMethod: before.verifyMethod,
          },
          after: {
            documentType: updated.documentType,
            verifiedAt: updated.verifiedAt?.toISOString() ?? null,
            verifyMethod: updated.verifyMethod,
          },
        },
        tx,
      );
      return updated;
    });

    return toDto(row, await this.actorNames([row.uploadedBy, row.verifiedByUserId]));
  }

  /**
   * Bước 1: tạo bản ghi `pending` + phát URL PUT. `id` và `object_key` do SERVER sinh — tên file
   * người dùng nộp chỉ được lưu để hiển thị, không tham gia định danh (không có đường nào cho
   * `../` đi vào key).
   */
  async presign(
    tenantId: string,
    customerId: string,
    userId: string,
    dto: PresignCustomerDocumentDto,
  ): Promise<CustomerDocumentPresignDto> {
    this.assertPrivateStorage();
    const customer = await this.customers.findOne(tenantId, customerId);
    if (customer.archivedAt) {
      throw new BadRequestException({
        code: API_ERROR_CODE.CUSTOMER_ARCHIVED,
        message: 'Hồ sơ khách đang lưu trữ — khôi phục trước khi thêm giấy tờ',
      });
    }
    const customTypeName =
      dto.documentType === CUSTOMER_DOCUMENT_TYPE.OTHER ? dto.customTypeName?.trim() || null : null;

    const documentId = newId();
    const extension = DOCUMENT_MIME_EXTENSION[dto.contentType as DocumentUploadMimeType];
    const objectKey = `tenants/${tenantId}/customers/${customerId}/documents/${documentId}.${extension}`;

    await this.prisma.tenantCustomerDocument.create({
      data: {
        id: documentId,
        tenantId,
        tenantCustomerId: customerId,
        documentType: dto.documentType,
        customTypeName,
        objectKey,
        originalName: dto.fileName,
        mimeType: dto.contentType,
        sizeBytes: dto.fileSize,
        status: CUSTOMER_DOCUMENT_STATUS.PENDING,
        expiresAt: dto.expiresAt ? toDateOnly(dto.expiresAt) : null,
        uploadedBy: userId,
      },
    });

    const ticket = await this.r2.presignPrivateUpload({
      key: objectKey,
      contentType: dto.contentType,
      contentLength: dto.fileSize,
    });
    return { documentId, uploadUrl: ticket.uploadUrl, expiresIn: ticket.expiresIn };
  }

  /**
   * Bước 2: PUT thành công CHƯA phải bằng chứng file hợp lệ. Xác minh bằng HEAD (tồn tại, đúng
   * dung lượng đã khai và trong trần, content-type được duyệt) + chữ ký byte đầu khớp MIME.
   * Sai bất kỳ điểm nào → 4xx có kiểm soát, bản ghi KHÔNG thành `ready` (nên không tải về được).
   */
  async complete(
    tenantId: string,
    customerId: string,
    userId: string,
    documentId: string,
  ): Promise<CustomerDocumentDto> {
    this.assertPrivateStorage();
    await this.customers.findOne(tenantId, customerId);

    // Điều kiện tenant + khách nằm TRONG câu truy vấn — id của gian hàng khác là 404, không lộ.
    const document = await this.prisma.tenantCustomerDocument.findFirst({
      where: { id: documentId, tenantId, tenantCustomerId: customerId },
    });
    if (!document) throw documentNotFound();
    if (document.status !== CUSTOMER_DOCUMENT_STATUS.PENDING) {
      // Gọi lại sau khi đã hoàn tất là idempotent; bản ghi đã gỡ thì không hồi sinh.
      if (document.status === CUSTOMER_DOCUMENT_STATUS.READY) {
        const names = await this.actorNames([document.uploadedBy]);
        return toDto(document, names);
      }
      throw documentNotFound();
    }

    const head = await this.r2.headPrivateObject(document.objectKey);
    if (!head) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Chưa nhận được tệp trên kho lưu trữ — hãy tải lên rồi thử lại',
      });
    }
    if (
      head.size !== document.sizeBytes ||
      head.size > DOCUMENT_UPLOAD_MAX_BYTES ||
      (head.contentType !== null && head.contentType !== document.mimeType)
    ) {
      throw invalidObject();
    }
    const prefix = await this.r2.readPrivateObjectPrefix(document.objectKey, 12);
    if (!prefix || !FILE_SIGNATURES[document.mimeType as DocumentUploadMimeType]?.(prefix)) {
      throw invalidObject();
    }

    const updated = await this.prisma.tenantCustomerDocument.update({
      where: { id: document.id },
      data: { status: CUSTOMER_DOCUMENT_STATUS.READY, completedAt: new Date() },
      select: SELECT,
    });

    // Giấy tờ tuỳ thân của khách vào hệ thống — để lại vết. KHÔNG log object key/nội dung.
    await this.audit.record({
      tenantId,
      actorUserId: userId,
      actorScope: AUDIT_ACTOR_SCOPE.TENANT,
      action: 'tenant_customer.document_upload',
      targetType: 'tenant_customer',
      targetId: customerId,
      after: { documentId: document.id, documentType: document.documentType },
    });

    return toDto(updated, await this.actorNames([updated.uploadedBy]));
  }

  /**
   * Phát signed GET ngắn hạn — CHỈ sau khi guard đã kiểm `customers.documents.view_files` và
   * bản ghi thuộc đúng tenant + đúng khách + đang `ready`. Sai bất kỳ điều kiện nào là 404
   * (chống IDOR: không phân biệt "không tồn tại" với "của người khác").
   *
   * Mỗi lần mở là MỘT dòng audit: đây là dữ liệu định danh của người thứ ba, phải trả lời được
   * "ai đã xem CCCD của khách nào, lúc nào".
   */
  async download(
    tenantId: string,
    customerId: string,
    userId: string,
    documentId: string,
  ): Promise<CustomerDocumentDownloadDto> {
    this.assertPrivateStorage();
    await this.customers.findOne(tenantId, customerId);

    const document = await this.prisma.tenantCustomerDocument.findFirst({
      where: {
        id: documentId,
        tenantId,
        tenantCustomerId: customerId,
        status: CUSTOMER_DOCUMENT_STATUS.READY,
        deletedAt: null,
      },
      select: { id: true, objectKey: true, originalName: true, documentType: true },
    });
    if (!document) throw documentNotFound();

    const ticket = await this.r2.presignPrivateDownload(
      document.objectKey,
      document.originalName,
      DOWNLOAD_URL_TTL_SECONDS,
    );
    await this.audit.record({
      tenantId,
      actorUserId: userId,
      actorScope: AUDIT_ACTOR_SCOPE.TENANT,
      action: 'tenant_customer.document_download',
      targetType: 'tenant_customer',
      targetId: customerId,
      after: { documentId: document.id, documentType: document.documentType },
    });

    return {
      downloadUrl: ticket.downloadUrl,
      expiresAt: new Date(Date.now() + ticket.expiresIn * 1000).toISOString(),
    };
  }

  /** Gỡ giấy tờ = SOFT delete + audit (object trên R2 không xoá tự động — cùng nợ với xe). */
  async remove(
    tenantId: string,
    customerId: string,
    userId: string,
    documentId: string,
  ): Promise<void> {
    await this.customers.findOne(tenantId, customerId);
    const result = await this.prisma.tenantCustomerDocument.updateMany({
      where: {
        id: documentId,
        tenantId,
        tenantCustomerId: customerId,
        status: { not: CUSTOMER_DOCUMENT_STATUS.DELETED },
      },
      data: { status: CUSTOMER_DOCUMENT_STATUS.DELETED, deletedAt: new Date() },
    });
    if (result.count === 0) throw documentNotFound();

    await this.audit.record({
      tenantId,
      actorUserId: userId,
      actorScope: AUDIT_ACTOR_SCOPE.TENANT,
      action: 'tenant_customer.document_delete',
      targetType: 'tenant_customer',
      targetId: customerId,
      after: { documentId },
    });
  }

  private async actorNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, displayName: true },
    });
    return new Map(users.map((user) => [user.id, user.displayName]));
  }

  private assertPrivateStorage(): void {
    if (!this.r2.privateEnabled) {
      throw new ServiceUnavailableException({
        code: API_ERROR_CODE.UPLOADS_NOT_CONFIGURED,
        message: 'Kho tài liệu riêng tư chưa được cấu hình (thiếu R2_PRIVATE_BUCKET)',
      });
    }
  }
}

/**
 * Trạng thái hạn SUY RA lúc đọc từ `expiresAt` — không cột nào lưu nó, vì nó phụ thuộc ngày
 * hôm nay. Cùng kỷ luật với giấy tờ xe (Wave 5).
 */
export function expiryStatusOf(expiresAt: Date | null, now = new Date()): CustomerDocumentExpiry {
  if (!expiresAt) return CUSTOMER_DOCUMENT_EXPIRY.NO_EXPIRY;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysLeft = Math.floor((expiresAt.getTime() - today) / 86_400_000);
  if (daysLeft < 0) return CUSTOMER_DOCUMENT_EXPIRY.EXPIRED;
  if (daysLeft <= CUSTOMER_DOCUMENT_EXPIRING_SOON_DAYS) {
    return CUSTOMER_DOCUMENT_EXPIRY.EXPIRING_SOON;
  }
  return CUSTOMER_DOCUMENT_EXPIRY.VALID;
}

function toDto(row: DocumentRow, uploaderNames: Map<string, string>): CustomerDocumentDto {
  return {
    id: row.id,
    documentType: row.documentType,
    verifiedAt: row.verifiedAt ? row.verifiedAt.toISOString() : null,
    verifiedByName: row.verifiedByUserId
      ? (uploaderNames.get(row.verifiedByUserId) ?? null)
      : null,
    verifyMethod: row.verifyMethod,
    verifyNote: row.verifyNote,
    customTypeName: row.customTypeName,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    expiresAt: fromDateOnly(row.expiresAt),
    expiryStatus: expiryStatusOf(row.expiresAt),
    uploadedByName: row.uploadedBy ? (uploaderNames.get(row.uploadedBy) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function documentNotFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy giấy tờ',
  });
}

function invalidObject(): BadRequestException {
  return new BadRequestException({
    code: API_ERROR_CODE.VALIDATION_FAILED,
    message: 'Tệp tải lên không khớp khai báo (loại hoặc dung lượng) — hãy tải lên lại',
  });
}
