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
  resolveEffectiveBilling,
  type EffectiveBilling,
  SHOP_ONBOARDING_STATE,
  type BillingMode,
  COMMISSION_TRACK_TERM_MONTHS,
  OWNER_LITE_VEHICLE_LIMIT,
  FREE_TRIP_ALLOWANCE,
  NOTIFICATION_TYPE,
  PLAN_STATUS,
  SUBSCRIPTION_INVOICE_STATUS,
  SUBSCRIPTION_INVOICE_TTL_HOURS,
  SUBSCRIPTION_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  addCalendarMonthsVn,
  parsePlanAssumedGmv,
  parsePlanInvoiceSnapshot,
  parsePlanLimits,
  parsePlanSlots,
  termDiscountPercent,
  type PaginationMeta,
  type PlanAssumedGmvJson,
  type PlanInvoiceLine,
  type PlanInvoiceSnapshot,
  type PlanLimitsJson,
  type PlanSlots,
  type VehicleType,
} from '@xeprime/types';
import { ListingsService } from '../public-listings/listings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notification/notification.service';
import {
  AddSlotsDto,
  AssignSubscriptionDto,
  CreatePlanDto,
  CurrentPlanDto,
  MySubscriptionDto,
  PaymentInfoDto,
  PendingSubscriptionInvoiceDto,
  PlanDto,
  PlanListQueryDto,
  PurchaseSubscriptionDto,
  SUBSCRIPTION_DEFAULT_LIMIT,
  SUBSCRIPTION_MAX_LIMIT,
  SubscriptionDto,
  SubscriptionInvoiceDto,
  SubscriptionListQueryDto,
  TenantPlanDto,
  UpdatePlanDto,
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
  basePriceMonthly: true,
  assumedMonthlyGmvJson: true,
  limitsJson: true,
  price: true,
  currency: true,
  durationDays: true,
  maxVehicles: true,
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
  paidAt: true,
  expiresAt: true,
  createdAt: true,
} satisfies Prisma.SubscriptionInvoiceSelect;

const SUB_SELECT = {
  id: true,
  tenantId: true,
  planId: true,
  status: true,
  price: true,
  termMonths: true,
  slotsJson: true,
  billingMode: true,
  commissionPercent: true,
  startsAt: true,
  endsAt: true,
  note: true,
  createdAt: true,
  plan: { select: { code: true, name: true, maxVehicles: true, limitsJson: true } },
} satisfies Prisma.TenantSubscriptionSelect;

