import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  BANK_MATCH_TARGET_TYPE,
  BILLING_MODE,
  BILLING_PHASE,
  PLAN_VEHICLE_SCOPE,
  PLAN_VEHICLE_SCOPE_VALUES,
  PLAN_VEHICLE_SCOPE_DISPLAY_ORDER,
  PLAN_QUOTA_GATE_POINT,
  QUOTA_LIMIT_REASON,
  VEHICLE_QUOTA_KIND,
  type PlanQuotaGatePoint,
  type QuotaLimitReason,
  type VehicleQuotaKind,
  packageTermCovering,
  planScopesConflict,
  planVehicleScopeDisplayRank,
  planVehicleScopeOf,
  resolveActivePackageTerms,
  resolveEffectiveBilling,
  type ActivePackageTerm,
  type EffectiveBilling,
  type PlanVehicleScope,
  type VehicleType,
  SHOP_ONBOARDING_STATE,
  type BillingMode,
  COMMISSION_TRACK_TERM_MONTHS,
  OWNER_LITE_VEHICLE_LIMIT,
  FREE_TRIP_ALLOWANCE,
  NOTIFICATION_TYPE,
  PLAN_STATUS,
  type PlanStatus,
  SUBSCRIPTION_INVOICE_PAYABLE_STATUSES,
  SUBSCRIPTION_INVOICE_STATUS,
  isSubscriptionInvoicePayable,
  SUBSCRIPTION_INVOICE_TTL_HOURS,
  SUBSCRIPTION_ASSIGN_KIND,
  SUBSCRIPTION_ASSIGN_KIND_ACTION,
  SUBSCRIPTION_AUDIT_ACTION,
  SUBSCRIPTION_CANCEL_BLOCK,
  SUBSCRIPTION_CANCEL_REASON,
  SUBSCRIPTION_EDIT_BLOCK,
  SUBSCRIPTION_EDIT_MAX_END_MONTHS,
  SUBSCRIPTION_ORIGIN,
  SUBSCRIPTION_STATUS,
  AUDIT_TARGET_TYPE,
  laterChainTermsOf,
  planSubscriptionChain,
  selfServePurchaseTiming,
  subscriptionCancelBlockOf,
  subscriptionChainLockKey,
  subscriptionEditBlockOf,
  subscriptionEndsAtValid,
  subscriptionOriginOf,
  subscriptionShiftPlan,
  subscriptionTermStateOf,
  type SubscriptionChainPlan,
  type PlanPurchaseKind,
  type SubscriptionCapTerm,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  addCalendarMonthsVn,
  parsePlanInvoiceSnapshot,
  parsePlanLimits,
  parsePlanQuota,
  planSellableTerms,
  planTermPrice,
  type PaginationMeta,
  type PlanInvoiceLine,
  type PlanInvoiceSnapshot,
  type PlanLimitsJson,
  type PlanQuotaSnapshot,
} from '@xeprime/types';
import { ListingsService } from '../public-listings/listings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import {
  AssignSubscriptionDto,
  CreatePlanDto,
  CreateSubscriptionCheckoutDto,
  CurrentPlanDto,
  MySubscriptionDto,
  PaymentInfoDto,
  PendingSubscriptionInvoiceDto,
  PlanDto,
  PlanListQueryDto,
  PreviewSubscriptionPurchaseDto,
  PurchaseSubscriptionDto,
  SUBSCRIPTION_DEFAULT_LIMIT,
  SUBSCRIPTION_MAX_LIMIT,
  SubscriptionCheckoutDto,
  SubscriptionDto,
  SubscriptionInvoiceDto,
  SubscriptionListQueryDto,
  SubscriptionPurchasePreviewDto,
  TenantPlanCatalogDto,
  TenantPlanDto,
  UpdatePlanDto,
  UpdateSubscriptionDto,
  VehicleTypeQuotaDto,
} from './dto/billing.dto';
import { paginationMeta, resolvePaging } from '../../common/pagination';
import {
  EFFECTIVE_SUBSCRIPTION_ARGS,
  currentSubscriptionWhere,
  effectiveSubscriptionWhere,
} from '../../common/plan/feature-state';
import { newReferenceCode } from '../../common/reference-code';

const PLAN_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  billingMode: true,
  commissionPercent: true,
  vehicleScope: true,
  limitsJson: true,
  currency: true,
  status: true,
  sortOrder: true,
  createdAt: true,
  _count: { select: { subscriptions: true } },
} satisfies Prisma.PlanSelect;

const INVOICE_SELECT = {
  id: true,
  tenantId: true,
  subscriptionId: true,
  code: true,
  periodFrom: true,
  periodTo: true,
  linesJson: true,
  subtotal: true,
  discountAmount: true,
  totalAmount: true,
  paidAmount: true,
  status: true,
  vehicleScope: true,
  paidAt: true,
  expiresAt: true,
  createdAt: true,
  checkout: { select: { id: true, code: true } },
} satisfies Prisma.SubscriptionInvoiceSelect;

const SUB_SELECT = {
  id: true,
  tenantId: true,
  planId: true,
  status: true,
  price: true,
  termMonths: true,
  quotaJson: true,
  billingMode: true,
  commissionPercent: true,
  vehicleScope: true,
  startsAt: true,
  endsAt: true,
  note: true,
  createdBy: true,
  createdAt: true,
  plan: { select: { code: true, name: true, limitsJson: true } },
} satisfies Prisma.TenantSubscriptionSelect;

/**
 * Khoá CHUỖI KỲ của một tenant (`subscriptionChainLockKey`) — mọi đường ghi `tenant_subscriptions`
 * lấy nó TRƯỚC khi đọc "đuôi": admin gán/huỷ, webhook kích hoạt, job hết hạn (worker). Khoá theo
 * transaction, tự nhả khi commit/rollback; lấy lại trong cùng transaction là no-op.
 */
