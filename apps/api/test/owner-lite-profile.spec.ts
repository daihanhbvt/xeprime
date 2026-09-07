import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BILLING_MODE,
  FEATURE_STATE,
  FULL_MANAGE_FEATURES,
  OWNER_LITE_FEATURES,
  PLAN_FEATURE,
  PLAN_STATUS,
  SUBSCRIPTION_STATUS,
  type PlanFeature,
} from '@xeprime/types';
import { PLAN_FEATURE_KEY } from '../src/common/decorators';
import { PlanFeatureGuard } from '../src/common/guards/plan-feature.guard';
import {
  currentSubscriptionWhere,
  resolveTenantFeatures,
} from '../src/common/plan/feature-state';

/**
 * BA HỒ SƠ của gate Owner Lite (R3 — ADR 0027 điều 1/3, ADR 0028 điều 1), trên PostgreSQL THẬT.
 *
 * Vì sao spec này tồn tại, và vì sao nó phải chạm database: toàn bộ hạ tầng năng lực — guard,
 * `resolveTenantFeatures`, `useFeature`, bộ lọc menu — đã đúng từ lâu và có test riêng. Thứ SAI
 * là **dữ liệu gói**: bậc `commission` được seed với đủ cả bảy cờ, nên chủ xe cơ bản mở đúng bằng
 * gian hàng thuê bao và hai bậc của ADR 0027 không tồn tại trên thực tế. Không một test hàm thuần
 * nào bắt được điều đó, vì tất cả đều tự dựng lấy cờ đầu vào.
 *
 * Ở đây đi đúng đường mà một request thật đi: **dòng `plans` trong database → gói hiện hành →
 * `resolveTenantFeatures` → `PlanFeatureGuard`**. Cờ đầu vào lấy từ `FULL_MANAGE_FEATURES` /
 * `OWNER_LITE_FEATURES` — cùng hai hằng mà seed dùng — nên spec đỏ khi ranh giới bậc bị nới lại.
 */
const prisma = createPrismaClient();
const RUN = newId().slice(-8).toLowerCase();

let dbAvailable = false;
let ownerId: string;
let commissionPlanId: string;
let packagePlanId: string;
/** Basic mới · Basic có dữ liệu cũ · gói còn hiệu lực. */
let basicNewId: string;
let basicLegacyId: string;
let packagedId: string;

/** Tính năng dùng làm ví dụ xuyên suốt — sổ thu chi là thứ ADR 0027 nhắc đến nhiều nhất. */
const SAMPLE: PlanFeature = PLAN_FEATURE.FINANCE;

async function mkTenant(tag: string, usedFeatures: PlanFeature[]): Promise<string> {
  const id = newId();
  await prisma.tenant.create({
    data: {
      id,
      code: `T-${id.slice(-8)}`,
      slug: `t-${id.toLowerCase().slice(-10)}`,
      name: `OwnerLite-${tag}-${RUN}`,
      status: 'active',
      ownerUserId: ownerId,
      usedFeatures,
    },
  });
  return id;
}

/** Gói hiện hành của tenant — đúng cửa sổ mà `currentSubscriptionWhere` định nghĩa. */
async function subscribe(tenantId: string, planId: string, billingMode: string): Promise<void> {
  const now = new Date();
  await prisma.tenantSubscription.create({
    data: {
      id: newId(),
      tenantId,
      planId,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      price: 0,
      termMonths: 12,
      billingMode,
      startsAt: new Date(now.getTime() - 60_000),
      endsAt: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
    },
  });
}

