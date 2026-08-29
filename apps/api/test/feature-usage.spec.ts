import { Reflector } from '@nestjs/core';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  FEATURE_STATE,
  PLAN_FEATURE,
  PLAN_FEATURE_VALUES,
  type FeatureState,
  type PlanFeature,
} from '@xeprime/types';
import { firstValueFrom, of, throwError } from 'rxjs';
import { PLAN_FEATURE_KEY } from '../src/common/decorators';
import { FeatureUsageInterceptor } from '../src/common/interceptors/feature-usage.interceptor';
import type { RequestContext, TenantContext } from '../src/common/types/request-context';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * W3 LÔ 2 — `FeatureUsageInterceptor` trên PostgreSQL THẬT.
 *
 * Bất biến quan trọng nhất và cũng là lý do đây phải là interceptor chứ không phải guard:
 * **request trả 4xx KHÔNG được đánh dấu "đã dùng"**. Guard chạy trước `ValidationPipe`, nên một
 * lần bấm nhầm trả 400 sẽ để lại cờ VĨNH VIỄN (`hidden → read_only`, không có đường lùi).
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const reflector = new Reflector();
const interceptor = new FeatureUsageInterceptor(reflector, asService);

const RUN = newId().slice(-8).toLowerCase();

let dbAvailable = false;
let ownerId: string;
let tenantId: string;

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
  await prisma.user.create({
    data: { id: ownerId, displayName: 'Usage Owner', email: `usage-${RUN}@xeprime.test` },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `UsageShop-${RUN}`,
      status: 'active',
      ownerUserId: ownerId,
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
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

function tenantCtx(state: FeatureState, used: PlanFeature[] = []): TenantContext {
  const features = Object.fromEntries(
    PLAN_FEATURE_VALUES.map((f) => [f, f === PLAN_FEATURE.FINANCE ? state : FEATURE_STATE.HIDDEN]),
  ) as Record<PlanFeature, FeatureState>;
  return {
    tenantId,
    tenantStatus: 'active',
    roleKey: 'shop_owner',
    permissions: [],
    features,
    usedFeatures: used,
    planCode: 'standard',
    planEndsAt: null,
  };
}

function ctxOf(options: { feature?: PlanFeature; method: string; tenant?: TenantContext }) {
  const handler = function handlerFn(): void {};
  class FakeController {}
  if (options.feature) Reflect.defineMetadata(PLAN_FEATURE_KEY, options.feature, handler);
  const req = {
    method: options.method,
    tenant: options.tenant ?? tenantCtx(FEATURE_STATE.ENABLED),
  } as unknown as RequestContext;
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => FakeController,
  } as never;
}

/** Chạy interceptor với một handler thành công, rồi đợi câu UPDATE nền kịp chạy. */
async function run(ctx: never, ok = true): Promise<void> {
  const next = { handle: () => (ok ? of({ id: 1 }) : throwError(() => new Error('400'))) };
  try {
    await firstValueFrom(interceptor.intercept(ctx, next));
  } catch {
    // Handler ném = request 4xx/5xx. `tap` không chạy nhánh next — đúng thứ spec kiểm.
  }
  // `markUsed` được gọi không-chờ (void) để không giữ response lại; nhường một nhịp cho nó.
  await new Promise((resolve) => setTimeout(resolve, 120));
}

async function usedFeatures(): Promise<string[]> {
  const row = await prisma.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { usedFeatures: true },
  });
  return [...row.usedFeatures];
}

async function reset(): Promise<void> {
  await prisma.tenant.update({ where: { id: tenantId }, data: { usedFeatures: [] } });
}

describe('FeatureUsageInterceptor — chỉ ghi khi thật sự DÙNG', () => {
  maybe('2xx + method GHI + enabled ⇒ ghi đúng một cờ', async () => {
    await reset();
    await run(ctxOf({ feature: PLAN_FEATURE.FINANCE, method: 'POST' }));
    expect(await usedFeatures()).toEqual([PLAN_FEATURE.FINANCE]);
  });

  maybe('⚠️ handler NÉM (4xx) ⇒ KHÔNG ghi — lý do đây là interceptor, không phải guard', async () => {
    await reset();
    await run(ctxOf({ feature: PLAN_FEATURE.FINANCE, method: 'POST' }), false);
    expect(await usedFeatures()).toEqual([]);
  });

  maybe('GET không ghi — xem một trang không phải là dùng tính năng', async () => {
    await reset();
    await run(ctxOf({ feature: PLAN_FEATURE.FINANCE, method: 'GET' }));
    expect(await usedFeatures()).toEqual([]);
  });

  maybe('read_only KHÔNG ghi — không tự nới hidden→read_only cho tenant chưa từng dùng', async () => {
    await reset();
    await run(
      ctxOf({
        feature: PLAN_FEATURE.FINANCE,
        method: 'POST',
        tenant: tenantCtx(FEATURE_STATE.READ_ONLY),
      }),
    );
    expect(await usedFeatures()).toEqual([]);
  });

  maybe('route không có marker thì không ghi gì', async () => {
    await reset();
    await run(ctxOf({ method: 'POST' }));
    expect(await usedFeatures()).toEqual([]);
  });

  maybe('lần thứ hai là NO-OP: không nhân đôi phần tử trong mảng', async () => {
    await reset();
    await run(ctxOf({ feature: PLAN_FEATURE.FINANCE, method: 'POST' }));
    await run(ctxOf({ feature: PLAN_FEATURE.FINANCE, method: 'POST' }));
    expect(await usedFeatures()).toEqual([PLAN_FEATURE.FINANCE]);
  });

  maybe('cờ thứ hai được APPEND, không thay cờ cũ', async () => {
    await reset();
    await run(ctxOf({ feature: PLAN_FEATURE.FINANCE, method: 'POST' }));
    // Tenant vừa mở thêm quản lý tài xế ⇒ ngữ cảnh mới có DRIVERS bật.
    const ctx = ctxOf({ feature: PLAN_FEATURE.DRIVERS, method: 'POST' });
    const req = (ctx as unknown as { switchToHttp(): { getRequest(): RequestContext } })
      .switchToHttp()
      .getRequest();
    (req.tenant as unknown as { features: Record<string, FeatureState> }).features[
      PLAN_FEATURE.DRIVERS
    ] = FEATURE_STATE.ENABLED;
    await run(ctx);

    expect((await usedFeatures()).sort()).toEqual(
      [PLAN_FEATURE.DRIVERS, PLAN_FEATURE.FINANCE].sort(),
    );
  });
});