async function lockSubscriptionChain(tx: Prisma.TransactionClient, tenantId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${subscriptionChainLockKey(tenantId)}))`;
}

/** Đủ để kể lại MỘT kỳ trong audit: kỳ được nối đuôi, kỳ bị huỷ, kỳ bị thay. */
const TERM_SNAPSHOT_SELECT = {
  id: true,
  planId: true,
  status: true,
  billingMode: true,
  vehicleScope: true,
  startsAt: true,
  endsAt: true,
  plan: { select: { code: true, name: true } },
} satisfies Prisma.TenantSubscriptionSelect;

type TermSnapshotRow = Prisma.TenantSubscriptionGetPayload<{
  select: typeof TERM_SNAPSHOT_SELECT;
}>;

/** Kỳ kèm thứ đủ để đọc TRẦN XE — đầu vào của `selfServePurchaseTiming` (ADR 0084). */
const CAP_TERM_SELECT = {
  ...TERM_SNAPSHOT_SELECT,
  quotaJson: true,
  plan: { select: { code: true, name: true, limitsJson: true } },
} satisfies Prisma.TenantSubscriptionSelect;

type CapTermRow = Prisma.TenantSubscriptionGetPayload<{ select: typeof CAP_TERM_SELECT }> &
  SubscriptionCapTerm;

/** Trần xe của một kỳ: `quota_json` trước, bậc gói sau — biểu thức TƯỜNG MINH (ADR 0041 điều 3). */
function withCap(
  row: Prisma.TenantSubscriptionGetPayload<{ select: typeof CAP_TERM_SELECT }>,
): CapTermRow {
  const quota = parsePlanQuota(row.quotaJson);
  return {
    ...row,
    maxVehicles: quota ? quota.maxVehicles : parsePlanLimits(row.plan.limitsJson).maxVehicles,
  };
}

/** Đủ để sửa một kỳ (ADR 0080): snapshot cho audit + giá, hạn mức, ghi chú, nguồn gốc. */
const EDIT_SELECT = {
  ...TERM_SNAPSHOT_SELECT,
  price: true,
  termMonths: true,
  quotaJson: true,
  note: true,
  createdBy: true,
  plan: { select: { code: true, name: true, limitsJson: true } },
} satisfies Prisma.TenantSubscriptionSelect;

/**
 * Ba cột claim của job vòng đời gắn với `ends_at` CŨ — kỳ đổi ngày thì xoá để nhắc gia hạn / báo
 * hết hạn chạy lại theo ngày mới, thay vì im lặng vì "đã nhắc rồi".
 */
const LIFECYCLE_CLAIMS_RESET = {
  renewalRemindedAt: null,
  expiryNotifiedAt: null,
  graceGuideNotifiedAt: null,
  lapseHandledAt: null,
} satisfies Prisma.TenantSubscriptionUpdateInput;

/** Kỳ TRẢ PHÍ — mọi dòng không phải hoa hồng 0đ (kể cả dòng cũ thiếu `billing_mode`). */
const isPaidRow = (term: TermSnapshotRow) => term.billingMode !== BILLING_MODE.COMMISSION;

function termSnapshot(term: TermSnapshotRow) {
  return {
    subscriptionId: term.id,
    planCode: term.plan.code,
    planName: term.plan.name,
    vehicleScope: term.vehicleScope,
    billingMode: term.billingMode,
    startsAt: term.startsAt.toISOString(),
    endsAt: term.endsAt.toISOString(),
  };
}

/**
 * Writer DUY NHẤT của `plans` + `tenant_subscriptions` (ADR 0010, giữ nguyên qua ADR 0015).
 *
 * Lịch sử thuê bao append-only: gán/gia hạn CHÈN dòng mới (`startsAt` nối đuôi gói hiện hành
 * còn hạn, hoặc = now), không update dòng cũ trừ huỷ sớm (active → cancelled). "Hết hạn" suy
 * ra từ `endsAt` — không job. Mọi mutation ghi audit trong cùng transaction.
 *
 * Từ ADR 0041: bậc gói bán theo TRẦN SỐ XE + KỲ HẠN, giá là con số tuyệt đối của kỳ hạn
 * (`limits.termPrices`) chứ không phải một phép nhân. Kỳ hạn tính bằng THÁNG LỊCH
 * (`addCalendarMonthsVn`, không bao giờ `× 30 ngày`); chế độ thu phí VÀ hạn mức đều SNAPSHOT lên
 * dòng subscription lúc gán (ADR 0024 điều 2 · ADR 0041 điều 3).
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    /** ADR 0024 ràng buộc 2: BillingService GỌI writer của `public_listings`, không tự ghi. */
    private readonly listings: ListingsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Thông tin nhận chuyển khoản của nền tảng — nguồn cho ảnh VietQR ở màn thanh toán hoá đơn.
   * Cấu hình đi theo nhóm bốn-biến-hoặc-không (env.schema đã canh), nên chỉ cần dò một biến.
   */
  paymentInfo(): PaymentInfoDto {
    const bankCode = this.config.get<string>('SEPAY_BANK_CODE') ?? null;
    if (!bankCode) {
      return {
        configured: false,
        bankCode: null,
        accountNumber: null,
        accountName: null,
        transferPrefix: null,
      };
    }
    return {
      configured: true,
      bankCode,
      accountNumber: this.config.get<string>('SEPAY_ACCOUNT_NUMBER') ?? null,
      accountName: this.config.get<string>('SEPAY_ACCOUNT_NAME') ?? null,
      transferPrefix: this.config.get<string>('SEPAY_TRANSFER_PREFIX') ?? null,
    };
  }

  // -------------------------------------------------------------------------
  // Plans
  // -------------------------------------------------------------------------

  async listPlans(query: PlanListQueryDto): Promise<PlanDto[]> {
    const where: Prisma.PlanWhereInput =
      query.status === 'all' ? {} : { status: query.status ?? PLAN_STATUS.ACTIVE };
    const rows = await this.prisma.plan.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: PLAN_SELECT,
    });
    return this.toPlanDtos(rows);
  }

  async createPlan(actorUserId: string, dto: CreatePlanDto): Promise<PlanDto> {
    const dup = await this.prisma.plan.findUnique({
      where: { code: dto.code },
      select: { id: true },
    });
    if (dup) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: 'Mã gói đã tồn tại',
      });
    }
    // Lỗi NHẬP LIỆU trước lỗi TRẠNG THÁI danh mục: phạm vi sai là sai bất kể danh mục đang có gì.
    const vehicleScope = this.planScopeForCreate(dto.billingMode, dto.vehicleScope);
    await this.assertCommissionTrackStaysSingle(dto.billingMode, null);

    const knobs = this.normalizePlanKnobs({
      billingMode: dto.billingMode,
      commissionPercent: dto.commissionPercent ?? null,
      limits: parsePlanLimits(dto.limits ?? null),
    });

    const row = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.plan.create({
        data: {
          id: newId(),
          code: dto.code,
          name: dto.name,
          description: dto.description ?? null,
          billingMode: knobs.billingMode,
          commissionPercent: knobs.commissionPercent,
          vehicleScope,
          limitsJson: knobs.limits as unknown as Prisma.InputJsonValue,
          sortOrder: dto.sortOrder ?? 0,
        },
        select: PLAN_SELECT,
      });
      await this.audit.record(
        {
          actorUserId,
          actorScope: 'platform',
          action: 'plan.create',
          targetType: 'plan',
          targetId: plan.id,
          after: {
            code: dto.code,
            name: dto.name,
            billingMode: knobs.billingMode,
            commissionPercent: knobs.commissionPercent,
            vehicleScope,
            ...planAuditKnobs(knobs.limits),
          },
        },
        tx,
      );
      return plan;
    });
    // Bậc vừa tạo chưa thể có hoá đơn nào trỏ tới — không cần hỏi.
    return toPlanDto(row, 0);
  }

  async updatePlan(actorUserId: string, id: string, dto: UpdatePlanDto): Promise<PlanDto> {
    const current = await this.loadPlan(id);
    /*
     * Hai cổng, cùng một nỗi lo nhưng ngược chiều nhau — và cả hai đều nằm ở đây vì `updatePlan`
     * là đường duy nhất đổi được `billing_mode` của một bậc đã tồn tại:
     *
     *   commission → package : bậc mặc định BIẾN MẤT khỏi tuyến hoa hồng ⇒ gian hàng mở sau đó
     *                          rơi vào pha `unconfigured` (ADR 0038 điều 1).
     *   package → commission : sinh ra bậc hoa hồng THỨ HAI ⇒ phép chọn "sort_order nhỏ nhất"
     *                          thành một cuộc xổ số giữa hai mức phí dịch vụ.
     */
    if (dto.billingMode !== undefined && dto.billingMode !== current.billingMode) {
      if (current.billingMode === BILLING_MODE.COMMISSION) {
        throw new ConflictException({
          code: API_ERROR_CODE.DEFAULT_PLAN_PROTECTED,
          message:
            'Đây là bậc mặc định của TUYẾN HOA HỒNG — không đổi được sang gói thuê bao. ' +
            'Muốn thêm lựa chọn cho gian hàng thì tạo một gói `package` mới.',
          details: { planCode: current.code, operation: 'change_billing_mode' },
        });
      }
      await this.assertCommissionTrackStaysSingle(dto.billingMode, current.id);
      // Bậc theo loại xe không thành bậc hoa hồng được (CHECK `plans_commission_scope_all`).
      this.planScopeForCreate(dto.billingMode, current.vehicleScope);
    }

    // Chuẩn hoá trên hình MERGED (field không gửi = giữ giá trị đang lưu): phép kiểm chạy trên
    // trạng thái SẼ được lưu, không phải trên mảnh dto — sửa mỗi cái tên của một bậc `commission`
    // vẫn phải giữ đúng bất biến "% bắt buộc, 1–20" mà CHECK ở DB cũng canh.
    const knobs = this.normalizePlanKnobs({
      billingMode: dto.billingMode ?? current.billingMode,
      commissionPercent:
        dto.commissionPercent !== undefined
          ? dto.commissionPercent
          : current.commissionPercent === null
            ? null
            : Number(current.commissionPercent),
      limits: parsePlanLimits(dto.limits !== undefined ? dto.limits : current.limitsJson),
    });
    const before = parsePlanLimits(current.limitsJson);

    const row = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.plan.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          // Bộ núm ghi TRỌN theo hình merged đã kiểm — mỗi lần sửa là một lần chuẩn hoá
          // limits_json về đủ hình dạng ADR 0041 điều 1.
          billingMode: knobs.billingMode,
          commissionPercent: knobs.commissionPercent,
          limitsJson: knobs.limits as unknown as Prisma.InputJsonValue,
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
        select: PLAN_SELECT,
      });
      await this.audit.record(
        {
          actorUserId,
          actorScope: 'platform',
          action: 'plan.update',
          targetType: 'plan',
          targetId: id,
          before: {
            name: current.name,
            billingMode: current.billingMode,
            commissionPercent:
              current.commissionPercent === null ? null : current.commissionPercent.toString(),
            ...planAuditKnobs(before),
          },
          after: {
            name: plan.name,
            billingMode: plan.billingMode,
            commissionPercent:
              plan.commissionPercent === null ? null : plan.commissionPercent.toString(),
            ...planAuditKnobs(knobs.limits),
          },
        },
        tx,
      );
      return plan;
    });
    return this.toPlanDtoOne(row);
  }

  /**
   * NGỪNG BÁN (archive) một bậc gói.
   *
   * ⚠️ Archive là chuyện của DANH MỤC, không phải của khách hàng: **không một thuê bao nào bị
   * huỷ**. Mọi `tenant_subscriptions` đang trỏ tới bậc này chạy hết kỳ của nó, giữ nguyên
   * `billing_mode`, `quota_json` và `commission_percent` đã snapshot (ADR 0024) — thứ duy nhất
   * mất đi là khả năng MUA MỚI bậc đó (`purchase` từ chối `status != active`) và khả năng admin
   * gán nó cho một tenant khác. Huỷ thuê bao là `cancel()`, một thao tác khác, trên một bảng
   * khác, có audit riêng.
   *
   * Bậc TUYẾN HOA HỒNG không archive được: nó không phải một SKU để ngừng bán mà là tuyến vào
   * cửa của toàn sàn, và `assignDefaultPlanWithinTx` chọn đúng "bậc commission đang bán có
   * sort_order nhỏ nhất". Archive nó là làm mọi gian hàng mở sau đó không có tuyến thu phí.
   */
  async archivePlan(actorUserId: string, id: string): Promise<PlanDto> {
    const current = await this.loadPlan(id);
    if (current.billingMode === BILLING_MODE.COMMISSION) {
      throw new ConflictException({
        code: API_ERROR_CODE.DEFAULT_PLAN_PROTECTED,
        message:
          'Không ngừng bán được bậc mặc định của TUYẾN HOA HỒNG — mọi chủ xe cá nhân vào cửa ' +
          'bằng chính nó. Đây không phải một gói để khách chọn mua.',
        details: { planCode: current.code, operation: 'archive' },
      });
    }
    return this.transitionPlanStatus(actorUserId, current, PLAN_STATUS.ARCHIVED);
  }

  /**
   * MỞ BÁN LẠI một bậc gói đã ngừng bán — chiều ngược của `archivePlan`.
   *
   * Cũng là chuyện của DANH MỤC: bậc hiện lại trên bảng giá gian hàng (`listPlansForTenant`) và
   * admin gán được nó cho tenant khác. Không đụng một thuê bao nào — thuê bao chạy trên bậc này
   * trong lúc nó ngừng bán vẫn mang đúng snapshot của chính nó (ADR 0024). Lượt mua MỚI sau khi
   * mở lại chụp bảng giá và hạn mức của bậc TẠI THỜI ĐIỂM MUA, như mọi lượt mua khác.
   *
   * Bậc tuyến hoa hồng không bao giờ bị archive qua API (`archivePlan` chặn), nhưng dữ liệu tay
   * thì có thể. Mở lại một bậc `commission` khi danh mục đã có bậc hoa hồng khác là sinh ra bậc
   * thứ hai — cùng cổng singleton với `createPlan`/`updatePlan`.
   */
  async activatePlan(actorUserId: string, id: string): Promise<PlanDto> {
    const current = await this.loadPlan(id);
    await this.assertCommissionTrackStaysSingle(current.billingMode, current.id);
    return this.transitionPlanStatus(actorUserId, current, PLAN_STATUS.ACTIVE);
  }

  /**
   * Lật `plans.status` — đường ghi chung của MỞ BÁN (`draft`/`archived` → `active`) và NGỪNG BÁN
   * (`active`/`draft` → `archived`). `draft` (ADR 0065) là bậc mới chưa chốt giá: mở bán là lần
   * đầu nó xuất hiện ở bảng giá gian hàng.
   *
   * Compare-and-set bằng `updateMany … WHERE status = <nguồn>` thay cho đọc-rồi-ghi: hai admin
   * bấm công tắc cùng lúc thì đúng một lượt đổi được, lượt kia nhận
   * `INVALID_STATUS_TRANSITION` — không phải hai dòng audit cho một lần đổi, và không có lượt nào
   * "thành công" trên một trạng thái nó chưa từng nhìn thấy.
   */
  private async transitionPlanStatus(
    actorUserId: string,
    current: PlanRow,
    to: PlanStatus,
  ): Promise<PlanDto> {
    const fromStatuses: PlanStatus[] =
      to === PLAN_STATUS.ACTIVE
        ? [PLAN_STATUS.ARCHIVED, PLAN_STATUS.DRAFT]
        : [PLAN_STATUS.ACTIVE, PLAN_STATUS.DRAFT];
    const from = current.status;
    const row = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.plan.updateMany({
        where: { id: current.id, status: { in: fromStatuses } },
        data: { status: to },
      });
      if (count === 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
          message: to === PLAN_STATUS.ACTIVE ? 'Gói đang được bán' : 'Gói đã ngừng bán',
          details: { planCode: current.code, status: to },
        });
      }
      await this.audit.record(
        {
          actorUserId,
          actorScope: 'platform',
          action: to === PLAN_STATUS.ACTIVE ? 'plan.activate' : 'plan.archive',
          targetType: 'plan',
          targetId: current.id,
          before: { status: from },
          after: { status: to },
        },
        tx,
      );
      return tx.plan.findUniqueOrThrow({ where: { id: current.id }, select: PLAN_SELECT });
    });
    return this.toPlanDtoOne(row);
  }

  /**
   * XOÁ HẲN một bậc gói — chỉ cho bậc CHƯA TỪNG được dùng (bản nháp tạo nhầm).
   *
   * "Dùng" nghĩa là có dòng `tenant_subscriptions` HOẶC có hoá đơn gói trỏ tới nó, ở BẤT KỲ trạng
   * thái nào. Hoá đơn là vế dễ bỏ sót: nó trỏ tới bậc qua `lines_json.planId`, không có FK, nên
   * DB không tự chặn — và một hoá đơn CHƯA TRẢ của bậc đã xoá là một vụ mất tiền chờ sẵn: tiền về,
   * `activateFromInvoiceWithinTx` không tìm thấy bậc, transaction đổ, SePay gửi lại mãi mà gian
   * hàng không bao giờ có gói. Bậc đã dùng thì TẮT (archive), không xoá.
   *
   * Thứ tự khoá đóng cửa sổ đua với một lượt mua đang chạy:
   *  - ở đây khoá hàng `plans` bằng `FOR UPDATE` TRƯỚC khi đếm;
   *  - `purchase` giữ `FOR KEY SHARE` trên cùng hàng tới hết transaction tạo hoá đơn;
   *  - gán tay (`assign`) chèn `tenant_subscriptions` — FK `RESTRICT` tự lấy khoá tương đương.
   * Nên hoặc lượt mua commit trước và phép đếm ở đây thấy hoá đơn của nó, hoặc lượt xoá commit
   * trước và lượt mua không còn hàng nào để khoá. FK vẫn là lưới cuối nếu có đường ghi nào khác.
   */
  async deletePlan(actorUserId: string, id: string): Promise<void> {
    const current = await this.loadPlan(id);
    if (current.billingMode === BILLING_MODE.COMMISSION) {
      throw new ConflictException({
        code: API_ERROR_CODE.DEFAULT_PLAN_PROTECTED,
        message: 'Không xoá được bậc mặc định của TUYẾN HOA HỒNG — mọi chủ xe cá nhân vào cửa bằng nó.',
        details: { planCode: current.code, operation: 'delete' },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM plans WHERE id = ${id} FOR UPDATE`;
      if (locked.length === 0) {
        throw new NotFoundException({
          code: API_ERROR_CODE.NOT_FOUND,
          message: 'Không tìm thấy gói dịch vụ',
        });
      }
      const subscriptions = await tx.tenantSubscription.count({ where: { planId: id } });
      const invoices = (await this.planInvoiceCounts([id], tx)).get(id) ?? 0;
      if (subscriptions > 0 || invoices > 0) {
        throw new ConflictException({
          code: API_ERROR_CODE.PLAN_IN_USE,
          message: 'Gói đã có thuê bao hoặc hoá đơn nên không xoá được — hãy ngừng bán thay vì xoá',
          details: { planCode: current.code, subscriptions, invoices },
        });
      }
      await tx.plan.delete({ where: { id } });
      await this.audit.record(
        {
          actorUserId,
          actorScope: 'platform',
          action: 'plan.delete',
          targetType: 'plan',
          targetId: id,
          // Bản chụp đủ để dựng lại bậc nếu xoá nhầm — hàng `plans` không còn nữa.
          before: {
            code: current.code,
            name: current.name,
            description: current.description,
            status: current.status,
            billingMode: current.billingMode,
            sortOrder: current.sortOrder,
            ...planAuditKnobs(parsePlanLimits(current.limitsJson)),
          },
        },
        tx,
      );
    });
  }

  /** Như `toPlanDtos` cho đúng một hàng. */
  private async toPlanDtoOne(row: PlanRow): Promise<PlanDto> {
    const [dto] = await this.toPlanDtos([row]);
    return dto as PlanDto;
  }

  /**
   * Gắn cờ `deletable` cho một loạt bậc gói — MỘT truy vấn hoá đơn cho cả loạt, không N+1.
   *
   * Chỉ hỏi hoá đơn cho bậc CHƯA có thuê bao nào (và không phải tuyến hoa hồng): bậc đã có thuê
   * bao thì đằng nào cũng không xoá được, và một hoá đơn đã trả luôn sinh ra một thuê bao — nên
   * tập cần quét thường chỉ là vài bản nháp, thường là rỗng.
   */
  private async toPlanDtos(rows: PlanRow[]): Promise<PlanDto[]> {
    const candidates = rows
      .filter((row) => row.billingMode !== BILLING_MODE.COMMISSION && row._count.subscriptions === 0)
      .map((row) => row.id);
    const invoices = await this.planInvoiceCounts(candidates);
    return rows.map((row) => toPlanDto(row, invoices.get(row.id) ?? 0));
  }

  /**
   * Số hoá đơn gói trỏ tới từng bậc qua `lines_json.planId` (mọi trạng thái). Không có FK cho
   * quan hệ này — hoá đơn là SNAPSHOT lượt mua (ADR 0041 điều 3) — nên nó được đếm bằng SQL.
   */
  private async planInvoiceCounts(
    planIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, number>> {
    if (planIds.length === 0) return new Map();
    const client = tx ?? this.prisma;
    const rows = await client.$queryRaw<{ plan_id: string; n: bigint }[]>`
      SELECT lines_json->>'planId' AS plan_id, count(*) AS n
        FROM subscription_invoices
       WHERE lines_json->>'planId' = ANY(${planIds}::text[])
       GROUP BY 1`;
    return new Map(rows.map((row) => [row.plan_id, Number(row.n)]));
  }

  // -------------------------------------------------------------------------
  // Subscriptions
  // -------------------------------------------------------------------------

  async listSubscriptions(
    tenantId: string,
    query: SubscriptionListQueryDto,
  ): Promise<{ data: SubscriptionDto[]; meta: PaginationMeta }> {
    await this.assertTenant(tenantId);
    const paging = resolvePaging(query, SUBSCRIPTION_DEFAULT_LIMIT, SUBSCRIPTION_MAX_LIMIT);
    /*
     * `state=live`: chuỗi kỳ còn hạn — tối đa vài dòng (kỳ đang chạy + kỳ đã xếp lịch), nên vẫn đi
     * qua phân trang nhưng sắp theo ngày BẮT ĐẦU. Màn gia hạn đọc nó thay vì suy từ trang đầu của
     * lịch sử: lịch sử sắp theo ngày tạo, và vài vòng xếp lịch/huỷ đủ đẩy kỳ đang chạy khỏi trang 1.
     */
    const live = query.state === 'live';
    const where: Prisma.TenantSubscriptionWhereInput = live
      ? { tenantId, status: SUBSCRIPTION_STATUS.ACTIVE, endsAt: { gt: new Date() } }
      : { tenantId };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.tenantSubscription.count({ where }),
      this.prisma.tenantSubscription.findMany({
        where,
        orderBy: live ? [{ startsAt: 'asc' }, { id: 'asc' }] : [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: paging.skip,
        take: paging.take,
        select: SUB_SELECT,
      }),
    ]);

    return {
      data: rows.map(toSubscriptionDto),
      meta: paginationMeta(paging, total),
    };
  }

  /**
   * Gán / gia hạn / đổi gói: chèn MỘT dòng mới (lịch sử append-only — ADR 0010).
   *
   * Kỳ mới bắt đầu lúc nào do `dto.timing` quyết (`SUBSCRIPTION_CHANGE_TIMING`):
   *  - `next_term` (mặc định): nối đuôi kỳ trả phí cuối cùng còn hạn (`planChainWithinTx`).
   *    Audit `subscription.renew` nếu CÙNG bậc, `subscription.schedule_change` nếu khác bậc —
   *    người đối soát phải phân biệt được gia hạn với đổi gói từ kỳ sau.
   *  - `now`: huỷ mọi kỳ còn hạn rồi bắt đầu từ `now`, trong CHÍNH transaction này
   *    (`planChainWithinTx` — ADR 0041 điều 6). Audit `subscription.change_now` + một dòng
   *    `subscription.cancel` cho mỗi kỳ trả phí bị thay.
   * Không còn kỳ trả phí nào ⇒ bắt đầu từ `now`, audit `subscription.assign`.
   */
  async assign(
    tenantId: string,
    actorUserId: string,
    dto: AssignSubscriptionDto,
  ): Promise<SubscriptionDto> {
    await this.assertTenant(tenantId);
    const plan = await this.loadPlan(dto.planId);
    /*
     * `draft` (ADR 0065 — CHƯA MỞ BÁN): bảng giá của nó là số GIỮ CHỖ, nên gán tay chỉ được khi
     * admin gõ GIÁ tường minh; rơi về giá niêm yết của một bậc chưa chốt giá là thu một con số
     * không ai quyết. `archived` thì không gán được như trước.
     */
    if (plan.status === PLAN_STATUS.DRAFT && dto.price === undefined) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Gói chưa mở bán (giá đang là số tạm) — nhập giá cho lượt gán này, hoặc mở bán gói trước',
        details: { field: 'price', planStatus: plan.status },
      });
    }
    if (plan.status === PLAN_STATUS.ARCHIVED) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: 'Gói đã ngừng bán, không gán được',
      });
    }

    const limits = parsePlanLimits(plan.limitsJson);
    const quota = quotaOf(limits);
    /*
     * Giá của một lượt GÁN TAY: ưu tiên con số admin gõ, rơi về giá niêm yết của kỳ hạn.
     *
     * Admin được quyền lệch khỏi bảng giá (tặng, khuyến mãi, hợp đồng đàm phán) và mỗi lượt đều
     * có audit. Nhưng bậc `salesOnly` KHÔNG có bảng giá để rơi về (ADR 0041 điều 5), nên ở đó
     * thiếu `price` là lỗi nhập liệu — mặc định 0đ sẽ tặng một gói doanh nghiệp vì một ô trống.
     */
    /*
     * Tuyến hoa hồng KHÔNG có bảng giá và cũng không cần một cái: thuê bao của nó là 0đ, tiền
     * nằm ở khoản giữ chỗ theo chuyến (ADR 0029 điều 2). Đòi `price` ở đây là chặn chính đường
     * mà `assignDefaultPlanWithinTx` và job vòng đời đi qua.
     */
    const listed =
      plan.billingMode === BILLING_MODE.COMMISSION ? '0' : planTermPrice(limits, dto.termMonths);
    if (dto.price === undefined && listed === null) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: limits.salesOnly
          ? 'Bậc gói này bán bằng tư vấn — nhập giá đàm phán cho kỳ hạn đã chọn'
          : `Bậc gói này không niêm yết giá cho kỳ ${dto.termMonths} tháng — nhập giá, hoặc chọn kỳ hạn có trong bảng giá`,
        details: { field: 'price', termMonths: dto.termMonths, salesOnly: limits.salesOnly },
      });
    }
    const pricing = this.priceTerm(dto.price ?? (listed as string), dto.termMonths);
    const price = pricing.total;

    const row = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      // Nối đuôi theo endsAt MUỘN NHẤT còn active (kể cả chu kỳ tương lai đã xếp hàng) — dùng
      // findCurrent (startsAt <= now) ở đây sẽ tạo 2 chu kỳ chồng nhau khi gia hạn 2 lần. Dòng
      // hoa hồng 0đ thì bị HUỶ chứ không nối sau; xem `planChainWithinTx`.
      // Khoá chuỗi kỳ + đặt lượt gán vào chuỗi + huỷ kỳ bị thay — một phép, cùng transaction.
      const chain = await this.planChainWithinTx(tx, {
        tenantId,
        planId: plan.id,
        vehicleScope: planVehicleScopeOf(plan.vehicleScope),
        timing: dto.timing,
        actorUserId,
        now,
      });
      const { startsAt } = chain;
      // THÁNG LỊCH, không phải N×30 ngày (ADR 0015 điều 2) — cùng định nghĩa "một tháng"
      // với thuê dài hạn (ADR 0011).
      const endsAt = addCalendarMonthsVn(startsAt, dto.termMonths);

      const sub = await tx.tenantSubscription.create({
        data: {
          id: newId(),
          tenantId,
          planId: plan.id,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          price,
          termMonths: dto.termMonths,
          // SNAPSHOT phạm vi loại xe (ADR 0065) — trigger ở DB đòi nó khớp phạm vi của bậc.
          vehicleScope: plan.vehicleScope,
          // SNAPSHOT hạn mức (ADR 0041 điều 3) — chỉ tuyến gói có; tuyến hoa hồng không mua hạn
          // mức nào, trần của nó là `OWNER_LITE_VEHICLE_LIMIT` trong code.
          quotaJson:
            plan.billingMode === BILLING_MODE.PACKAGE
              ? (quota as unknown as Prisma.InputJsonValue)
              : Prisma.DbNull,
          // SNAPSHOT chế độ thu phí (ADR 0024 điều 2) — admin sửa plan sau đó KHÔNG được
          // lật chế độ của dòng này giữa kỳ.
          billingMode: plan.billingMode,
          commissionPercent: plan.commissionPercent,
          startsAt,
          endsAt,
          note: dto.note ?? null,
          createdBy: actorUserId,
        },
        select: SUB_SELECT,
      });

      /*
       * Admin gán một gói `package` cho gian hàng đang chờ thanh toán cũng là ONBOARDING XONG
       * (ADR 0040): tiền đã thu ngoài luồng, nên giữ họ ở màn "hãy chuyển khoản" là bắt họ trả
       * tiền lần thứ hai. Cùng transaction, cùng lý do với đường webhook.
       */
      await this.completePackageOnboardingWithinTx(tx, tenantId, plan.billingMode);
      await this.voidInvoicesSupersededByScopeWithinTx(tx, tenantId, plan);

      // Hoá đơn gói cho lượt gán tay (ADR 0015 điều 5): admin gán = đã thu tiền ngoài luồng
      // ⇒ hoá đơn `paid` gắn thẳng vào subscription. 0đ (gói tuyến hoa hồng) thì không sinh
      // chứng từ — một hoá đơn 0đ là nhiễu trong sổ.
      if (!price.isZero()) {
        await this.createInvoiceWithinTx(tx, {
          tenantId,
          subscriptionId: sub.id,
          snapshot: {
            planId: plan.id,
            planCode: plan.code,
            termMonths: dto.termMonths,
            vehicleScope: planVehicleScopeOf(plan.vehicleScope),
            quota,
            lines: pricing.lines,
          },
          subtotal: pricing.subtotal,
          discountAmount: pricing.discountAmount,
          periodFrom: startsAt,
          periodTo: endsAt,
          paid: true,
        });
      }

      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          /*
           * `renew` chỉ khi nối sau một kỳ ĐÃ TRẢ TIỀN cùng bậc. Nối sau (rồi huỷ) dòng hoa hồng
           * 0đ là NÂNG CẤP, không phải gia hạn — gọi nó là 'renew' làm mất dấu đúng sự kiện mà một
           * cuộc đối soát doanh thu đi tìm. Bảng quyết định: `planSubscriptionChain`.
           */
          action: SUBSCRIPTION_ASSIGN_KIND_ACTION[chain.kind],
          targetType: AUDIT_TARGET_TYPE.TENANT_SUBSCRIPTION,
          targetId: sub.id,
          after: {
            planCode: plan.code,
            // Tên gói lúc gán: audit phải đọc được kể cả khi bậc gói bị đổi tên/xoá sau này.
            planName: plan.name,
            price: price.toString(),
            // Dấu vết của một giá LỆCH bảng giá: một cuộc đối soát doanh thu phải phân biệt được
            // "admin gõ 0đ" với "bậc này niêm yết 0đ".
            listedPrice: listed,
            priceOverridden: dto.price !== undefined && dto.price !== listed,
            termMonths: dto.termMonths,
            quota,
            vehicleScope: plan.vehicleScope,
            billingMode: plan.billingMode,
            commissionPercent:
              plan.commissionPercent === null ? null : plan.commissionPercent.toString(),
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            // Kỳ mà lượt này nối đuôi (gia hạn / đổi gói từ kỳ sau) và các kỳ bị lượt "đổi ngay"
            // thay thế — để người đọc audit thấy được TỪ gói nào SANG gói nào.
            ...(chain.previous ? { previousTerm: termSnapshot(chain.previous) } : {}),
            ...(chain.kind === SUBSCRIPTION_ASSIGN_KIND.CHANGE_NOW
              ? { replacedTerms: chain.cancel.filter(isPaidRow).map(termSnapshot) }
              : {}),
            ...(dto.note ? { note: dto.note } : {}),
          },
        },
        tx,
      );
      return sub;
    });

    return toSubscriptionDto(row);
  }

  /**
   * Huỷ sớm một kỳ TRẢ PHÍ còn hạn — kỳ đang chạy hoặc kỳ đã xếp lịch (active → cancelled).
   *
   * Luật (`subscriptionCancelBlockOf`, web đọc cùng hàm):
   *  - Kỳ đã huỷ / đã hết hạn ⇒ `INVALID_STATUS_TRANSITION` — không còn gì để huỷ.
   *  - Dòng hoa hồng mặc định ⇒ `INVALID_STATUS_TRANSITION` — đổi tuyến bằng cách GÁN gói.
   *
   * Các kỳ XẾP SAU nó trong chuỗi (`laterChainTermsOf`) bị huỷ KÈM trong cùng transaction (ADR 0080
   * điều 1) — mỗi kỳ trả phí một dòng audit lý do `cascade`. Chuỗi không bao giờ bị hở một khoảng.
   *
   * Huỷ kỳ CUỐI CÙNG còn hạn thì trong CÙNG transaction gán lại dòng hoa hồng mặc định
   * (`assignDefaultPlanWithinTx`): "không có gói" là pha `unconfigured` — mọi đường ghi tiền từ
   * chối, và job vòng đời không bao giờ tự sửa vì nó chỉ nhặt dòng `active` (ADR 0038 điều 1).
   */
  async cancel(
    tenantId: string,
    actorUserId: string,
    subscriptionId: string,
  ): Promise<SubscriptionDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      await lockSubscriptionChain(tx, tenantId);
      const now = new Date();
      const target = await tx.tenantSubscription.findFirst({
        where: { id: subscriptionId, tenantId },
        select: TERM_SNAPSHOT_SELECT,
      });
      if (!target) {
        throw new NotFoundException({
          code: API_ERROR_CODE.NOT_FOUND,
          message: 'Không tìm thấy thuê bao',
        });
      }
      const live = await tx.tenantSubscription.findMany({
        where: { tenantId, status: SUBSCRIPTION_STATUS.ACTIVE, endsAt: { gt: now } },
        select: TERM_SNAPSHOT_SELECT,
      });
      const block = subscriptionCancelBlockOf(target, now);
      if (block) {
        throw new ConflictException({
          code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
          message:
            block === SUBSCRIPTION_CANCEL_BLOCK.DEFAULT_TERM
              ? 'Dòng tuyến hoa hồng mặc định không huỷ được — đổi tuyến bằng cách gán gói'
              : 'Chỉ huỷ được kỳ đang hiệu lực hoặc đang chờ đến kỳ',
        });
      }

      const cascade = laterChainTermsOf(target, live, now);
      const cancelledIds = new Set([target.id, ...cascade.map((term) => term.id)]);
      await tx.tenantSubscription.updateMany({
        where: { id: { in: [...cancelledIds] }, status: SUBSCRIPTION_STATUS.ACTIVE },
        data: { status: SUBSCRIPTION_STATUS.CANCELLED },
      });
      /*
       * Còn kỳ nào ĐANG CHẠY ở bất kỳ phạm vi nào không (ADR 0065) — huỷ gói ô tô khi gói xe máy
       * còn hạn thì gian hàng vẫn ở tuyến gói, không gán dòng hoa hồng.
       *
       * "Đang chạy" chứ không "còn hạn": với nhiều phạm vi, một kỳ xe máy CHỈ ĐÃ XẾP LỊCH có thể
       * còn lại sau khi huỷ kỳ ô tô đang chạy (luật "kỳ xếp sau" chỉ xét phạm vi xung đột). Không
       * gán gì lúc đó là để gian hàng trống tuyến tới ngày kỳ xe máy bắt đầu — pha `unconfigured`.
       * Dòng hoa hồng gán ở đây nhường chỗ ngay khi kỳ gói đó bắt đầu (`resolveEffectiveBilling`:
       * kỳ gói còn hạn thắng dòng hoa hồng).
       */
      /*
       * Kỳ gói đang ÂN HẠN (đã hết hạn, chưa qua `graceDays`) cũng giữ tuyến (ADR 0038 điều 1 ·
       * ADR 0065 điều 5) — nó không có trong `live` (`ends_at > now`), nên hỏi chính phép chấm kỳ
       * hiệu lực trên các dòng đã bắt đầu, SAU khi kỳ bị huỷ đã lật `cancelled`.
       */
      const stillRunning =
        live.some((term) => !cancelledIds.has(term.id) && term.startsAt.getTime() <= now.getTime()) ||
        resolveActivePackageTerms(await this.loadEffectiveRows(tenantId, now, tx), now).length > 0;
      const fallback = stillRunning
        ? null
        : await this.assignDefaultPlanWithinTx(tx, tenantId, now);

      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: SUBSCRIPTION_AUDIT_ACTION.CANCEL,
          targetType: AUDIT_TARGET_TYPE.TENANT_SUBSCRIPTION,
          targetId: target.id,
          // Kỳ bị huỷ nằm ở CẢ HAI bên: phép so trước/sau chỉ còn đúng trạng thái và lý do.
          before: { status: SUBSCRIPTION_STATUS.ACTIVE, term: termSnapshot(target) },
          after: {
            status: SUBSCRIPTION_STATUS.CANCELLED,
            reason: SUBSCRIPTION_CANCEL_REASON.MANUAL,
            term: termSnapshot(target),
            ...(cascade.length > 0 ? { cascadedTerms: cascade.map(termSnapshot) } : {}),
            ...(fallback ? { fallbackTerm: termSnapshot(fallback) } : {}),
          },
        },
        tx,
      );
      // Dòng hoa hồng đã xếp lịch bị huỷ kèm là dòng hệ thống — như `planChainWithinTx`, không audit.
      for (const term of cascade.filter(isPaidRow)) {
        await this.audit.record(
          {
            tenantId,
            actorUserId,
            actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
            action: SUBSCRIPTION_AUDIT_ACTION.CANCEL,
            targetType: AUDIT_TARGET_TYPE.TENANT_SUBSCRIPTION,
            targetId: term.id,
            before: { status: SUBSCRIPTION_STATUS.ACTIVE, term: termSnapshot(term) },
            after: {
              status: SUBSCRIPTION_STATUS.CANCELLED,
              reason: SUBSCRIPTION_CANCEL_REASON.CASCADE,
              term: termSnapshot(term),
              causedBy: target.id,
            },
          },
          tx,
        );
      }
      return tx.tenantSubscription.findUniqueOrThrow({
        where: { id: target.id },
        select: SUB_SELECT,
      });
    });
    return toSubscriptionDto(row);
  }

  /**
   * Sửa một kỳ TRẢ PHÍ còn hạn — giá, ngày kết thúc, trần số xe, ghi chú (ADR 0080 điều 2–3).
   *
   *  - Kỳ đã huỷ / hết hạn / dòng hoa hồng ⇒ `SUBSCRIPTION_TERM_NOT_EDITABLE`.
   *  - GIÁ chỉ sửa được ở kỳ admin gán (`origin = admin`): kỳ sinh từ hoá đơn gian hàng đã trả
   *    phải giữ số tiền khớp hoá đơn ⇒ `SUBSCRIPTION_PRICE_NOT_EDITABLE`. Hoá đơn `paid` của kỳ admin
   *    gán được ghi lại theo giá mới (0đ ⇒ void; chưa có mà giá > 0 ⇒ sinh mới) — hoá đơn đó là
   *    chứng từ của chính lượt gán, không phải một khoản tiền qua đối soát.
   *  - NGÀY KẾT THÚC đổi thì các kỳ xếp sau trong chuỗi dời theo cùng khoảng (`subscriptionShiftPlan`)
   *    — mỗi kỳ bị dời một dòng audit `subscription.shift`. Thứ tự ghi đi theo EXCLUDE (kiểm từng
   *    dòng): kéo dài thì dời kỳ muộn nhất trước, rút ngắn thì sửa kỳ này trước. Chồng lên kỳ ngoài
   *    chuỗi ⇒ EXCLUDE từ chối ⇒ `SUBSCRIPTION_TERM_CONFLICT`, cả transaction rơi.
   *    Ba cột claim của job vòng đời trên các kỳ bị đổi ngày được xoá để nhắc lại theo ngày mới.
   *  - TRẦN SỐ XE ghi vào snapshot `quota_json` của kỳ (ADR 0041 điều 3). Hạ trần dưới số xe đang
   *    dùng không gỡ xe nào — như hạ bậc, cổng tạo/đưa xe lên chợ chặn từ lượt sau.
   */
  async updateSubscription(
    tenantId: string,
    actorUserId: string,
    subscriptionId: string,
    dto: UpdateSubscriptionDto,
  ): Promise<SubscriptionDto> {
    if (
      dto.price === undefined &&
      dto.endsAt === undefined &&
      dto.maxVehicles === undefined &&
      dto.note === undefined
    ) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Chưa có thay đổi nào để lưu',
      });
    }

    const row = await this.prisma.$transaction(async (tx) => {
      await lockSubscriptionChain(tx, tenantId);
      const now = new Date();
      const target = await tx.tenantSubscription.findFirst({
        where: { id: subscriptionId, tenantId },
        select: EDIT_SELECT,
      });
      if (!target) {
        throw new NotFoundException({
          code: API_ERROR_CODE.NOT_FOUND,
          message: 'Không tìm thấy thuê bao',
        });
      }
      const block = subscriptionEditBlockOf(target, now);
      if (block) {
        throw new ConflictException({
          code: API_ERROR_CODE.SUBSCRIPTION_TERM_NOT_EDITABLE,
          message:
            block === SUBSCRIPTION_EDIT_BLOCK.COMMISSION_TERM
              ? 'Dòng tuyến hoa hồng không sửa được — đổi tuyến bằng cách gán gói'
              : 'Chỉ sửa được kỳ đang hiệu lực hoặc đang chờ đến kỳ',
          details: { reason: block },
        });
      }
      const adminOrigin = subscriptionOriginOf(target) === SUBSCRIPTION_ORIGIN.ADMIN;
      if (dto.price !== undefined && !adminOrigin) {
        throw new ConflictException({
          code: API_ERROR_CODE.SUBSCRIPTION_PRICE_NOT_EDITABLE,
          message: 'Kỳ sinh từ hoá đơn gian hàng đã thanh toán — không sửa được giá',
        });
      }
      const endsAt = dto.endsAt === undefined ? target.endsAt : new Date(dto.endsAt);
      if (dto.endsAt !== undefined && !subscriptionEndsAtValid(target, endsAt, now)) {
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: `Ngày kết thúc phải sau ngày bắt đầu, sau hôm nay và trong ${SUBSCRIPTION_EDIT_MAX_END_MONTHS} tháng tới`,
          details: { field: 'endsAt', maxMonths: SUBSCRIPTION_EDIT_MAX_END_MONTHS },
        });
      }

      const price =
        dto.price === undefined ? target.price : new Prisma.Decimal(dto.price).toDecimalPlaces(2);
      const beforeQuota =
        parsePlanQuota(target.quotaJson) ?? quotaOf(parsePlanLimits(target.plan.limitsJson));
      const quota: PlanQuotaSnapshot =
        dto.maxVehicles === undefined ? beforeQuota : { ...beforeQuota, maxVehicles: dto.maxVehicles };
      const note = dto.note === undefined ? target.note : dto.note?.trim() || null;

      const priceChanged = !price.equals(target.price);
      const endsChanged = endsAt.getTime() !== target.endsAt.getTime();
      const quotaChanged = quota.maxVehicles !== beforeQuota.maxVehicles;
      const noteChanged = note !== target.note;
      if (!priceChanged && !endsChanged && !quotaChanged && !noteChanged) {
        return tx.tenantSubscription.findUniqueOrThrow({
          where: { id: target.id },
          select: SUB_SELECT,
        });
      }

      const live = await tx.tenantSubscription.findMany({
        where: { tenantId, status: SUBSCRIPTION_STATUS.ACTIVE, endsAt: { gt: now } },
        select: { ...TERM_SNAPSHOT_SELECT, createdBy: true },
      });
      const shifts = subscriptionShiftPlan(target, live, endsAt, now);
      const extending = endsAt.getTime() > target.endsAt.getTime();
      const shiftOne = async (shift: (typeof shifts)[number]) => {
        await tx.tenantSubscription.update({
          where: { id: shift.term.id },
          data: { startsAt: shift.startsAt, endsAt: shift.endsAt, ...LIFECYCLE_CLAIMS_RESET },
        });
        if (shift.term.createdBy) {
          await tx.subscriptionInvoice.updateMany({
            where: { subscriptionId: shift.term.id, status: SUBSCRIPTION_INVOICE_STATUS.PAID },
            data: { periodFrom: shift.startsAt, periodTo: shift.endsAt },
          });
        }
      };
      if (extending) {
        for (const shift of [...shifts].reverse()) await shiftOne(shift);
      }
      const updated = await tx.tenantSubscription.update({
        where: { id: target.id },
        data: {
          price,
          endsAt,
          note,
          ...(quotaChanged ? { quotaJson: quota as unknown as Prisma.InputJsonValue } : {}),
          ...(endsChanged ? LIFECYCLE_CLAIMS_RESET : {}),
        },
        select: SUB_SELECT,
      });
      if (!extending) {
        for (const shift of shifts) await shiftOne(shift);
      }

      if (adminOrigin && (priceChanged || endsChanged || quotaChanged)) {
        await this.syncAdminInvoiceWithinTx(tx, {
          tenantId,
          term: updated,
          quota,
        });
      }

      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
          action: SUBSCRIPTION_AUDIT_ACTION.UPDATE,
          targetType: AUDIT_TARGET_TYPE.TENANT_SUBSCRIPTION,
          targetId: target.id,
          before: {
            term: termSnapshot(target),
            price: target.price.toString(),
            maxVehicles: beforeQuota.maxVehicles,
            note: target.note,
          },
          after: {
            term: termSnapshot(updated),
            price: price.toString(),
            maxVehicles: quota.maxVehicles,
            note,
            ...(shifts.length > 0
              ? {
                  shiftedTerms: shifts.map((shift) => ({
                    subscriptionId: shift.term.id,
                    startsAt: shift.startsAt.toISOString(),
                    endsAt: shift.endsAt.toISOString(),
                  })),
                }
              : {}),
          },
        },
        tx,
      );
      for (const shift of shifts) {
        await this.audit.record(
          {
            tenantId,
            actorUserId,
            actorScope: AUDIT_ACTOR_SCOPE.PLATFORM,
            action: SUBSCRIPTION_AUDIT_ACTION.SHIFT,
            targetType: AUDIT_TARGET_TYPE.TENANT_SUBSCRIPTION,
            targetId: shift.term.id,
            before: { term: termSnapshot(shift.term) },
            after: {
              term: {
                ...termSnapshot(shift.term),
                startsAt: shift.startsAt.toISOString(),
                endsAt: shift.endsAt.toISOString(),
              },
              causedBy: target.id,
            },
          },
          tx,
        );
      }
      return updated;
    });

    return toSubscriptionDto(row);
  }

  /**
   * Hoá đơn `paid` của một kỳ ADMIN GÁN đi theo kỳ sau khi sửa — chứng từ của lượt gán phải nói đúng
   * giá, kỳ và hạn mức đang áp. 0đ ⇒ void (một hoá đơn 0đ là nhiễu, như lúc gán); chưa có hoá đơn
   * mà giá > 0 (kỳ tặng nay tính tiền) ⇒ sinh mới, `paid` như lượt gán tay.
   */
  private async syncAdminInvoiceWithinTx(
    tx: Prisma.TransactionClient,
    args: { tenantId: string; term: SubRow; quota: PlanQuotaSnapshot },
  ): Promise<void> {
    const { term, quota } = args;
    const invoice = await tx.subscriptionInvoice.findFirst({
      where: { subscriptionId: term.id, status: SUBSCRIPTION_INVOICE_STATUS.PAID },
      orderBy: { createdAt: 'desc' },
      select: { id: true, linesJson: true },
    });
    if (term.price.isZero()) {
      if (invoice) {
        await tx.subscriptionInvoice.update({
          where: { id: invoice.id },
          data: { status: SUBSCRIPTION_INVOICE_STATUS.VOID },
        });
      }
      return;
    }
    // Dòng trước ADR 0015 không có kỳ hạn — không dựng được dòng hoá đơn đúng; để nguyên chứng từ cũ.
    if (term.termMonths === null) return;
    const pricing = this.priceTerm(term.price.toString(), term.termMonths);
    const snapshot: PlanInvoiceSnapshot = {
      planId: term.planId,
      planCode: term.plan.code,
      termMonths: term.termMonths,
      vehicleScope: planVehicleScopeOf(term.vehicleScope),
      quota,
      lines: pricing.lines,
    };
    if (!invoice) {
      await this.createInvoiceWithinTx(tx, {
        tenantId: args.tenantId,
        subscriptionId: term.id,
        snapshot,
        subtotal: pricing.subtotal,
        discountAmount: pricing.discountAmount,
        periodFrom: term.startsAt,
        periodTo: term.endsAt,
        paid: true,
      });
      return;
    }
    await tx.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: {
        linesJson: snapshot as unknown as Prisma.InputJsonValue,
        subtotal: pricing.subtotal,
        discountAmount: pricing.discountAmount,
        totalAmount: pricing.total,
        paidAmount: pricing.total,
        periodFrom: term.startsAt,
        periodTo: term.endsAt,
      },
    });
  }

  /**
   * Gán GÓI MẶC ĐỊNH cho một gian hàng vừa mở — ADR 0015 điều 9, chạy trong transaction của
   * `registerShop`.
   *
   * Vì sao bắt buộc, không phải tiện ích: từ ADR 0027, cờ năng lực đọc từ **gói hiện hành**. Một
   * tenant không có gói nào có tập cờ RỖNG, nên ngày bật cổng chặn họ mất sạch tính năng nâng
   * cao — kể cả quyền ĐỌC. "Không có gói" phải là trạng thái không tồn tại, chứ không phải một
   * trạng thái được xử lý tử tế.
   *
   * Gói mặc định = bậc `commission` đang bán có `sortOrder` nhỏ nhất (tuyến hoa hồng — ADR 0020:
   * vào miễn phí, chỉ trả khi có doanh thu). Không có bậc nào như vậy ⇒ KHÔNG ném: chặn người ta
   * mở gian hàng vì danh mục gói cấu hình thiếu là đổi một lỗi vận hành lấy một lỗi người dùng.
   * Ghi log để người vận hành sửa danh mục, rồi migration/job sẽ vá phần còn lại.
   *
   * Không sinh hoá đơn (0đ) và không ghi audit `platform`: đây là hệ quả tự động của việc đăng
   * ký, không phải một hành động quản trị.
   */
  /**
   * Bậc MẶC ĐỊNH của tuyến hoa hồng — bậc `commission` đang bán có `sort_order` nhỏ nhất.
   *
   * Cùng vị từ với job vòng đời (`lapseToCommission`), và đó là lý do nó phải là một hàm: hai
   * nơi chọn "gói mặc định" theo hai cách là hai chủ xe nhận hai mức phí dịch vụ khác nhau tuỳ
   * việc họ đến đây bằng đường đăng ký hay bằng đường hết gói.
   *
   * NÉM khi không tìm thấy, không trả `null`. Bản trước ghi `logger.error` rồi `return`, nên
   * việc mở gian hàng vẫn thành công và tenant ra đời KHÔNG có dòng thuê bao nào — pha
   * `unconfigured` của ADR 0038 điều 1. Hậu quả không hiện ra ở đây mà ở nơi khác hẳn: mọi
   * đường ghi tiền của họ bị từ chối, hàng tuần sau, với một mã lỗi nói về gói dịch vụ.
   */
  private async loadDefaultCommissionPlanOrThrow(
    tx?: Prisma.TransactionClient,
  ): Promise<{ id: string; code: string; commissionPercent: Prisma.Decimal | null }> {
    const client = tx ?? this.prisma;
    const plan = await client.plan.findFirst({
      where: { status: PLAN_STATUS.ACTIVE, billingMode: BILLING_MODE.COMMISSION },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, code: true, commissionPercent: true },
    });
    if (!plan) {
      this.logger.error(
        'Không có bậc gói tuyến hoa hồng nào đang bán — danh mục gói hỏng. ' +
          'Chạy lại seed dữ liệu nền (SEED_MODE=system) hoặc tạo lại bậc mặc định ở màn quản trị gói.',
      );
      throw new ConflictException({
        code: API_ERROR_CODE.DEFAULT_COMMISSION_PLAN_MISSING,
        message:
          'Danh mục gói dịch vụ chưa có bậc mặc định của tuyến hoa hồng nên chưa mở được gian hàng. ' +
          'Liên hệ hỗ trợ XePrime.',
      });
    }
    return plan;
  }

  /**
   * Danh mục chỉ được có ĐÚNG MỘT bậc `commission` — xem `DEFAULT_COMMISSION_PLAN_CODE`.
   *
   * `exceptPlanId` để `updatePlan` không tự chặn chính bậc nó đang sửa.
   *
   * ⚠️ **Đây là cổng THÔNG ĐIỆP, chưa phải ràng buộc DB.** Nó là check-then-insert, nên hai
   * request song song về lý thuyết cùng qua được. Nơi đúng để đóng đinh bất biến này là một
   * partial unique index (`… ON plans ((billing_mode)) WHERE billing_mode = 'commission'`) —
   * cùng kỷ luật mà `provider_tx_id` và `vehicle_occupancies` đã dùng.
   *
   * Chưa làm trong đợt này vì database TEST đang vi phạm nó: `test/helpers/billing-fixture.ts`
   * và vài spec dựng bậc `commission` riêng cho từng tổ hợp cờ/ân hạn, nên index sẽ làm đỏ một
   * mảng spec cho tới khi chúng dùng chung một bậc. Rủi ro thực tế thấp (chỉ platform admin gọi
   * được, và phải trùng nhau trong vài mili-giây), nhưng đừng đọc dòng này thành "đã an toàn".
   */
  private async assertCommissionTrackStaysSingle(
    billingMode: string | undefined,
    exceptPlanId: string | null,
  ): Promise<void> {
    if (billingMode !== BILLING_MODE.COMMISSION) return;
    const existing = await this.prisma.plan.findFirst({
      where: {
        billingMode: BILLING_MODE.COMMISSION,
        ...(exceptPlanId ? { id: { not: exceptPlanId } } : {}),
      },
      select: { code: true },
    });
    if (!existing) return;
    throw new ConflictException({
      code: API_ERROR_CODE.COMMISSION_PLAN_IS_SINGLETON,
      message:
        `Tuyến hoa hồng đã có bậc mặc định "${existing.code}" và chỉ được có một. ` +
        'Sửa % phí dịch vụ ngay trên bậc đó, đừng tạo bậc thứ hai.',
      details: { existingPlanCode: existing.code },
    });
  }

  /**
   * Đặt một lượt gán MỚI vào chuỗi kỳ của tenant — một phép cho cả admin gán (`assign`) lẫn webhook
   * kích hoạt khi tiền về (`activateFromInvoiceWithinTx`).
   *
   *  1. Khoá chuỗi kỳ (`lockSubscriptionChain`) rồi mới đọc — hai lượt song song không cùng nối
   *     sau một "đuôi", và job hết hạn ở worker không chen vào giữa.
   *  2. Quyết định bằng `planSubscriptionChain` (`@xeprime/types`) — CÙNG hàm mà hộp gia hạn ở web
   *     dùng để xem trước, nên ngày bắt đầu web hứa là ngày server ghi.
   *  3. Huỷ các kỳ bị thay trong cùng transaction. Kỳ TRẢ PHÍ bị thay (đổi gói ngay) có một dòng
   *     audit `subscription.cancel` riêng, lý do `replaced`; dòng hoa hồng 0đ là dòng hệ thống —
   *     thay nó không ghi audit.
   *
   * ## Vì sao không chỉ là "nối sau `ends_at` muộn nhất"
   *
   * Mọi tenant đều mang một dòng hoa hồng 0đ dài `COMMISSION_TRACK_TERM_MONTHS` (12 tháng) do
   * `assignDefaultPlanWithinTx` gán lúc mở gian hàng. Phép nối đuôi trần sẽ thấy dòng đó là "kỳ
   * còn hạn" và đặt `starts_at` của gói vừa mua ở **12 tháng sau**: tenant VẪN ở tuyến hoa hồng,
   * vẫn bị trần Owner Lite, khách vẫn bị cộng phí dịch vụ — trong khi hoá đơn `paid` và audit đủ.
   * Đuôi vì thế chỉ chọn trong kỳ TRẢ PHÍ; dòng hoa hồng luôn nhường chỗ.
   *
   * Huỷ chứ không xoá: dòng bị thay vẫn là lịch sử tuyến của tenant, và bất biến "MỘT dòng hiệu
   * lực tại một thời điểm" mà `findCurrent`/`resolveEffectiveBilling` dựa vào được giữ.
   */
  private async planChainWithinTx(
    tx: Prisma.TransactionClient,
    args: {
      tenantId: string;
      planId: string;
      /** Phạm vi loại xe của bậc được gán (ADR 0065) — chỉ kỳ ở phạm vi XUNG ĐỘT bị nối/huỷ. */
      vehicleScope: PlanVehicleScope;
      /**
       * Admin gán: thời điểm admin chọn. Gian hàng tự mua: `{ selfServe }` — thời điểm SUY từ trần xe
       * của bậc so với các kỳ còn hạn, đọc SAU khoá (ADR 0084).
       */
      timing: string | null | undefined | { selfServe: { maxVehicles: number | null } };
      /** `null` = hệ thống (webhook) — không có lượt "đổi gói ngay" nào từ đường đó. */
      actorUserId: string | null;
      now: Date;
    },
  ): Promise<SubscriptionChainPlan<TermSnapshotRow> & { purchaseKind: PlanPurchaseKind | null }> {
    await lockSubscriptionChain(tx, args.tenantId);
    const live = (
      await tx.tenantSubscription.findMany({
        where: {
          tenantId: args.tenantId,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          endsAt: { gt: args.now },
        },
        orderBy: { startsAt: 'asc' },
        select: CAP_TERM_SELECT,
      })
    ).map(withCap);
    const decision =
      args.timing && typeof args.timing === 'object'
        ? selfServePurchaseTiming(
            live,
            {
              planId: args.planId,
              vehicleScope: args.vehicleScope,
              maxVehicles: args.timing.selfServe.maxVehicles,
            },
            args.now,
          )
        : null;
    const chain = planSubscriptionChain(
      live,
      {
        planId: args.planId,
        timing: decision ? decision.timing : (args.timing as string | null | undefined),
        vehicleScope: args.vehicleScope,
      },
      args.now,
    );
    if (chain.cancel.length > 0) {
      await tx.tenantSubscription.updateMany({
        where: {
          id: { in: chain.cancel.map((term) => term.id) },
          status: SUBSCRIPTION_STATUS.ACTIVE,
        },
        data: { status: SUBSCRIPTION_STATUS.CANCELLED },
      });
    }
    for (const term of chain.cancel) {
      if (!isPaidRow(term)) continue;
      await this.audit.record(
        {
          tenantId: args.tenantId,
          actorUserId: args.actorUserId,
          actorScope: args.actorUserId ? AUDIT_ACTOR_SCOPE.PLATFORM : AUDIT_ACTOR_SCOPE.SYSTEM,
          action: SUBSCRIPTION_AUDIT_ACTION.CANCEL,
          targetType: AUDIT_TARGET_TYPE.TENANT_SUBSCRIPTION,
          targetId: term.id,
          before: { status: SUBSCRIPTION_STATUS.ACTIVE, term: termSnapshot(term) },
          after: {
            status: SUBSCRIPTION_STATUS.CANCELLED,
            reason: SUBSCRIPTION_CANCEL_REASON.REPLACED,
            term: termSnapshot(term),
          },
        },
        tx,
      );
    }
    return { ...chain, purchaseKind: decision?.kind ?? null };
  }

  /**
   * ONBOARDING GÓI ĐÃ XONG — mốc `package_pending → package_active` (ADR 0040).
   *
   * Gọi từ CHÍNH transaction bật thuê bao, ở cả hai đường: webhook SePay
   * (`activateFromInvoiceWithinTx`) và admin gán tay (`assign`). Không phải một job, không phải
   * một lượt gọi API do client báo — "tôi đã chuyển khoản" không phải một sự kiện, và một mốc
   * ghi ngoài transaction là một cửa sổ trong đó gói đã bật nhưng người dùng vẫn bị giữ ở màn
   * thanh toán.
   *
   * `updateMany` có điều kiện trạng thái (khuôn claim quen thuộc của file này), nên:
   *  - chạy lại/song song là no-op, không ghi đè gì;
   *  - tenant vào bằng cửa hoa hồng rồi mua gói vẫn giữ `commission` — họ chưa từng đi qua cửa
   *    gian hàng, và nói ngược lại sẽ làm sai luật "gian hàng hết gói không phải người mới".
   *
   * Chỉ áp với gói `package`: một dòng hoa hồng (kể cả dòng hệ thống 0đ) không hoàn tất được
   * onboarding của tuyến trả phí.
   */
  private async completePackageOnboardingWithinTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    billingMode: string | null,
  ): Promise<void> {
    if (billingMode !== BILLING_MODE.PACKAGE) return;
    await tx.tenant.updateMany({
      where: { id: tenantId, onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING },
      data: { onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE },
    });
  }

  /**
   * Hoá đơn `issued` còn mở của các phạm vi KHÁC mà xung đột với bậc vừa bật (ADR 0065 điều 6.3) bị
   * void trong CÙNG transaction — CẢ HAI chiều: bật bậc `all` (doanh nghiệp) void hoá đơn ô tô/xe
   * máy; bật gói ô tô void hoá đơn `all` cũ (ví dụ hoá đơn `shop-basic` trước ADR 0065). Để lại
   * chúng là để một lần chuyển khoản muộn mở một kỳ xếp SAU kỳ vừa bật mà không ai mua nữa.
   *
   * Hoá đơn CÙNG phạm vi không đụng ở đây (đường mua tự void nó; gán tay/kích hoạt giữ nguyên hành vi
   * trước ADR 0065). Hoá đơn `partially_paid` KHÔNG void (đã có tiền thật — ADR 0016 điều 6): nó nằm
   * lại cho admin xử lý ở màn đối soát.
   */
  private async voidInvoicesSupersededByScopeWithinTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    plan: { billingMode: string; vehicleScope: string },
  ): Promise<void> {
    if (plan.billingMode !== BILLING_MODE.PACKAGE) return;
    const scope = planVehicleScopeOf(plan.vehicleScope);
    const others = PLAN_VEHICLE_SCOPE_VALUES.filter(
      (other) => other !== scope && planScopesConflict(scope, other),
    );
    await this.voidIssuedInvoicesWithinTx(tx, { tenantId, vehicleScope: { in: others } });
  }

  async assignDefaultPlanWithinTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    now: Date = new Date(),
  ): Promise<TermSnapshotRow> {
    const plan = await this.loadDefaultCommissionPlanOrThrow(tx);

    return tx.tenantSubscription.create({
      data: {
        id: newId(),
        tenantId,
        planId: plan.id,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        price: 0,
        termMonths: COMMISSION_TRACK_TERM_MONTHS,
        billingMode: BILLING_MODE.COMMISSION,
        commissionPercent: plan.commissionPercent,
        // Tuyến hoa hồng phủ mọi loại xe (CHECK `plans_commission_scope_all`).
        vehicleScope: PLAN_VEHICLE_SCOPE.ALL,
        startsAt: now,
        endsAt: addCalendarMonthsVn(now, COMMISSION_TRACK_TERM_MONTHS),
        // Không ghi chú chữ: dòng hệ thống nói bằng `origin` (`subscriptionOriginOf`) và giao diện
        // tự dịch — một câu tiếng Việt lưu trong DB là câu tiếng Việt trên giao diện tiếng Anh.
        note: null,
      },
      select: TERM_SNAPSHOT_SELECT,
    });
  }

  // -------------------------------------------------------------------------
  // "Gói của tôi" — tenant-scoped (W2 LÔ 3)
  // -------------------------------------------------------------------------

  /**
   * Gói hiện hành + mức dùng / hạn mức THEO LOẠI XE + lượt miễn phí (ADR 0026 · ADR 0065).
   *
   * Một lượt đọc các dòng hiệu lực (`EFFECTIVE_SUBSCRIPTION_ARGS`) rồi mọi phép suy chạy trên
   * CHÍNH tập dòng đó — tuyến, kỳ của từng phạm vi, hạn mức từng loại — để thẻ "Gói của tôi"
   * không thể nói một con số khác với con số `assertVehicleQuota` thật sự chặn.
   */
  async mySubscription(tenantId: string): Promise<MySubscriptionDto> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { freeTripsUsed: true },
    });
    if (!tenant) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy gian hàng',
      });
    }
    const now = new Date();
    const [rows, fleet, onMarket] = await Promise.all([
      this.loadEffectiveRows(tenantId, now),
      this.prisma.vehicle.groupBy({
        by: ['vehicleType'],
        where: { tenantId, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.vehicle.groupBy({
        by: ['vehicleType'],
        where: { tenantId, deletedAt: null, publicStatus: { in: [...MARKETPLACE_SLOT_STATUSES] } },
        _count: { _all: true },
      }),
    ]);
    const countOf = (list: typeof fleet, type: string) =>
      list.find((r) => r.vehicleType === type)?._count._all ?? 0;
    const carUsed = countOf(fleet, VEHICLE_TYPE.CAR);
    const motorbikeUsed = countOf(fleet, VEHICLE_TYPE.MOTORBIKE);
    const carOnMarket = countOf(onMarket, VEHICLE_TYPE.CAR);
    const motorbikeOnMarket = countOf(onMarket, VEHICLE_TYPE.MOTORBIKE);

    const billing = resolveEffectiveBilling(rows, now);
    const terms = resolveActivePackageTerms(rows, now);
    /*
     * "Gói hiện hành" (một dòng, giữ cho client cũ): kỳ gói ƯU TIÊN khi ở tuyến gói (`all` thắng,
     * rồi ô tô, rồi xe máy — thứ tự của `resolveActivePackageTerms`), ngược lại dòng hiệu lực gần
     * nhất. Đọc `findCurrent` (đòi `ends_at > now`) thì suốt ân hạn thẻ hiện "chưa có gói" ngay
     * cạnh hạn mức của chính gói vừa hết hạn.
     */
    const primary = terms[0]?.row ?? rows[0] ?? null;

    const usedBy = (scope: PlanVehicleScope) =>
      scope === PLAN_VEHICLE_SCOPE.ALL
        ? { used: carUsed + motorbikeUsed, onMarketplace: carOnMarket + motorbikeOnMarket }
        : scope === PLAN_VEHICLE_SCOPE.CAR
          ? { used: carUsed, onMarketplace: carOnMarket }
          : { used: motorbikeUsed, onMarketplace: motorbikeOnMarket };
    const quotas = {
      car: quotaForVehicleType(rows, billing, VEHICLE_TYPE.CAR, now),
      motorbike: quotaForVehicleType(rows, billing, VEHICLE_TYPE.MOTORBIKE, now),
    };
    const withUsage = (quota: VehicleTypeQuota): VehicleTypeQuotaDto => ({
      ...quota,
      ...usedBy(quota.countedScope),
    });

    const used = Math.min(tenant.freeTripsUsed, FREE_TRIP_ALLOWANCE);
    return {
      currentPlan: primary ? toCurrentPlanDto(primary, now) : null,
      currentPlans: terms.map((term) => toCurrentPlanDto(term.row, now)),
      usage: {
        car: { used: carUsed, onMarketplace: carOnMarket },
        motorbike: { used: motorbikeUsed, onMarketplace: motorbikeOnMarket },
      },
      vehicleQuotas: { car: withUsage(quotas.car), motorbike: withUsage(quotas.motorbike) },
      fleetQuota: fleetQuotaSummary(quotas, carUsed + motorbikeUsed),
      freeTrips: {
        allowance: FREE_TRIP_ALLOWANCE,
        used: tenant.freeTripsUsed,
        left: FREE_TRIP_ALLOWANCE - used,
      },
    };
  }

  /**
   * Các dòng thuê bao HIỆU LỰC gần nhất của một tenant — đầu vào DUY NHẤT của mọi phép chấm tuyến
   * / kỳ / hạn mức trong service này (`EFFECTIVE_SUBSCRIPTION_ARGS`: đã bắt đầu, `ends_at` muộn
   * nhất trước, giới hạn cửa sổ). `SUB_SELECT` là tập cha của select hiệu lực, nên cùng dòng đó
   * dựng được DTO mà không cần đọc lần hai.
   */
  private loadEffectiveRows(
    tenantId: string,
    now: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<SubRow[]> {
    const client = tx ?? this.prisma;
    return client.tenantSubscription.findMany({
      where: { tenantId, ...effectiveSubscriptionWhere(now) },
      orderBy: EFFECTIVE_SUBSCRIPTION_ARGS.orderBy,
      take: EFFECTIVE_SUBSCRIPTION_ARGS.take,
      select: SUB_SELECT,
    });
  }

  /**
   * Danh sách gói ĐANG BÁN cho gian hàng chọn — không lộ giả định định giá nội bộ.
   *
   * Lọc `billingMode = package`: bậc tuyến hoa hồng KHÔNG phải một SKU. Nó là tuyến vào cửa mà
   * mọi chủ xe đã ở sẵn trong đó, giá 0đ, không kỳ hạn nào để mua — bày nó ra cạnh gói trả tiền
   * là mời người dùng "mua" thứ họ đang dùng, và `purchase` sẽ từ chối với "không có khoản phải
   * trả" mà không giải thích được vì sao lựa chọn đó lại hiện ra.
   */
  async listPlansForTenant(): Promise<TenantPlanDto[]> {
    const rows = await this.prisma.plan.findMany({
      where: { status: PLAN_STATUS.ACTIVE, billingMode: BILLING_MODE.PACKAGE },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: PLAN_SELECT,
    });
    return rows.map(toTenantPlanDto);
  }

  /**
   * Bảng giá gian hàng NHÓM THEO PHẠM VI loại xe (ADR 0065) — `motorbike`, `car`, rồi `all`
   * (bậc doanh nghiệp). Cùng tập bậc với `listPlansForTenant`; endpoint phẳng giữ nguyên hình cho
   * app native đã phát hành (ADR 0031), endpoint này là thứ màn chọn gói mới đọc. Nhóm rỗng vẫn
   * có mặt để giao diện nói "chưa có gói cho loại xe này" thay vì đoán từ một khoá vắng.
   */
  async planCatalogForTenant(): Promise<TenantPlanCatalogDto> {
    const plans = await this.listPlansForTenant();
    return {
      groups: PLAN_VEHICLE_SCOPE_DISPLAY_ORDER.map((vehicleScope) => ({
        vehicleScope,
        plans: plans.filter((plan) => plan.vehicleScope === vehicleScope),
      })),
    };
  }

  /** Lịch sử hoá đơn gói của gian hàng (mới nhất trước). */
  async listInvoicesForTenant(
    tenantId: string,
    query: SubscriptionListQueryDto,
  ): Promise<{ data: SubscriptionInvoiceDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, SUBSCRIPTION_DEFAULT_LIMIT, SUBSCRIPTION_MAX_LIMIT);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.subscriptionInvoice.count({ where: { tenantId } }),
      this.prisma.subscriptionInvoice.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip: paging.skip,
        take: paging.take,
        select: INVOICE_SELECT,
      }),
    ]);
    return { data: rows.map(toInvoiceDto), meta: paginationMeta(paging, total) };
  }

  /**
   * MỘT hoá đơn gói của gian hàng — nguồn của trang thanh toán `/payment/:invoiceId`.
   *
   * Trang đó phải nói đúng kết cục của chính hoá đơn trên đường dẫn ở MỌI trạng thái: đang chờ
   * (mời trả), đã trả (gói đã bật), đã huỷ/hết hạn (mời mua lại). `invoices/pending` chỉ trả lời
   * câu "đang nợ gì" — trả xong là `null`, và trang không phân biệt được "vừa trả" với "đã huỷ".
   *
   * Lọc theo `tenantId` của PHẠM VI người gọi trong cùng câu truy vấn: id hoá đơn của gian hàng
   * khác trả 404 y như id không tồn tại — không lộ việc nó có thật.
   */
  async invoiceForTenant(tenantId: string, invoiceId: string): Promise<SubscriptionInvoiceDto> {
    const row = await this.prisma.subscriptionInvoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: INVOICE_SELECT,
    });
    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy hoá đơn gói',
      });
    }
    return toInvoiceDto(row);
  }

  /**
   * HOÁ ĐƠN GÓI ĐANG CHỜ TIỀN của gian hàng — `null` khi không có (ADR 0040).
   *
   * Endpoint riêng thay vì để web lọc trang đầu của `listInvoicesForTenant`, vì đây là thứ màn
   * onboarding phải phục hồi sau một lần F5: "gian hàng này đang nợ mã nào" là một câu hỏi có
   * ĐÚNG MỘT câu trả lời, và bất biến đó do server giữ (`purchase` void hoá đơn `issued` cũ và
   * chặn khi có hoá đơn `partially_paid`, cả hai dưới một advisory lock). Lọc ở client thì bất
   * biến đó thành một giả định — và một danh sách phân trang có thể đẩy hoá đơn chờ sang trang 2
   * ngay khi lịch sử dài hơn một trang.
   *
   * `orderBy createdAt desc` chỉ là lưới an toàn cho dữ liệu cũ vi phạm bất biến (hoá đơn tạo
   * trước migration `subscription_invoice_single_payable`): mới nhất là mã người dùng vừa thấy.
   */
  async pendingInvoiceForTenant(tenantId: string): Promise<PendingSubscriptionInvoiceDto> {
    /*
     * Từ ADR 0065 mỗi PHẠM VI loại xe giữ tối đa một hoá đơn trả được (unique
     * `subscription_invoices_one_payable_per_tenant_scope`), nên tối đa ba dòng — đọc hết, không
     * phân trang. `invoice` (mới nhất) giữ cho client cũ; `invoices` là danh sách đầy đủ.
     */
    const rows = await this.prisma.subscriptionInvoice.findMany({
      where: {
        tenantId,
        status: {
          in: [...SUBSCRIPTION_INVOICE_PAYABLE_STATUSES],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: PLAN_VEHICLE_SCOPE_VALUES.length,
      select: INVOICE_SELECT,
    });
    const invoices = rows.map(toInvoiceDto);
    return { invoice: invoices[0] ?? null, invoices };
  }

  /**
   * Gian hàng TỰ mua / gia hạn gói: sinh hoá đơn `issued` + mã đối soát `XPG…`, KHÔNG tạo
   * subscription — gói chỉ bật khi tiền đã về (ADR 0026 điều 4; webhook mở ở W4, admin vẫn gán
   * tay được qua đường platform).
   *
   * ## Mỗi tenant chỉ giữ MỘT hoá đơn trả được — và bất biến đó được giữ bằng hai thứ
   *
   * Hai mã cùng sống là hai đường tiền cùng kích hoạt gói, nên:
   *  - hoá đơn `issued` cũ (chưa đồng nào về) bị lật `void` trong cùng transaction;
   *  - hoá đơn `partially_paid` (đã có tiền thật) thì CHẶN hẳn lượt mua mới — không void được
   *    mà cũng không cho đứng cạnh hoá đơn mới;
   *  - cả transaction chạy sau một advisory lock theo tenant, vì bất biến này nói về sự VẮNG MẶT
   *    của hàng nên không có unique index nào đại diện được cho nó.
   */
  async purchase(
    tenantId: string,
    actorUserId: string,
    dto: PurchaseSubscriptionDto,
  ): Promise<SubscriptionInvoiceDto> {
    await this.assertTenant(tenantId);
    const prepared = await this.preparePurchase(dto);
    const now = new Date();
    const live = await this.liveTermsOf(tenantId, now);
    const expiresAt = new Date(now.getTime() + SUBSCRIPTION_INVOICE_TTL_HOURS * 60 * 60 * 1000);

    const row = await this.prisma.$transaction(async (tx) => {
      await this.lockTenantPurchasesWithinTx(tx, tenantId);
      return this.issuePurchaseWithinTx(tx, {
        tenantId,
        actorUserId,
        prepared,
        live,
        now,
        expiresAt,
        checkoutId: null,
      });
    });
    return toInvoiceDto(row);
  }

  /**
   * Mua NHIỀU gói trong MỘT lần chuyển khoản (ADR 0083): gói ô tô + gói xe máy → hai hoá đơn (mỗi
   * loại xe một hoá đơn, ADR 0065 điều 6 giữ nguyên) gom dưới MỘT phiếu `XPC…`.
   *
   * Mọi luật của lượt mua đơn lẻ áp NGUYÊN cho từng phần tử — cùng `preparePurchase` +
   * `issuePurchaseWithinTx`, cùng advisory lock theo tenant: hoá đơn `issued` cũ cùng phạm vi bị void
   * (kèm phiếu chứa nó), hoá đơn đã nhận một phần tiền chặn lượt mua. Hai phần tử phải là HAI phạm
   * vi không xung đột — trùng loại xe hay có bậc doanh nghiệp (`all`) là một lượt mua vô nghĩa:
   * phần tử sau sẽ void phần tử trước ngay trong cùng transaction.
   *
   * Cả phiếu ra đời hoặc không gì cả: một phần tử hỏng (bậc ngừng bán, kỳ không bán…) thì không có
   * hoá đơn nào — khác với chuỗi gọi `purchase` lần lượt, nơi hoá đơn đầu vẫn sống khi lượt sau hỏng.
   */
  async createCheckout(
    tenantId: string,
    actorUserId: string,
    dto: CreateSubscriptionCheckoutDto,
  ): Promise<SubscriptionCheckoutDto> {
    await this.assertTenant(tenantId);
    const prepared: PreparedPurchase[] = [];
    for (const item of dto.items) prepared.push(await this.preparePurchase(item));
    assertCombinableScopes(prepared);

    const now = new Date();
    const live = await this.liveTermsOf(tenantId, now);
    const expiresAt = new Date(now.getTime() + SUBSCRIPTION_INVOICE_TTL_HOURS * 60 * 60 * 1000);
    const total = prepared.reduce(
      (sum, item) => sum.add(item.pricing.total),
      new Prisma.Decimal(0),
    );
    // Thứ tự hoá đơn con = thứ tự hiển thị loại xe, không phụ thuộc thứ tự client gửi.
    const ordered = [...prepared].sort(
      (a, b) =>
        planVehicleScopeDisplayRank(a.vehicleScope) - planVehicleScopeDisplayRank(b.vehicleScope),
    );

    const checkoutId = await this.prisma.$transaction(async (tx) => {
      await this.lockTenantPurchasesWithinTx(tx, tenantId);
      const checkout = await tx.subscriptionCheckout.create({
        data: {
          id: newId(),
          tenantId,
          code: newReferenceCode(BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_CHECKOUT),
          totalAmount: total,
          expiresAt,
        },
        select: { id: true, code: true },
      });
      const invoiceIds: string[] = [];
      for (const item of ordered) {
        const invoice = await this.issuePurchaseWithinTx(tx, {
          tenantId,
          actorUserId,
          prepared: item,
          live,
          now,
          expiresAt,
          checkoutId: checkout.id,
        });
        invoiceIds.push(invoice.id);
      }
      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: 'tenant',
          action: 'subscription_checkout.issue',
          targetType: AUDIT_TARGET_TYPE.SUBSCRIPTION_CHECKOUT,
          targetId: checkout.id,
          after: {
            code: checkout.code,
            invoiceIds,
            totalAmount: total.toString(),
            expiresAt: expiresAt.toISOString(),
          },
        },
        tx,
      );
      return checkout.id;
    });
    return this.checkoutForTenant(tenantId, checkoutId);
  }

  /**
   * XEM TRƯỚC một lượt mua (ADR 0084) — bước "Kỳ hạn & xác nhận" của hộp mua gói đọc ở đây, không tự
   * suy ở client (client chỉ thấy kỳ ĐANG CHẠY, không thấy kỳ đã xếp lịch). Cùng `preparePurchase`,
   * cùng `selfServePurchaseTiming` + `planSubscriptionChain` mà lượt mua thật dùng; không ghi gì.
   *
   * Ngày là DỰ KIẾN: lượt mua mới / nâng bậc bắt đầu lúc tiền về, và lúc đó server suy lại.
   */
  async previewPurchase(
    tenantId: string,
    dto: PreviewSubscriptionPurchaseDto,
  ): Promise<SubscriptionPurchasePreviewDto> {
    await this.assertTenant(tenantId);
    const prepared: PreparedPurchase[] = [];
    for (const item of dto.items) prepared.push(await this.preparePurchase(item));
    assertCombinableScopes(prepared);

    const now = new Date();
    const live = await this.liveTermsOf(tenantId, now);
    const items = [...prepared]
      .sort(
        (a, b) =>
          planVehicleScopeDisplayRank(a.vehicleScope) - planVehicleScopeDisplayRank(b.vehicleScope),
      )
      .map((item) => {
        const decision = selfServePurchaseTiming(
          live,
          {
            planId: item.plan.id,
            vehicleScope: item.vehicleScope,
            maxVehicles: item.limits.maxVehicles,
          },
          now,
        );
        const chain = planSubscriptionChain(
          live,
          { planId: item.plan.id, vehicleScope: item.vehicleScope, timing: decision.timing },
          now,
        );
        return {
          planId: item.plan.id,
          planName: item.plan.name,
          vehicleScope: item.vehicleScope,
          termMonths: item.termMonths,
          kind: decision.kind,
          startsAt: chain.startsAt.toISOString(),
          endsAt: addCalendarMonthsVn(chain.startsAt, item.termMonths).toISOString(),
          maxVehicles: item.limits.maxVehicles,
          amount: item.pricing.total.toString(),
          replacedTerms: chain.cancel
            .filter(isPaidRow)
            .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
            .map((term) => ({
              planName: term.plan.name,
              startsAt: term.startsAt.toISOString(),
              endsAt: term.endsAt.toISOString(),
            })),
        };
      });
    return {
      items,
      total: prepared
        .reduce((sum, item) => sum.add(item.pricing.total), new Prisma.Decimal(0))
        .toString(),
    };
  }

  /**
   * MỘT phiếu thanh toán gộp của chính gian hàng, kèm hoá đơn con — nguồn của trang thanh toán
   * `/payment/checkout/:id`. Lọc theo tenant trong câu truy vấn: id của gian hàng khác là 404.
   */
  async checkoutForTenant(tenantId: string, checkoutId: string): Promise<SubscriptionCheckoutDto> {
    const row = await this.prisma.subscriptionCheckout.findFirst({
      where: { id: checkoutId, tenantId },
      select: {
        id: true,
        tenantId: true,
        code: true,
        totalAmount: true,
        paidAmount: true,
        status: true,
        paidAt: true,
        expiresAt: true,
        createdAt: true,
        invoices: { select: INVOICE_SELECT },
      },
    });
    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy phiếu thanh toán',
      });
    }
    const invoices = row.invoices
      .map(toInvoiceDto)
      .sort(
        (a, b) =>
          planVehicleScopeDisplayRank(a.vehicleScope) - planVehicleScopeDisplayRank(b.vehicleScope),
      );
    return {
      id: row.id,
      tenantId: row.tenantId,
      code: row.code,
      totalAmount: row.totalAmount.toString(),
      paidAmount: row.paidAmount.toString(),
      status: row.status,
      paidAt: row.paidAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      invoices,
    };
  }

  /**
   * KHOÁ THEO TENANT cho mọi lượt phát hành hoá đơn gói, giữ tới hết transaction.
   *
   * Không có unique nào chặn được "hai hoá đơn payable của cùng một tenant": `code` là chuỗi
   * ngẫu nhiên nên hai dòng luôn hợp lệ với DB. Ở Read Committed, hai lần bấm "Tạo hoá đơn"
   * song song (hai tab, hay một cú double-click) cùng đọc tập hoá đơn cũ như nhau, cùng void
   * nó, rồi mỗi bên INSERT một dòng mới — kết quả là hai mã XPG cùng sống, và hai lần chuyển
   * khoản đều kích hoạt gói.
   *
   * Advisory lock thay vì `SELECT … FOR UPDATE`: thứ cần bảo vệ là sự VẮNG MẶT của một hàng
   * (chưa có hoá đơn nào), mà khoá hàng thì không khoá được hàng chưa tồn tại.
   */
  private async lockTenantPurchasesWithinTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;
  }

  /**
   * Kỳ ĐANG CÒN HẠN của tenant — đầu vào của phép tính kỳ DỰ KIẾN in trên hoá đơn
   * (`planSubscriptionChain`). Kỳ thật chốt lại lúc tiền về (`activateFromInvoiceWithinTx`).
   */
  private async liveTermsOf(tenantId: string, now: Date): Promise<CapTermRow[]> {
    const rows = await this.prisma.tenantSubscription.findMany({
      where: { tenantId, status: SUBSCRIPTION_STATUS.ACTIVE, endsAt: { gt: now } },
      select: CAP_TERM_SELECT,
    });
    return rows.map(withCap);
  }

  /**
   * Phần KIỂM + TÍNH GIÁ của một lượt mua — mọi thứ không cần transaction: bậc còn bán, tự mua
   * được, kỳ hạn có trong bảng giá, tổng khác 0. Lớp chặn thật của cả `purchase` lẫn
   * `createCheckout`; ẩn thẻ ở màn mua chỉ là UX.
   */
  private async preparePurchase(dto: PurchaseSubscriptionDto): Promise<PreparedPurchase> {
    const plan = await this.loadPlan(dto.planId);
    /*
     * Bậc CHƯA MỞ BÁN có mã riêng (`PLAN_NOT_PUBLISHED`): người đang xem bảng giá cần câu "chọn
     * gói khác", không phải câu chung "dữ liệu vừa thay đổi". `planStatus` giữ lại trong `details`
     * cho client cũ còn đọc nó.
     */
    if (plan.status === PLAN_STATUS.DRAFT) {
      throw new ConflictException({
        code: API_ERROR_CODE.PLAN_NOT_PUBLISHED,
        message: 'Gói chưa mở bán',
        details: { planCode: plan.code, planStatus: plan.status },
      });
    }
    if (plan.status !== PLAN_STATUS.ACTIVE) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: 'Gói đã ngừng bán',
        details: { planStatus: plan.status },
      });
    }
    /*
     * KHÔNG có cổng xác minh ở đây (16/09/2026 — ADR 0040 ghi đè ADR 0036 trong phạm vi này).
     *
     * ADR 0036 đặt "pháp nhân phải được xem xét" làm điều kiện MUA GÓI. Ghép nó với luồng đăng
     * ký gian hàng mới thì thứ tự thành: tạo gian hàng → gửi hồ sơ xác minh → CHỜ admin → mới
     * được trả tiền. Một người đang muốn mua chỗ bán hàng phải chờ một cái gật đầu không có SLA,
     * và trong lúc chờ họ không dùng được gì cả — đó là chỗ rơi rụng lớn nhất của phễu trả phí.
     *
     * Thanh toán mở TUYẾN GÓI và Manage; nó KHÔNG mở bất cứ thứ gì thuộc trục kiểm duyệt. Xe vẫn
     * đi qua `approval_tasks` loại `VEHICLE` từng chiếc (ADR 0008), và không có nơi nào đánh
     * `verification = verified` chỉ vì tiền đã về. Xác minh còn nguyên vai trò của nó ở đường
     * pháp lý/rút tiền, chỉ thôi làm cổng thu tiền.
     */
    const limits = parsePlanLimits(plan.limitsJson);

    /*
     * Bậc bán bằng TƯ VẤN không tự mua được (ADR 0041 điều 5) — và đây là lớp chặn thật.
     *
     * Thẻ của nó VẪN hiện trên bảng giá (với nút "Liên hệ tư vấn", không có giá), vì giấu hẳn
     * một bậc doanh nghiệp là giấu luôn lối nâng cấp của gian hàng lớn nhất. Nhưng thẻ hiện thì
     * đường POST cũng gọi được, nên mã lỗi phải nói đúng việc cần làm thay vì rơi vào nhánh
     * "không có khoản phải trả".
     */
    if (limits.salesOnly) {
      throw new ConflictException({
        code: API_ERROR_CODE.PLAN_NOT_SELF_SERVE,
        message:
          'Gói này được cấu hình riêng theo quy mô gian hàng — liên hệ XePrime để được tư vấn và báo giá.',
        details: { planCode: plan.code },
      });
    }

    /*
     * `limits.termPrices` là bảng giá VÀ danh sách kỳ hạn ĐƯỢC BÁN (ADR 0041 điều 2). DTO chỉ
     * chặn được tập kỳ hạn toàn cục [1,3,6,12]; bậc gói thu hẹp thêm ở đây, và đây là lớp chặn
     * thật — ẩn thẻ kỳ hạn ở màn mua chỉ là UX.
     */
    const price = planTermPrice(limits, dto.termMonths);
    if (price === null) {
      const allowedTerms = planSellableTerms(limits);
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: allowedTerms.length
          ? `Gói này chỉ bán theo kỳ hạn ${allowedTerms.join('/')} tháng`
          : 'Gói này hiện không có bảng giá nên chưa mua được',
        details: { field: 'termMonths', allowedTerms },
      });
    }

    const pricing = this.priceTerm(price, dto.termMonths);
    if (pricing.total.isZero()) {
      // 0đ = không có khoản phải trả: một hoá đơn 0đ không có gì để webhook khớp, và nó sẽ
      // nằm mãi ở `issued` cho tới khi job lật `void`.
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Gói này đang niêm yết 0đ cho kỳ hạn đã chọn nên không có khoản phải trả',
      });
    }

    return {
      plan,
      limits,
      pricing,
      termMonths: dto.termMonths,
      vehicleScope: planVehicleScopeOf(plan.vehicleScope),
    };
  }

  /**
   * Phần GHI của một lượt mua — chạy TRONG transaction của nơi gọi, sau
   * `lockTenantPurchasesWithinTx`. Void hoá đơn `issued` cùng phạm vi (kèm phiếu gộp chứa nó), chặn
   * khi có hoá đơn đã nhận một phần tiền, rồi phát hành hoá đơn mới (gắn `checkoutId` khi là phần
   * tử của một phiếu gộp).
   */
  private async issuePurchaseWithinTx(
    tx: Prisma.TransactionClient,
    args: {
      tenantId: string;
      actorUserId: string;
      prepared: PreparedPurchase;
      live: CapTermRow[];
      now: Date;
      expiresAt: Date;
      checkoutId: string | null;
    },
  ) {
    const { tenantId, actorUserId, now, expiresAt } = args;
    const { plan, limits, pricing, vehicleScope } = args.prepared;
    const termMonths = args.prepared.termMonths;
    /*
     * Hoá đơn của mọi phạm vi XUNG ĐỘT (ADR 0065): mua gói ô tô ⇒ {car, all}; mua bậc `all` ⇒ cả ba.
     * Unique ở DB chỉ giữ "một hoá đơn trả được mỗi phạm vi" theo phạm vi CHÍNH XÁC, nên phần xung
     * đột chéo (một hoá đơn `all` cũ còn mở khi mua gói ô tô) phải xử ở đây: hai mã cùng sống thì
     * lần chuyển khoản muộn mở một kỳ mà chính lượt mua mới đã thay.
     */
    const conflictingScopes = PLAN_VEHICLE_SCOPE_VALUES.filter((other) =>
      planScopesConflict(vehicleScope, other),
    );
    /*
     * Kỳ DỰ KIẾN để hiển thị — CÙNG bảng quyết định mà lượt kích hoạt sẽ dùng
     * (`planSubscriptionChain`, theo phạm vi): mua gói xe máy khi đang có gói ô tô thì bắt đầu
     * NGAY, không nối sau kỳ ô tô. Kỳ thật chốt lại lúc tiền về (`activateFromInvoiceWithinTx`).
     */
    const { timing } = selfServePurchaseTiming(
      args.live,
      { planId: plan.id, vehicleScope, maxVehicles: limits.maxVehicles },
      now,
    );
    const periodFrom = planSubscriptionChain(
      args.live,
      { planId: plan.id, vehicleScope, timing },
      now,
    ).startsAt;
    const periodTo = addCalendarMonthsVn(periodFrom, termMonths);

    {
      /*
       * GIỮ hàng `plans` tới hết transaction (`FOR KEY SHARE`) — hoá đơn trỏ tới bậc gói qua
       * `lines_json.planId`, không có FK nào khiến DB tự chặn `deletePlan` chạy song song. Không
       * khoá thì lượt xoá có thể lọt giữa lúc đọc bậc gói ở trên và lúc chèn hoá đơn dưới đây,
       * để lại một hoá đơn mà lúc tiền về không kích hoạt được. Khoá này không chặn sửa hay
       * archive (chỉ xung đột với DELETE và đổi khoá).
       */
      const planRow = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM plans WHERE id = ${plan.id} FOR KEY SHARE`;
      if (planRow.length === 0) {
        throw new NotFoundException({
          code: API_ERROR_CODE.NOT_FOUND,
          message: 'Không tìm thấy gói dịch vụ',
        });
      }

      /*
       * Hoá đơn ĐÃ NHẬN MỘT PHẦN TIỀN chặn đường mua tiếp — và phải chặn, không phải void.
       *
       * `updateMany` bên dưới cố ý chỉ void trạng thái `issued` (chưa đồng nào về). Một hoá đơn
       * `partially_paid` thì khác hẳn: void nó là xoá dấu vết của khoản khách đã chuyển, còn để
       * nó sống cạnh một hoá đơn mới thì `applyBankPaymentWithinTx` coi CẢ HAI đều payable.
       * Lối đi tiếp đúng là chuyển nốt phần còn thiếu theo mã cũ, nên trả mã lỗi nói thẳng điều
       * đó kèm chính mã đối soát đang dang dở.
       */
      /*
       * Theo PHẠM VI (ADR 0065): hoá đơn gói ô tô dang dở không chặn mua gói xe máy — hai chuỗi
       * kỳ độc lập, và unique ở DB cũng chỉ giữ một hoá đơn trả được cho mỗi phạm vi.
       */
      const partiallyPaid = await tx.subscriptionInvoice.findFirst({
        where: {
          tenantId,
          vehicleScope: { in: conflictingScopes },
          status: SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID,
        },
        orderBy: { createdAt: 'desc' },
        select: { code: true, checkout: { select: { code: true } } },
      });
      if (partiallyPaid) {
        // Hoá đơn thuộc phiếu gộp nhận tiền QUA phiếu — mã cần chuyển bù là mã của phiếu.
        const code = partiallyPaid.checkout?.code ?? partiallyPaid.code;
        throw new ConflictException({
          code: API_ERROR_CODE.SUBSCRIPTION_INVOICE_PARTIALLY_PAID,
          message: `Hoá đơn ${code} đã nhận một phần tiền — chuyển nốt phần còn thiếu theo đúng mã đó thay vì tạo hoá đơn mới`,
          details: { code },
        });
      }

      await this.voidIssuedInvoicesWithinTx(tx, {
        tenantId,
        vehicleScope: { in: conflictingScopes },
      });
      const invoice = await this.createInvoiceWithinTx(tx, {
        tenantId,
        subscriptionId: null,
        checkoutId: args.checkoutId,
        snapshot: {
          planId: plan.id,
          planCode: plan.code,
          termMonths,
          vehicleScope,
          timing,
          quota: quotaOf(limits),
          lines: pricing.lines,
        },
        subtotal: pricing.subtotal,
        discountAmount: pricing.discountAmount,
        periodFrom,
        periodTo,
        paid: false,
        expiresAt,
      });
      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: 'tenant',
          action: 'subscription_invoice.issue',
          targetType: 'subscription_invoice',
          targetId: invoice.id,
          after: {
            code: invoice.code,
            checkoutId: args.checkoutId,
            planCode: plan.code,
            termMonths,
            vehicleScope,
            quota: quotaOf(limits),
            totalAmount: invoice.totalAmount.toString(),
            expiresAt: expiresAt.toISOString(),
          },
        },
        tx,
      );
      return invoice;
    }
  }

  /**
   * VOID mọi hoá đơn `issued` khớp `where` — và PHIẾU GỘP chứa chúng cùng mọi hoá đơn anh em
   * (ADR 0083). Đường void duy nhất của các lượt mua / kích hoạt trong service này.
   *
   * Vì sao kéo cả phiếu: tổng của phiếu là tổng các hoá đơn con. Void một con mà phiếu còn sống thì
   * khách chuyển đủ tổng cũ cho một phiếu không còn kích hoạt được phần đã void — tiền về một nơi
   * không có hàng để giao.
   *
   * Phiếu bị void TRƯỚC (một `UPDATE` có điều kiện trạng thái — chờ khoá hàng nếu lượt tiền về đang
   * cầm `FOR UPDATE` trên phiếu, rồi đọc lại trạng thái), con void SAU theo đúng tập phiếu vừa void.
   * Phiếu đã có tiền (`partially_paid`) không void — cùng luật với hoá đơn đơn lẻ.
   */
  private async voidIssuedInvoicesWithinTx(
    tx: Prisma.TransactionClient,
    where: Prisma.SubscriptionInvoiceWhereInput,
  ): Promise<void> {
    const issued = await tx.subscriptionInvoice.findMany({
      where: { ...where, status: SUBSCRIPTION_INVOICE_STATUS.ISSUED },
      select: { id: true, checkoutId: true },
    });
    if (issued.length === 0) return;
    const standalone = issued.filter((row) => row.checkoutId === null).map((row) => row.id);
    if (standalone.length) {
      await tx.subscriptionInvoice.updateMany({
        where: { id: { in: standalone }, status: SUBSCRIPTION_INVOICE_STATUS.ISSUED },
        data: { status: SUBSCRIPTION_INVOICE_STATUS.VOID },
      });
    }
    const checkoutIds = [
      ...new Set(issued.map((row) => row.checkoutId).filter((id): id is string => id !== null)),
    ];
    if (checkoutIds.length === 0) return;
    const voided = await tx.$queryRaw<{ id: string }[]>`
      UPDATE subscription_checkouts
         SET status = ${SUBSCRIPTION_INVOICE_STATUS.VOID}, updated_at = now()
       WHERE id = ANY(${checkoutIds}::char(26)[])
         AND status = ${SUBSCRIPTION_INVOICE_STATUS.ISSUED}
      RETURNING id`;
    if (voided.length === 0) return;
    await tx.subscriptionInvoice.updateMany({
      where: {
        checkoutId: { in: voided.map((row) => row.id) },
        status: SUBSCRIPTION_INVOICE_STATUS.ISSUED,
      },
      data: { status: SUBSCRIPTION_INVOICE_STATUS.VOID },
    });
  }

  /**
   * Gói hiện hành của tenant (đọc-only, dùng cho tenant detail) — null nếu không có/hết hạn.
   * Nhiều kỳ cùng chạy (ADR 0065) ⇒ kỳ ưu tiên (`all` → ô tô → xe máy, rồi dòng hoa hồng);
   * danh sách đủ là `currentPlans`.
   */
  async currentPlan(tenantId: string): Promise<CurrentPlanDto | null> {
    const now = new Date();
    const [first] = await this.findCurrentRows(tenantId, now);
    return first ? toCurrentPlanDto(first, now) : null;
  }

  /** Mọi kỳ ĐANG CHẠY (`starts_at <= now < ends_at`), kỳ ưu tiên trước — xem `currentPlan`. */
  async currentPlans(tenantId: string): Promise<CurrentPlanDto[]> {
    const now = new Date();
    return (await this.findCurrentRows(tenantId, now)).map((row) => toCurrentPlanDto(row, now));
  }

  /**
   * Áp MỘT khoản tiền ngân hàng vào hoá đơn gói theo mã đối soát — do `SepayService` gọi,
   * TRONG cùng transaction với dòng `bank_transactions` (ADR 0022 điều 2: cột `matched_*` và
   * hiệu ứng ở đích phải cùng sống cùng chết).
   *
   * Nằm ở BillingService vì đây là writer duy nhất của `subscription_invoices` và
   * `tenant_subscriptions` — SePay sở hữu sổ ngân hàng, không sở hữu hoá đơn.
   *
   * ## An toàn khi chạy lặp / song song
   *
   * Chống ghi đôi cấp GIAO DỊCH nằm ở unique `(provider, provider_tx_id)` phía caller. Ở đây
   * lo phần còn lại: HAI giao dịch KHÁC NHAU cùng trả một hoá đơn chạy song song.
   *  - Cộng dồn bằng `increment` nguyên tử, không đọc-rồi-ghi.
   *  - Lật `paid` + kích hoạt bằng MỘT `updateMany` có điều kiện trạng thái (khuôn claim của
   *    `subscription-lifecycle`): hai bên cùng đủ tiền thì đúng một bên claim được, bên kia
   *    thấy `count = 0` và dừng ở "đã trả rồi" — không bao giờ hai subscription.
   *
   * ## Chuyển thiếu / thừa (ADR 0016 điều 6)
   *
   * Thiếu → `partially_paid`, KHÔNG kích hoạt, giữ nguyên mã để chuyển bù (`expiresAt` được
   * XOÁ: hoá đơn đã có tiền thật thì không được để job lật `void` — tiền về sau hạn vài phút
   * mà mã chết là admin phải xử lý tay một ca lẽ ra tự xong). Thừa → ghi có kỳ sau: `paidAmount`
   * giữ nguyên phần dư làm bằng chứng, admin thấy chênh lệch ở màn đối soát.
   */
  async applyBankPaymentWithinTx(
    tx: Prisma.TransactionClient,
    args: { code: string; amount: Prisma.Decimal; providerTxId: string },
  ): Promise<
    | { outcome: 'invoice_not_found' }
    | { outcome: 'invoice_closed'; invoiceId: string; tenantId: string; status: string }
    | { outcome: 'partial'; invoiceId: string; tenantId: string; paid: string; total: string }
    | { outcome: 'already_paid'; invoiceId: string; tenantId: string }
    | { outcome: 'activated'; invoiceId: string; tenantId: string; subscriptionId: string }
  > {
    const invoice = await tx.subscriptionInvoice.findUnique({
      where: { code: args.code.toUpperCase() },
      select: {
        id: true,
        tenantId: true,
        status: true,
        totalAmount: true,
        linesJson: true,
        checkout: { select: { code: true } },
      },
    });
    if (!invoice) return { outcome: 'invoice_not_found' };

    /*
     * Hoá đơn thuộc PHIẾU GỘP nhận tiền QUA phiếu (ADR 0083) — kể cả khi khách (hay admin khớp tay)
     * dùng mã của chính hoá đơn. Cộng vào hoá đơn con thì một khoản kích hoạt MỘT gói trong khi
     * khách đã mua hai, và tổng của phiếu không bao giờ khớp nữa.
     */
    if (invoice.checkout) {
      const applied = await this.applyCheckoutPaymentWithinTx(tx, {
        code: invoice.checkout.code,
        amount: args.amount,
        providerTxId: args.providerTxId,
      });
      switch (applied.outcome) {
        case 'checkout_not_found':
          return { outcome: 'invoice_not_found' };
        case 'checkout_closed':
          return {
            outcome: 'invoice_closed',
            invoiceId: invoice.id,
            tenantId: invoice.tenantId,
            status: applied.status,
          };
        case 'partial':
          return {
            outcome: 'partial',
            invoiceId: invoice.id,
            tenantId: invoice.tenantId,
            paid: applied.paid,
            total: applied.total,
          };
        case 'already_paid':
          return { outcome: 'already_paid', invoiceId: invoice.id, tenantId: invoice.tenantId };
        case 'activated':
          return {
            outcome: 'activated',
            invoiceId: invoice.id,
            tenantId: invoice.tenantId,
            subscriptionId: applied.subscriptionIds[0] ?? '',
          };
      }
    }

    // string[] tường minh: cột status là String (ADR 0005) nên phép includes so với giá trị DB.
    const payable: string[] = [...SUBSCRIPTION_INVOICE_PAYABLE_STATUSES];

    if (invoice.status === SUBSCRIPTION_INVOICE_STATUS.PAID) {
      // Tiền về lần nữa cho hoá đơn đã đủ: cộng dồn làm BẰNG CHỨNG chênh lệch (paid > total
      // hiện ở màn đối soát), không kích hoạt gì thêm.
      await tx.subscriptionInvoice.update({
        where: { id: invoice.id },
        data: { paidAmount: { increment: args.amount } },
      });
      return { outcome: 'already_paid', invoiceId: invoice.id, tenantId: invoice.tenantId };
    }
    if (!payable.includes(invoice.status)) {
      // `void`/`draft`: tiền về cho một mã đã chết — KHÔNG tự xử lý. Giao dịch nằm ở hàng đợi
      // chưa khớp để admin quyết (hoàn, hay khớp tay sang hoá đơn thay thế).
      return {
        outcome: 'invoice_closed',
        invoiceId: invoice.id,
        tenantId: invoice.tenantId,
        status: invoice.status,
      };
    }

    const credited = await tx.subscriptionInvoice.updateMany({
      where: { id: invoice.id, status: { in: payable } },
      data: { paidAmount: { increment: args.amount } },
    });
    if (credited.count === 0) {
      /*
       * Trạng thái vừa bị lật GIỮA findUnique và increment — hoặc job `void` hoá đơn quá hạn,
       * hoặc một webhook song song vừa trả đủ. `count = 0` nghĩa là tiền CHƯA được cộng vào
       * đâu; bỏ qua chỗ này là giao dịch bị đánh dấu "đã khớp" trong khi hoá đơn không nhận
       * được đồng nào.
       */
      const current = await tx.subscriptionInvoice.findUniqueOrThrow({
        where: { id: invoice.id },
        select: { status: true },
      });
      if (current.status === SUBSCRIPTION_INVOICE_STATUS.PAID) {
        // Cộng làm bằng chứng thừa — cùng đường với nhánh PAID ở trên.
        await tx.subscriptionInvoice.update({
          where: { id: invoice.id },
          data: { paidAmount: { increment: args.amount } },
        });
        return { outcome: 'already_paid', invoiceId: invoice.id, tenantId: invoice.tenantId };
      }
      return {
        outcome: 'invoice_closed',
        invoiceId: invoice.id,
        tenantId: invoice.tenantId,
        status: current.status,
      };
    }
    const updated = await tx.subscriptionInvoice.findUniqueOrThrow({
      where: { id: invoice.id },
      select: { paidAmount: true, totalAmount: true },
    });

    if (updated.paidAmount.lt(updated.totalAmount)) {
      await tx.subscriptionInvoice.updateMany({
        where: { id: invoice.id, status: SUBSCRIPTION_INVOICE_STATUS.ISSUED },
        // Xem docblock: hoá đơn đã có tiền thật thì thôi hạn `void`.
        data: { status: SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID, expiresAt: null },
      });
      return {
        outcome: 'partial',
        invoiceId: invoice.id,
        tenantId: invoice.tenantId,
        paid: updated.paidAmount.toString(),
        total: updated.totalAmount.toString(),
      };
    }

    const claimed = await tx.subscriptionInvoice.updateMany({
      where: { id: invoice.id, status: { in: payable } },
      data: { status: SUBSCRIPTION_INVOICE_STATUS.PAID, paidAt: new Date(), expiresAt: null },
    });
    if (claimed.count === 0) {
      // Giao dịch song song vừa claim xong — tiền của mình thành phần dư, như nhánh PAID trên.
      return { outcome: 'already_paid', invoiceId: invoice.id, tenantId: invoice.tenantId };
    }

    const subscriptionId = await this.activateFromInvoiceWithinTx(tx, {
      invoiceId: invoice.id,
      tenantId: invoice.tenantId,
      totalAmount: invoice.totalAmount,
      linesJson: invoice.linesJson,
      providerTxId: args.providerTxId,
    });
    return {
      outcome: 'activated',
      invoiceId: invoice.id,
      tenantId: invoice.tenantId,
      subscriptionId,
    };
  }

  /**
   * Áp MỘT khoản tiền ngân hàng vào PHIẾU THANH TOÁN GỘP theo mã `XPC…` (ADR 0083) — cùng hợp
   * đồng với `applyBankPaymentWithinTx`: `SepayService` gọi TRONG transaction của dòng
   * `bank_transactions`.
   *
   * ## Khoá hàng phiếu, không claim từng bước
   *
   * Phiếu có nhiều hoá đơn con, và lượt "đủ tiền" phải lật TẤT CẢ cùng lúc. `SELECT … FOR UPDATE`
   * trên hàng phiếu tuần tự hoá mọi lượt chạm vào nó: hai khoản tiền song song, lượt void của job
   * hết hạn, lượt void do mua lại — tất cả đều `UPDATE` hàng phiếu trước, nên chờ nhau thay vì đan
   * xen. Sau khoá, trạng thái đọc lại là trạng thái thật.
   *
   * ## Thiếu / đủ / thừa — cùng luật hoá đơn đơn lẻ (ADR 0016 điều 6)
   *
   *  - thiếu ⇒ phiếu VÀ mọi hoá đơn con cùng `partially_paid`, thôi hạn void (`expires_at` NULL):
   *    các luật đã có (chặn mua mới cùng loại xe, job không void) tự áp lên từng hoá đơn con;
   *  - đủ ⇒ phiếu `paid`; mỗi hoá đơn con `paid` với `paid_amount` = đúng tổng của nó (phân bổ),
   *    rồi kích hoạt LẦN LƯỢT — một kỳ hỏng thì cả transaction đổ, SePay gửi lại, không nửa vời;
   *  - thừa / tiền về lần nữa ⇒ cộng vào `paid_amount` của PHIẾU làm bằng chứng chênh lệch.
   */
  async applyCheckoutPaymentWithinTx(
    tx: Prisma.TransactionClient,
    args: { code: string; amount: Prisma.Decimal; providerTxId: string },
  ): Promise<
    | { outcome: 'checkout_not_found' }
    | { outcome: 'checkout_closed'; checkoutId: string; tenantId: string; status: string }
    | { outcome: 'partial'; checkoutId: string; tenantId: string; paid: string; total: string }
    | { outcome: 'already_paid'; checkoutId: string; tenantId: string }
    | { outcome: 'activated'; checkoutId: string; tenantId: string; subscriptionIds: string[] }
  > {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM subscription_checkouts WHERE code = ${args.code.toUpperCase()} FOR UPDATE`;
    const [lockedRow] = locked;
    if (!lockedRow) return { outcome: 'checkout_not_found' };
    const checkout = await tx.subscriptionCheckout.findUniqueOrThrow({
      where: { id: lockedRow.id },
      select: { id: true, tenantId: true, status: true, totalAmount: true, paidAmount: true },
    });
    const base = { checkoutId: checkout.id, tenantId: checkout.tenantId };

    if (checkout.status === SUBSCRIPTION_INVOICE_STATUS.PAID) {
      await tx.subscriptionCheckout.update({
        where: { id: checkout.id },
        data: { paidAmount: { increment: args.amount } },
      });
      return { outcome: 'already_paid', ...base };
    }
    if (!isSubscriptionInvoicePayable(checkout.status)) {
      // `void`: tiền về cho một mã đã chết — nằm lại hàng đợi đối soát để admin quyết (hoàn khách).
      return { outcome: 'checkout_closed', ...base, status: checkout.status };
    }

    const members = await tx.subscriptionInvoice.findMany({
      where: { checkoutId: checkout.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, status: true, totalAmount: true, linesJson: true },
    });
    /*
     * Bất biến của `voidIssuedInvoicesWithinTx`: con void thì phiếu void theo. Một phiếu còn mở mà
     * có con không nhận tiền được là dữ liệu sai lệch (sửa tay?) — KHÔNG kích hoạt một phần; để
     * admin xử ở hàng đợi.
     */
    const broken = members.find((member) => !isSubscriptionInvoicePayable(member.status));
    if (members.length === 0 || broken) {
      this.logger.warn(
        `Phiếu ${checkout.id} còn mở nhưng có hoá đơn con không nhận tiền được — chuyển hàng đợi đối soát.`,
      );
      return {
        outcome: 'checkout_closed',
        ...base,
        status: broken?.status ?? SUBSCRIPTION_INVOICE_STATUS.VOID,
      };
    }

    const paid = checkout.paidAmount.add(args.amount);
    if (paid.lt(checkout.totalAmount)) {
      await tx.subscriptionCheckout.update({
        where: { id: checkout.id },
        data: {
          paidAmount: paid,
          status: SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID,
          expiresAt: null,
        },
      });
      await tx.subscriptionInvoice.updateMany({
        where: { checkoutId: checkout.id, status: SUBSCRIPTION_INVOICE_STATUS.ISSUED },
        data: { status: SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID, expiresAt: null },
      });
      return {
        outcome: 'partial',
        ...base,
        paid: paid.toString(),
        total: checkout.totalAmount.toString(),
      };
    }

    const paidAt = new Date();
    await tx.subscriptionCheckout.update({
      where: { id: checkout.id },
      data: {
        paidAmount: paid,
        status: SUBSCRIPTION_INVOICE_STATUS.PAID,
        paidAt,
        expiresAt: null,
      },
    });
    // Lật HẾT trước, kích hoạt SAU: lượt kích hoạt con đầu void hoá đơn `issued` xung đột — con
    // thứ hai đã `paid` nên không bao giờ bị cuốn theo.
    for (const member of members) {
      await tx.subscriptionInvoice.update({
        where: { id: member.id },
        data: {
          status: SUBSCRIPTION_INVOICE_STATUS.PAID,
          paidAmount: member.totalAmount,
          paidAt,
          expiresAt: null,
        },
      });
    }
    const subscriptionIds: string[] = [];
    for (const member of members) {
      subscriptionIds.push(
        await this.activateFromInvoiceWithinTx(tx, {
          invoiceId: member.id,
          tenantId: checkout.tenantId,
          totalAmount: member.totalAmount,
          linesJson: member.linesJson,
          providerTxId: args.providerTxId,
        }),
      );
    }
    return { outcome: 'activated', ...base, subscriptionIds };
  }

  /**
   * Mở gói từ SNAPSHOT của hoá đơn đã trả đủ — kỳ THẬT chốt tại đây (nối đuôi gói còn hạn,
   * đúng phép tính của `assign`), không phải kỳ "dự kiến" in trên hoá đơn lúc phát hành.
   *
   * Snapshot là nguồn của planId/termMonths/slots (số tiền đã thoả thuận — ADR 0024); riêng
   * `billingMode`/`commissionPercent` đọc từ dòng plan HIỆN TẠI vì chúng được snapshot vào
   * subscription ngay bây giờ — thời điểm kích hoạt chính là thời điểm "tạo" theo ADR 0024.
   *
   * Snapshot hỏng (dữ liệu tay/cũ) → ném để transaction ABORT: dòng bank_transaction cũng không
   * được ghi, SePay retry, và lỗi nổi lên ở log thay vì một gói mở sai chỗ.
   */
  private async activateFromInvoiceWithinTx(
    tx: Prisma.TransactionClient,
    args: {
      invoiceId: string;
      tenantId: string;
      totalAmount: Prisma.Decimal;
      linesJson: Prisma.JsonValue;
      providerTxId: string;
    },
  ): Promise<string> {
    const snapshot = parsePlanInvoiceSnapshot(args.linesJson);
    if (!snapshot) {
      throw new Error(`Hoá đơn ${args.invoiceId} có lines_json không kích hoạt được`);
    }
    const plan = await tx.plan.findUniqueOrThrow({
      where: { id: snapshot.planId },
      select: {
        id: true,
        code: true,
        name: true,
        billingMode: true,
        commissionPercent: true,
        vehicleScope: true,
      },
    });
    /*
     * Phạm vi đọc từ BẬC, không từ snapshot: phạm vi của một bậc không đổi sau khi tạo, và trigger
     * ở DB đòi dòng thuê bao khớp đúng bậc nó trỏ tới. Hoá đơn trước ADR 0065 (bậc `shop-*` đã
     * ngừng bán) ra một kỳ `all` với trần TỔNG ghi trên chính tờ hoá đơn — xếp SAU mọi kỳ đang
     * chạy của cả hai loại xe, nên không cắt ngắn kỳ nào gian hàng đã trả.
     */
    const vehicleScope = planVehicleScopeOf(plan.vehicleScope);
    if (snapshot.vehicleScope !== vehicleScope) {
      this.logger.warn(
        `Hoá đơn ${args.invoiceId} ghi phạm vi ${snapshot.vehicleScope} nhưng bậc ${plan.code} là ${vehicleScope} — kích hoạt theo bậc.`,
      );
    }

    const now = new Date();
    /*
     * Thời điểm SUY LẠI lúc tiền về (ADR 0084), không đọc `snapshot.timing`: giữa lúc phát hành và lúc
     * trả, chuỗi kỳ có thể đã đổi (admin gán, một hoá đơn khác về trước), và hoá đơn cũ còn mang
     * `now` do người mua tự chọn — gia hạn cùng bậc với `now` từng huỷ cả kỳ đang chạy.
     */
    const { startsAt, purchaseKind } = await this.planChainWithinTx(tx, {
      tenantId: args.tenantId,
      planId: plan.id,
      vehicleScope,
      timing: { selfServe: { maxVehicles: snapshot.quota.maxVehicles } },
      actorUserId: null,
      now,
    });
    const endsAt = addCalendarMonthsVn(startsAt, snapshot.termMonths);

    const sub = await tx.tenantSubscription.create({
      data: {
        id: newId(),
        tenantId: args.tenantId,
        planId: plan.id,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        price: args.totalAmount,
        termMonths: snapshot.termMonths,
        vehicleScope,
        // Hạn mức từ CHÍNH hoá đơn, không đọc lại `plan.limits_json`: giữa lúc phát hành mã và
        // lúc tiền về, admin có thể đã sửa bậc gói. Thứ gian hàng trả tiền cho là thứ ghi trên
        // tờ hoá đơn họ đang cầm (ADR 0041 điều 3).
        quotaJson:
          plan.billingMode === BILLING_MODE.PACKAGE
            ? (snapshot.quota as unknown as Prisma.InputJsonValue)
            : Prisma.DbNull,
        billingMode: plan.billingMode,
        commissionPercent: plan.commissionPercent,
        startsAt,
        endsAt,
        // Người tạo là HỆ THỐNG (webhook) — cột NULL, dấu vết nằm ở audit + bank_transactions.
        createdBy: null,
      },
      select: { id: true, startsAt: true, endsAt: true },
    });

    await tx.subscriptionInvoice.update({
      where: { id: args.invoiceId },
      // Kỳ thật thay kỳ dự kiến — hoá đơn phải kể đúng câu chuyện của gói nó đã mở.
      data: { subscriptionId: sub.id, periodFrom: sub.startsAt, periodTo: sub.endsAt },
    });

    /*
     * ONBOARDING GÓI XONG — trong CHÍNH transaction này (ADR 0040).
     *
     * Ba thứ phải cùng sống cùng chết: hoá đơn `paid`, dòng thuê bao `active`, và mốc onboarding.
     * Tách mốc ra ngoài (một job, hay một lượt gọi API sau khi client thấy `paid`) tạo ra một
     * cửa sổ trong đó gian hàng đã trả tiền nhưng vẫn bị routing giữ ở màn chuyển khoản — và
     * `planChainWithinTx` ngay trên đã huỷ dòng hoa hồng tạm, nên trong cửa sổ đó họ không thuộc
     * tuyến nào cả.
     */
    await this.completePackageOnboardingWithinTx(tx, args.tenantId, plan.billingMode);
    await this.voidInvoicesSupersededByScopeWithinTx(tx, args.tenantId, plan);

    await this.audit.record(
      {
        tenantId: args.tenantId,
        actorScope: AUDIT_ACTOR_SCOPE.SYSTEM,
        action: SUBSCRIPTION_AUDIT_ACTION.ACTIVATE_FROM_PAYMENT,
        targetType: AUDIT_TARGET_TYPE.TENANT_SUBSCRIPTION,
        targetId: sub.id,
        after: {
          invoiceId: args.invoiceId,
          planId: plan.id,
          // Mã + tên gói lúc kích hoạt — nhật ký đọc được cả khi bậc gói đổi tên sau này.
          planCode: plan.code,
          planName: plan.name,
          termMonths: snapshot.termMonths,
          vehicleScope,
          purchaseKind,
          quota: snapshot.quota,
          price: args.totalAmount.toString(),
          startsAt: sub.startsAt.toISOString(),
          endsAt: sub.endsAt.toISOString(),
          // Mã giao dịch phía nhà cung cấp — KHÔNG phải nội dung chuyển khoản hay số TK.
          providerTxId: args.providerTxId,
        },
      },
      tx,
    );

    await this.notifications.emitToTenantMembers(
      args.tenantId,
      {
        type: NOTIFICATION_TYPE.SUBSCRIPTION_ACTIVATED,
        title: `Gói ${plan.name} đã kích hoạt`,
        // Cùng cách in ngày với các tin vòng đời gói ở `subscription-lifecycle` — múi giờ VN.
        body: `Tiền đã về đủ. Gói hiệu lực tới ${sub.endsAt.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}.`,
        tenantId: args.tenantId,
      },
      tx,
    );

    return sub.id;
  }

  /**
   * Hạn mức SỐ XE — đếm THEO LOẠI XE trong phạm vi của gói, hai điểm thi hành (ADR 0041 điều 4 ·
   * ADR 0065).
   *
   * | Nguồn trần | Trần | Đếm | Gác tạo xe | Gác gửi lên chợ |
   * | --- | --- | --- | --- | --- |
   * | Kỳ gói phủ loại xe (`plan`) | `quota.maxVehicles` | xe CÙNG loại (bậc `all`: mọi loại) | ✅ | ✅ |
   * | Tuyến gói nhưng KHÔNG có kỳ cho loại này | — | — | ❌ `PLAN_SCOPE_REQUIRED` | ❌ `PLAN_SCOPE_REQUIRED` |
   * | Owner Lite (`owner_lite`) | `OWNER_LITE_VEHICLE_LIMIT` | TỔNG | ✅ | — |
   * | Chưa cấu hình (`billing_unconfigured`) | 3, mã lỗi khác | TỔNG | ✅ | — |
   *
   * ## Không rơi về Owner Lite cho loại xe chưa mua gói
   *
   * Gian hàng đang trả gói ô tô mà đăng được xe máy theo trần 3 xe của tuyến hoa hồng là hai
   * tuyến trên MỘT gian hàng — và tuyến hoa hồng thu 10% phí dịch vụ phía khách trên chính chiếc
   * xe máy đó, trong khi cả gian hàng đang hưởng 0% (ADR 0028). Lối đi tiếp đúng là mua gói cho
   * loại xe đó, nên mã lỗi nói đúng điều đó.
   *
   * ## Vì sao đọc `resolveEffectiveBilling` chứ không `findCurrent`
   *
   * `findCurrent` đòi `ends_at > now`, nên đúng giây một gói hết hạn nó trả `null` — và một bản
   * trước của hàm này coi `null` là KHÔNG GIỚI HẠN. Pha `grace`/`lapsed` chỉ tồn tại ở
   * `resolveEffectiveBilling`/`resolveActivePackageTerms`, nên hạn mức phải hỏi chính chúng.
   *
   * ## Hai điểm thi hành, và vì sao chúng khác nhau
   *
   * `scope: 'fleet'` (mặc định) — tạo xe. `scope: 'marketplace'` — gửi xe lên chợ; chỉ đếm xe
   * đang chiếm suất và TRỪ chính chiếc đang gửi, để tenant tụt bậc vẫn chọn được xe nào ở lại.
   * Trần KHÔNG trả tiền (Owner Lite, `unconfigured`) chỉ gác điểm TẠO (ADR 0038 điều 12); trần
   * ĐÃ TRẢ TIỀN gác cả hai, vì đó là cửa duy nhất còn lại của một lần HẠ BẬC.
   *
   * ⚠️ Cổng này CHẶN THÊM MỚI, không gỡ thứ đang có (ADR 0038 · ADR 0041 điều 4). Xe ở nguyên
   * trên chợ, chuyến chạy tiếp, tiền về ví bình thường; chỉ chiếc TIẾP THEO bị từ chối.
   */
  async assertVehicleQuota(
    tenantId: string,
    vehicleType: VehicleType,
    opts: { scope?: PlanQuotaGatePoint; excludeVehicleId?: string } = {},
  ): Promise<void> {
    const quota = await this.vehicleQuotaFor(tenantId, vehicleType, new Date());
    if (quota.kind === VEHICLE_QUOTA_KIND.SCOPE_REQUIRED) {
      throw new ForbiddenException({
        code: API_ERROR_CODE.PLAN_SCOPE_REQUIRED,
        message:
          vehicleType === VEHICLE_TYPE.MOTORBIKE
            ? 'Gian hàng chưa có gói cho XE MÁY. Mua gói xe máy để đăng và đưa xe máy lên chợ.'
            : 'Gian hàng chưa có gói cho Ô TÔ. Mua gói ô tô để đăng và đưa ô tô lên chợ.',
        details: { vehicleType },
      });
    }
    if (quota.kind === VEHICLE_QUOTA_KIND.UNLIMITED || quota.limit === null) return;

    const scope = opts.scope ?? PLAN_QUOTA_GATE_POINT.FLEET;
    if (scope === PLAN_QUOTA_GATE_POINT.MARKETPLACE && quota.reason !== QUOTA_LIMIT_REASON.PLAN) return;

    const where: Prisma.VehicleWhereInput = {
      tenantId,
      deletedAt: null,
      // Bậc `all` (và Owner Lite) đếm GỘP hai loại; bậc theo loại chỉ đếm đúng loại đó.
      ...(quota.countedScope === PLAN_VEHICLE_SCOPE.ALL ? {} : { vehicleType: quota.countedScope }),
      ...(scope === PLAN_QUOTA_GATE_POINT.MARKETPLACE ? { publicStatus: { in: [...MARKETPLACE_SLOT_STATUSES] } } : {}),
      // Trừ chính chiếc đang gửi lại / đang đổi loại — để thao tác trên xe đã có không tự chặn mình.
      ...(opts.excludeVehicleId ? { id: { not: opts.excludeVehicleId } } : {}),
    };
    const used = await this.prisma.vehicle.count({ where });
    if (used < quota.limit) return;

    const details = {
      scope,
      reason: quota.reason,
      vehicleType,
      countedScope: quota.countedScope,
      used,
      limit: quota.limit,
    };

    /*
     * Cùng CON SỐ, khác LÝ DO — và lý do đi theo tới tận thông điệp lỗi.
     *
     * `unconfigured` không phải tuyến hoa hồng (ADR 0038 điều 1): đó là lỗi cấu hình của nền
     * tảng mà người dùng không tự sửa được. Nói với họ "chủ xe cá nhân đăng tối đa 3 xe" là nói
     * sai nguyên nhân, và đẩy họ đi mua một gói không giải quyết được gì.
     */
    if (quota.reason === QUOTA_LIMIT_REASON.BILLING_UNCONFIGURED) {
      throw new ConflictException({
        code: API_ERROR_CODE.TENANT_BILLING_NOT_CONFIGURED,
        message:
          `Gian hàng chưa có gói dịch vụ hiệu lực nên tạm thời chỉ giữ được ${quota.limit} xe. ` +
          'Liên hệ hỗ trợ XePrime — đây là lỗi cấu hình phía nền tảng, không phải hạn mức của bạn.',
        details,
      });
    }
    throw new ForbiddenException({
      code: API_ERROR_CODE.PLAN_LIMIT_REACHED,
      message:
        quota.reason === QUOTA_LIMIT_REASON.PLAN
          ? `Gói hiện tại cho phép tối đa ${quota.limit} xe${
              quota.countedScope === PLAN_VEHICLE_SCOPE.ALL
                ? ''
                : vehicleType === VEHICLE_TYPE.MOTORBIKE
                  ? ' máy'
                  : ' ô tô'
            }. Nâng bậc gói để đăng thêm xe.`
          : `Chủ xe cá nhân đăng tối đa ${quota.limit} xe (tính cả ô tô và xe máy). ` +
            'Mua gói gian hàng để đăng thêm xe.',
      details,
    });
  }

  /**
   * Hạn mức đang áp cho MỘT loại xe của một tenant — MỘT phép suy cho cổng chặn, màn "Gói của
   * tôi" và drawer đối tác của admin (`quotaForVehicleType`).
   *
   * `reason` và `countedScope` đi kèm con số vì chúng quyết định điểm thi hành, cách đếm, và câu
   * người dùng đọc khi chạm trần. Nén chúng vào một `number | null` là cách một màn hình bắt đầu
   * mời chủ xe "mua gói" để sửa một lỗi cấu hình của nền tảng.
   */
  async vehicleQuotaFor(
    tenantId: string,
    vehicleType: VehicleType,
    now: Date = new Date(),
  ): Promise<VehicleTypeQuota> {
    const rows = await this.loadEffectiveRows(tenantId, now);
    return quotaForVehicleType(rows, resolveEffectiveBilling(rows, now), vehicleType, now);
  }

  /** Hạn mức của CẢ HAI loại xe từ một lượt đọc — drawer đối tác của admin dùng. */
  async fleetQuotaFor(
    tenantId: string,
    now: Date = new Date(),
  ): Promise<Record<VehicleType, VehicleTypeQuota>> {
    const rows = await this.loadEffectiveRows(tenantId, now);
    const billing = resolveEffectiveBilling(rows, now);
    return {
      [VEHICLE_TYPE.CAR]: quotaForVehicleType(rows, billing, VEHICLE_TYPE.CAR, now),
      [VEHICLE_TYPE.MOTORBIKE]: quotaForVehicleType(rows, billing, VEHICLE_TYPE.MOTORBIKE, now),
    } as Record<VehicleType, VehicleTypeQuota>;
  }

  // -------------------------------------------------------------------------

  /**
   * Phạm vi loại xe của một bậc MỚI (ADR 0065) — bỏ trống = `all`.
   *
   * Bậc tuyến hoa hồng chỉ được là `all` (CHECK `plans_commission_scope_all`): tuyến đó không bán
   * gì theo loại xe, trần Owner Lite là TỔNG. Từ chối ở đây bằng `VALIDATION_FAILED` thay vì để DB
   * trả 500 cho một ô admin chọn sai.
   *
   * Không có đường SỬA phạm vi: dòng thuê bao snapshot nó và trigger ở DB đòi hai bên khớp, nên
   * đổi phạm vi của một bậc đã bán là đổi điều kiện hợp đồng của mọi gian hàng đang chạy trên nó.
   * Muốn một phạm vi khác thì tạo bậc khác.
   */
  private planScopeForCreate(billingMode: string, requested?: string): PlanVehicleScope {
    const scope = planVehicleScopeOf(requested);
    if (billingMode === BILLING_MODE.COMMISSION && scope !== PLAN_VEHICLE_SCOPE.ALL) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Bậc tuyến hoa hồng phủ mọi loại xe — phạm vi phải là "all"',
        details: { field: 'vehicleScope' },
      });
    }
    return scope;
  }

  /**
   * Chuẩn hoá + kiểm bộ núm của một bậc gói trước khi ghi. Chạy trên hình MERGED (create: dto
   * trọn vẹn; update: dto đè lên giá trị đang lưu) — hai chế độ, hai hình dạng dữ liệu, khớp
   * từng chữ với CHECK `plans_commission_percent_by_mode_check` ở DB.
   */
  private normalizePlanKnobs(input: {
    billingMode: string;
    commissionPercent: number | null;
    limits: PlanLimitsJson;
  }): typeof input {
    if (input.billingMode === BILLING_MODE.COMMISSION) {
      if (input.commissionPercent == null) {
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: 'Bậc gói tuyến hoa hồng bắt buộc có commissionPercent (1–20)',
          details: { field: 'commissionPercent' },
        });
      }
      /*
       * Tuyến hoa hồng KHÔNG bán gì (ADR 0038 điều 13): bảng giá phải rỗng, và nó cũng không
       * phải một bậc "tư vấn" đang chờ báo giá. Xoá lặng thay vì từ chối — vài dòng giá sót lại
       * là dữ liệu thừa chứ không phải ý định của admin; nhưng để chúng lọt vào `limits_json`
       * thì màn quản trị sẽ hiện tuyến vào cửa miễn phí như một SKU có giá.
       */
      return {
        ...input,
        limits: { ...input.limits, termPrices: [], salesOnly: false, recommended: false },
      };
    }
    /*
     * package: KHÔNG có % hoa hồng (0đ phí dịch vụ trên chuyến). Tự xoá thay vì bắt client gửi
     * null tường minh — không có cách đọc thứ hai cho tổ hợp package + %.
     *
     * Bậc `salesOnly` bán bằng tư vấn nên bảng giá của nó phải RỖNG (ADR 0041 điều 5): để cả hai
     * cùng tồn tại là bày một giá niêm yết cạnh nút "Liên hệ tư vấn", rồi `purchase()` vẫn từ
     * chối — người dùng thấy một con số và bị chặn mà không hiểu vì sao.
     */
    return {
      ...input,
      commissionPercent: null,
      limits: input.limits.salesOnly ? { ...input.limits, termPrices: [] } : input.limits,
    };
  }

  /**
   * Bảng kê cả kỳ của MỘT lượt mua bậc gói — ADR 0041 điều 2.
   *
   * Một dòng, một con số: giá của kỳ hạn là thứ admin gõ vào bảng giá (hoặc thứ admin đàm phán ở
   * đường gán tay), không phải kết quả của một phép nhân. `unitPrice` cố ý bằng `amount` — "đơn
   * giá" của một bậc gói CHÍNH LÀ tiền cả kỳ, và chia nó cho số tháng để lấp ô đó sẽ in lên
   * chứng từ một con số lẻ không có trên bất kỳ bảng giá nào.
   *
   * `discountAmount = 0` luôn: % tiết kiệm trên thẻ kỳ hạn là một phép SO SÁNH giữa các kỳ hạn
   * (`planTermSavingPercent`), không phải một khoản giảm trên một giá gốc. Ghi nó vào chứng từ là
   * phát hành một hoá đơn khai rằng gói 12 tháng vốn giá 1.200.000đ — một con số không tồn tại.
   */
  private priceTerm(
    price: string,
    termMonths: number,
  ): {
    lines: PlanInvoiceLine[];
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    total: Prisma.Decimal;
  } {
    const amount = new Prisma.Decimal(price).toDecimalPlaces(2);
    return {
      lines: [
        {
          kind: 'package',
          quantity: 1,
          months: termMonths,
          unitPrice: amount.toString(),
          amount: amount.toString(),
        },
      ],
      subtotal: amount,
      discountAmount: new Prisma.Decimal(0),
      total: amount,
    };
  }

  /**
   * Ghi MỘT hoá đơn gói — đường ghi duy nhất của `subscription_invoices` đi qua đây.
   * Mã `XPG…` unique TOÀN SÀN do DB gác; đụng mã (xác suất 32⁻⁸) thì transaction của caller
   * fail với P2002 và caller thử lại trọn gói — không bắt lỗi giữa transaction vì Postgres đã
   * abort nó rồi.
   */
  private createInvoiceWithinTx(
    tx: Prisma.TransactionClient,
    args: {
      tenantId: string;
      subscriptionId: string | null;
      /** Phiếu gộp chứa hoá đơn này (ADR 0083) — chỉ lượt mua gộp truyền. */
      checkoutId?: string | null;
      snapshot: PlanInvoiceSnapshot;
      subtotal: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      periodFrom: Date;
      periodTo: Date;
      paid: boolean;
      expiresAt?: Date | null;
    },
  ) {
    const total = args.subtotal.sub(args.discountAmount);
    return tx.subscriptionInvoice.create({
      data: {
        id: newId(),
        tenantId: args.tenantId,
        subscriptionId: args.subscriptionId,
        checkoutId: args.checkoutId ?? null,
        code: newReferenceCode(BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_INVOICE),
        periodFrom: args.periodFrom,
        periodTo: args.periodTo,
        // Cột phạm vi là khoá của unique "một hoá đơn trả được mỗi phạm vi" (ADR 0065) — lấy từ
        // CHÍNH snapshot để cột và `lines_json` không bao giờ nói hai điều khác nhau.
        vehicleScope: args.snapshot.vehicleScope,
        linesJson: args.snapshot as unknown as Prisma.InputJsonValue,
        subtotal: args.subtotal,
        discountAmount: args.discountAmount,
        totalAmount: total,
        paidAmount: args.paid ? total : 0,
        status: args.paid ? SUBSCRIPTION_INVOICE_STATUS.PAID : SUBSCRIPTION_INVOICE_STATUS.ISSUED,
        paidAt: args.paid ? new Date() : null,
        expiresAt: args.paid ? null : (args.expiresAt ?? null),
      },
      select: INVOICE_SELECT,
    });
  }

  /**
   * TUYẾN hiệu lực của tenant ngay lúc này — nguồn DUY NHẤT cho báo giá, duyệt yêu cầu, cọc,
   * snapshot phí và denormalize listing.
   *
   * ⚠️ Thay cho phép suy cũ *"không có gói hiện hành ⇒ `package` (0%)"*. Phép đó đọc như một
   * fail-safe nhưng thực tế là một lỗ tiền định kỳ: dòng thuê bao hoa hồng 0đ có kỳ hạn
   * `COMMISSION_TRACK_TERM_MONTHS`, và giữa lúc nó hết hạn với lúc job vòng đời nối dòng mới
   * (sau `graceDays`, job chạy mỗi giờ) tenant KHÔNG có gói hiện hành nào — nên mọi chuyến trong
   * cửa sổ đó vừa không thu phí dịch vụ vừa không thu cọc. Với dữ liệu backfill 30/08, toàn bộ
   * tenant rơi vào cửa sổ đó cùng một ngày.
   *
   * `resolveEffectiveBilling` phân biệt bốn pha, và hai pha mới là chỗ sửa: trong **ân hạn** giữ
   * nguyên tuyến của dòng vừa hết hạn; **sau ân hạn** là tuyến hoa hồng ngay lập tức, không chờ
   * job. Pha thứ tư (`unconfigured`) trả `billingMode: null` — nơi gọi phải xử lý tường minh.
   */
  async effectiveBillingFor(
    tenantId: string,
    now: Date = new Date(),
    tx?: Prisma.TransactionClient,
  ): Promise<EffectiveBilling> {
    const client = tx ?? this.prisma;
    // Mọi phạm vi loại xe (ADR 0065): còn MỘT kỳ gói hiệu lực ở bất kỳ phạm vi nào là cả gian
    // hàng ở tuyến gói — `resolveEffectiveBilling` gộp các dòng.
    const rows = await client.tenantSubscription.findMany({
      where: { tenantId, ...effectiveSubscriptionWhere(now) },
      ...EFFECTIVE_SUBSCRIPTION_ARGS,
    });
    const billing = resolveEffectiveBilling(rows, now);
    if (billing.phase === BILLING_PHASE.UNCONFIGURED) {
      /*
       * `unconfigured` có HAI nguyên nhân từ ADR 0040, và chỉ một trong hai là sự cố.
       *
       * Gian hàng trả phí đang chờ thanh toán lượt gói đầu tiên CỐ Ý không có dòng thuê bao nào
       * (gán một dòng hoa hồng tạm sẽ biến họ thành chủ xe tuyến hoa hồng ở mọi nơi đọc
       * `billingMode`). Hệ quả — mọi đường ghi tiền bị từ chối — là đúng: một gian hàng chưa trả
       * tiền thì cũng chưa nhận đơn. Gọi đó là "danh mục gói hỏng" ở mức `error` là dạy đội vận
       * hành bỏ qua chính mã log này, đúng lúc nó cần được đọc.
       *
       * Đọc `tenants` chỉ trong nhánh này: pha `unconfigured` là ngoại lệ, nên một truy vấn nữa
       * ở đây không nằm trên đường nóng của `/auth/me` hay `TenantScopeGuard`.
       */
      const tenant = await client.tenant.findUnique({
        where: { id: tenantId },
        select: { onboardingState: true },
      });
      if (tenant?.onboardingState === SHOP_ONBOARDING_STATE.PACKAGE_PENDING) {
        this.logger.debug(
          `Tenant ${tenantId} đang onboarding tuyến gói (chưa thanh toán) nên chưa có tuyến thu phí.`,
        );
      } else {
        this.logger.error(
          `Tenant ${tenantId} KHÔNG xác định được tuyến thu phí (không có dòng thuê bao hợp lệ). ` +
            'Đường ghi tiền sẽ bị từ chối cho tới khi danh mục gói được sửa.',
        );
      }
    }
    return billing;
  }

  /**
   * Tuyến để TÍNH TIỀN, hoặc ném khi chưa xác định được.
   *
   * Dùng ở đường GHI (duyệt yêu cầu, tạo hold, đóng băng snapshot phí). Ném thay vì đoán, vì
   * đoán sai ở đây tạo ra một đơn có giá đã thoả thuận với khách nhưng sai dòng tiền — và đơn
   * đó bất biến sau khi tạo (ADR 0024).
   */
  async billingModeForMoneyOrThrow(
    tenantId: string,
    now: Date = new Date(),
    tx?: Prisma.TransactionClient,
  ): Promise<BillingMode> {
    const billing = await this.effectiveBillingFor(tenantId, now, tx);
    if (!billing.billingMode) {
      throw new ConflictException({
        code: API_ERROR_CODE.TENANT_BILLING_NOT_CONFIGURED,
        message:
          'Gian hàng chưa có gói dịch vụ hiệu lực nên chưa xác định được cách tính phí. ' +
          'Liên hệ hỗ trợ XePrime trước khi nhận đơn mới.',
        details: { phase: billing.phase },
      });
    }
    return billing.billingMode;
  }

  /**
   * `plans.limits_json` của gói HIỆN HÀNH — nguồn duy nhất của cờ năng lực (ADR 0027 điều 4).
   *
   * `null` khi không có gói hiện hành, và `planFeatureFlags` biến nó thành tập rỗng. Trả jsonb
   * thô thay vì tự giải cờ ở đây: `planFeatureFlags`/`featureStatesFrom` trong
   * `common/plan/feature-state.ts` đã là nơi duy nhất diễn giải nó cho guard và `me()`, và một
   * bản diễn giải thứ hai trong service là đúng thứ ADR 0027 cảnh báo.
   */
  async currentPlanLimitsFor(
    tenantId: string,
    now: Date = new Date(),
    tx?: Prisma.TransactionClient,
  ): Promise<unknown> {
    const rows = await this.findCurrentRows(tenantId, now, tx);
    if (rows.length === 0) return null;
    /*
     * Nhiều kỳ cùng chạy (ADR 0065: gói ô tô + gói xe máy) ⇒ HỢP cờ năng lực của các kỳ — cùng
     * phép mà `resolveTenantFeatures` dùng cho guard và `me()`. Trả về hình `limits_json` (chỉ
     * khoá `features`) để `planFeatureFlags` ở nơi gọi đọc như cũ.
     */
    const features = new Set(rows.flatMap((row) => parsePlanLimits(row.plan.limitsJson).features));
    return { features: [...features] };
  }

  /**
   * Mọi kỳ ĐANG CHẠY của tenant (`starts_at <= now < ends_at`), kỳ ưu tiên trước: kỳ gói theo thứ
   * tự phạm vi `all` → ô tô → xe máy, rồi dòng hoa hồng.
   */
  private async findCurrentRows(
    tenantId: string,
    now: Date,
    tx?: Prisma.TransactionClient,
  ): Promise<SubRow[]> {
    const client = tx ?? this.prisma;
    const rows = await client.tenantSubscription.findMany({
      // Điều kiện "gói hiện hành" dùng CHUNG với TenantScopeGuard/AuthService.me (ADR 0027):
      // hai định nghĩa trôi khỏi nhau là menu mở mà API trả 403.
      where: { tenantId, ...currentSubscriptionWhere(now) },
      orderBy: { endsAt: 'desc' },
      select: SUB_SELECT,
    });
    const rank = (row: SubRow) =>
      row.billingMode === BILLING_MODE.PACKAGE
        ? PLAN_VEHICLE_SCOPE_VALUES.indexOf(planVehicleScopeOf(row.vehicleScope))
        : PLAN_VEHICLE_SCOPE_VALUES.length;
    return rows.sort((a, b) => rank(a) - rank(b));
  }

  private async loadPlan(id: string) {
    const plan = await this.prisma.plan.findUnique({ where: { id }, select: PLAN_SELECT });
    if (!plan) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy gói dịch vụ',
      });
    }
    return plan;
  }

  private async assertTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundException({
        code: API_ERROR_CODE.NOT_FOUND,
        message: 'Không tìm thấy gian hàng',
      });
    }
  }
}

