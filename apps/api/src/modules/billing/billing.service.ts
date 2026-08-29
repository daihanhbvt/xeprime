import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BANK_MATCH_TARGET_TYPE,
  BILLING_MODE,
  FREE_TRIP_ALLOWANCE,
  PLAN_STATUS,
  SUBSCRIPTION_INVOICE_STATUS,
  SUBSCRIPTION_INVOICE_TTL_HOURS,
  SUBSCRIPTION_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  addCalendarMonthsVn,
  parsePlanAssumedGmv,
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
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AddSlotsDto,
  AssignSubscriptionDto,
  CreatePlanDto,
  CurrentPlanDto,
  MySubscriptionDto,
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
    const dup = await this.prisma.plan.findUnique({ where: { code: dto.code }, select: { id: true } });
    if (dup) {
      throw new ConflictException({
        code: API_ERROR_CODE.CONFLICT,
        message: 'Mã gói đã tồn tại',
      });
    }

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

  /** Ngừng bán (archive) — thuê bao đã gán giữ nguyên hiệu lực, chỉ không gán mới được nữa. */
  async archivePlan(actorUserId: string, id: string): Promise<PlanDto> {
    const current = await this.loadPlan(id);
    if (current.status === PLAN_STATUS.ARCHIVED) {
      throw new ConflictException({
        code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
        message: 'Gói đã ngừng bán',
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
      // Nối đuôi theo endsAt MUỘN NHẤT còn active (kể cả chu kỳ tương lai đã xếp hàng) —
      // dùng findCurrent (startsAt <= now) ở đây sẽ tạo 2 chu kỳ chồng nhau khi gia hạn 2 lần.
      const tail = await tx.tenantSubscription.findFirst({
        where: {
          tenantId,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          endsAt: { gt: now },
        },
        orderBy: { endsAt: 'desc' },
        select: { endsAt: true },
      });
      const startsAt = tail ? tail.endsAt : now;
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
          action: tail ? 'subscription.renew' : 'subscription.assign',
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
    const current = await this.findCurrent(tenantId, new Date());

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
            in: [VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW, VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC],
          },
        },
        _count: { _all: true },
      }),
    ]);
    const countOf = (rows: typeof fleet, type: string) =>
      rows.find((r) => r.vehicleType === type)?._count._all ?? 0;

    // Cùng cách suy hạn mức với assertVehicleQuota — không có định nghĩa thứ hai.
    const limits = current ? parsePlanLimits(current.plan.limitsJson) : null;
    const slots = current?.slotsJson != null ? parsePlanSlots(current.slotsJson) : null;
    const unlimited =
      !current || current.billingMode === BILLING_MODE.COMMISSION;
    const limitOf = (type: 'car' | 'motorbike'): number | null => {
      if (unlimited || !limits) return null;
      if (slots) return type === 'car' ? slots.car : slots.motorbike;
      return type === 'car' ? limits.maxCars : limits.maxMotorbikes;
    };

    const used = Math.min(tenant.freeTripsUsed, FREE_TRIP_ALLOWANCE);
    return {
      currentPlan: current ? toCurrentPlanDto(current) : null,
      usage: {
        car: {
          used: countOf(fleet, VEHICLE_TYPE.CAR),
          onMarketplace: countOf(onMarket, VEHICLE_TYPE.CAR),
          limit: limitOf('car'),
        },
        motorbike: {
          used: countOf(fleet, VEHICLE_TYPE.MOTORBIKE),
          onMarketplace: countOf(onMarket, VEHICLE_TYPE.MOTORBIKE),
          limit: limitOf('motorbike'),
        },
      },
      freeTrips: {
        allowance: FREE_TRIP_ALLOWANCE,
        used: tenant.freeTripsUsed,
        left: FREE_TRIP_ALLOWANCE - used,
      },
    };
  }

  /** Danh sách gói đang bán cho gian hàng chọn — không lộ giả định định giá nội bộ. */
  async listPlansForTenant(): Promise<TenantPlanDto[]> {
    const rows = await this.prisma.plan.findMany({
      where: { status: PLAN_STATUS.ACTIVE },
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
   * Gian hàng TỰ mua / gia hạn gói: sinh hoá đơn `issued` + mã đối soát `XPG…`, KHÔNG tạo
   * subscription — gói chỉ bật khi tiền đã về (ADR 0026 điều 4; webhook mở ở W4, admin vẫn gán
   * tay được qua đường platform). Mỗi tenant chỉ giữ MỘT hoá đơn chờ: hoá đơn `issued` cũ bị
   * lật `void` trong cùng transaction — hai mã cùng sống là hai đường tiền cùng kích hoạt.
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
    const limits = parsePlanLimits(plan.limitsJson);
    const slots = this.resolvePurchaseSlots(limits, dto.slots);
    const pricing = this.priceTerm(plan.basePriceMonthly, limits, slots, dto.termMonths);
    if (pricing.total.isZero()) {
      // Gói 0đ không có gì để mua — tuyến hoa hồng là mặc định, không đi qua hoá đơn.
      throw new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_FAILED,
        message: 'Gói này không cần mua — không có khoản phải trả',
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
   * Hạn mức CHỖ XE theo loại (ADR 0015 điều 1 + 7): số chỗ đã mua CHÍNH LÀ hạn mức — ô tô và
   * xe máy đếm riêng. Enforce ở HAI điểm: tạo xe (`scope: 'fleet'`, mặc định) và đưa xe lên chợ
   * (`scope: 'marketplace'` — "cái răng thật", chỉ đếm xe đang chiếm suất trên chợ và trừ chính
   * chiếc đang gửi, để tenant tụt gói vẫn chọn được xe nào chiếm chỗ).
   *
   * Ai KHÔNG bị giới hạn:
   *  - không có gói hiện hành — grandfather (ADR 0010) và hạn mức không rơi theo khi hết gói
   *    (ADR 0024 điều 6);
   *  - gói tuyến hoa hồng — tuyến A không bán chỗ, nền tảng thu trên chuyến (ADR 0020).
   *
   * Hạn mức đọc từ SNAPSHOT `slots_json` của dòng thuê bao; dòng lịch sử chưa có slots rơi về
   * trần của bậc gói (`limits.maxCars`/`maxMotorbikes` — backfill từ `max_vehicles` cũ).
   */
  async assertVehicleQuota(
    tenantId: string,
    vehicleType: VehicleType,
    opts: { scope?: 'fleet' | 'marketplace'; excludeVehicleId?: string } = {},
  ): Promise<void> {
    const current = await this.findCurrent(tenantId, new Date());
    if (!current) return;
    if (current.billingMode === BILLING_MODE.COMMISSION) return;

    const limits = parsePlanLimits(current.plan.limitsJson);
    const slots = current.slotsJson === null ? null : parsePlanSlots(current.slotsJson);
    const limit =
      vehicleType === VEHICLE_TYPE.CAR
        ? (slots ? slots.car : limits.maxCars)
        : (slots ? slots.motorbike : limits.maxMotorbikes);
    if (limit == null) return;

    const scope = opts.scope ?? 'fleet';
    const used = await this.prisma.vehicle.count({
      where: {
        tenantId,
        deletedAt: null,
        vehicleType,
        ...(scope === 'marketplace'
          ? {
              publicStatus: {
                in: [
                  VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW,
                  VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
                ],
              },
              ...(opts.excludeVehicleId ? { id: { not: opts.excludeVehicleId } } : {}),
            }
          : {}),
      },
    });
    if (used >= limit) {
      throw new ForbiddenException({
        code: API_ERROR_CODE.PLAN_LIMIT_REACHED,
        message: 'Đã chạm giới hạn số chỗ của gói cho loại xe này. Vui lòng mua thêm chỗ.',
        details: { vehicleType, used, limit },
      });
    }
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
    // package: KHÔNG có % hoa hồng (0đ trên chuyến — ADR 0020). Tự xoá thay vì bắt client gửi
    // null tường minh — không có cách đọc thứ hai cho tổ hợp package + %.
    this.assertPlanIncentive(input.basePriceMonthly, input.limits, input.assumedGmv);
    return { ...input, commissionPercent: null };
  }

  /**
   * KIỂM ĐIỂM GIAO (ADR 0020) — quy tắc trong code, không phải núm vặn.
   *
   * Điểm hoà vốn của gói so với tuyến hoa hồng không được nằm DƯỚI `includedCars`: với
   * N ≤ includedCars chi phí gói = phí nền (chỗ đã gồm sẵn), nên "hoà vốn dưới includedCars"
   * ⇔ `basePriceMonthly < includedCars × commissionPercent% × G`. Vi phạm nghĩa là chủ xe
   * NHỎ HƠN quy mô gói cũng thấy gói rẻ hơn — tuyến hoa hồng mất vai trò phễu.
   *
   * `includedCars = 0` ⇒ ngưỡng 0đ, mọi phí nền qua được — đúng theo phát biểu của ADR;
   * bậc gói gian hàng tử tế nên có includedCars > 0 để phép kiểm có răng.
   */
  private assertPlanIncentive(
    basePriceMonthly: string,
    limits: PlanLimitsJson,
    assumedGmv: PlanAssumedGmvJson | null,
  ): void {
    if (assumedGmv === null) {
      throw new ConflictException({
        code: API_ERROR_CODE.PLAN_INCENTIVE_INVALID,
        message: 'Bậc gói package phải có assumedMonthlyGmv để kiểm điểm giao (ADR 0020)',
        details: { reason: 'MISSING_ASSUMPTIONS' },
      });
    }
    const threshold = new Prisma.Decimal(assumedGmv.monthlyGmvPerCar)
      .mul(assumedGmv.commissionPercent)
      .div(100)
      .mul(limits.includedCars)
      .toDecimalPlaces(2);
    if (new Prisma.Decimal(basePriceMonthly).lessThan(threshold)) {
      throw new ConflictException({
        code: API_ERROR_CODE.PLAN_INCENTIVE_INVALID,
        message: 'Điểm hoà vốn nằm dưới số chỗ gồm sẵn — phí nền quá thấp so với tuyến hoa hồng',
        details: {
          reason: 'BREAKEVEN_BELOW_INCLUDED',
          basePriceMonthly,
          minBasePriceMonthly: threshold.toString(),
          includedCars: limits.includedCars,
        },
      });
    }
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
        status: args.paid
          ? SUBSCRIPTION_INVOICE_STATUS.PAID
          : SUBSCRIPTION_INVOICE_STATUS.ISSUED,
        paidAt: args.paid ? new Date() : null,
        expiresAt: args.paid ? null : (args.expiresAt ?? null),
      },
      select: INVOICE_SELECT,
    });
  }

  private findCurrent(tenantId: string, now: Date, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.tenantSubscription.findFirst({
      where: {
        tenantId,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        startsAt: { lte: now },
        endsAt: { gt: now },
      },
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
