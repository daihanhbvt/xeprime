import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  BILLING_MODE,
  BILLING_PHASE,
  FEATURE_STATE,
  PLAN_FEATURE,
  PLAN_FEATURE_VALUES,
  PLAN_STATUS,
  SUBSCRIPTION_STATUS,
  isSubscriptionTrack,
} from '@xeprime/types';
import {
  EFFECTIVE_SUBSCRIPTION_ARGS,
  effectiveSubscriptionWhere,
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
const DAY = 86_400_000;

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

describe('featureStatesFrom — ba trạng thái, có gác bằng featuresActive (ADR 0027 điều 3, sửa 15/09/2026)', () => {
  it('luôn đủ 8 mục, kể cả hidden — vắng mặt KHÁC hidden', () => {
    const states = featureStatesFrom(new Set(), [], true);
    expect(Object.keys(states).sort()).toEqual([...PLAN_FEATURE_VALUES].sort());
    expect(Object.values(states).every((s) => s === FEATURE_STATE.HIDDEN)).toBe(true);
  });

  it('có cờ → enabled; không cờ + đã dùng → read_only; không cờ + chưa dùng → hidden', () => {
    const states = featureStatesFrom(
      new Set([PLAN_FEATURE.FINANCE]),
      [PLAN_FEATURE.FINANCE, PLAN_FEATURE.DRIVERS],
      true,
    );
    expect(states[PLAN_FEATURE.FINANCE]).toBe(FEATURE_STATE.ENABLED);
    expect(states[PLAN_FEATURE.DRIVERS]).toBe(FEATURE_STATE.READ_ONLY);
    expect(states[PLAN_FEATURE.CONTRACTS]).toBe(FEATURE_STATE.HIDDEN);
  });

  it('có cờ thì ENABLED bất kể đã dùng hay chưa — cột usedFeatures KHÔNG cấp quyền', () => {
    const states = featureStatesFrom(new Set([PLAN_FEATURE.BRANCHES]), [], true);
    expect(states[PLAN_FEATURE.BRANCHES]).toBe(FEATURE_STATE.ENABLED);
  });

  it('chuỗi lạ trong usedFeatures bị bỏ qua, không làm lệch trạng thái nào', () => {
    const states = featureStatesFrom(new Set(), ['finance', 'không_phải_cờ'], true);
    expect(states[PLAN_FEATURE.FINANCE]).toBe(FEATURE_STATE.READ_ONLY);
    expect(Object.keys(states)).toHaveLength(PLAN_FEATURE_VALUES.length);
  });

  /*
   * QUYẾT ĐỊNH 15/09/2026 — ghi đè ADR 0027 điều 3 trong phạm vi HẾT GÓI.
   *
   * `read_only` ra đời cho ca HẠ BẬC gói (vẫn còn thuê bao, mất một cờ) và nó giữ nguyên ở ba
   * test trên. Ca HẾT gói + HẾT ân hạn thì khác hẳn: tenant đã rơi về tuyến hoa hồng, và tuyến
   * đó không có bộ quản lý nâng cao ở bất kỳ chế độ nào — kể cả chỉ-xem.
   */
  it('allowReadOnly = false ⇒ HIDDEN, kể cả tính năng ĐÃ TỪNG dùng', () => {
    // Đúng hình dạng của một gói hoa hồng: `features: []`, nhưng tenant có dữ liệu cũ.
    const states = featureStatesFrom(new Set(), [PLAN_FEATURE.FINANCE, PLAN_FEATURE.DEBTS], false);
    expect(Object.values(states).every((s) => s === FEATURE_STATE.HIDDEN)).toBe(true);
  });

  it('allowReadOnly = false chỉ tắt trạng thái GIỮA — cờ có trong gói vẫn ENABLED', () => {
    const states = featureStatesFrom(
      new Set([PLAN_FEATURE.FINANCE]),
      [PLAN_FEATURE.FINANCE, PLAN_FEATURE.DEBTS],
      false,
    );
    expect(states[PLAN_FEATURE.FINANCE]).toBe(FEATURE_STATE.ENABLED);
    expect(states[PLAN_FEATURE.DEBTS]).toBe(FEATURE_STATE.HIDDEN);
  });
});


/*
 * ═══════════════════════════════════════════════════════════════════════════
 * NĂM MỐC của vòng đời gói, trên PostgreSQL thật.
 *
 * Đây là bộ test của F1. Mỗi mốc khẳng định BỐN giá trị cùng lúc, vì lỗi cũ không nằm ở giá trị
 * nào riêng lẻ mà nằm ở chỗ chúng NÓI NGƯỢC NHAU: tiền chạy theo nhánh `package` (miễn phí) còn
 * giao diện chạy theo nhánh hoa hồng, về cùng một tenant, trong cùng một khoảnh khắc.
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe('năm mốc vòng đời gói trên PostgreSQL thật (F1)', () => {
  /** Đặt `ends_at` của dòng thuê bao rồi đọc lại đúng bằng `select` mà guard và `me()` dùng. */
  async function atMilestone(endsAt: Date) {
    await prisma.tenantSubscription.updateMany({ where: { tenantId }, data: { endsAt } });
    const row = await asService.tenantSubscription.findFirst({
      where: { tenantId, ...effectiveSubscriptionWhere(new Date()) },
      ...EFFECTIVE_SUBSCRIPTION_ARGS,
    });
    return resolveTenantFeatures(row, [PLAN_FEATURE.FINANCE]);
  }

  beforeEach(async () => {
    if (!dbAvailable) return;
    await prisma.tenantSubscription.deleteMany({ where: { tenantId } });
    await prisma.plan.update({
      where: { id: planId },
      data: { limitsJson: { features: [PLAN_FEATURE.FINANCE, PLAN_FEATURE.BRANCHES], graceDays: 7 } },
    });
    await prisma.tenantSubscription.create({
      data: {
        id: newId(),
        tenantId,
        planId,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        price: 0,
        termMonths: 1,
        billingMode: BILLING_MODE.PACKAGE,
        startsAt: new Date(Date.now() - 30 * DAY),
        endsAt: new Date(Date.now() + DAY),
      },
    });
  });

  maybe('1 · TRƯỚC hết hạn — tuyến gói, năng lực đủ, vào Manage được', async () => {
    const plan = await atMilestone(new Date(Date.now() + DAY));
    expect(plan.phase).toBe(BILLING_PHASE.CURRENT);
    expect(plan.billingMode).toBe(BILLING_MODE.PACKAGE);
    expect(plan.features[PLAN_FEATURE.FINANCE]).toBe(FEATURE_STATE.ENABLED);
    expect(isSubscriptionTrack(plan.billing)).toBe(true);
  });

  maybe('2 · ĐÚNG lúc hết hạn — KHÔNG rơi về hoa hồng, ân hạn bắt đầu', async () => {
    const plan = await atMilestone(new Date(Date.now() - 1_000));
    expect(plan.phase).toBe(BILLING_PHASE.GRACE);
    // Đây là dòng khoá lỗi cũ: trước 15/09 `planCode` về null và tenant "không có gói".
    expect(plan.planCode).toBe(`feat-${RUN}`);
    expect(plan.billingMode).toBe(BILLING_MODE.PACKAGE);
    expect(plan.features[PLAN_FEATURE.FINANCE]).toBe(FEATURE_STATE.ENABLED);
    expect(plan.graceEndsAt).toBeInstanceOf(Date);
  });

  maybe('3 · TRONG ân hạn — mọi thứ giữ nguyên, đúng như tin nhắn đã hứa', async () => {
    const plan = await atMilestone(new Date(Date.now() - 3 * DAY));
    expect(plan.phase).toBe(BILLING_PHASE.GRACE);
    expect(plan.billingMode).toBe(BILLING_MODE.PACKAGE);
    expect(isSubscriptionTrack(plan.billing)).toBe(true);
    expect(plan.features[PLAN_FEATURE.BRANCHES]).toBe(FEATURE_STATE.ENABLED);
  });

  /*
   * Mốc 4 là chỗ quyết định 6 ghi đè ADR 0027 điều 3: KHÔNG còn `read_only` sau khi hết ân hạn.
   * Tenant này có `usedFeatures = [finance]`, tức là đúng điều kiện sinh `read_only` ở bản cũ.
   */
  maybe('4 · SAU ân hạn, TRƯỚC khi worker chạy — hoa hồng NGAY, và HIDDEN chứ không read_only', async () => {
    const plan = await atMilestone(new Date(Date.now() - 8 * DAY));
    expect(plan.phase).toBe(BILLING_PHASE.LAPSED);
    expect(plan.billingMode).toBe(BILLING_MODE.COMMISSION);
    expect(isSubscriptionTrack(plan.billing)).toBe(false);
    expect(plan.features[PLAN_FEATURE.FINANCE]).toBe(FEATURE_STATE.HIDDEN);
    expect(plan.features[PLAN_FEATURE.BRANCHES]).toBe(FEATURE_STATE.HIDDEN);
  });

  maybe('5 · SAU khi worker nối dòng hoa hồng — cùng một câu trả lời, không có bước nhảy', async () => {
    await atMilestone(new Date(Date.now() - 8 * DAY));
    const lapsedEndsAt = new Date(Date.now() - 8 * DAY);
    const graceEndsAt = new Date(lapsedEndsAt.getTime() + 7 * DAY);
    // Đúng dòng mà `lapseToCommission` ghi: nối liền từ mốc hết ân hạn, không từ `now`.
    const commissionPlanId = newId();
    await prisma.plan.create({
      data: {
        id: commissionPlanId,
        code: `feat-comm-${RUN}`,
        name: 'Hoa hồng',
        status: PLAN_STATUS.ACTIVE,
        billingMode: BILLING_MODE.COMMISSION,
        commissionPercent: 10,
        basePriceMonthly: 0,
        limitsJson: { features: [], graceDays: 7 },
      },
    });
    await prisma.tenantSubscription.create({
      data: {
        id: newId(),
        tenantId,
        planId: commissionPlanId,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        price: 0,
        termMonths: 12,
        billingMode: BILLING_MODE.COMMISSION,
        commissionPercent: 10,
        startsAt: graceEndsAt,
        endsAt: new Date(graceEndsAt.getTime() + 365 * DAY),
      },
    });

    const row = await asService.tenantSubscription.findFirst({
      where: { tenantId, ...effectiveSubscriptionWhere(new Date()) },
      ...EFFECTIVE_SUBSCRIPTION_ARGS,
    });
    const plan = resolveTenantFeatures(row, [PLAN_FEATURE.FINANCE]);

    // Worker chạy KHÔNG làm đổi câu trả lời — mốc 4 và mốc 5 phải giống hệt nhau về tuyến và
    // năng lực. Nếu khác, nghĩa là có một cửa sổ mà hành vi phụ thuộc việc job đã chạy hay chưa.
    expect(plan.phase).toBe(BILLING_PHASE.CURRENT);
    expect(plan.billingMode).toBe(BILLING_MODE.COMMISSION);
    expect(isSubscriptionTrack(plan.billing)).toBe(false);
    expect(Object.values(plan.features).every((s) => s === FEATURE_STATE.HIDDEN)).toBe(true);

    await prisma.tenantSubscription.deleteMany({ where: { planId: commissionPlanId } });
    await prisma.plan.deleteMany({ where: { id: commissionPlanId } });
  });

  maybe('limits_json HỎNG trong DB không làm sập đường đọc', async () => {
    await prisma.plan.update({ where: { id: planId }, data: { limitsJson: 'không phải object' } });
    const plan = await atMilestone(new Date(Date.now() + 30 * DAY));
    // Gói vẫn là gói hiện hành, chỉ là không cờ nào đọc được → không ai bị 500.
    expect(plan.planCode).toBe(`feat-${RUN}`);
    expect(plan.phase).toBe(BILLING_PHASE.CURRENT);
    // Không cờ nào đọc được, nhưng tenant VẪN ở tuyến gói ⇒ sổ đã dùng vẫn xem lại được.
    expect(plan.features[PLAN_FEATURE.FINANCE]).toBe(FEATURE_STATE.READ_ONLY);
    expect(plan.features[PLAN_FEATURE.BRANCHES]).toBe(FEATURE_STATE.HIDDEN);
  });

  maybe('dòng thuê bao thiếu billing_mode ⇒ unconfigured, KHÔNG đoán thành tuyến gói', async () => {
    await prisma.tenantSubscription.updateMany({ where: { tenantId }, data: { billingMode: null } });
    const plan = await atMilestone(new Date(Date.now() + DAY));
    expect(plan.phase).toBe(BILLING_PHASE.UNCONFIGURED);
    expect(plan.billingMode).toBeNull();
    expect(isSubscriptionTrack(plan.billing)).toBe(false);
  });
});