type PlanRow = Prisma.PlanGetPayload<{ select: typeof PLAN_SELECT }>;
type SubRow = Prisma.TenantSubscriptionGetPayload<{ select: typeof SUB_SELECT }>;
type InvoiceRow = Prisma.SubscriptionInvoiceGetPayload<{ select: typeof INVOICE_SELECT }>;

/** Một lượt mua đã KIỂM và TÍNH GIÁ xong (`preparePurchase`), chờ ghi trong transaction. */
interface PreparedPurchase {
  plan: PlanRow;
  limits: PlanLimitsJson;
  pricing: {
    lines: PlanInvoiceLine[];
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    total: Prisma.Decimal;
  };
  termMonths: number;
  vehicleScope: PlanVehicleScope;
}

/**
 * Các gói của MỘT lượt mua gộp / xem trước phải thuộc các loại xe KHÔNG xung đột (ADR 0083): trùng
 * loại xe thì phần tử sau void phần tử trước trong cùng transaction; gói mọi loại xe (`all`) chỉ mua
 * riêng.
 */
function assertCombinableScopes(prepared: readonly PreparedPurchase[]): void {
  for (const [index, item] of prepared.entries()) {
    if (prepared.length > 1 && item.vehicleScope === PLAN_VEHICLE_SCOPE.ALL) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Gói cho mọi loại xe không mua gộp được — mua riêng gói đó',
        details: { field: `items.${index}.planId` },
      });
    }
    const clash = prepared.find(
      (other, otherIndex) =>
        otherIndex < index && planScopesConflict(other.vehicleScope, item.vehicleScope),
    );
    if (clash) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Mỗi loại xe chỉ chọn một gói trong một lần thanh toán',
        details: { field: `items.${index}.planId`, vehicleScope: item.vehicleScope },
      });
    }
  }
}

