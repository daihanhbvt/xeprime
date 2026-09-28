import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BILLING_MODE,
  DEFAULT_PLATFORM_TENANT_SORT,
  PLATFORM_PARTNER_KIND,
  PLATFORM_TENANT_SORT,
  SHOP_ONBOARDING_STATE,
  TENANT_STATUS,
  isSubscriptionTrack,
  platformPartnerKindOf,
  resolveEffectiveBilling,
  type PaginationMeta,
  type PlatformPartnerKind,
  type PlatformTenantSort,
} from '@xeprime/types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EFFECTIVE_SUBSCRIPTION_ARGS,
  effectiveSubscriptionWhere,
} from '../../common/plan/feature-state';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import {
  LockTenantDto,
  PLATFORM_TENANT_DEFAULT_LIMIT,
  PLATFORM_TENANT_MAX_LIMIT,
  PlatformTenantDetailDto,
  PlatformTenantDto,
  PlatformTenantListQueryDto,
} from './dto/platform-tenant.dto';
import { paginationMeta, resolvePaging } from '../../common/pagination';

/**
 * Cột của một dòng danh sách. Kèm dòng thuê bao HIỆU LỰC gần nhất (cùng `where`/`orderBy` với
 * `tenantContextSelect`) để chấm loại đối tác bằng đúng phép giải mà cổng tuyến dùng — không đọc
 * tên gói, không đọc `tenant_type`.
 */
function listSelect(now: Date) {
  return {
    id: true,
    code: true,
    name: true,
    slug: true,
    tenantType: true,
    status: true,
    phone: true,
    email: true,
    createdAt: true,
    onboardingState: true,
    owner: { select: { displayName: true } },
    profile: { select: { provinceName: true } },
    _count: { select: { vehicles: true } },
    subscriptions: { where: effectiveSubscriptionWhere(now), ...EFFECTIVE_SUBSCRIPTION_ARGS },
  } satisfies Prisma.TenantSelect;
}

/** Hai trạng thái đăng ký đã tự nói "đây là gian hàng tuyến gói" (ADR 0040) — không cần đọc thuê bao. */
const PACKAGE_DOOR_STATES: string[] = [
  SHOP_ONBOARDING_STATE.PACKAGE_PENDING,
  SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
];

/** Luôn kèm `id` làm khoá phụ: phân trang trên khoá không duy nhất sẽ lặp/sót dòng giữa hai trang. */
const ORDER_BY: Readonly<Record<PlatformTenantSort, Prisma.TenantOrderByWithRelationInput[]>> = {
  [PLATFORM_TENANT_SORT.NEWEST]: [{ createdAt: 'desc' }, { id: 'desc' }],
  [PLATFORM_TENANT_SORT.OLDEST]: [{ createdAt: 'asc' }, { id: 'asc' }],
  [PLATFORM_TENANT_SORT.NAME]: [{ name: 'asc' }, { id: 'asc' }],
  [PLATFORM_TENANT_SORT.VEHICLES]: [
    { vehicles: { _count: 'desc' } },
    { createdAt: 'desc' },
    { id: 'desc' },
  ],
};

