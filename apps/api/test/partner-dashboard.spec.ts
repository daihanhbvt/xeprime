import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  BILLING_MODE,
  BILLING_PHASE,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  DASHBOARD_AGENDA_KIND,
  DASHBOARD_AGENDA_LIMIT,
  DASHBOARD_TREND_MONTHS,
  FEATURE_STATE,
  MEMBERSHIP_STATUS,
  PERMISSION,
  PERMISSION_VALUES,
  PLAN_FEATURE,
  PLAN_FEATURE_VALUES,
  SHOP_ONBOARDING_STATE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  type FeatureState,
  type Permission,
  type PlanFeature,
} from '@xeprime/types';
import { vnDateKey, vnMonthStartUtc } from '../src/common/day-range';
import type { TenantContext } from '../src/common/types/request-context';
import { HostMetricsService } from '../src/modules/host-metrics/host-metrics.service';
import { PartnerDashboardService } from '../src/modules/partner-dashboard/partner-dashboard.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Tổng quan site partner — chạy trên PostgreSQL THẬT.
 *
 * Thứ phải khoá lại:
 *  1. Mỗi số là đúng TẬP CON của danh sách mà thẻ dẫn tới (chờ giao xe, đang thuê, yêu cầu chờ
 *     duyệt) — và "hôm nay" là ngày lịch VIỆT NAM.
 *  2. Lịch giao/nhận gộp hai luồng theo giờ, mốc quá giờ đứng đầu, cắt ở `DASHBOARD_AGENDA_LIMIT`.
 *  3. Từng khối gác theo QUYỀN (thiếu ⇒ `null`, không phải 0); báo cáo theo kỳ gác thêm theo TUYẾN
 *     (ADR 0027 điều 1) — chủ xe tuyến hoa hồng không bao giờ nhận `trend`.
 *  4. Phạm vi chi nhánh fail-closed: được giao mảng RỖNG thì không thấy gì (ADR 0052).
 *
 * Mọi phép đếm khoanh theo `tenantId` riêng của spec — các spec khác chạy cùng DB.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const dashboard = new PartnerDashboardService(asService, new HostMetricsService(asService));

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** Mốc "bây giờ" cố định cho cả bộ — mọi mốc dữ liệu tính tương đối từ đây. */
const NOW = new Date();

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let vehicleId: string;
let tag: string;
let pickupOverdue: string;
let activeOverdue: string;