/** Xe đang chiếm suất trên chợ — chờ duyệt công khai hoặc đã công khai. */
const MARKETPLACE_SLOT_STATUSES = [
  VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW,
  VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
] as const;

/**
 * Hạn mức đang áp cho MỘT loại xe (ADR 0065) — hình dạng chung của cổng chặn, "Gói của tôi" và
 * drawer đối tác.
 *
 *  - `kind: 'scope_required'` — gian hàng TUYẾN GÓI không có kỳ gói nào phủ loại xe này ⇒ tạo xe
 *    / đưa lên chợ bị từ chối `PLAN_SCOPE_REQUIRED`. `limit`/`reason` là `null`.
 *  - `countedScope` — đếm xe trong phạm vi nào: chính loại xe (bậc theo loại), hoặc `all` (bậc
 *    doanh nghiệp/bậc cũ có trần, Owner Lite) — tức trần dùng CHUNG với loại xe kia.
 */
export interface VehicleTypeQuota {
  kind: VehicleQuotaKind;
  limit: number | null;
  reason: QuotaLimitReason | null;
  countedScope: PlanVehicleScope;
  subscriptionId: string | null;
  planCode: string | null;
  planName: string | null;
  /** Pha của kỳ gói gác loại xe này (`current`/`grace`); `null` ngoài tuyến gói. */
  phase: string | null;
}

