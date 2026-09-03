import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  BILLING_MODE,
  FEATURE_STATE,
  PLAN_FEATURE,
  PLAN_FEATURE_VALUES,
  PLAN_STATUS,
  SUBSCRIPTION_STATUS,
} from '@xeprime/types';
import {
  currentSubscriptionWhere,
  featureStatesFrom,
  planFeatureFlags,
  resolveTenantFeatures,
} from '../src/common/plan/feature-state';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * W3 LÔ 1 — trục NĂNG LỰC theo gói (ADR 0027 điều 3 và 5).
 *
 * Ba điều được khoá ở đây, và cả ba đều là chỗ dễ hỏng nhất:
 *
 *  1. **Ma trận ba trạng thái** — `enabled` / `read_only` / `hidden` suy đúng từ (cờ gói × cờ đã
 *     dùng), và luôn trả ĐỦ 8 mục (vắng mặt ≠ hidden).
 *  2. **`limits_json` hỏng KHÔNG được ném.** Hàm này chạy trong guard toàn cục — một jsonb rác
 *     của một tenant mà làm 500 thì tenant đó không đăng nhập nổi.
 *  3. **Năng lực KHÔNG đóng băng** (ADR 0027 điều 5, khác hẳn ADR 0024): chèn một dòng
 *     subscription mới thì `read_only → enabled` ngay ở lượt đọc kế tiếp, không chờ gì cả.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const RUN = newId().slice(-8).toLowerCase();

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let planId: string;

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
  planId = newId();
  await prisma.user.create({
    data: { id: ownerId, displayName: 'Feature Owner', email: `feat-${RUN}@xeprime.test` },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `FeatShop-${RUN}`,
      status: 'active',
      ownerUserId: ownerId,
      // Đã từng dùng sổ thu chi ở kỳ trước — đây là điều kiện của `read_only`.
      usedFeatures: [PLAN_FEATURE.FINANCE],
    },
  });
  await prisma.plan.create({
    data: {
      id: planId,
      code: `feat-${RUN}`,
      name: 'Gói có cờ',
      status: PLAN_STATUS.ACTIVE,
      billingMode: BILLING_MODE.PACKAGE,
      basePriceMonthly: 0,
      durationDays: 30,
      limitsJson: { features: [PLAN_FEATURE.FINANCE, PLAN_FEATURE.BRANCHES] },
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.tenantSubscription.deleteMany({ where: { tenantId } });
    await prisma.plan.deleteMany({ where: { id: planId } });
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

describe('planFeatureFlags — parser phòng thủ (ADR 0027 điều 4)', () => {
  it('NULL / kiểu lạ / features rác → tập RỖNG, KHÔNG ném', () => {
    for (const bad of [null, undefined, 'chuỗi', 42, [], { features: 'finance' }, { features: 7 }]) {
      expect(() => planFeatureFlags(bad)).not.toThrow();
      expect(planFeatureFlags(bad).size).toBe(0);
    }
  });

  it('chuỗi lạ trong features bị BỎ, cờ hợp lệ giữ nguyên', () => {
    const flags = planFeatureFlags({ features: ['finance', 'hack_the_planet', 42, null] });
    expect([...flags]).toEqual([PLAN_FEATURE.FINANCE]);
  });
});

describe('featureStatesFrom — ma trận ba trạng thái (ADR 0027 điều 3)', () => {
  it('luôn đủ 8 mục, kể cả hidden — vắng mặt KHÁC hidden', () => {
    const states = featureStatesFrom(new Set(), []);
    expect(Object.keys(states).sort()).toEqual([...PLAN_FEATURE_VALUES].sort());
    expect(Object.values(states).every((s) => s === FEATURE_STATE.HIDDEN)).toBe(true);
  });

  it('có cờ → enabled; không cờ + đã dùng → read_only; không cờ + chưa dùng → hidden', () => {
    const states = featureStatesFrom(new Set([PLAN_FEATURE.FINANCE]), [
      PLAN_FEATURE.FINANCE,
      PLAN_FEATURE.DRIVERS,
    ]);
    expect(states[PLAN_FEATURE.FINANCE]).toBe(FEATURE_STATE.ENABLED);
    expect(states[PLAN_FEATURE.DRIVERS]).toBe(FEATURE_STATE.READ_ONLY);
    expect(states[PLAN_FEATURE.CONTRACTS]).toBe(FEATURE_STATE.HIDDEN);
  });

  it('có cờ thì ENABLED bất kể đã dùng hay chưa — cột usedFeatures KHÔNG cấp quyền', () => {
    const states = featureStatesFrom(new Set([PLAN_FEATURE.BRANCHES]), []);
    expect(states[PLAN_FEATURE.BRANCHES]).toBe(FEATURE_STATE.ENABLED);
  });

  it('chuỗi lạ trong usedFeatures bị bỏ qua, không làm lệch trạng thái nào', () => {
    const states = featureStatesFrom(new Set(), ['finance', 'không_phải_cờ']);
    expect(states[PLAN_FEATURE.FINANCE]).toBe(FEATURE_STATE.READ_ONLY);
    expect(Object.keys(states)).toHaveLength(PLAN_FEATURE_VALUES.length);
  });
});

describe('gói hiện hành trên PostgreSQL thật', () => {
  maybe('chưa có gói: cờ đã dùng → read_only, còn lại hidden; planCode/planEndsAt null', async () => {
    const current = await currentSubscription();
    expect(current).toBeNull();

    const plan = resolveTenantFeatures(current, [PLAN_FEATURE.FINANCE]);
    expect(plan.planCode).toBeNull();
    expect(plan.planEndsAt).toBeNull();
    expect(plan.features[PLAN_FEATURE.FINANCE]).toBe(FEATURE_STATE.READ_ONLY);
    expect(plan.features[PLAN_FEATURE.MAINTENANCE]).toBe(FEATURE_STATE.HIDDEN);
  });

  maybe(
    'ADR 0027 điều 5: chèn subscription mới ⇒ read_only → enabled NGAY lượt đọc kế tiếp',
    async () => {
      await prisma.tenantSubscription.create({
        data: {
          id: newId(),
          tenantId,
          planId,
          status: SUBSCRIPTION_STATUS.ACTIVE,
          price: 0,
          termMonths: 1,
          billingMode: BILLING_MODE.PACKAGE,
          startsAt: new Date(Date.now() - 60_000),
          endsAt: new Date(Date.now() + 30 * 86_400_000),
        },
      });

      const plan = resolveTenantFeatures(await currentSubscription(), [PLAN_FEATURE.FINANCE]);
      expect(plan.planCode).toBe(`feat-${RUN}`);
      expect(plan.planEndsAt).toBeInstanceOf(Date);
      // Không cache, không đóng băng — đây là điểm KHÁC ADR 0024.
      expect(plan.features[PLAN_FEATURE.FINANCE]).toBe(FEATURE_STATE.ENABLED);
      expect(plan.features[PLAN_FEATURE.BRANCHES]).toBe(FEATURE_STATE.ENABLED);
      // Cờ không có trong gói vẫn hidden dù gói đang hiệu lực.
      expect(plan.features[PLAN_FEATURE.DRIVERS]).toBe(FEATURE_STATE.HIDDEN);
    },
  );

  maybe('gói HẾT HẠN không còn là gói hiện hành ⇒ tụt về read_only', async () => {
    await prisma.tenantSubscription.updateMany({
      where: { tenantId },
      data: { endsAt: new Date(Date.now() - 1_000) },
    });

    const plan = resolveTenantFeatures(await currentSubscription(), [PLAN_FEATURE.FINANCE]);
    expect(plan.planCode).toBeNull();
    expect(plan.features[PLAN_FEATURE.FINANCE]).toBe(FEATURE_STATE.READ_ONLY);
    expect(plan.features[PLAN_FEATURE.BRANCHES]).toBe(FEATURE_STATE.HIDDEN);
  });

  maybe('limits_json HỎNG trong DB không làm sập đường đọc', async () => {
    await prisma.plan.update({
      where: { id: planId },
      data: { limitsJson: 'không phải object' },
    });
    await prisma.tenantSubscription.updateMany({
      where: { tenantId },
      data: { endsAt: new Date(Date.now() + 30 * 86_400_000) },
    });

    const current = await currentSubscription();
    expect(() => resolveTenantFeatures(current, [PLAN_FEATURE.FINANCE])).not.toThrow();
    const plan = resolveTenantFeatures(current, [PLAN_FEATURE.FINANCE]);
    // Gói vẫn là gói hiện hành, chỉ là không cờ nào đọc được → không ai bị 500, không ai mất
    // quyền XEM sổ cũ.
    expect(plan.planCode).toBe(`feat-${RUN}`);
    expect(plan.features[PLAN_FEATURE.FINANCE]).toBe(FEATURE_STATE.READ_ONLY);
  });
});

/** Đọc gói hiện hành đúng bằng `select` mà guard và `me()` dùng. */
function currentSubscription() {
  return asService.tenantSubscription.findFirst({
    where: { tenantId, ...currentSubscriptionWhere(new Date()) },
    orderBy: { endsAt: 'desc' },
    select: { endsAt: true, plan: { select: { code: true, limitsJson: true } } },
  });
}