/** Đọc trạng thái năng lực đúng cách `TenantScopeGuard` đọc — không đi tắt. */
async function profileOf(tenantId: string) {
  const tenant = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: {
      usedFeatures: true,
      subscriptions: {
        where: currentSubscriptionWhere(new Date()),
        orderBy: { endsAt: 'desc' },
        take: 1,
        select: { endsAt: true, plan: { select: { code: true, limitsJson: true } } },
      },
    },
  });
  return resolveTenantFeatures(tenant.subscriptions[0] ?? null, tenant.usedFeatures);
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
  commissionPlanId = newId();
  packagePlanId = newId();

  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ xe', email: `ol-${RUN}@xeprime.test` },
  });

  // Hai bậc gói dựng từ CHÍNH hai hằng mà seed dùng.
  await prisma.plan.create({
    data: {
      id: commissionPlanId,
      code: `ol-commission-${RUN}`,
      name: 'Hoa hồng theo chuyến',
      status: PLAN_STATUS.ACTIVE,
      billingMode: BILLING_MODE.COMMISSION,
      commissionPercent: 10,
      basePriceMonthly: 0,
      durationDays: 30,
      limitsJson: { features: [...OWNER_LITE_FEATURES] },
    },
  });
  await prisma.plan.create({
    data: {
      id: packagePlanId,
      code: `ol-package-${RUN}`,
      name: 'Gói theo xe',
      status: PLAN_STATUS.ACTIVE,
      billingMode: BILLING_MODE.PACKAGE,
      basePriceMonthly: 0,
      durationDays: 30,
      limitsJson: { features: [...FULL_MANAGE_FEATURES] },
    },
  });

  basicNewId = await mkTenant('new', []);
  basicLegacyId = await mkTenant('legacy', [PLAN_FEATURE.FINANCE, PLAN_FEATURE.DEBTS]);
  packagedId = await mkTenant('packaged', []);

  await subscribe(basicNewId, commissionPlanId, BILLING_MODE.COMMISSION);
  await subscribe(basicLegacyId, commissionPlanId, BILLING_MODE.COMMISSION);
  await subscribe(packagedId, packagePlanId, BILLING_MODE.PACKAGE);
});