/**
 * Lõi thuần của `vehicleQuotaFor` — nhận các dòng hiệu lực đã đọc, để `mySubscription` tính hai
 * loại xe từ MỘT lượt đọc thay vì hai.
 */
function quotaForVehicleType<
  T extends EffectiveSubscriptionRowWithQuota,
>(rows: readonly T[], billing: EffectiveBilling, vehicleType: VehicleType, now: Date): VehicleTypeQuota {
  if (billing.billingMode !== BILLING_MODE.PACKAGE) {
    return {
      kind: VEHICLE_QUOTA_KIND.TOTAL,
      limit: OWNER_LITE_VEHICLE_LIMIT,
      reason:
        billing.phase === BILLING_PHASE.UNCONFIGURED ? QUOTA_LIMIT_REASON.BILLING_UNCONFIGURED : QUOTA_LIMIT_REASON.OWNER_LITE,
      // Trần Owner Lite là TỔNG ô tô + xe máy (ADR 0038 điều 12).
      countedScope: PLAN_VEHICLE_SCOPE.ALL,
      subscriptionId: null,
      planCode: null,
      planName: null,
      phase: null,
    };
  }
  const term: ActivePackageTerm<T> | null = packageTermCovering(
    resolveActivePackageTerms(rows, now),
    vehicleType,
  );
  if (!term) {
    return {
      kind: VEHICLE_QUOTA_KIND.SCOPE_REQUIRED,
      limit: null,
      reason: null,
      countedScope: vehicleType,
      subscriptionId: null,
      planCode: null,
      planName: null,
      phase: null,
    };
  }
  /*
   * SNAPSHOT thắng bậc gói (ADR 0041 điều 3), và phép chọn phải TƯỜNG MINH.
   *
   * `quota.maxVehicles ?? limits.maxVehicles` đọc một `null` TƯỜNG MINH ("bậc này không giới
   * hạn") thành "chưa khai" rồi rơi về bậc gói — sai ở đúng chỗ tốn tiền nhất. `parsePlanQuota`
   * trả `null` cho cả cột NULL lẫn jsonb hỏng, và chỉ khi đó mới hỏi tới bậc gói.
   */
  const quota = parsePlanQuota(term.row.quotaJson);
  const limit = quota ? quota.maxVehicles : parsePlanLimits(term.row.plan.limitsJson).maxVehicles;
  return {
    kind: limit === null ? VEHICLE_QUOTA_KIND.UNLIMITED : VEHICLE_QUOTA_KIND.TOTAL,
    limit,
    reason: QUOTA_LIMIT_REASON.PLAN,
    countedScope: term.vehicleScope === PLAN_VEHICLE_SCOPE.ALL ? PLAN_VEHICLE_SCOPE.ALL : vehicleType,
    subscriptionId: term.row.id,
    planCode: term.row.plan.code,
    planName: term.row.plan.name ?? null,
    phase: term.billing.phase,
  };
}

