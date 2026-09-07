import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  AUDIT_ACTOR_SCOPE,
  NOTIFICATION_TYPE,
  SELLER_ENTITY_TYPE,
  SELLER_PROFILE_STATUS,
  canEditSellerProfile,
  maskAccountNumber,
  type PaginationMeta,
  type NotificationType,
  type SellerEntityType,
  type SellerProfileStatus,
} from '@xeprime/types';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import { toDateOnly, fromDateOnly } from '../../common/date-only';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import {
  PlatformSellerListQueryDto,
  PlatformSellerProfileDto,
  SaveSellerProfileDto,
  SELLER_DEFAULT_LIMIT,
  SELLER_MAX_LIMIT,
  SellerProfileDto,
} from './dto/seller-profile.dto';

const SELECT = {
  id: true,
  tenantId: true,
  entityType: true,
  legalName: true,
  taxId: true,
  idNumber: true,
  idIssuedAt: true,
  idIssuedBy: true,
  bankCode: true,
  bankAccountNumber: true,
  bankAccountName: true,
  status: true,
  submittedAt: true,
  verifiedAt: true,
  reviewNote: true,
  updatedAt: true,
} satisfies Prisma.SellerProfileSelect;

type Row = Prisma.SellerProfileGetPayload<{ select: typeof SELECT }>;

/**
 * Hồ sơ NGƯỜI BÁN — ADR 0028 release gate 1, Gap Analysis §3.A (R3).
 *
 * Ba điều đáng nói:
 *
 *  1. **Chưa chặn gì ở R3.** Hồ sơ được thu thập và xác minh, nhưng không có guard nào bắt phải
 *     `verified` mới đăng xe hay nhận đơn. Cổng đó thuộc gate TIỀN THẬT (R4): chặn sớm hơn là
 *     đuổi người bán đi trước khi họ kịp thấy lý do phải khai.
 *  2. **Xác minh đi qua `approval_tasks`** (`target_type = seller_profile`) — cùng hàng đợi với
 *     duyệt gian hàng/xe, đúng lằn ranh 2 của CLAUDE.md mục 6. Không dựng hàng đợi thứ hai.
 *  3. **Đổi tài khoản nhận tiền là việc NHẠY CẢM.** Hồ sơ đã `verified` mà sửa số tài khoản thì
 *     quay lại `submitted` và ghi `bank_changed_at` — R4 dùng mốc đó đặt cooldown trước khi cho
 *     rút. Sửa các trường khác không hạ trạng thái.
 */