afterAll(async () => {
  if (dbAvailable) {
    const ids = [basicNewId, basicLegacyId, packagedId].filter(Boolean);
    await prisma.tenantSubscription.deleteMany({ where: { tenantId: { in: ids } } });
    await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
    await prisma.plan.deleteMany({ where: { id: { in: [commissionPlanId, packagePlanId] } } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('hồ sơ 1 — Basic MỚI: chỉ thấy Owner Lite', () => {
  maybe('mọi tính năng nâng cao đều HIDDEN', async () => {
    const { features, planCode } = await profileOf(basicNewId);
    expect(planCode).toBe(`ol-commission-${RUN}`);
    for (const feature of FULL_MANAGE_FEATURES) {
      expect(features[feature]).toBe(FEATURE_STATE.HIDDEN);
    }
  });

  maybe('gói hoa hồng KHÔNG mở bằng gói thuê bao — đây chính là lỗi dữ liệu đã trượt', async () => {
    const basic = await profileOf(basicNewId);
    const packaged = await profileOf(packagedId);
    expect(basic.features).not.toEqual(packaged.features);
  });
});

describe('hồ sơ 2 — Basic CÓ DỮ LIỆU CŨ: read_only, không mất quyền xem', () => {
  maybe('tính năng đã từng dùng ⇒ READ_ONLY; chưa từng dùng ⇒ HIDDEN', async () => {
    const { features } = await profileOf(basicLegacyId);
    expect(features[PLAN_FEATURE.FINANCE]).toBe(FEATURE_STATE.READ_ONLY);
    expect(features[PLAN_FEATURE.DEBTS]).toBe(FEATURE_STATE.READ_ONLY);
    // `read_only` KHÔNG lan sang cả bộ — họ chỉ giữ lại đúng thứ đã có dữ liệu.
    expect(features[PLAN_FEATURE.DRIVERS]).toBe(FEATURE_STATE.HIDDEN);
    expect(features[PLAN_FEATURE.BRANCHES]).toBe(FEATURE_STATE.HIDDEN);
  });

  maybe('gia hạn lên gói ⇒ mở lại NGAY ở lượt đọc kế tiếp (ADR 0027 điều 5)', async () => {
    const tenantId = await mkTenant('renew', [PLAN_FEATURE.FINANCE]);
    await subscribe(tenantId, commissionPlanId, BILLING_MODE.COMMISSION);
    expect((await profileOf(tenantId)).features[SAMPLE]).toBe(FEATURE_STATE.READ_ONLY);

    // Không đóng băng, không job nào phải chạy: chèn dòng gói mới là xong.
    await subscribe(tenantId, packagePlanId, BILLING_MODE.PACKAGE);
    expect((await profileOf(tenantId)).features[SAMPLE]).toBe(FEATURE_STATE.ENABLED);

    await prisma.tenantSubscription.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });
});

describe('hồ sơ 3 — gói còn hiệu lực: Full Manage', () => {
  maybe('mọi tính năng nâng cao đều ENABLED', async () => {
    const { features } = await profileOf(packagedId);
    for (const feature of FULL_MANAGE_FEATURES) {
      expect(features[feature]).toBe(FEATURE_STATE.ENABLED);
    }
  });
});

/**
 * Gate điều 4: **gọi thẳng API không vượt được guard.**
 *
 * Guard được nạp bằng trạng thái ĐỌC TỪ DATABASE ở trên, không phải bằng một object dựng tay —
 * đó là chỗ khác biệt với `plan-feature-guard.spec.ts` (vốn kiểm ma trận method × trạng thái).
 */
describe('gate — gọi thẳng endpoint nâng cao', () => {
  const guardWith = (mode: string) =>
    new PlanFeatureGuard(new Reflector(), {
      get: (key: string) => (key === 'PLAN_FEATURE_ENFORCEMENT' ? mode : undefined),
    } as unknown as ConfigService);

  function ctx(features: Record<string, string>, method: string): ExecutionContext {
    const handler = function receipts() {};
    Reflect.defineMetadata(PLAN_FEATURE_KEY, SAMPLE, handler);
    return {
      getHandler: () => handler,
      getClass: () => class ReceiptsController {},
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          url: '/receipts',
          tenant: { tenantId: 'x', planCode: 'p', planEndsAt: null, features },
        }),
      }),
    } as unknown as ExecutionContext;
  }

  maybe('Basic mới + POST /receipts ⇒ FEATURE_NOT_IN_PLAN', async () => {
    const { features } = await profileOf(basicNewId);
    expect(() => guardWith('on').canActivate(ctx(features, 'POST'))).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: API_ERROR_CODE.FEATURE_NOT_IN_PLAN }),
      }),
    );
  });

  maybe('Basic có dữ liệu cũ: ĐỌC qua, GHI bị chặn bằng FEATURE_READ_ONLY', async () => {
    const { features } = await profileOf(basicLegacyId);
    // Đọc phải qua — "không ai mất quyền xem sổ sách của chính mình" (ADR 0027 điều 3).
    expect(guardWith('on').canActivate(ctx(features, 'GET'))).toBe(true);
    expect(() => guardWith('on').canActivate(ctx(features, 'POST'))).toThrow(ForbiddenException);
    expect(() => guardWith('on').canActivate(ctx(features, 'POST'))).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: API_ERROR_CODE.FEATURE_READ_ONLY }),
      }),
    );
  });

  maybe('gói còn hiệu lực: đọc lẫn ghi đều qua', async () => {
    const { features } = await profileOf(packagedId);
    expect(guardWith('on').canActivate(ctx(features, 'GET'))).toBe(true);
    expect(guardWith('on').canActivate(ctx(features, 'POST'))).toBe(true);
  });

  maybe('⚠️ mặc định `warn` KHÔNG chặn ai — đợt này ship mà chưa khoá sổ của ai', async () => {
    // Điều kiện an toàn của rollout: migration siết dữ liệu gói, nhưng cổng chặn vẫn mở cho tới
    // khi vận hành quyết định bật `on` theo docs/deployment.md §9.4b.
    const { features } = await profileOf(basicNewId);
    expect(guardWith('warn').canActivate(ctx(features, 'POST'))).toBe(true);
  });
});