type EffectiveSubscriptionRowWithQuota = {
  id: string;
  billingMode: string | null;
  endsAt: Date;
  vehicleScope: string;
  quotaJson: Prisma.JsonValue;
  plan: { code: string; name: string; limitsJson: Prisma.JsonValue };
};

/**
 * `fleetQuota` một-con-số cho client trước ADR 0065 — SUY từ hạn mức theo loại, không phải một
 * luật thứ hai. Tuyến gói: tổng trần các loại đã có gói (loại chưa có gói góp 0; một kỳ `all` có
 * trần chỉ tính MỘT lần), có loại không giới hạn ⇒ `unlimited`. Cổng chặn thật đọc theo loại.
 */
function fleetQuotaSummary(
  quotas: { car: VehicleTypeQuota; motorbike: VehicleTypeQuota },
  totalUsed: number,
): MySubscriptionDto['fleetQuota'] {
  const list = [quotas.car, quotas.motorbike];
  if (list.some((q) => q.kind === VEHICLE_QUOTA_KIND.UNLIMITED)) {
    return { kind: VEHICLE_QUOTA_KIND.UNLIMITED, totalLimit: null, reason: null, totalUsed };
  }
  if (quotas.car.reason !== QUOTA_LIMIT_REASON.PLAN && quotas.car.kind !== VEHICLE_QUOTA_KIND.SCOPE_REQUIRED) {
    return { kind: VEHICLE_QUOTA_KIND.TOTAL, totalLimit: quotas.car.limit, reason: quotas.car.reason, totalUsed };
  }
  const seen = new Set<string>();
  let totalLimit = 0;
  for (const q of list) {
    if (q.kind !== VEHICLE_QUOTA_KIND.TOTAL || q.limit === null || !q.subscriptionId) continue;
    if (seen.has(q.subscriptionId)) continue;
    seen.add(q.subscriptionId);
    totalLimit += q.limit;
  }
  return { kind: VEHICLE_QUOTA_KIND.TOTAL, totalLimit, reason: QUOTA_LIMIT_REASON.PLAN, totalUsed };
}

