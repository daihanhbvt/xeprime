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
  SHOP_ONBOARDING_STATE,
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
 *  3. **KHÔNG còn tài khoản nhận tiền ở đây** (16/09/2026). Nó sống ở `bank_accounts`
 *     (`/shop/bank-accounts`) — sổ có cờ mặc định, lưu trữ và dấu vết đổi, và là bảng mà lệnh
 *     rút thật sự đọc. Ba cột cũ trên `seller_profiles` là bản khai thứ hai không nối với đồng
 *     nào: gian hàng điền xong vẫn không rút được, và người bán đã xác minh vẫn phải khai lại ở
 *     màn bên cạnh. Hồ sơ này giờ chỉ còn nói về DANH TÍNH và thuế — đúng phần mà reviewer nền
 *     tảng và module thuế cần.
 */
@Injectable()
export class SellerProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  // ── Phía gian hàng ────────────────────────────────────────────────────────

  /**
   * Hồ sơ của gian hàng — tạo LƯỜI một bản nháp rỗng để màn hình luôn có gì đó để hiện.
   *
   * Loại chủ thể khởi đầu theo TUYẾN ĐĂNG KÝ (`defaultEntityTypeFor`): gian hàng tuyến gói mở
   * "Thông tin khai thuế" lần đầu phải thấy ngay ô mã số thuế, không phải ô CCCD của một cá nhân.
   */
  async getOrCreate(tenantId: string): Promise<SellerProfileDto> {
    const existing = await this.prisma.sellerProfile.findUnique({
      where: { tenantId },
      select: SELECT,
    });
    if (existing) return toDto(existing);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { onboardingState: true },
    });
    const created = await this.prisma.sellerProfile.create({
      data: { id: newId(), tenantId, entityType: defaultEntityTypeFor(tenant?.onboardingState) },
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

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.sellerProfile.update({
        where: { tenantId },
        data: {
          entityType: dto.entityType,
          legalName: dto.legalName?.trim() || null,
          taxId: normalizeTaxId(dto.taxId),
          idNumber: dto.idNumber?.replace(/\s+/g, '').toUpperCase() || null,
          idIssuedAt: dto.idIssuedAt ? toDateOnly(dto.idIssuedAt) : null,
          idIssuedBy: dto.idIssuedBy?.trim() || null,
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
          // KHÔNG ghi số giấy tờ vào audit — chỉ ghi loại chủ thể vừa lưu.
          after: { entityType: dto.entityType },
        },
        tx,
      );
      return updated;
    });
    return toDto(row);
  }

  /**
   * Ghi RIÊNG mã số thuế, trong transaction của nơi gọi — đích của trường `taxCode` cũ trên hồ sơ
   * gian hàng (`TenantsService.updateProfile`, 07/10/2026). Client cũ (app native) vẫn gửi MST ở
   * đó; thay vì một cột thứ hai, nó rơi vào đúng hồ sơ này — nguồn duy nhất mà hợp đồng, màn quản
   * trị và báo cáo thuế đọc.
   *
   * Cùng luật với `save`: hồ sơ đang chờ/đã xác minh KHÔNG đổi được (`SELLER_PROFILE_NOT_EDITABLE`)
   * — trừ khi giá trị không đổi: client cũ gửi lại nguyên trạng mỗi lần lưu hồ sơ gian hàng, và
   * chặn nó là chặn luôn lần lưu tên/địa chỉ. Chưa có hồ sơ ⇒ tạo bản nháp mang MST đó.
   *
   * Quyền `seller_profile.manage` là việc của nơi gọi — hàm này không biết ai đang gọi.
   */
  async setTaxIdWithinTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    rawTaxId: string | null,
  ): Promise<void> {
    const taxId = normalizeTaxId(rawTaxId);
    const current = await tx.sellerProfile.findUnique({
      where: { tenantId },
      select: { id: true, status: true, taxId: true },
    });
    if ((current?.taxId ?? null) === taxId) return;
    if (current && !canEditSellerProfile(current.status as SellerProfileStatus)) {
      throw new ConflictException({
        code: API_ERROR_CODE.SELLER_PROFILE_NOT_EDITABLE,
        message: 'Hồ sơ người bán đang chờ hoặc đã xác minh — không đổi được mã số thuế',
        details: { status: current.status },
      });
    }

    let row: { id: string; entityType: string };
    if (current) {
      row = await tx.sellerProfile.update({
        where: { tenantId },
        data: { taxId },
        select: { id: true, entityType: true },
      });
    } else {
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { onboardingState: true },
      });
      row = await tx.sellerProfile.create({
        data: {
          id: newId(),
          tenantId,
          entityType: defaultEntityTypeFor(tenant?.onboardingState),
          taxId,
        },
        select: { id: true, entityType: true },
      });
    }

    await this.audit.record(
      {
        tenantId,
        actorUserId,
        actorScope: AUDIT_ACTOR_SCOPE.TENANT,
        action: 'seller_profile.save',
        targetType: 'seller_profile',
        targetId: row.id,
        // KHÔNG ghi số giấy tờ vào audit — như `save`. `via` nói lần ghi đến từ đường cũ.
        after: { entityType: row.entityType, via: 'tenant_profile.tax_code' },
      },
      tx,
    );
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
        data: {
          status: SELLER_PROFILE_STATUS.SUBMITTED,
          submittedAt: new Date(),
          reviewNote: null,
        },
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
        select: {
          ...SELECT,
          tenant: { select: { name: true } },
          verifier: { select: { displayName: true } },
        },
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
      select: {
        ...SELECT,
        tenant: { select: { name: true } },
        verifier: { select: { displayName: true } },
      },
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
 * Mã số thuế đã chuẩn hoá: bỏ mọi khoảng trắng, chuỗi rỗng ⇒ `null` (gỡ). MỘT phép cho mọi đường
 * ghi `seller_profiles.tax_id` — `save` và `setTaxIdWithinTx` — để "không đổi" so được bằng `===`.
 */
export function normalizeTaxId(raw: string | null | undefined): string | null {
  return raw?.replace(/\s+/g, '') || null;
}

/**
 * Loại chủ thể của bản NHÁP tạo lười, theo TUYẾN ĐĂNG KÝ (ADR 0040): chủ xe tuyến hoa hồng là cá
 * nhân; gian hàng đi cửa gói (đã hay đang trả tiền) ít nhất là hộ kinh doanh. Chỉ là giá trị khởi
 * đầu để form hiện đúng ô (CCCD hay MST) — chủ gian hàng đổi được trước khi gửi xác minh.
 */
export function defaultEntityTypeFor(onboardingState: string | null | undefined): SellerEntityType {
  return !onboardingState || onboardingState === SHOP_ONBOARDING_STATE.COMMISSION
    ? SELLER_ENTITY_TYPE.INDIVIDUAL
    : SELLER_ENTITY_TYPE.HOUSEHOLD_BUSINESS;
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
}): string[] {
  const missing: string[] = [];
  if (!row.legalName) missing.push('legalName');
  /*
   * KHÔNG đòi tài khoản nhận tiền nữa (16/09/2026): nó không sống trên hồ sơ này. Cổng "phải có
   * tài khoản nhận tiền mới rút được" nằm ở chính luồng rút (`WithdrawalService` đọc
   * `bank_accounts`), nơi câu hỏi đó mới có nghĩa — chặn ở đây chỉ khiến một hồ sơ DANH TÍNH
   * không gửi đi được vì lý do chẳng liên quan tới danh tính.
   */
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