@Injectable()
export class SellerProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  // ── Phía gian hàng ────────────────────────────────────────────────────────

  /** Hồ sơ của gian hàng — tạo LƯỜI một bản nháp rỗng để màn hình luôn có gì đó để hiện. */
  async getOrCreate(tenantId: string): Promise<SellerProfileDto> {
    const existing = await this.prisma.sellerProfile.findUnique({
      where: { tenantId },
      select: SELECT,
    });
    if (existing) return toDto(existing);

    const created = await this.prisma.sellerProfile.create({
      data: { id: newId(), tenantId, entityType: SELLER_ENTITY_TYPE.INDIVIDUAL },
      select: SELECT,
    });
    return toDto(created);
  }

  async save(
    tenantId: string,
    actorUserId: string,
    dto: SaveSellerProfileDto,
  ): Promise<SellerProfileDto> {
    const current = await this.load(tenantId);
    if (!canEditSellerProfile(current.status as SellerProfileStatus)) {
      throw new ConflictException({
        code: API_ERROR_CODE.SELLER_PROFILE_NOT_EDITABLE,
        message: 'Hồ sơ đang chờ xác minh — không sửa được cho tới khi có kết quả',
        details: { status: current.status },
      });
    }

    const bankAccountNumber = dto.bankAccountNumber?.replace(/\s+/g, '') || null;
    const bankChanged =
      current.status === SELLER_PROFILE_STATUS.VERIFIED &&
      bankAccountNumber !== null &&
      bankAccountNumber !== current.bankAccountNumber;

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.sellerProfile.update({
        where: { tenantId },
        data: {
          entityType: dto.entityType,
          legalName: dto.legalName?.trim() || null,
          taxId: dto.taxId?.replace(/\s+/g, '') || null,
          idNumber: dto.idNumber?.replace(/\s+/g, '').toUpperCase() || null,
          idIssuedAt: dto.idIssuedAt ? toDateOnly(dto.idIssuedAt) : null,
          idIssuedBy: dto.idIssuedBy?.trim() || null,
          bankCode: dto.bankCode?.trim().toUpperCase() || null,
          bankAccountNumber,
          bankAccountName: dto.bankAccountName?.trim() || null,
          /*
           * Đổi TÀI KHOẢN NHẬN TIỀN trên hồ sơ đã xác minh ⇒ phải xác minh lại. Không phải hình
           * thức: đây chính là đường mà một tài khoản bị chiếm sẽ dùng để đổi đích nhận tiền.
           */
          ...(bankChanged
            ? { status: SELLER_PROFILE_STATUS.SUBMITTED, bankChangedAt: new Date(), verifiedAt: null }
            : {}),
        },
        select: SELECT,
      });

      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.TENANT,
          action: 'seller_profile.save',
          targetType: 'seller_profile',
          targetId: updated.id,
          // KHÔNG ghi số tài khoản / số giấy tờ vào audit — chỉ ghi CÓ ĐỔI hay không.
          after: { entityType: dto.entityType, bankChanged },
        },
        tx,
      );
      if (bankChanged) await this.openApprovalTask(tx, tenantId, updated.id, actorUserId);
      return updated;
    });
    return toDto(row);
  }

  /** Gửi xác minh — mở một `approval_task` cho hàng đợi reviewer. */
  async submit(tenantId: string, actorUserId: string): Promise<SellerProfileDto> {
    const current = await this.load(tenantId);
    if (!canEditSellerProfile(current.status as SellerProfileStatus)) {
      throw new ConflictException({
        code: API_ERROR_CODE.SELLER_PROFILE_NOT_EDITABLE,
        message: 'Hồ sơ đang chờ xác minh',
        details: { status: current.status },
      });
    }
    const missing = missingFields(current);
    if (missing.length > 0) {
      throw new ConflictException({
        code: API_ERROR_CODE.SELLER_PROFILE_INCOMPLETE,
        message: 'Hồ sơ còn thiếu thông tin bắt buộc',
        details: { missing },
      });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.sellerProfile.update({
        where: { tenantId },
        data: { status: SELLER_PROFILE_STATUS.SUBMITTED, submittedAt: new Date(), reviewNote: null },
        select: SELECT,
      });
      await this.openApprovalTask(tx, tenantId, updated.id, actorUserId);
      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.TENANT,
          action: 'seller_profile.submit',
          targetType: 'seller_profile',
          targetId: updated.id,
          after: { entityType: updated.entityType },
        },
        tx,
      );
      return updated;
    });
    return toDto(row);
  }

  // ── Phía nền tảng ─────────────────────────────────────────────────────────

  async listForPlatform(
    query: PlatformSellerListQueryDto,
  ): Promise<{ data: PlatformSellerProfileDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, SELLER_DEFAULT_LIMIT, SELLER_MAX_LIMIT);
    const where: Prisma.SellerProfileWhereInput = {
      // Không lọc = VIỆC CẦN LÀM, không phải toàn bộ lịch sử.
      status: query.status ?? SELLER_PROFILE_STATUS.SUBMITTED,
      ...(query.q
        ? {
            OR: [
              { legalName: { contains: query.q, mode: 'insensitive' } },
              { taxId: { contains: query.q, mode: 'insensitive' } },
              { tenant: { name: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.sellerProfile.count({ where }),
      this.prisma.sellerProfile.findMany({
        where,
        orderBy: { submittedAt: 'asc' },
        skip: paging.skip,
        take: paging.take,
        select: { ...SELECT, tenant: { select: { name: true } }, verifier: { select: { displayName: true } } },
      }),
    ]);
    return {
      // DANH SÁCH che PII: một hàng đợi mở suốt ngày không nên phơi số CCCD của hàng trăm người.
      data: rows.map((r) => toPlatformDto(r, { mask: true })),
      meta: paginationMeta(paging, total),
    };
  }

  /** Chi tiết — PII ĐẦY ĐỦ. Đây là lúc reviewer thật sự đối chiếu giấy tờ. */
  async getForPlatform(id: string): Promise<PlatformSellerProfileDto> {
    const row = await this.prisma.sellerProfile.findUnique({
      where: { id },
      select: { ...SELECT, tenant: { select: { name: true } }, verifier: { select: { displayName: true } } },
    });
    if (!row) throw notFound();
    return toPlatformDto(row, { mask: false });
  }

  async verify(id: string, actorUserId: string): Promise<PlatformSellerProfileDto> {
    return this.review(id, actorUserId, {
      status: SELLER_PROFILE_STATUS.VERIFIED,
      approval: APPROVAL_STATUS.APPROVED,
      notification: NOTIFICATION_TYPE.SELLER_PROFILE_VERIFIED,
      title: 'Hồ sơ người bán đã được xác minh',
      note: null,
    });
  }

  async requestChanges(
    id: string,
    actorUserId: string,
    note: string,
  ): Promise<PlatformSellerProfileDto> {
    return this.review(id, actorUserId, {
      status: SELLER_PROFILE_STATUS.CHANGES_REQUESTED,
      approval: APPROVAL_STATUS.REJECTED,
      notification: NOTIFICATION_TYPE.SELLER_PROFILE_CHANGES_REQUESTED,
      title: 'Hồ sơ người bán cần bổ sung',
      note,
    });
  }

  async reject(id: string, actorUserId: string, note: string): Promise<PlatformSellerProfileDto> {
    return this.review(id, actorUserId, {
      status: SELLER_PROFILE_STATUS.REJECTED,
      approval: APPROVAL_STATUS.REJECTED,
      notification: NOTIFICATION_TYPE.SELLER_PROFILE_REJECTED,
      title: 'Hồ sơ người bán bị từ chối',
      note,
    });
  }

  // ── Nội bộ ────────────────────────────────────────────────────────────────

  private async review(
    id: string,
    actorUserId: string,
    decision: {
      status: SellerProfileStatus;
      approval: string;
      notification: NotificationType;
      title: string;
      note: string | null;
    },
  ): Promise<PlatformSellerProfileDto> {
    const before = await this.prisma.sellerProfile.findUnique({
      where: { id },
      select: { id: true, tenantId: true, status: true },
    });
    if (!before) throw notFound();
    if (before.status !== SELLER_PROFILE_STATUS.SUBMITTED) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: 'Hồ sơ này không ở trạng thái chờ xác minh',
        details: { status: before.status },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // Điều kiện trạng thái trong WHERE: hai reviewer bấm cùng lúc thì đúng một người thắng.
      const claimed = await tx.sellerProfile.updateMany({
        where: { id, status: SELLER_PROFILE_STATUS.SUBMITTED },
        data: {
          status: decision.status,
          reviewNote: decision.note,
          verifiedBy: actorUserId,
          verifiedAt: decision.status === SELLER_PROFILE_STATUS.VERIFIED ? new Date() : null,
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.CONFLICT,
          message: 'Hồ sơ vừa được người khác xử lý',
        });
      }

      await tx.approvalTask.updateMany({
        where: {
          targetType: APPROVAL_TARGET_TYPE.SELLER_PROFILE,
          targetId: id,
          status: APPROVAL_STATUS.PENDING,
        },
        data: {
          status: decision.approval,
          reviewedBy: actorUserId,
          reviewedAt: new Date(),
          reason: decision.note,
        },
      });

      await this.audit.record(
        {
          tenantId: before.tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: `seller_profile.${decision.status}`,
          targetType: 'seller_profile',
          targetId: id,
          before: { status: before.status },
          after: { status: decision.status, ...(decision.note ? { note: decision.note } : {}) },
        },
        tx,
      );

      await this.notifications.emitToTenantMembers(
        before.tenantId,
        {
          type: decision.notification,
          title: decision.title,
          body: decision.note ?? 'Xem chi tiết ở màn Hồ sơ người bán.',
          tenantId: before.tenantId,
        },
        tx,
      );
    });

    return this.getForPlatform(id);
  }

  /** Một task chờ duyệt cho mỗi hồ sơ — mở lại thì tái dùng dòng đang `pending`. */
  private async openApprovalTask(
    tx: Prisma.TransactionClient,
    tenantId: string,
    profileId: string,
    actorUserId: string,
  ): Promise<void> {
    const open = await tx.approvalTask.findFirst({
      where: {
        targetType: APPROVAL_TARGET_TYPE.SELLER_PROFILE,
        targetId: profileId,
        status: APPROVAL_STATUS.PENDING,
      },
      select: { id: true },
    });
    if (open) return;
    await tx.approvalTask.create({
      data: {
        id: newId(),
        tenantId,
        targetType: APPROVAL_TARGET_TYPE.SELLER_PROFILE,
        targetId: profileId,
        status: APPROVAL_STATUS.PENDING,
        submittedBy: actorUserId,
      },
    });
  }

  private async load(tenantId: string): Promise<Row> {
    const row = await this.prisma.sellerProfile.findUnique({ where: { tenantId }, select: SELECT });
    if (row) return row;
    // Chưa có hồ sơ mà đã gọi save/submit — tạo nháp rồi đọc lại, không bắt client gọi hai lần.
    await this.getOrCreate(tenantId);
    return this.prisma.sellerProfile.findUniqueOrThrow({ where: { tenantId }, select: SELECT });
  }
}

