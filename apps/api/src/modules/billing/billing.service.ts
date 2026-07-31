import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  PLAN_STATUS,
  SUBSCRIPTION_STATUS,
  type PaginationMeta,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AssignSubscriptionDto,
  CreatePlanDto,
  CurrentPlanDto,
  PlanDto,
  PlanListQueryDto,
  SUBSCRIPTION_DEFAULT_LIMIT,
  SUBSCRIPTION_MAX_LIMIT,
  SubscriptionDto,
  SubscriptionListQueryDto,
  UpdatePlanDto,
} from './dto/billing.dto';

const PLAN_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  price: true,
  currency: true,
  durationDays: true,
  maxVehicles: true,
  status: true,
  sortOrder: true,
  createdAt: true,
  _count: { select: { subscriptions: true } },
} satisfies Prisma.PlanSelect;

const SUB_SELECT = {
  id: true,
  tenantId: true,
  planId: true,
  status: true,
  price: true,
  startsAt: true,
  endsAt: true,
  note: true,
  createdAt: true,
  plan: { select: { code: true, name: true, maxVehicles: true } },
} satisfies Prisma.TenantSubscriptionSelect;

/**
 * Writer DUY NHẤT của `plans` + `tenant_subscriptions` (ADR 0010).
 *
 * Lịch sử thuê bao append-only: gán/gia hạn CHÈN dòng mới (`startsAt` nối đuôi gói hiện hành
 * còn hạn, hoặc = now), không update dòng cũ trừ huỷ sớm (active → cancelled). "Hết hạn" suy
 * ra từ `endsAt` — không job. Mọi mutation ghi audit trong cùng transaction.
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

    const row = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.plan.create({
        data: {
          id: newId(),
          code: dto.code,
          name: dto.name,
          description: dto.description ?? null,
          price: dto.price,
          durationDays: dto.durationDays,
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
          after: { code: dto.code, name: dto.name, price: dto.price, durationDays: dto.durationDays, maxVehicles: dto.maxVehicles ?? null },
        },
        tx,
      );
      return plan;
    });
    return toPlanDto(row);
  }

  async updatePlan(actorUserId: string, id: string, dto: UpdatePlanDto): Promise<PlanDto> {
    const current = await this.loadPlan(id);
    const row = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.plan.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
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
            price: current.price.toString(),
            durationDays: current.durationDays,
            maxVehicles: current.maxVehicles,
          },
          after: {
            name: plan.name,
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
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(
      SUBSCRIPTION_MAX_LIMIT,
      Math.max(1, query.limit ?? SUBSCRIPTION_DEFAULT_LIMIT),
    );

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.tenantSubscription.count({ where: { tenantId } }),
      this.prisma.tenantSubscription.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: SUB_SELECT,
      }),
    ]);

    return {
      data: rows.map(toSubscriptionDto),
      meta: { page, limit, total, hasNext: page * limit < total },
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
      const endsAt = new Date(startsAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

      const sub = await tx.tenantSubscription.create({
        data: {
          id: newId(),
          tenantId,
          planId: plan.id,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          price: plan.price,
          startsAt,
          endsAt,
          note: dto.note ?? null,
          createdBy: actorUserId,
        },
        select: SUB_SELECT,
      });

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
            price: plan.price.toString(),
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

  /** Gói hiện hành của tenant (đọc-only, dùng cho tenant detail) — null nếu không có/hết hạn. */
  async currentPlan(tenantId: string): Promise<CurrentPlanDto | null> {
    const current = await this.findCurrent(tenantId, new Date());
    if (!current) return null;
    return {
      subscriptionId: current.id,
      planId: current.planId,
      planCode: current.plan.code,
      planName: current.plan.name,
      maxVehicles: current.plan.maxVehicles,
      endsAt: current.endsAt.toISOString(),
    };
  }

  /**
   * Quota xe (ADR 0010): tenant có gói hiện hành với `maxVehicles` hữu hạn mà số xe (chưa xoá)
   * đã chạm → chặn tạo thêm. Không gói / `maxVehicles` NULL = không giới hạn.
   */
  async assertVehicleQuota(tenantId: string): Promise<void> {
    const current = await this.findCurrent(tenantId, new Date());
    if (!current || current.plan.maxVehicles == null) return;
    const vehicleCount = await this.prisma.vehicle.count({
      where: { tenantId, deletedAt: null },
    });
    if (vehicleCount >= current.plan.maxVehicles) {
      throw new ForbiddenException({
        code: API_ERROR_CODE.PLAN_LIMIT_REACHED,
        message: 'Đã chạm giới hạn số xe của gói. Vui lòng nâng cấp gói.',
      });
    }
  }

  // -------------------------------------------------------------------------

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

function toPlanDto(p: PlanRow): PlanDto {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    description: p.description,
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
    startsAt: (s.startsAt as Date).toISOString(),
    endsAt: (s.endsAt as Date).toISOString(),
    note: s.note,
    createdAt: (s.createdAt as Date).toISOString(),
  };
}