function context(overrides: Partial<TenantContext> = {}): TenantContext {
  const features = Object.fromEntries(
    PLAN_FEATURE_VALUES.map((f) => [f, FEATURE_STATE.ENABLED]),
  ) as Record<PlanFeature, FeatureState>;
  return {
    tenantId,
    tenantStatus: TENANT_STATUS.ACTIVE,
    onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
    roleKey: TENANT_ROLE.SHOP_OWNER,
    permissions: PERMISSION_VALUES.filter((p) => !p.startsWith('platform.')),
    allowedBranchIds: null,
    features,
    usedFeatures: [],
    planCode: 'pro',
    planEndsAt: null,
    billingMode: BILLING_MODE.PACKAGE,
    billingPhase: BILLING_PHASE.CURRENT,
    graceEndsAt: null,
    ...overrides,
  };
}

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }

  ownerId = newId();
  tenantId = newId();
  vehicleId = newId();
  tag = tenantId.slice(-6);

  await prisma.user.create({
    data: {
      id: ownerId,
      realm: ACCOUNT_REALM.PARTNER,
      displayName: 'Chủ xe',
      email: `pd-o-${ownerId}@xeprime.test`,
    },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `DashShop-${tag}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
      joinedAt: NOW,
    },
  });
  // Xe có mặt từ trước đầu tháng trước — mẫu số lấp đầy là trọn kỳ.
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: `XE-${vehicleId.slice(-6)}`,
      name: `Vios-${tag}`,
      plateNumber: `51A-${vehicleId.slice(-5)}`,
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW,
      createdAt: new Date(vnMonthStartUtc(NOW, 2).getTime()),
    },
  });

  let seq = 0;
  const mkRequest = (status: string, respondInMs: number) =>
    prisma.bookingRequest.create({
      data: {
        id: newId(),
        tenantId,
        vehicleId,
        status,
        customerName: `Khach-${tag}`,
        customerPhone: `09123457${String(seq++).padStart(2, '0')}`,
        pickupAt: new Date(NOW.getTime() + 5 * DAY),
        returnAt: new Date(NOW.getTime() + 6 * DAY),
        respondBy: new Date(NOW.getTime() + respondInMs),
        decidedAt: status === BOOKING_REQUEST_STATUS.AWAITING_HOLD ? NOW : null,
        decidedBy: status === BOOKING_REQUEST_STATUS.AWAITING_HOLD ? ownerId : null,
      },
    });
  // Hai yêu cầu chờ duyệt: còn 5′ (KHẨN) và còn 50′; một yêu cầu đã nhận, chờ khách trả.
  await mkRequest(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, 50 * MINUTE);
  await mkRequest(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, 5 * MINUTE);
  await mkRequest(BOOKING_REQUEST_STATUS.AWAITING_HOLD, -10 * MINUTE);

  const mkBooking = (
    status: string,
    pickupMs: number,
    returnMs: number,
    extra: { actualPickupMs?: number; actualReturnMs?: number } = {},
  ) => {
    const id = newId();
    return prisma.booking
      .create({
        data: {
          id,
          tenantId,
          vehicleId,
          code: `PD-${id.slice(-6)}`,
          customerName: `Khach-${tag}`,
          status,
          pickupAt: new Date(NOW.getTime() + pickupMs),
          returnAt: new Date(NOW.getTime() + returnMs),
          actualPickupAt:
            extra.actualPickupMs === undefined ? null : new Date(NOW.getTime() + extra.actualPickupMs),
          actualReturnAt:
            extra.actualReturnMs === undefined ? null : new Date(NOW.getTime() + extra.actualReturnMs),
          totalAmount: '1000000',
        },
      })
      .then(() => id);
  };

  // Chờ giao: quá giờ 1h, sau 3h, và 10 ngày nữa (ngoài cửa sổ lịch 7 ngày).
  pickupOverdue = await mkBooking(BOOKING_STATUS.RESERVED, -1 * HOUR, DAY);
  await mkBooking(BOOKING_STATUS.RESERVED, 3 * HOUR, 2 * DAY);
  await mkBooking(BOOKING_STATUS.RESERVED, 10 * DAY, 11 * DAY);
  // Đang thuê: quá hạn trả 2h, và trả sau 1 ngày.
  activeOverdue = await mkBooking(BOOKING_STATUS.ACTIVE, -2 * DAY, -2 * HOUR, { actualPickupMs: -2 * DAY });
  await mkBooking(BOOKING_STATUS.ACTIVE, -1 * DAY, DAY, { actualPickupMs: -1 * DAY });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.bookingRequest.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

/** Số mốc của spec rơi vào HÔM NAY theo ngày lịch VN — đúng ở mọi giờ chạy spec. */
async function expectedToday(field: 'pickupAt' | 'returnAt', status: string[]): Promise<number> {
  const rows = await prisma.booking.findMany({
    where: { tenantId, status: { in: status } },
    select: { pickupAt: true, returnAt: true },
  });
  const today = vnDateKey(NOW);
  return rows.filter((r) => vnDateKey(r[field]) === today).length;
}

describe('Tổng quan partner — việc trong ngày', () => {
  maybe('chờ giao / đang thuê là đúng tập của hai danh sách; quá giờ tính mọi ngày', async () => {
    const res = await dashboard.overview(context(), {}, NOW);

    expect(res.today).toEqual({
      awaitingPickup: 3,
      pickupsToday: await expectedToday('pickupAt', [BOOKING_STATUS.RESERVED]),
      pickupsOverdue: 1,
      active: 2,
      returnsToday: await expectedToday('returnAt', [BOOKING_STATUS.ACTIVE]),
      returnsOverdue: 1,
    });
  });

  maybe('yêu cầu: chờ duyệt + KHẨN theo mốc nhắc cuối + hạn sớm nhất + chờ khách trả', async () => {
    const res = await dashboard.overview(context(), {}, NOW);

    expect(res.requests).toMatchObject({ pending: 2, pendingUrgent: 1, awaitingPayment: 1 });
    // Hạn sớm nhất là yêu cầu còn 5′.
    const next = new Date(res.requests!.nextRespondBy!).getTime();
    expect(Math.abs(next - (NOW.getTime() + 5 * MINUTE))).toBeLessThan(1000);
  });
});

describe('Tổng quan partner — lịch giao/nhận', () => {
  maybe('gộp hai luồng theo giờ hẹn, mốc quá giờ đứng đầu, bỏ mốc ngoài 7 ngày', async () => {
    const res = await dashboard.overview(context(), {}, NOW);
    const items = res.agenda!.items;

    // 2 chờ giao trong cửa sổ + 2 đang thuê; chuyến giao sau 10 ngày nằm ngoài.
    expect(items).toHaveLength(4);
    expect(res.agenda!.hasMore).toBe(false);
    const times = items.map((i) => i.at);
    expect([...times].sort()).toEqual(times);
    expect(items[0]).toMatchObject({ kind: DASHBOARD_AGENDA_KIND.RETURN, bookingId: activeOverdue });
    expect(items[1]).toMatchObject({ kind: DASHBOARD_AGENDA_KIND.PICKUP, bookingId: pickupOverdue });
    expect(items[0]).toMatchObject({ vehicleName: `Vios-${tag}`, customerName: `Khach-${tag}` });
    expect(items.length).toBeLessThanOrEqual(DASHBOARD_AGENDA_LIMIT);
  });
});

describe('Tổng quan partner — tháng này, xu hướng, chợ', () => {
  maybe('lấp đầy tính trên thời gian xe CÓ KHÁCH; số % trong [0, 100]', async () => {
    const res = await dashboard.overview(context(), {}, NOW);
    const month = res.month!;

    expect(month.period).toMatch(/^\d{4}-\d{2}$/);
    expect(month.newBookings).toBeGreaterThanOrEqual(5);
    expect(month.completedTrips).toBe(0);
    // Một xe, đang có khách liên tục từ ít nhất 1 ngày trước ⇒ lấp đầy > 0.
    expect(month.utilizationPercent).not.toBeNull();
    expect(month.utilizationPercent!).toBeGreaterThan(0);
    expect(month.utilizationPercent!).toBeLessThanOrEqual(100);
  });

  maybe('xe chờ duyệt đếm vào `inReview`; chưa có tin đăng ⇒ onMarket 0', async () => {
    const res = await dashboard.overview(context(), {}, NOW);
    expect(res.market).toEqual({ onMarket: 0, inReview: 1, needsRevision: 0, draft: 0 });
  });

  maybe('tuyến gói có sổ tổng hợp ⇒ trend đủ tháng, cũ → mới, tháng cuối là tháng này', async () => {
    const res = await dashboard.overview(context(), {}, NOW);
    expect(res.trend).toHaveLength(DASHBOARD_TREND_MONTHS);
    expect(res.trend!.at(-1)!.period).toBe(res.month!.period);
    expect(res.trend!.at(-1)!.newBookings).toBe(res.month!.newBookings);
  });

  maybe('uy tín luôn có mặt — cùng hình dạng với chỉ số công khai', async () => {
    const res = await dashboard.overview(context(), {}, NOW);
    expect(res.reputation).toHaveProperty('sampleCount');
    expect(res.reputation).toHaveProperty('responseRatePercent');
  });
});

describe('Tổng quan partner — quyền, tuyến, phạm vi', () => {
  maybe('tuyến HOA HỒNG không có báo cáo theo kỳ (ADR 0027 điều 1), dù gói báo finance', async () => {
    const res = await dashboard.overview(
      context({ billingMode: BILLING_MODE.COMMISSION, onboardingState: SHOP_ONBOARDING_STATE.COMMISSION }),
      {},
      NOW,
    );
    expect(res.trend).toBeNull();
    // Phần vận hành vẫn đủ — chủ xe cá nhân cũng có việc trong ngày.
    expect(res.today).not.toBeNull();
    expect(res.month).not.toBeNull();
  });

  maybe('gói không có sổ tổng hợp (finance hidden) ⇒ trend null', async () => {
    const base = context();
    const res = await dashboard.overview(
      context({ features: { ...base.features, [PLAN_FEATURE.FINANCE]: FEATURE_STATE.HIDDEN } }),
      {},
      NOW,
    );
    expect(res.trend).toBeNull();
  });

  maybe('thiếu quyền ⇒ khối đó null, không phải 0', async () => {
    const only = (...keep: Permission[]) => context({ permissions: keep });
    const res = await dashboard.overview(only(PERMISSION.TENANT_VIEW), {}, NOW);
    expect(res).toMatchObject({
      today: null,
      requests: null,
      agenda: null,
      month: null,
      trend: null,
      market: null,
    });

    const withRequests = await dashboard.overview(
      only(PERMISSION.TENANT_VIEW, PERMISSION.BOOKING_REQUEST_VIEW),
      {},
      NOW,
    );
    expect(withRequests.requests).not.toBeNull();
    expect(withRequests.today).toBeNull();
  });

  maybe('phiên hỗ trợ chỉ có năng lực xem đơn (⇒ đúng `bookings.view`): vẫn có việc + lịch + uy tín', async () => {
    // `SUPPORT_CAPABILITY_PERMISSIONS[booking.view]` = [`bookings.view`] — không có `tenants.view`.
    const res = await dashboard.overview(
      context({ permissions: [PERMISSION.BOOKING_VIEW], roleKey: TENANT_ROLE.SHOP_VIEWER }),
      {},
      NOW,
    );
    expect(res.today).not.toBeNull();
    expect(res.agenda).not.toBeNull();
    expect(res.requests).toBeNull();
    expect(res.market).toBeNull();
    expect(res.reputation).toHaveProperty('sampleCount');
  });

  maybe('được giao mảng chi nhánh RỖNG ⇒ không thấy gì (fail-closed, ADR 0052)', async () => {
    const res = await dashboard.overview(context({ allowedBranchIds: [] }), {}, NOW);
    expect(res.today).toMatchObject({ awaitingPickup: 0, active: 0 });
    expect(res.requests).toMatchObject({ pending: 0, awaitingPayment: 0 });
    expect(res.agenda!.items).toHaveLength(0);
    expect(res.month!.utilizationPercent).toBeNull();
  });
});