/**
 * Writer DUY NHẤT của `plans` + `tenant_subscriptions` (ADR 0010, giữ nguyên qua ADR 0015).
 *
 * Lịch sử thuê bao append-only: gán/gia hạn CHÈN dòng mới (`startsAt` nối đuôi gói hiện hành
 * còn hạn, hoặc = now), không update dòng cũ trừ huỷ sớm (active → cancelled). "Hết hạn" suy
 * ra từ `endsAt` — không job. Mọi mutation ghi audit trong cùng transaction.
 *
 * Từ ADR 0015/0020/0024: cước theo CHỖ XE, kỳ hạn THÁNG LỊCH (`addCalendarMonthsVn`, không bao
 * giờ `× 30 ngày`), chế độ thu phí SNAPSHOT lên dòng subscription lúc gán, và bậc gói `package`
 * phải qua KIỂM ĐIỂM GIAO trước khi lưu.
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
      return { configured: false, bankCode: null, accountNumber: null, accountName: null };
    }
    return {
      configured: true,
      bankCode,
      accountNumber: this.config.get<string>('SEPAY_ACCOUNT_NUMBER') ?? null,
      accountName: this.config.get<string>('SEPAY_ACCOUNT_NAME') ?? null,
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
    return rows.map(toPlanDto);
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
    await this.assertCommissionTrackStaysSingle(dto.billingMode, null);

    const knobs = this.normalizePlanKnobs({
      billingMode: dto.billingMode,
      commissionPercent: dto.commissionPercent ?? null,
      basePriceMonthly: dto.basePriceMonthly ?? '0',
      limits: parsePlanLimits(dto.limits ?? null),
      assumedGmv: dto.assumedMonthlyGmv ?? null,
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
          basePriceMonthly: knobs.basePriceMonthly,
          limitsJson: knobs.limits as unknown as Prisma.InputJsonValue,
          assumedMonthlyGmvJson:
            knobs.assumedGmv === null
              ? Prisma.JsonNull
              : (knobs.assumedGmv as unknown as Prisma.InputJsonValue),
          price: dto.price ?? '0',
          durationDays: dto.durationDays ?? 30,
          maxVehicles: dto.maxVehicles ?? null,
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
            basePriceMonthly: knobs.basePriceMonthly,
            maxVehicles: dto.maxVehicles ?? null,
          },
        },
        tx,
      );
      return plan;
    });
    return toPlanDto(row);
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
    }

    // Kiểm trên hình MERGED (field không gửi = giữ giá trị đang lưu): kiểm điểm giao chạy trên
    // trạng thái SẼ được lưu, không phải trên mảnh dto — sửa một field lẻ của bậc `package`
    // vẫn phải chứng minh được bài toán khuyến khích (ADR 0020, quy tắc trong code).
    const knobs = this.normalizePlanKnobs({
      billingMode: dto.billingMode ?? current.billingMode,
      commissionPercent:
        dto.commissionPercent !== undefined
          ? dto.commissionPercent
          : current.commissionPercent === null
            ? null
            : Number(current.commissionPercent),
      basePriceMonthly: dto.basePriceMonthly ?? current.basePriceMonthly.toString(),
      limits: parsePlanLimits(dto.limits !== undefined ? dto.limits : current.limitsJson),
      assumedGmv:
        dto.assumedMonthlyGmv !== undefined
          ? dto.assumedMonthlyGmv
          : parsePlanAssumedGmv(current.assumedMonthlyGmvJson),
    });

    const row = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.plan.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
          // Bộ núm ghi TRỌN theo hình merged đã kiểm — mỗi lần sửa là một lần chuẩn hoá
          // limits_json về đủ hình dạng ADR 0015 điều 4.
          billingMode: knobs.billingMode,
          commissionPercent: knobs.commissionPercent,
          basePriceMonthly: knobs.basePriceMonthly,
          limitsJson: knobs.limits as unknown as Prisma.InputJsonValue,
          assumedMonthlyGmvJson:
            knobs.assumedGmv === null
              ? Prisma.JsonNull
              : (knobs.assumedGmv as unknown as Prisma.InputJsonValue),
          ...(dto.price !== undefined ? { price: dto.price } : {}),
          ...(dto.durationDays !== undefined ? { durationDays: dto.durationDays } : {}),
          ...('maxVehicles' in dto ? { maxVehicles: dto.maxVehicles ?? null } : {}),
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
            basePriceMonthly: current.basePriceMonthly.toString(),
            price: current.price.toString(),
            durationDays: current.durationDays,
            maxVehicles: current.maxVehicles,
          },
          after: {
            name: plan.name,
            billingMode: plan.billingMode,
            commissionPercent:
              plan.commissionPercent === null ? null : plan.commissionPercent.toString(),
            basePriceMonthly: plan.basePriceMonthly.toString(),
            price: plan.price.toString(),
            durationDays: plan.durationDays,
            maxVehicles: plan.maxVehicles,
          },
        },
        tx,
      );
      return plan;
    });
    return toPlanDto(row);
  }

  /**
   * NGỪNG BÁN (archive) một bậc gói.
   *
   * ⚠️ Archive là chuyện của DANH MỤC, không phải của khách hàng: **không một thuê bao nào bị
   * huỷ**. Mọi `tenant_subscriptions` đang trỏ tới bậc này chạy hết kỳ của nó, giữ nguyên
   * `billing_mode`, `slots_json` và `commission_percent` đã snapshot (ADR 0024) — thứ duy nhất
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
    if (current.status === PLAN_STATUS.ARCHIVED) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Gói đã ngừng bán',
      });
    }
    if (current.billingMode === BILLING_MODE.COMMISSION) {
      throw new ConflictException({
        code: API_ERROR_CODE.DEFAULT_PLAN_PROTECTED,
        message:
          'Không ngừng bán được bậc mặc định của TUYẾN HOA HỒNG — mọi chủ xe cá nhân vào cửa ' +
          'bằng chính nó. Đây không phải một gói để khách chọn mua.',
        details: { planCode: current.code, operation: 'archive' },
      });
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.plan.update({
        where: { id },
        data: { status: PLAN_STATUS.ARCHIVED },
        select: PLAN_SELECT,
      });
      await this.audit.record(
        {
          actorUserId,
          actorScope: 'platform',
          action: 'plan.archive',
          targetType: 'plan',
          targetId: id,
          before: { status: PLAN_STATUS.ACTIVE },
          after: { status: PLAN_STATUS.ARCHIVED },
        },
        tx,
      );
      return plan;
    });
    return toPlanDto(row);
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

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.tenantSubscription.count({ where: { tenantId } }),
      this.prisma.tenantSubscription.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
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
   * Gán / gia hạn: chèn dòng mới. Còn gói hiện hành → chu kỳ mới nối đuôi (`startsAt =
   * current.endsAt`, audit `subscription.renew`); hết/chưa có → bắt đầu từ now (`subscription.assign`).
   */
  async assign(
    tenantId: string,
    actorUserId: string,
    dto: AssignSubscriptionDto,
  ): Promise<SubscriptionDto> {
    await this.assertTenant(tenantId);
    const plan = await this.loadPlan(dto.planId);
    if (plan.status !== PLAN_STATUS.ACTIVE) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: 'Gói đã ngừng bán, không gán được',
      });
    }

    const limits = parsePlanLimits(plan.limitsJson);
    const slots = this.resolvePurchaseSlots(limits, dto.slots);
    const pricing = this.priceTerm(plan.basePriceMonthly, limits, slots, dto.termMonths);
    const price = pricing.total;

    const row = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      // Nối đuôi theo endsAt MUỘN NHẤT còn active (kể cả chu kỳ tương lai đã xếp hàng) — dùng
      // findCurrent (startsAt <= now) ở đây sẽ tạo 2 chu kỳ chồng nhau khi gia hạn 2 lần. Dòng
      // hoa hồng 0đ thì bị HUỶ chứ không nối sau; xem `resolveChainStart`.
      const { startsAt, renewedPaidTerm } = await this.resolveChainStart(tx, tenantId, now);
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
          slotsJson: slots as unknown as Prisma.InputJsonValue,
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
            slots,
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
          actorScope: 'platform',
          /*
           * `renew` chỉ khi nối sau một kỳ ĐÃ TRẢ TIỀN. Nối sau (rồi huỷ) dòng hoa hồng 0đ là
           * NÂNG CẤP, không phải gia hạn — gọi nó là 'renew' làm mất dấu đúng sự kiện mà một
           * cuộc đối soát doanh thu đi tìm.
           */
          action: renewedPaidTerm ? 'subscription.renew' : 'subscription.assign',
          targetType: 'tenant_subscription',
          targetId: sub.id,
          after: {
            planCode: plan.code,
            price: price.toString(),
            termMonths: dto.termMonths,
            slots,
            billingMode: plan.billingMode,
            commissionPercent:
              plan.commissionPercent === null ? null : plan.commissionPercent.toString(),
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            ...(dto.note ? { note: dto.note } : {}),
          },
        },
        tx,
      );
      return sub;
    });

    return toSubscriptionDto(row);
  }

  /** Huỷ sớm một dòng thuê bao còn hiệu lực (active → cancelled). */
  async cancel(
    tenantId: string,
    actorUserId: string,
    subscriptionId: string,
  ): Promise<SubscriptionDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const res = await tx.tenantSubscription.updateMany({
        where: { id: subscriptionId, tenantId, status: SUBSCRIPTION_STATUS.ACTIVE },
        data: { status: SUBSCRIPTION_STATUS.CANCELLED },
      });
      if (res.count !== 1) {
        const exists = await tx.tenantSubscription.findFirst({
          where: { id: subscriptionId, tenantId },
          select: { id: true },
        });
        if (!exists) {
          throw new NotFoundException({
            code: API_ERROR_CODE.NOT_FOUND,
            message: 'Không tìm thấy thuê bao',
          });
        }
        throw new ConflictException({
          code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
          message: 'Chỉ huỷ được thuê bao đang hiệu lực',
        });
      }
      const sub = await tx.tenantSubscription.findUniqueOrThrow({
        where: { id: subscriptionId },
        select: SUB_SELECT,
      });
      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: 'platform',
          action: 'subscription.cancel',
          targetType: 'tenant_subscription',
          targetId: subscriptionId,
          before: { status: SUBSCRIPTION_STATUS.ACTIVE },
          after: { status: SUBSCRIPTION_STATUS.CANCELLED },
        },
        tx,
      );
      return sub;
    });
    return toSubscriptionDto(row);
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
   * Kỳ mới BẮT ĐẦU từ mốc nào — một phép giải cho cả ba đường tạo thuê bao (admin gán, tenant
   * tự mua, webhook kích hoạt khi tiền về).
   *
   * ## Vì sao không chỉ là "nối sau `ends_at` muộn nhất"
   *
   * Mọi tenant đều mang một dòng hoa hồng 0đ dài `COMMISSION_TRACK_TERM_MONTHS` (12 tháng) do
   * `assignDefaultPlanWithinTx` gán lúc mở gian hàng. Phép nối đuôi trần sẽ thấy dòng đó là
   * "kỳ còn hạn" và đặt `starts_at` của gói vừa mua ở **12 tháng sau**. Hệ quả thì im lặng và
   * tốn tiền thật:
   *
   *  - `effectiveSubscriptionWhere` đòi `starts_at <= now`, nên dòng gói bị loại khỏi phép chấm
   *    pha ⇒ tenant VẪN ở tuyến hoa hồng;
   *  - họ vẫn bị trần Owner Lite 3 xe, vẫn bị `SubscriptionTrackGuard` đẩy khỏi `/manage`, và
   *    khách của họ vẫn bị cộng phí dịch vụ 10%;
   *  - hoá đơn thì `paid`, audit thì có, nên không nơi nào trông như đang hỏng.
   *
   * ## Luật
   *
   * Nhìn dòng ĐUÔI, không nhìn gói sắp tạo:
   *
   * | Đuôi | Làm gì | Vì sao |
   * | --- | --- | --- |
   * | không có | bắt đầu từ `now` | — |
   * | `package` còn hạn | nối từ `ends_at` của nó | đó là kỳ ĐÃ TRẢ TIỀN; gia hạn sớm không được cắt ngắn nó |
   * | `commission` còn hạn | **huỷ nó**, bắt đầu từ `now` | dòng hệ thống 0đ, không ai trả gì cho nó — không có kỳ nào để tôn trọng |
   *
   * Huỷ chứ không xoá: dòng bị thay vẫn là lịch sử tuyến của tenant, và `listSubscriptions` phải
   * kể lại được. Huỷ cũng giữ bất biến "MỘT dòng hiệu lực tại một thời điểm" mà
   * `findCurrent`/`resolveEffectiveBilling` dựa vào.
   */
  private async resolveChainStart(
    tx: Prisma.TransactionClient,
    tenantId: string,
    now: Date,
  ): Promise<{ startsAt: Date; renewedPaidTerm: boolean }> {
    const tail = await tx.tenantSubscription.findFirst({
      where: { tenantId, status: SUBSCRIPTION_STATUS.ACTIVE, endsAt: { gt: now } },
      orderBy: { endsAt: 'desc' },
      select: { id: true, endsAt: true, billingMode: true },
    });
    if (!tail) return { startsAt: now, renewedPaidTerm: false };
    if (tail.billingMode !== BILLING_MODE.COMMISSION) {
      return { startsAt: tail.endsAt, renewedPaidTerm: true };
    }

    /*
     * Huỷ TẤT CẢ dòng hoa hồng còn hạn, không chỉ dòng đuôi: job vòng đời nối liền kỳ nên một
     * tenant có thể mang nhiều dòng hoa hồng chồng nhau sau một lần job chạy trễ, và bỏ sót một
     * dòng là để lại đúng cái `ends_at` vừa gây ra lỗi này.
     */
    await tx.tenantSubscription.updateMany({
      where: {
        tenantId,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        billingMode: BILLING_MODE.COMMISSION,
        endsAt: { gt: now },
      },
      data: { status: SUBSCRIPTION_STATUS.CANCELLED },
    });
    return { startsAt: now, renewedPaidTerm: false };
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

  async assignDefaultPlanWithinTx(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
    const plan = await this.loadDefaultCommissionPlanOrThrow(tx);

    const now = new Date();
    await tx.tenantSubscription.create({
      data: {
        id: newId(),
        tenantId,
        planId: plan.id,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        price: 0,
        termMonths: COMMISSION_TRACK_TERM_MONTHS,
        billingMode: BILLING_MODE.COMMISSION,
        commissionPercent: plan.commissionPercent,
        startsAt: now,
        endsAt: addCalendarMonthsVn(now, COMMISSION_TRACK_TERM_MONTHS),
        note: 'Gói mặc định khi mở gian hàng (ADR 0015 điều 9).',
      },
    });
  }

  // -------------------------------------------------------------------------
  // Mua thêm chỗ giữa kỳ (ADR 0015 điều 8) — admin, đã thu tiền
  // -------------------------------------------------------------------------

  /**
   * Mua thêm chỗ giữa kỳ: HUỶ dòng hiện hành + CHÈN dòng mới CÙNG `ends_at`, số chỗ mới —
   * giữ bất biến "MỘT dòng hiệu lực tại một thời điểm" mà `findCurrent` dựa vào (ADR 0015
   * điều 8). Prorate TRÒN THÁNG theo số tháng còn lại (làm tròn LÊN), KHÔNG áp % giảm kỳ hạn —
   * ưu đãi đó trả cho cam kết trả trước cả kỳ, phần mua thêm không cam kết gì mới.
   *
   * Đường admin (đã thu tiền ngoài luồng) ⇒ hoá đơn `paid`. Tenant tự mua thêm chỗ đi đường
   * hoá đơn `issued` + kích hoạt khi tiền về — mở ở W4 cùng webhook.
   */
  async addSlots(
    tenantId: string,
    actorUserId: string,
    dto: AddSlotsDto,
  ): Promise<SubscriptionDto> {
    await this.assertTenant(tenantId);
    const now = new Date();
    const current = await this.findCurrent(tenantId, now);
    if (!current || current.billingMode !== BILLING_MODE.PACKAGE || current.slotsJson === null) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message:
          'Chỉ mua thêm chỗ được khi đang có gói tuyến package còn hạn (dòng có snapshot số chỗ)',
      });
    }
    const limits = parsePlanLimits(current.plan.limitsJson);
    const oldSlots = parsePlanSlots(current.slotsJson);
    const newSlots = this.resolvePurchaseSlots(limits, dto.slots);
    const deltaCar = newSlots.car - oldSlots.car;
    const deltaMotorbike = newSlots.motorbike - oldSlots.motorbike;
    if (deltaCar < 0 || deltaMotorbike < 0 || deltaCar + deltaMotorbike === 0) {
      // Thu hẹp chỗ giữa kỳ không phải nghiệp vụ này — tiền đã trả trước, "mua bớt" là hoàn
      // tiền, và hoàn tiền có đường riêng (ví — ADR 0023, chưa mở cho gói).
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Số chỗ mới phải lớn hơn số chỗ hiện có (mua thêm, không mua bớt)',
        details: { current: oldSlots, requested: newSlots },
      });
    }

    // Số tháng còn lại, TRÒN THÁNG làm tròn lên: n nhỏ nhất sao cho now + n tháng lịch >= endsAt.
    let monthsLeft = 1;
    while (monthsLeft < 24 && addCalendarMonthsVn(now, monthsLeft) < current.endsAt) {
      monthsLeft += 1;
    }

    const lines: PlanInvoiceLine[] = [];
    let subtotal = new Prisma.Decimal(0);
    for (const [type, delta, unitPrice] of [
      [VEHICLE_TYPE.CAR, deltaCar, limits.perVehiclePrice.car],
      [VEHICLE_TYPE.MOTORBIKE, deltaMotorbike, limits.perVehiclePrice.motorbike],
    ] as const) {
      if (delta <= 0) continue;
      if (unitPrice === null) {
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: 'Bậc gói không bán thêm loại chỗ này',
          details: { field: `slots.${type}` },
        });
      }
      const amount = new Prisma.Decimal(unitPrice).mul(delta).mul(monthsLeft).toDecimalPlaces(2);
      lines.push({
        kind: 'add_slot',
        vehicleType: type,
        quantity: delta,
        months: monthsLeft,
        unitPrice,
        amount: amount.toString(),
      });
      subtotal = subtotal.add(amount);
    }

    const row = await this.prisma.$transaction(async (tx) => {
      // Huỷ dòng hiện hành bằng updateMany có điều kiện — hai admin bấm cùng lúc thì người
      // đến sau thấy count=0 và dừng, không sinh hai dòng hiệu lực chồng nhau.
      const closed = await tx.tenantSubscription.updateMany({
        where: { id: current.id, status: SUBSCRIPTION_STATUS.ACTIVE },
        data: { status: SUBSCRIPTION_STATUS.CANCELLED },
      });
      if (closed.count !== 1) {
        throw new ConflictException({
          code: API_ERROR_CODE.CONFLICT,
          message: 'Dòng thuê bao hiện hành vừa thay đổi — tải lại rồi thử lại',
        });
      }
      const sub = await tx.tenantSubscription.create({
        data: {
          id: newId(),
          tenantId,
          planId: current.planId,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          // Giá trị kỳ = tiền đã trả cho dòng cũ + tiền mua thêm — snapshot vẫn cộng dồn được.
          price: new Prisma.Decimal(current.price).add(subtotal),
          termMonths: current.termMonths,
          slotsJson: newSlots as unknown as Prisma.InputJsonValue,
          // SNAPSHOT chế độ GIỮ NGUYÊN giữa kỳ (ADR 0024 điều 2) — mua thêm chỗ không đổi tuyến.
          billingMode: current.billingMode,
          commissionPercent: current.commissionPercent,
          startsAt: now,
          endsAt: current.endsAt,
          note: dto.note ?? null,
          createdBy: actorUserId,
        },
        select: SUB_SELECT,
      });
      await this.createInvoiceWithinTx(tx, {
        tenantId,
        subscriptionId: sub.id,
        snapshot: {
          planId: current.planId,
          planCode: current.plan.code,
          termMonths: monthsLeft,
          slots: newSlots,
          lines,
        },
        subtotal,
        discountAmount: new Prisma.Decimal(0),
        periodFrom: now,
        periodTo: current.endsAt,
        paid: true,
      });
      await this.audit.record(
        {
          tenantId,
          actorUserId,
          actorScope: 'platform',
          action: 'subscription.add_slots',
          targetType: 'tenant_subscription',
          targetId: sub.id,
          before: { subscriptionId: current.id, slots: oldSlots },
          after: { slots: newSlots, monthsLeft, amount: subtotal.toString() },
        },
        tx,
      );
      return sub;
    });
    return toSubscriptionDto(row);
  }

  // -------------------------------------------------------------------------
  // "Gói của tôi" — tenant-scoped (W2 LÔ 3)
  // -------------------------------------------------------------------------

  /** Gói hiện hành + mức dùng chỗ theo loại xe + lượt miễn phí (ADR 0026). */
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
    /*
     * Dòng thuê bao HIỆU LỰC, không phải "gói còn hạn".
     *
     * `findCurrent` đòi `ends_at > now`, nên suốt 7 ngày ân hạn nó trả `null` — và màn "Gói của
     * tôi" sẽ hiện "chưa có gói" NGAY CẠNH hạn mức theo chỗ của chính gói vừa hết hạn (phần
     * `fleetQuota` bên dưới đọc pha hiệu lực). Hai con số trên cùng một thẻ nói ngược nhau là
     * đúng loại lệch mà `resolveEffectiveBilling` sinh ra để xoá.
     */
    const current = await this.prisma.tenantSubscription.findFirst({
      where: { tenantId, ...effectiveSubscriptionWhere(new Date()) },
      orderBy: EFFECTIVE_SUBSCRIPTION_ARGS.orderBy,
      select: SUB_SELECT,
    });

    // Hai groupBy thay cho bốn count — mức dùng đội xe và mức chiếm suất trên chợ, theo loại.
    const [fleet, onMarket] = await Promise.all([
      this.prisma.vehicle.groupBy({
        by: ['vehicleType'],
        where: { tenantId, deletedAt: null },
        _count: { _all: true },
      }),
      this.prisma.vehicle.groupBy({
        by: ['vehicleType'],
        where: {
          tenantId,
          deletedAt: null,
          publicStatus: {
            in: [
              VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW,
              VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
            ],
          },
        },
        _count: { _all: true },
      }),
    ]);
    const countOf = (rows: typeof fleet, type: string) =>
      rows.find((r) => r.vehicleType === type)?._count._all ?? 0;

    /*
     * Hạn mức đọc từ `vehicleQuotaFor` — CÙNG hàm mà `assertVehicleQuota` gọi, nên màn "Gói
     * của tôi" không thể nói một con số khác với con số backend thật sự chặn. Bản trước có một
     * bản sao của luật ở đây, và bản sao đó đọc `findCurrent` (vô hạn khi vừa hết hạn) trong
     * khi cổng chặn đọc pha hiệu lực.
     *
     * Owner Lite: trần là một BỂ CHUNG nên `usage.<loại>.limit` để `null` và con số thật đi ở
     * `fleetQuota`. Viết trần tổng vào ô của từng loại là nói "3 ô tô" khi luật là "3 xe".
     */
    const quota = await this.vehicleQuotaFor(tenantId);
    const carUsed = countOf(fleet, VEHICLE_TYPE.CAR);
    const motorbikeUsed = countOf(fleet, VEHICLE_TYPE.MOTORBIKE);
    const limitOf = (type: VehicleType): number | null =>
      quota.kind === 'per_type' ? quota.limit[type] : null;

    const used = Math.min(tenant.freeTripsUsed, FREE_TRIP_ALLOWANCE);
    return {
      currentPlan: current ? toCurrentPlanDto(current) : null,
      usage: {
        car: {
          used: carUsed,
          onMarketplace: countOf(onMarket, VEHICLE_TYPE.CAR),
          limit: limitOf(VEHICLE_TYPE.CAR),
        },
        motorbike: {
          used: motorbikeUsed,
          onMarketplace: countOf(onMarket, VEHICLE_TYPE.MOTORBIKE),
          limit: limitOf(VEHICLE_TYPE.MOTORBIKE),
        },
      },
      fleetQuota: {
        kind: quota.kind,
        totalLimit: quota.kind === 'total' ? quota.limit : null,
        totalUsed: carUsed + motorbikeUsed,
      },
      freeTrips: {
        allowance: FREE_TRIP_ALLOWANCE,
        used: tenant.freeTripsUsed,
        left: FREE_TRIP_ALLOWANCE - used,
      },
    };
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
    return rows.map((row) => {
      const { assumedMonthlyGmv: _gmv, subscriptionCount: _count, ...rest } = toPlanDto(row);
      return rest;
    });
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
    const row = await this.prisma.subscriptionInvoice.findFirst({
      where: {
        tenantId,
        status: {
          in: [SUBSCRIPTION_INVOICE_STATUS.ISSUED, SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: INVOICE_SELECT,
    });
    return { invoice: row ? toInvoiceDto(row) : null };
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
    const plan = await this.loadPlan(dto.planId);
    if (plan.status !== PLAN_STATUS.ACTIVE) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: 'Gói đã ngừng bán',
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
     * `limits.terms` là danh sách kỳ hạn ĐƯỢC BÁN của plan, không chỉ là bảng giảm giá
     * (ADR 0029 điều 3 — giá pilot bán tối thiểu 3 tháng). DTO chỉ chặn được tập kỳ hạn
     * toàn cục [1,3,6,12]; plan thu hẹp thêm ở đây, và đây là lớp chặn thật — ẩn lựa chọn
     * ở PurchaseModal chỉ là UX. Danh sách rỗng (plan cũ chưa khai) = không thu hẹp.
     */
    const allowedTerms = limits.terms.map((t) => t.months);
    if (allowedTerms.length > 0 && !allowedTerms.includes(dto.termMonths)) {
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: `Gói này chỉ bán theo kỳ hạn ${allowedTerms.join('/')} tháng`,
        details: { field: 'termMonths', allowedTerms },
      });
    }

    const slots = this.resolvePurchaseSlots(limits, dto.slots);
    const pricing = this.priceTerm(plan.basePriceMonthly, limits, slots, dto.termMonths);
    if (pricing.total.isZero()) {
      // 0đ = không có gì để mua: hoặc gói tuyến hoa hồng, hoặc gói giá-theo-chỗ mà chưa chọn
      // chỗ nào (ADR 0029 — phí nền 0đ, tiền nằm hết ở chỗ xe).
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Không có khoản phải trả — chọn ít nhất một chỗ xe',
      });
    }

    const now = new Date();
    // Kỳ DỰ KIẾN để hiển thị: nối đuôi gói còn hạn. Kỳ thật chốt lại lúc kích hoạt (W4).
    const tail = await this.prisma.tenantSubscription.findFirst({
      where: { tenantId, status: SUBSCRIPTION_STATUS.ACTIVE, endsAt: { gt: now } },
      orderBy: { endsAt: 'desc' },
      select: { endsAt: true },
    });
    const periodFrom = tail ? tail.endsAt : now;
    const periodTo = addCalendarMonthsVn(periodFrom, dto.termMonths);
    const expiresAt = new Date(now.getTime() + SUBSCRIPTION_INVOICE_TTL_HOURS * 60 * 60 * 1000);

    const row = await this.prisma.$transaction(async (tx) => {
      /*
       * KHOÁ THEO TENANT, giữ tới hết transaction.
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
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;

      /*
       * Hoá đơn ĐÃ NHẬN MỘT PHẦN TIỀN chặn đường mua tiếp — và phải chặn, không phải void.
       *
       * `updateMany` bên dưới cố ý chỉ void trạng thái `issued` (chưa đồng nào về). Một hoá đơn
       * `partially_paid` thì khác hẳn: void nó là xoá dấu vết của khoản khách đã chuyển, còn để
       * nó sống cạnh một hoá đơn mới thì `applyBankPaymentWithinTx` coi CẢ HAI đều payable.
       * Lối đi tiếp đúng là chuyển nốt phần còn thiếu theo mã cũ, nên trả mã lỗi nói thẳng điều
       * đó kèm chính mã đối soát đang dang dở.
       */
      const partiallyPaid = await tx.subscriptionInvoice.findFirst({
        where: { tenantId, status: SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID },
        orderBy: { createdAt: 'desc' },
        select: { code: true },
      });
      if (partiallyPaid) {
        throw new ConflictException({
          code: API_ERROR_CODE.SUBSCRIPTION_INVOICE_PARTIALLY_PAID,
          message: `Hoá đơn ${partiallyPaid.code} đã nhận một phần tiền — chuyển nốt phần còn thiếu theo đúng mã đó thay vì tạo hoá đơn mới`,
          details: { code: partiallyPaid.code },
        });
      }

      await tx.subscriptionInvoice.updateMany({
        where: { tenantId, status: SUBSCRIPTION_INVOICE_STATUS.ISSUED },
        data: { status: SUBSCRIPTION_INVOICE_STATUS.VOID },
      });
      const invoice = await this.createInvoiceWithinTx(tx, {
        tenantId,
        subscriptionId: null,
        snapshot: {
          planId: plan.id,
          planCode: plan.code,
          termMonths: dto.termMonths,
          slots,
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
            planCode: plan.code,
            termMonths: dto.termMonths,
            slots,
            totalAmount: invoice.totalAmount.toString(),
            expiresAt: expiresAt.toISOString(),
          },
        },
        tx,
      );
      return invoice;
    });
    return toInvoiceDto(row);
  }

  /** Gói hiện hành của tenant (đọc-only, dùng cho tenant detail) — null nếu không có/hết hạn. */
  async currentPlan(tenantId: string): Promise<CurrentPlanDto | null> {
    const current = await this.findCurrent(tenantId, new Date());
    return current ? toCurrentPlanDto(current) : null;
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
      select: { id: true, tenantId: true, status: true, totalAmount: true, linesJson: true },
    });
    if (!invoice) return { outcome: 'invoice_not_found' };

    // string[] tường minh: cột status là String (ADR 0005) nên phép includes so với giá trị DB.
    const payable: string[] = [
      SUBSCRIPTION_INVOICE_STATUS.ISSUED,
      SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID,
    ];

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
      select: { id: true, name: true, billingMode: true, commissionPercent: true },
    });

    const now = new Date();
    const { startsAt } = await this.resolveChainStart(tx, args.tenantId, now);
    const endsAt = addCalendarMonthsVn(startsAt, snapshot.termMonths);

    const sub = await tx.tenantSubscription.create({
      data: {
        id: newId(),
        tenantId: args.tenantId,
        planId: plan.id,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        price: args.totalAmount,
        termMonths: snapshot.termMonths,
        slotsJson: snapshot.slots as unknown as Prisma.InputJsonValue,
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
     * `resolveChainStart` ngay trên đã huỷ dòng hoa hồng tạm, nên trong cửa sổ đó họ không thuộc
     * tuyến nào cả.
     */
    await this.completePackageOnboardingWithinTx(tx, args.tenantId, plan.billingMode);

    await this.audit.record(
      {
        tenantId: args.tenantId,
        actorScope: AUDIT_ACTOR_SCOPE.SYSTEM,
        action: 'subscription.activate_from_payment',
        targetType: 'tenant_subscription',
        targetId: sub.id,
        after: {
          invoiceId: args.invoiceId,
          planId: plan.id,
          termMonths: snapshot.termMonths,
          slots: snapshot.slots,
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
   * Số chỗ mua: bỏ trống = đúng số gồm sẵn; không mua DƯỚI mức gồm sẵn — phí nền đã bao chúng,
   * ghi con số nhỏ hơn chỉ tạo ra một hạn mức giả thấp hơn thứ tenant đã trả tiền. Vượt trần
   * bậc gói thì từ chối.
   */
  private resolvePurchaseSlots(
    limits: PlanLimitsJson,
    input: { car: number; motorbike: number } | undefined,
  ): PlanSlots {
    const slots: PlanSlots = {
      car: Math.max(input?.car ?? limits.includedCars, limits.includedCars),
      motorbike: Math.max(input?.motorbike ?? limits.includedMotorbikes, limits.includedMotorbikes),
    };
    for (const [type, bought, max] of [
      ['car', slots.car, limits.maxCars],
      ['motorbike', slots.motorbike, limits.maxMotorbikes],
    ] as const) {
      if (max !== null && bought > max) {
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: 'Số chỗ vượt trần của bậc gói',
          details: { field: `slots.${type}`, requested: bought, max },
        });
      }
    }
    return slots;
  }

  /**
   * Hạn mức SỐ XE — hai tuyến, hai cách đếm, một cổng.
   *
   * | Tuyến hiệu lực | Hạn mức | Cách đếm |
   * | --- | --- | --- |
   * | `package` (pha `current` hoặc `grace`) | số CHỖ đã mua, theo LOẠI xe | ô tô và xe máy riêng |
   * | `commission` (kể cả `lapsed`) | `OWNER_LITE_VEHICLE_LIMIT` | **TỔNG** ô tô + xe máy |
   * | `unconfigured` | như tuyến hoa hồng | tổng — xem dưới |
   *
   * ## Vì sao đọc `resolveEffectiveBilling` chứ không `findCurrent`
   *
   * `findCurrent` đòi `ends_at > now`, nên đúng giây một gói hết hạn nó trả `null` — và bản
   * trước của hàm này coi `null` là KHÔNG GIỚI HẠN. Cộng với `graceDays = 7` và kỳ hoa hồng 12
   * tháng mà mọi tenant cùng nhận trong một ngày (ADR 0038, bối cảnh điều 2), đó là một cửa sổ
   * ĐỊNH KỲ trong đó mọi chủ xe đăng được vô số xe. Pha `grace`/`lapsed` chỉ tồn tại ở
   * `resolveEffectiveBilling`, nên hạn mức phải hỏi chính nó.
   *
   * `unconfigured` đi cùng đường với tuyến hoa hồng, KHÔNG đi cùng đường với "không giới hạn":
   * đó là lỗi cấu hình (ADR 0038 điều 1), và mức an toàn khi hỏng là mức CHẶT. Chủ xe thật vẫn
   * đăng được 3 xe trong lúc vận hành sửa lại danh mục gói.
   *
   * ## Hai điểm thi hành
   *
   * `scope: 'fleet'` (mặc định) — tạo xe. `scope: 'marketplace'` — gửi xe lên chợ; chỉ đếm xe
   * đang chiếm suất và TRỪ chính chiếc đang gửi, để tenant tụt gói vẫn chọn được xe nào ở lại.
   *
   * Hai tuyến dùng hai điểm khác nhau, và đó là chủ đích: trần TỔNG của Owner Lite chỉ gác
   * `fleet`, còn hạn mức theo CHỖ của tuyến gói gác cả hai (chỗ là suất TRÊN CHỢ). Lý do đầy
   * đủ nằm ngay trong thân hàm, ở nhánh `total`.
   *
   * ⚠️ Cổng này CHẶN THÊM MỚI, không gỡ thứ đang có (ADR 0038 — "Hạn mức xe khi chuyển tuyến").
   * Gian hàng 10 xe rơi về tuyến hoa hồng giữ nguyên 10 xe trên chợ, đơn chạy tiếp, tiền về ví
   * bình thường; chỉ chiếc THỨ 11 bị từ chối.
   */
  async assertVehicleQuota(
    tenantId: string,
    vehicleType: VehicleType,
    opts: { scope?: 'fleet' | 'marketplace'; excludeVehicleId?: string } = {},
  ): Promise<void> {
    const quota = await this.vehicleQuotaFor(tenantId, new Date());
    if (quota.kind === 'unlimited') return;

    const scope = opts.scope ?? 'fleet';
    const scopeWhere: Prisma.VehicleWhereInput =
      scope === 'marketplace'
        ? {
            publicStatus: {
              in: [
                VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW,
                VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
              ],
            },
            ...(opts.excludeVehicleId ? { id: { not: opts.excludeVehicleId } } : {}),
          }
        : {};

    if (quota.kind === 'total') {
      /*
       * Trần Owner Lite gác ĐIỂM TẠO, không gác điểm gửi lên chợ.
       *
       * Nó không cần gác điểm thứ hai: không tạo được chiếc thứ tư thì cũng không có chiếc thứ
       * tư nào để gửi. Gác thêm ở đây lại gây đúng thiệt hại mà ADR 0038 cấm — gian hàng 10 xe
       * rơi về tuyến hoa hồng giữ nguyên 10 xe TRÊN CHỢ, nhưng mọi chiếc rời chợ một lần (sửa
       * hồ sơ, bị yêu cầu bổ sung, tạm gỡ) sẽ KHÔNG BAO GIỜ quay lại được. Đó là "gỡ xe đang
       * bán" trả góp, chỉ chậm hơn.
       *
       * Hạn mức theo CHỖ của tuyến gói thì ngược lại: chỗ là suất TRÊN CHỢ, nên nó gác cả hai
       * điểm (xem nhánh `per_type` bên dưới).
       */
      if (scope === 'marketplace') return;

      /*
       * Đếm GỘP hai loại — `vehicleType` cố ý KHÔNG vào `where`. Ba ô tô cộng ba xe máy vẫn là
       * sáu chiếc, và trần này nói về ĐỘI XE chứ không về từng loại.
       */
      const used = await this.prisma.vehicle.count({
        where: { tenantId, deletedAt: null, ...scopeWhere },
      });
      if (used >= quota.limit) {
        if (quota.reason === 'billing_unconfigured') {
          throw new ConflictException({
            code: API_ERROR_CODE.TENANT_BILLING_NOT_CONFIGURED,
            message:
              `Gian hàng chưa có gói dịch vụ hiệu lực nên tạm thời chỉ giữ được ${quota.limit} xe. ` +
              'Liên hệ hỗ trợ XePrime — đây là lỗi cấu hình phía nền tảng, không phải hạn mức của bạn.',
            details: { scope: 'owner_lite_total', used, limit: quota.limit },
          });
        }
        throw new ForbiddenException({
          code: API_ERROR_CODE.PLAN_LIMIT_REACHED,
          message:
            `Chủ xe cá nhân đăng tối đa ${quota.limit} xe (tính cả ô tô và xe máy). ` +
            'Mua gói gian hàng để đăng thêm xe.',
          details: { scope: 'owner_lite_total', used, limit: quota.limit },
        });
      }
      return;
    }

    const limit = quota.limit[vehicleType];
    if (limit == null) return;
    const used = await this.prisma.vehicle.count({
      where: { tenantId, deletedAt: null, vehicleType, ...scopeWhere },
    });
    if (used >= limit) {
      throw new ForbiddenException({
        code: API_ERROR_CODE.PLAN_LIMIT_REACHED,
        message: 'Đã chạm giới hạn số chỗ của gói cho loại xe này. Vui lòng mua thêm chỗ.',
        details: { vehicleType, used, limit },
      });
    }
  }

  /**
   * Hạn mức xe đang áp cho một tenant — MỘT phép suy cho cổng chặn và cho màn "Gói của tôi".
   *
   * Ba HÌNH DẠNG, không phải một con số: tuyến gói giới hạn theo LOẠI, Owner Lite giới hạn
   * TỔNG, và một bậc `package` không khai trần nào thì thật sự là không giới hạn. Nén ba thứ
   * đó vào một `number | null` là cách màn hiển thị bắt đầu nói "3 ô tô" khi luật là "3 xe".
   */
  async vehicleQuotaFor(
    tenantId: string,
    now: Date = new Date(),
  ): Promise<
    | { kind: 'unlimited' }
    | { kind: 'total'; limit: number; reason: 'owner_lite' | 'billing_unconfigured' }
    | { kind: 'per_type'; limit: Record<VehicleType, number | null> }
  > {
    /*
     * `EFFECTIVE_SUBSCRIPTION_ARGS.select` + đúng MỘT cột thêm (`slots_json`), thay vì chép lại
     * cả khối select. Hằng đó tồn tại để không có định nghĩa thứ hai của "dòng hiệu lực"; một
     * bản chép tay ở đây là chỗ nó bắt đầu trôi (thiếu `plan.name`, `orderBy` lệch…).
     */
    const row = await this.prisma.tenantSubscription.findFirst({
      where: { tenantId, ...effectiveSubscriptionWhere(now) },
      orderBy: EFFECTIVE_SUBSCRIPTION_ARGS.orderBy,
      select: { ...EFFECTIVE_SUBSCRIPTION_ARGS.select, slotsJson: true },
    });
    const billing = resolveEffectiveBilling(row, now);
    if (billing.billingMode !== BILLING_MODE.PACKAGE || !row) {
      /*
       * Cùng CON SỐ, khác LÝ DO — và lý do đi theo tới tận thông điệp lỗi.
       *
       * `unconfigured` không phải tuyến hoa hồng (ADR 0038 điều 1): đó là lỗi cấu hình của nền
       * tảng mà người dùng không tự sửa được. Áp trần 3 xe cho họ là lựa chọn AN TOÀN (mức chặt,
       * không phải mức rộng nhất) — nhưng nói với họ "chủ xe cá nhân đăng tối đa 3 xe" là nói
       * sai nguyên nhân, và đẩy họ đi mua một gói không giải quyết được gì.
       */
      return {
        kind: 'total',
        limit: OWNER_LITE_VEHICLE_LIMIT,
        reason:
          billing.phase === BILLING_PHASE.UNCONFIGURED ? 'billing_unconfigured' : 'owner_lite',
      };
    }

    const limits = parsePlanLimits(row.plan.limitsJson);
    const slots = row.slotsJson === null ? null : parsePlanSlots(row.slotsJson);
    const limit: Record<VehicleType, number | null> = {
      [VEHICLE_TYPE.CAR]: slots ? slots.car : limits.maxCars,
      [VEHICLE_TYPE.MOTORBIKE]: slots ? slots.motorbike : limits.maxMotorbikes,
    };
    if (limit[VEHICLE_TYPE.CAR] == null && limit[VEHICLE_TYPE.MOTORBIKE] == null) {
      return { kind: 'unlimited' };
    }
    return { kind: 'per_type', limit };
  }
  /**
   * Số suất CHỢ còn trống theo từng loại xe — `null` = không giới hạn.
   *
   * Tồn tại riêng bên cạnh `assertVehicleQuota` vì hai câu hỏi khác nhau: cổng kia chấm MỘT
   * chiếc với dữ liệu đã commit, còn hàm này phục vụ nơi gửi NHIỀU xe trong cùng một lượt (tự
   * gửi duyệt sau khi hồ sơ gian hàng được duyệt). Gọi `assertVehicleQuota` trong vòng lặp sẽ
   * đọc lại cùng một con số đã commit cho mọi chiếc và cho qua cả đàn vượt hạn mức — nơi gọi
   * phải tự trừ dần trên số trả về ở đây.
   *
   * Hạn mức đến từ `vehicleQuotaFor`, KHÔNG tự suy lại: bản trước có một bản sao của luật
   * ("không gói ⇒ vô hạn, hoa hồng ⇒ vô hạn") và bản sao đó là chỗ trần Owner Lite lặng lẽ
   * biến mất ở đường gửi hàng loạt.
   *
   * ⚠️ Owner Lite trả `null` ở CẢ HAI loại, và đó không phải "vô hạn" — trần của tuyến đó gác ở
   * điểm TẠO xe, không gác suất chợ (xem `assertVehicleQuota`, nhánh `total`). Không tạo được
   * chiếc thứ tư thì cũng không có chiếc thứ tư nào để gửi lên chợ, nên ở đây thật sự không còn
   * gì để trừ.
   */
  async remainingMarketplaceSlots(tenantId: string): Promise<Record<VehicleType, number | null>> {
    const quota = await this.vehicleQuotaFor(tenantId);
    if (quota.kind === 'unlimited') {
      return { [VEHICLE_TYPE.CAR]: null, [VEHICLE_TYPE.MOTORBIKE]: null } as Record<
        VehicleType,
        number | null
      >;
    }

    const onMarket: Prisma.VehicleWhereInput = {
      tenantId,
      deletedAt: null,
      publicStatus: {
        in: [VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW, VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC],
      },
    };

    if (quota.kind === 'total') {
      // Owner Lite không có suất CHỢ — trần của họ gác điểm tạo (xem `assertVehicleQuota`),
      // nên ở đây không còn gì để trừ. Đội xe tối đa 3 chiếc đã là trần thật.
      return { [VEHICLE_TYPE.CAR]: null, [VEHICLE_TYPE.MOTORBIKE]: null } as Record<
        VehicleType,
        number | null
      >;
    }

    const used = await this.prisma.vehicle.groupBy({
      by: ['vehicleType'],
      where: onMarket,
      _count: { _all: true },
    });
    const usedOf = new Map(used.map((row) => [row.vehicleType, row._count._all]));

    return VEHICLE_TYPE_VALUES.reduce(
      (acc, type) => {
        const limit = quota.limit[type];
        acc[type] = limit == null ? null : Math.max(0, limit - (usedOf.get(type) ?? 0));
        return acc;
      },
      {} as Record<VehicleType, number | null>,
    );
  }
  // -------------------------------------------------------------------------

  /**
   * Chuẩn hoá + kiểm bộ núm của một bậc gói trước khi ghi. Chạy trên hình MERGED (create: dto
   * trọn vẹn; update: dto đè lên giá trị đang lưu) — hai chế độ, hai hình dạng dữ liệu, khớp
   * từng chữ với CHECK `plans_commission_percent_by_mode_check` ở DB.
   */
  private normalizePlanKnobs(input: {
    billingMode: string;
    commissionPercent: number | null;
    basePriceMonthly: string;
    limits: PlanLimitsJson;
    assumedGmv: PlanAssumedGmvJson | null;
  }): typeof input {
    if (input.billingMode === BILLING_MODE.COMMISSION) {
      if (input.commissionPercent == null) {
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: 'Bậc gói tuyến hoa hồng bắt buộc có commissionPercent (1–20)',
          details: { field: 'commissionPercent' },
        });
      }
      return input;
    }
    // package: KHÔNG có % hoa hồng (0đ phí dịch vụ trên chuyến). Tự xoá thay vì bắt client gửi
    // null tường minh — không có cách đọc thứ hai cho tổ hợp package + %.
    //
    // KHÔNG còn kiểm điểm giao ở đây (ADR 0029 gỡ ADR 0020): phí theo chuyến nay do KHÁCH gánh
    // trên giá đặt xe, nên phí nền 0đ không giết phễu — động lực nâng cấp là giá cạnh tranh
    // trên chợ, không phải chi phí trực tiếp của chủ xe. `assumedMonthlyGmv` thành tham khảo.
    return { ...input, commissionPercent: null };
  }

  /**
   * Bảng kê cả kỳ = (phí nền + chỗ mua thêm × đơn giá) × số tháng, giảm % theo kỳ hạn cam kết.
   * Chỗ trong mức gồm sẵn không tính thêm tiền — phí nền đã bao. Trả về TỪNG DÒNG để snapshot
   * vào hoá đơn (ADR 0015 điều 5) — hoá đơn phải tự giải thích được, không cần join.
   */
  private priceTerm(
    basePriceMonthly: Prisma.Decimal,
    limits: PlanLimitsJson,
    slots: PlanSlots,
    termMonths: number,
  ): {
    lines: PlanInvoiceLine[];
    subtotal: Prisma.Decimal;
    discountAmount: Prisma.Decimal;
    total: Prisma.Decimal;
  } {
    const lines: PlanInvoiceLine[] = [];
    let subtotal = new Prisma.Decimal(0);

    const base = new Prisma.Decimal(basePriceMonthly);
    if (!base.isZero()) {
      const amount = base.mul(termMonths).toDecimalPlaces(2);
      lines.push({
        kind: 'base',
        quantity: 1,
        months: termMonths,
        unitPrice: base.toString(),
        amount: amount.toString(),
      });
      subtotal = subtotal.add(amount);
    }

    for (const [type, bought, included, unitPrice] of [
      [VEHICLE_TYPE.CAR, slots.car, limits.includedCars, limits.perVehiclePrice.car],
      [
        VEHICLE_TYPE.MOTORBIKE,
        slots.motorbike,
        limits.includedMotorbikes,
        limits.perVehiclePrice.motorbike,
      ],
    ] as const) {
      const extra = bought - included;
      if (extra <= 0) continue;
      if (unitPrice === null) {
        throw new BadRequestException({
          code: API_ERROR_CODE.VALIDATION_FAILED,
          message: 'Bậc gói không bán thêm loại chỗ này',
          details: { field: `slots.${type}` },
        });
      }
      const amount = new Prisma.Decimal(unitPrice).mul(extra).mul(termMonths).toDecimalPlaces(2);
      lines.push({
        kind: 'slot',
        vehicleType: type,
        quantity: extra,
        months: termMonths,
        unitPrice,
        amount: amount.toString(),
      });
      subtotal = subtotal.add(amount);
    }

    const discountAmount = subtotal
      .mul(termDiscountPercent(limits, termMonths))
      .div(100)
      .toDecimalPlaces(2);
    return { lines, subtotal, discountAmount, total: subtotal.sub(discountAmount) };
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
        code: newReferenceCode(BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_INVOICE),
        periodFrom: args.periodFrom,
        periodTo: args.periodTo,
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
    const row = await client.tenantSubscription.findFirst({
      where: { tenantId, ...effectiveSubscriptionWhere(now) },
      ...EFFECTIVE_SUBSCRIPTION_ARGS,
    });
    const billing = resolveEffectiveBilling(row, now);
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
    const current = await this.findCurrent(tenantId, now, tx);
    return current?.plan.limitsJson ?? null;
  }

  private findCurrent(tenantId: string, now: Date, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.tenantSubscription.findFirst({
      // Điều kiện "gói hiện hành" dùng CHUNG với TenantScopeGuard/AuthService.me (ADR 0027):
      // hai định nghĩa trôi khỏi nhau là menu mở mà API trả 403.
      where: { tenantId, ...currentSubscriptionWhere(now) },
      orderBy: { endsAt: 'desc' },
      select: SUB_SELECT,
    });
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

function toCurrentPlanDto(current: SubRow): CurrentPlanDto {
  return {
    subscriptionId: current.id,
    planId: current.planId,
    planCode: current.plan.code,
    planName: current.plan.name,
    maxVehicles: current.plan.maxVehicles,
    // Ba cột SNAPSHOT trên chính dòng subscription (ADR 0024 điều 2) — null ở dòng gán
    // trước ADR 0015; caller phân biệt "không biết" với "0/commission", đừng bịa mặc định.
    billingMode: current.billingMode,
    commissionPercent:
      current.commissionPercent === null ? null : Number(current.commissionPercent),
    slots: current.slotsJson === null ? null : parsePlanSlots(current.slotsJson),
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
    slots: parsePlanSlots(snapshot.slots),
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
  };
}

function toPlanDto(p: PlanRow): PlanDto {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
    billingMode: p.billingMode,
    commissionPercent: p.commissionPercent === null ? null : Number(p.commissionPercent),
    basePriceMonthly: p.basePriceMonthly.toString(),
    // Parser phòng thủ: jsonb hỏng/thiếu key không sập đường đọc — rơi về giá trị an toàn.
    limits: parsePlanLimits(p.limitsJson),
    assumedMonthlyGmv: parsePlanAssumedGmv(p.assumedMonthlyGmvJson),
    price: p.price.toString(),
    currency: p.currency,
    durationDays: p.durationDays,
    maxVehicles: p.maxVehicles,
    status: p.status,
    sortOrder: p.sortOrder,
    subscriptionCount: p._count.subscriptions,
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
    slots: s.slotsJson === null ? null : parsePlanSlots(s.slotsJson),
    billingMode: s.billingMode,
    commissionPercent: s.commissionPercent === null ? null : Number(s.commissionPercent),
    startsAt: (s.startsAt as Date).toISOString(),
    endsAt: (s.endsAt as Date).toISOString(),
    note: s.note,
    createdAt: (s.createdAt as Date).toISOString(),
  };
}