/**
 * Trường còn thiếu để GỬI xác minh — phụ thuộc loại chủ thể (ADR 0028 điều 4: mỗi loại một cách
 * phân loại thuế). Hàm thuần, export để test và để form gọi cùng một luật.
 */
export function missingFields(row: {
  entityType: string;
  legalName: string | null;
  taxId: string | null;
  idNumber: string | null;
  bankCode: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
}): string[] {
  const missing: string[] = [];
  if (!row.legalName) missing.push('legalName');
  // Tài khoản nhận tiền: bắt buộc với MỌI loại — không có nó thì R4 không trả tiền cho ai được.
  if (!row.bankCode) missing.push('bankCode');
  if (!row.bankAccountNumber) missing.push('bankAccountNumber');
  if (!row.bankAccountName) missing.push('bankAccountName');

  if (row.entityType === SELLER_ENTITY_TYPE.INDIVIDUAL) {
    // Cá nhân: định danh bằng CCCD/hộ chiếu. MST cá nhân không bắt buộc — nhiều người chưa có.
    if (!row.idNumber) missing.push('idNumber');
  } else {
    // Hộ kinh doanh / doanh nghiệp: MST là thứ cơ quan thuế tra cứu.
    if (!row.taxId) missing.push('taxId');
  }
  return missing;
}