@Injectable()
export class PlatformTenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly billing: BillingService,
  ) {}

  /**
   * Danh sách đối tác của nền tảng (không tenant-scope — đây là admin platform). `deleted_at` null.
   *
   * `partnerKind` tách hai danh sách "Gian hàng gói" / "Chủ xe cá nhân" và được áp vào CHÍNH
   * `where` của phép đếm lẫn phép lấy trang — nên tổng số, phân trang, tìm kiếm, lọc trạng thái và
   * sắp xếp đều chạy bên trong một loại, không bao giờ lọc lại ở client.
   */
  async list(
    query: PlatformTenantListQueryDto,
  ): Promise<{ data: PlatformTenantDto[]; meta: PaginationMeta }> {
    const paging = resolvePaging(query, PLATFORM_TENANT_DEFAULT_LIMIT, PLATFORM_TENANT_MAX_LIMIT);
    const now = new Date();

    const q = query.q?.trim();
    const scope: Prisma.TenantWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { code: { contains: q, mode: 'insensitive' } },
              { slug: { contains: q, mode: 'insensitive' } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    };
    const where: Prisma.TenantWhereInput = query.partnerKind
      ? { AND: [scope, await this.partnerKindWhere(query.partnerKind, scope, now)] }
      : scope;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.tenant.count({ where }),
      this.prisma.tenant.findMany({
        where,
        orderBy: ORDER_BY[query.sort ?? DEFAULT_PLATFORM_TENANT_SORT],
        skip: paging.skip,
        take: paging.take,
        select: listSelect(now),
      }),
    ]);

    return {
      data: rows.map((row) => toListItem(row, now)),
      meta: paginationMeta(paging, total),
    };
  }

  /**
   * `platformPartnerKindOf` (= `isPackageShopTrack`) viết thành điều kiện DB.
   *
   * Hai nhánh của luật:
   *  1. `onboarding_state ∈ {package_pending, package_active}` — một cột, lọc thẳng.
   *  2. `billingMode = package` của gói HIỆU LỰC — nhóm chủ xe vào cửa hoa hồng rồi mua gói (họ giữ
   *     `commission`, xem `BillingService.completePackageOnboardingWithinTx`). Pha hiệu lực có ân
   *     hạn đọc từ `plans.limits_json`, nên KHÔNG chép lại sang SQL: SQL chỉ thu hẹp ứng viên (có
   *     một dòng gói đã bắt đầu), rồi chính `resolveEffectiveBilling` chấm — cùng hàm mà
   *     `TenantScopeGuard` và phiên hỗ trợ dùng. Nhóm này nhỏ (chỉ những người đã nâng cấp) và bị
   *     `scope` thu hẹp thêm.
   *
   * Hai loại phủ kín và rời nhau: loại cá nhân là phủ định chính xác của loại gian hàng.
   *
   * Độ lớn: danh sách `id` cuối cùng chỉ gồm người nâng cấp CÒN gói hiệu lực — nhỏ. Tập ỨNG VIÊN
   * thì lớn dần theo thời gian (dòng gói cũ không mất đi khi hết hạn, nên mọi người từng nâng cấp
   * đều lọt vào bước thu hẹp). Khi con số đó đáng kể, chuyển phép "dòng hiệu lực gần nhất" vào SQL
   * (LATERAL lấy dòng `ends_at` lớn nhất) — nhưng phép chấm ân hạn vẫn phải khớp
   * `resolveEffectiveBilling`, và test `platform-tenants.spec.ts` khoá đúng điều đó.
   */
  private async partnerKindWhere(
    kind: PlatformPartnerKind,
    scope: Prisma.TenantWhereInput,
    now: Date,
  ): Promise<Prisma.TenantWhereInput> {
    const upgradedIds = await this.commissionDoorPackageTenantIds(scope, now);
    return kind === PLATFORM_PARTNER_KIND.PACKAGE_SHOP
      ? { OR: [{ onboardingState: { in: PACKAGE_DOOR_STATES } }, { id: { in: upgradedIds } }] }
      : { onboardingState: { notIn: PACKAGE_DOOR_STATES }, id: { notIn: upgradedIds } };
  }

  private async commissionDoorPackageTenantIds(
    scope: Prisma.TenantWhereInput,
    now: Date,
  ): Promise<string[]> {
    const effective = effectiveSubscriptionWhere(now);
    const candidates = await this.prisma.tenant.findMany({
      where: {
        AND: [
          scope,
          { onboardingState: { notIn: PACKAGE_DOOR_STATES } },
          { subscriptions: { some: { ...effective, billingMode: BILLING_MODE.PACKAGE } } },
        ],
      },
      select: { id: true, subscriptions: { where: effective, ...EFFECTIVE_SUBSCRIPTION_ARGS } },
    });
    return candidates
      .filter((c) => isSubscriptionTrack(resolveEffectiveBilling(c.subscriptions[0] ?? null, now)))
      .map((c) => c.id);
  }

  async getOne(id: string): Promise<PlatformTenantDetailDto> {
    const now = new Date();
    const row = await this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...listSelect(now),
        owner: { select: { displayName: true, email: true, phone: true } },
        profile: {
          select: { provinceName: true, address: true, taxCode: true, businessLicenseNo: true },
        },
        _count: { select: { vehicles: true, bookings: true } },
      },
    });
    if (!row) throw notFound();
    return {
      ...toListItem(row, now),
      ownerEmail: row.owner?.email ?? null,
      ownerPhone: row.owner?.phone ?? null,
      address: row.profile?.address ?? null,
      taxCode: row.profile?.taxCode ?? null,
      businessLicenseNo: row.profile?.businessLicenseNo ?? null,
      bookingCount: row._count.bookings,
      currentPlan: await this.billing.currentPlan(id),
    };
  }

  /**
   * Khoá gian hàng đang hoạt động (active → suspended). Marketplace lọc `active` nên xe biến mất
   * khỏi sàn tức thì (ADR 0008). Ghi audit (scope platform). Chỉ khoá được shop đang `active`.
   */
  async lock(
    id: string,
    actorUserId: string,
    dto: LockTenantDto,
  ): Promise<PlatformTenantDetailDto> {
    await this.transition(
      id,
      actorUserId,
      TENANT_STATUS.ACTIVE,
      TENANT_STATUS.SUSPENDED,
      'tenant.lock',
      dto.reason,
    );
    return this.getOne(id);
  }

  /** Mở khoá (suspended → active). Chỉ mở được shop đang `suspended`. */
  async unlock(id: string, actorUserId: string): Promise<PlatformTenantDetailDto> {
    await this.transition(
      id,
      actorUserId,
      TENANT_STATUS.SUSPENDED,
      TENANT_STATUS.ACTIVE,
      'tenant.unlock',
    );
    return this.getOne(id);
  }

  private async transition(
    id: string,
    actorUserId: string,
    from: string,
    to: string,
    action: string,
    reason?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // updateMany với điều kiện trạng thái nguồn: chỉ đúng 1 dòng đổi được (chống đua + sai bước).
      const res = await tx.tenant.updateMany({
        where: { id, status: from, deletedAt: null },
        data: { status: to },
      });
      if (res.count !== 1) {
        // Không đổi được: hoặc không tồn tại, hoặc không ở trạng thái nguồn.
        const exists = await tx.tenant.findFirst({
          where: { id, deletedAt: null },
          select: { id: true },
        });
        if (!exists) throw notFound();
        throw new ConflictException({
          code: API_ERROR_CODE.INVALID_STATUS_TRANSITION,
          message:
            to === TENANT_STATUS.SUSPENDED
              ? 'Chỉ khoá được gian hàng đang hoạt động'
              : 'Chỉ mở khoá được gian hàng đang bị khoá',
        });
      }
      await this.audit.record(
        {
          tenantId: id,
          actorUserId,
          actorScope: 'platform',
          action,
          targetType: 'tenant',
          targetId: id,
          before: { status: from },
          after: { status: to, ...(reason ? { reason } : {}) },
        },
        tx,
      );
    });
  }
}

type TenantRow = Prisma.TenantGetPayload<{ select: ReturnType<typeof listSelect> }>;

function toListItem(r: TenantRow, now: Date): PlatformTenantDto {
  const billing = resolveEffectiveBilling(r.subscriptions[0] ?? null, now);
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    slug: r.slug,
    tenantType: r.tenantType,
    status: r.status,
    partnerKind: platformPartnerKindOf({
      onboardingState: r.onboardingState,
      billingMode: billing.billingMode,
    }),
    phone: r.phone,
    email: r.email,
    ownerName: r.owner?.displayName ?? null,
    provinceName: r.profile?.provinceName ?? null,
    vehicleCount: r._count.vehicles,
    createdAt: r.createdAt as unknown as string,
  };
}

function notFound(): NotFoundException {
  return new NotFoundException({
    code: API_ERROR_CODE.NOT_FOUND,
    message: 'Không tìm thấy gian hàng',
  });
}