/** Hoá đơn tay/hỏng không đọc ra snapshot nào — hiện "không giới hạn" là sai, nhưng DTO phải đủ hình. */
const EMPTY_QUOTA: PlanQuotaSnapshot = { maxVehicles: null, maxBranches: null, maxMembers: null };

/**
 * Hạn mức mà một lượt mua bậc gói này CHỤP LẠI (ADR 0041 điều 3) — ba trần, không kèm giá.
 *
 * Tách thành hàm vì nó được gọi ở BA đường ghi (admin gán, tenant mua, webhook kích hoạt) và cả
 * ba phải chụp đúng cùng một tập trường: thiếu `maxBranches` ở một đường là một gian hàng mua
 * bậc 3 chi nhánh rồi mở được vô số.
 */
function quotaOf(limits: PlanLimitsJson): PlanQuotaSnapshot {
  return {
    maxVehicles: limits.maxVehicles,
    maxBranches: limits.maxBranches,
    maxMembers: limits.maxMembers,
  };
}

/** Phần núm vặn của một bậc gói đi vào audit — đủ để đọc lại một quyết định định giá. */
function planAuditKnobs(limits: PlanLimitsJson): Record<string, unknown> {
  return {
    maxVehicles: limits.maxVehicles,
    maxBranches: limits.maxBranches,
    maxMembers: limits.maxMembers,
    termPrices: limits.termPrices,
    salesOnly: limits.salesOnly,
    features: limits.features,
  };
}

