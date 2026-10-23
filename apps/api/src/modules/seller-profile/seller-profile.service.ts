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
    // Bảo đảm có hàng để KHOÁ — bản nháp tạo lười nằm ngoài transaction là vô hại (idempotent).
    await this.load(tenantId);

    const next = {
      entityType: dto.entityType,
      legalName: dto.legalName?.trim() || null,
      taxId: normalizeTaxId(dto.taxId),
      idNumber: normalizeIdNumber(dto.idNumber),
      idIssuedAt: dto.idIssuedAt ? toDateOnly(dto.idIssuedAt) : null,
      idIssuedBy: dto.idIssuedBy?.trim() || null,
    };

    const row = await this.prisma.$transaction(async (tx) => {
      const current = await this.lockEditable(
        tx,
        tenantId,
        'Hồ sơ đang chờ xác minh — không sửa được cho tới khi có kết quả',
      );
      const reverify = reverificationFor(current, next);

      const updated = await tx.sellerProfile.update({
        where: { tenantId },
        data: { ...next, ...(reverify ? reverify.data : {}) },
        select: SELECT,
      });
      if (reverify?.status === SELLER_PROFILE_STATUS.SUBMITTED) {
        await this.openApprovalTask(tx, tenantId, updated.id, actorUserId);
      }

      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.TENANT,
          action: 'seller_profile.save',
          targetType: 'seller_profile',
          targetId: updated.id,
          // KHÔNG ghi số giấy tờ vào audit — chỉ ghi loại chủ thể vừa lưu và trường nào đã đổi.
          ...(reverify
            ? {
                before: { status: current.status, entityType: current.entityType },
                after: {
                  entityType: dto.entityType,
                  status: reverify.status,
                  reverifyReason: reverify.changed,
                },
              }
            : { after: { entityType: dto.entityType } }),
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
      select: {
        id: true,
        status: true,
        taxId: true,
        entityType: true,
        idNumber: true,
        legalName: true,
      },
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
    let reverify: ReturnType<typeof reverificationFor> = null;
    if (current) {
      // Đổi MST của hồ sơ ĐÃ XÁC MINH qua đường cũ cũng phải duyệt lại — cùng luật với `save`.
      reverify = reverificationFor(current, { ...current, taxId });
      row = await tx.sellerProfile.update({
        where: { tenantId },
        data: { taxId, ...(reverify ? reverify.data : {}) },
        select: { id: true, entityType: true },
      });
      if (reverify?.status === SELLER_PROFILE_STATUS.SUBMITTED) {
        await this.openApprovalTask(tx, tenantId, row.id, actorUserId);
      }
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
        ...(reverify
          ? { before: { status: current?.status ?? null } }
          : {}),
        after: {
          entityType: row.entityType,
          via: 'tenant_profile.tax_code',
          ...(reverify ? { status: reverify.status, reverifyReason: reverify.changed } : {}),
        },
      },
      tx,
    );
  }

  /** Gửi xác minh — mở một `approval_task` cho hàng đợi reviewer. */
  async submit(tenantId: string, actorUserId: string): Promise<SellerProfileDto> {
    await this.load(tenantId);

    const row = await this.prisma.$transaction(async (tx) => {
      // Khoá cùng hàng với `save`: bộ số được GỬI duyệt phải đúng là bộ số vừa kiểm đủ trường.
      const current = await this.lockEditable(tx, tenantId, 'Hồ sơ đang chờ xác minh');
      const missing = missingFields(current);
      if (missing.length > 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.SELLER_PROFILE_INCOMPLETE,
          message: 'Hồ sơ còn thiếu thông tin bắt buộc',
          details: { missing },
        });
      }

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

  /**
   * Khoá hàng hồ sơ (`FOR UPDATE`) rồi đọc lại TRONG transaction của nơi gọi — `save`/`submit`.
   *
   * Quyết định "sửa được không" và "có phải duyệt lại không" (ADR 0068 điều 2) phụ thuộc `status`.
   * Đọc nó ngoài transaction thì hai lượt lưu song song trên một hồ sơ ĐÃ XÁC MINH cùng thấy
   * `verified` và cùng ghi; hay một lượt lưu thấy `draft` rồi ghi đè lên hồ sơ vừa được GỬI duyệt
   * — reviewer duyệt một bộ số khác bộ đã gửi, và nhãn "doanh nghiệp đã xác minh" (miễn khấu trừ
   * thuế) dán lên dữ liệu chưa ai xem. Khoá xếp các lượt nối tiếp: lượt sau đọc đúng trạng thái
   * lượt trước để lại, và bị từ chối `SELLER_PROFILE_NOT_EDITABLE` nếu hồ sơ đã sang chờ duyệt.
   */
  private async lockEditable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    notEditableMessage: string,
  ): Promise<Row> {
    await tx.$queryRaw`SELECT 1 FROM seller_profiles WHERE tenant_id = ${tenantId} FOR UPDATE`;
    const current = await tx.sellerProfile.findUniqueOrThrow({ where: { tenantId }, select: SELECT });
    if (!canEditSellerProfile(current.status as SellerProfileStatus)) {
      throw new ConflictException({
        code: API_ERROR_CODE.SELLER_PROFILE_NOT_EDITABLE,
        message: notEditableMessage,
        details: { status: current.status },
      });
    }
    return current;
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

/** Số CCCD/hộ chiếu đã chuẩn hoá — bỏ khoảng trắng, in hoa; rỗng ⇒ `null`. */
export function normalizeIdNumber(raw: string | null | undefined): string | null {
  return raw?.replace(/\s+/g, '').toUpperCase() || null;
}

/** Trường ĐỊNH DANH THUẾ của hồ sơ — đổi một trong số này ở hồ sơ đã xác minh là phải duyệt lại. */
export const SELLER_TAX_IDENTITY_FIELDS = ['entityType', 'taxId', 'idNumber'] as const;

/**
 * Hồ sơ ĐÃ XÁC MINH bị đổi loại chủ thể, MST hoặc số CCCD ⇒ phải duyệt lại (ADR 0068 điều 2).
 *
 * Lý do là tiền thật: chỉ doanh nghiệp ĐÃ XÁC MINH mới được miễn khấu trừ thuế
 * (`taxSellerEntityOf`). Để hồ sơ đã duyệt tự đổi `individual → company` mà vẫn giữ nhãn
 * "đã xác minh" là một cú bấm để thôi bị khấu trừ 7%. Tương tự với MST/CCCD — đó là định danh ghi
 * lên tờ khai thuế, reviewer phải thấy lại.
 *
 * Còn đủ trường bắt buộc ⇒ `submitted` (vào lại hàng đợi reviewer — caller mở `approval_task`);
 * thiếu ⇒ `draft` (không thể gửi một hồ sơ thiếu, chủ gian hàng phải bổ sung rồi gửi). Đổi tên
 * pháp lý hay nơi cấp giấy tờ không kích hoạt — không đổi nghĩa vụ thuế. `null` = không cần.
 */
export function reverificationFor(
  current: { status: string; entityType: string; taxId: string | null; idNumber: string | null },
  next: { entityType: string; legalName: string | null; taxId: string | null; idNumber: string | null },
): {
  status: typeof SELLER_PROFILE_STATUS.SUBMITTED | typeof SELLER_PROFILE_STATUS.DRAFT;
  changed: string[];
  data: Prisma.SellerProfileUpdateInput;
} | null {
  if (current.status !== SELLER_PROFILE_STATUS.VERIFIED) return null;
  const changed = SELLER_TAX_IDENTITY_FIELDS.filter((field) => current[field] !== next[field]);
  if (changed.length === 0) return null;
  const status =
    missingFields(next).length === 0
      ? SELLER_PROFILE_STATUS.SUBMITTED
      : SELLER_PROFILE_STATUS.DRAFT;
  return {
    status,
    changed: [...changed],
    data: {
      status,
      submittedAt: status === SELLER_PROFILE_STATUS.SUBMITTED ? new Date() : null,
      verifiedAt: null,
      verifier: { disconnect: true },
      reviewNote: null,
    },
  };
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