function toDto(row: Row): SellerProfileDto {
  return {
    id: row.id,
    entityType: row.entityType,
    legalName: row.legalName,
    taxId: row.taxId,
    idNumber: row.idNumber,
    idIssuedAt: fromDateOnly(row.idIssuedAt),
    idIssuedBy: row.idIssuedBy,
    bankCode: row.bankCode,
    bankAccountNumber: row.bankAccountNumber,
    bankAccountName: row.bankAccountName,
    status: row.status,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    reviewNote: row.reviewNote,
    editable: canEditSellerProfile(row.status as SellerProfileStatus),
    missingFields: missingFields(row),
  };
}

function toPlatformDto(
  row: Row & { tenant: { name: string }; verifier: { displayName: string } | null },
  opts: { mask: boolean },
): PlatformSellerProfileDto {
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantName: row.tenant.name,
    entityType: row.entityType as SellerEntityType,
    legalName: row.legalName,
    taxId: row.taxId,
    idNumber: opts.mask ? maskAccountNumber(row.idNumber) : row.idNumber,
    bankCode: row.bankCode,
    bankAccountNumber: opts.mask
      ? maskAccountNumber(row.bankAccountNumber)
      : row.bankAccountNumber,
    bankAccountName: row.bankAccountName,
    status: row.status,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    verifiedByName: row.verifier?.displayName ?? null,
    reviewNote: row.reviewNote,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy hồ sơ người bán',
  });
}