function toCurrentPlanDto(current: SubRow, now: Date): CurrentPlanDto {
  const phase = resolveEffectiveBilling(current, now).phase;
  return {
    subscriptionId: current.id,
    planId: current.planId,
    planCode: current.plan.code,
    planName: current.plan.name,
    vehicleScope: planVehicleScopeOf(current.vehicleScope),
    phase,
    // Ba cột SNAPSHOT trên chính dòng subscription (ADR 0024 điều 2 · ADR 0041 điều 3) — null ở
    // dòng gán trước đó; caller phân biệt "không biết" với "0/commission", đừng bịa mặc định.
    billingMode: current.billingMode,
    commissionPercent:
      current.commissionPercent === null ? null : Number(current.commissionPercent),
    quota: parsePlanQuota(current.quotaJson),
    endsAt: current.endsAt.toISOString(),
  };
}

function toInvoiceDto(row: InvoiceRow): SubscriptionInvoiceDto {
  // lines_json do CHÍNH service này ghi đủ hình — đọc phòng thủ mức nhẹ cho dữ liệu tay.
  const snapshot = (row.linesJson ?? {}) as Partial<PlanInvoiceSnapshot>;
  return {
    id: row.id,
    tenantId: row.tenantId,
    subscriptionId: row.subscriptionId,
    code: row.code,
    planId: snapshot.planId ?? '',
    planCode: snapshot.planCode ?? '',
    termMonths: snapshot.termMonths ?? 0,
    vehicleScope: planVehicleScopeOf(row.vehicleScope),
    // Đọc qua parser đầy đủ: hoá đơn phát hành TRƯỚC ADR 0041 mang  thay cho ,
    // và màn lịch sử hoá đơn phải hiện đúng con số của chính tờ chứng từ đó.
    quota: parsePlanInvoiceSnapshot(row.linesJson)?.quota ?? EMPTY_QUOTA,
    lines: Array.isArray(snapshot.lines) ? snapshot.lines : [],
    periodFrom: (row.periodFrom as Date).toISOString(),
    periodTo: (row.periodTo as Date).toISOString(),
    subtotal: row.subtotal.toString(),
    discountAmount: row.discountAmount.toString(),
    totalAmount: row.totalAmount.toString(),
    paidAmount: row.paidAmount.toString(),
    status: row.status,
    paidAt: row.paidAt === null ? null : (row.paidAt as Date).toISOString(),
    expiresAt: row.expiresAt === null ? null : (row.expiresAt as Date).toISOString(),
    createdAt: (row.createdAt as Date).toISOString(),
    checkoutId: row.checkout?.id ?? null,
    checkoutCode: row.checkout?.code ?? null,
  };
}

/**
 * Bản ADMIN của một bậc gói: phần công khai + số thuê bao + cờ XOÁ ĐƯỢC.
 *
 * `deletable` là quy tắc của SERVER (`deletePlan` là lớp chặn thật) — màn quản trị chỉ đọc cờ này
 * để quyết định có vẽ nút "Xoá gói" hay không, thay vì tự suy từ `subscriptionCount` và bỏ sót vế
 * hoá đơn mà DTO không mang.
 */
function toPlanDto(p: PlanRow, invoiceCount: number): PlanDto {
  const subscriptionCount = p._count.subscriptions;
  return {
    ...toTenantPlanDto(p),
    subscriptionCount,
    deletable:
      p.billingMode !== BILLING_MODE.COMMISSION && subscriptionCount === 0 && invoiceCount === 0,
  };
}

/** Phần công khai của một bậc gói — thứ bảng giá gian hàng nhìn thấy. */
function toTenantPlanDto(p: PlanRow): TenantPlanDto {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    billingMode: p.billingMode,
    commissionPercent: p.commissionPercent === null ? null : Number(p.commissionPercent),
    vehicleScope: planVehicleScopeOf(p.vehicleScope),
    // Parser phòng thủ: jsonb hỏng/thiếu key không sập đường đọc — rơi về giá trị an toàn.
    limits: parsePlanLimits(p.limitsJson),
    currency: p.currency,
    status: p.status,
    sortOrder: p.sortOrder,
    createdAt: (p.createdAt as Date).toISOString(),
  };
}

function toSubscriptionDto(s: SubRow): SubscriptionDto {
  return {
    id: s.id,
    tenantId: s.tenantId,
    planId: s.planId,
    planCode: s.plan.code,
    planName: s.plan.name,
    status: s.status,
    price: s.price.toString(),
    // null = dòng lịch sử gán trước ADR 0015 — "không ghi", khác với 0/commission.
    termMonths: s.termMonths,
    quota: parsePlanQuota(s.quotaJson),
    vehicleScope: planVehicleScopeOf(s.vehicleScope),
    billingMode: s.billingMode,
    commissionPercent: s.commissionPercent === null ? null : Number(s.commissionPercent),
    startsAt: (s.startsAt as Date).toISOString(),
    endsAt: (s.endsAt as Date).toISOString(),
    note: s.note,
    // Trạng thái KỲ chấm bằng đồng hồ SERVER: client chấm bằng đồng hồ của nó sẽ thấy kỳ vừa bắt
    // đầu "bây giờ" là "chờ đến kỳ" (đồng hồ client chậm hơn vài trăm mili-giây là đủ).
    termState: subscriptionTermStateOf(s, new Date()),
    origin: subscriptionOriginOf(s),
    createdAt: (s.createdAt as Date).toISOString(),
  };
}
