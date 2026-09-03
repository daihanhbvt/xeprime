import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ConfigService } from '@nestjs/config';
import {
  API_ERROR_CODE,
  FEATURE_STATE,
  PLAN_FEATURE,
  PLAN_FEATURE_VALUES,
  type FeatureState,
  type PlanFeature,
} from '@xeprime/types';
import {
  FEATURE_READ_SAFE_KEY,
  PLAN_FEATURE_KEY,
} from '../src/common/decorators';
import { PlanFeatureGuard } from '../src/common/guards/plan-feature.guard';
import type { RequestContext, TenantContext } from '../src/common/types/request-context';

/**
 * W3 LÔ 2 — `PlanFeatureGuard`, ma trận (method × trạng thái × chế độ thi hành).
 *
 * Không cần DB: guard đọc `req.tenant.features` mà `TenantScopeGuard` đã giải sẵn — và việc nó
 * KHÔNG tự truy vấn chính là một trong những điều spec này khoá lại (guard không nhận Prisma).
 *
 * Bốn bất biến quan trọng nhất:
 *  - `read_only` + ĐỌC luôn qua — "không ai mất quyền xem sổ sách của chính mình" (ADR 0027 điều 3);
 *  - `hidden` và `read_only` + GHI ném HAI mã KHÁC NHAU — FE dựng hai màn khác nhau từ chúng;
 *  - `warn` KHÔNG BAO GIỜ ném — đó là điều kiện an toàn của cả đợt phát hành;
 *  - nhân sự nền tảng (`req.platform`) không bị gói của tenant chặn.
 */
const reflector = new Reflector();

/**
 * ConfigService giả trả giá trị CHỈ cho đúng khoá `PLAN_FEATURE_ENFORCEMENT`.
 *
 * Không phải chi tiết vụn: guard đọc `config.get(...) ?? 'warn'`, nên gõ sai tên khoá sẽ cho ra
 * `undefined` → rơi về `warn` → **production không bao giờ chặn ai** trong khi test vẫn xanh.
 * Một `get: () => mode` trả mọi khoá sẽ che đúng lỗi đó; ràng buộc tên khoá ở đây làm nó đỏ.
 */
function makeGuard(mode: 'off' | 'warn' | 'on'): PlanFeatureGuard {
  const config = {
    get: (key: string) => (key === 'PLAN_FEATURE_ENFORCEMENT' ? mode : undefined),
  } as unknown as ConfigService;
  return new PlanFeatureGuard(reflector, config);
}

function tenantWith(state: FeatureState, feature: PlanFeature = PLAN_FEATURE.FINANCE): TenantContext {
  const features = Object.fromEntries(
    PLAN_FEATURE_VALUES.map((f) => [f, f === feature ? state : FEATURE_STATE.HIDDEN]),
  ) as Record<PlanFeature, FeatureState>;
  return {
    tenantId: 'T1',
    tenantStatus: 'active',
    roleKey: 'shop_owner',
    permissions: [],
    features,
    usedFeatures: state === FEATURE_STATE.READ_ONLY ? [feature] : [],
    planCode: state === FEATURE_STATE.ENABLED ? 'standard' : null,
    planEndsAt: '2026-08-01T00:00:00.000Z',
  };
}

/**
 * `ExecutionContext` giả mang metadata thật.
 *
 * Metadata gắn lên chính hàm handler bằng `Reflect.defineMetadata` — cùng cơ chế mà
 * `@RequiresFeature` dùng, nên spec kiểm đúng đường guard đọc lúc chạy chứ không phải một
 * `getAllAndOverride` bị mock.
 */
function ctxOf(options: {
  feature?: PlanFeature;
  method?: string;
  tenant?: TenantContext | null;
  platform?: boolean;
  readSafe?: boolean;
}) {
  const handler = function handlerFn(): void {};
  class FakeController {}
  if (options.feature) Reflect.defineMetadata(PLAN_FEATURE_KEY, options.feature, handler);
  if (options.readSafe) Reflect.defineMetadata(FEATURE_READ_SAFE_KEY, true, handler);

  const req = {
    method: options.method ?? 'GET',
    url: '/receipts',
    originalUrl: '/receipts',
    tenant: options.tenant === null ? undefined : (options.tenant ?? tenantWith(FEATURE_STATE.ENABLED)),
    platform: options.platform ? { roleKey: 'platform_admin', permissions: [] } : undefined,
  } as unknown as RequestContext;

  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => FakeController,
  } as never;
}

describe('PlanFeatureGuard — lối cho qua', () => {
  it('route KHÔNG có marker luôn qua (opt-in, y như @TenantScoped)', () => {
    expect(makeGuard('on').canActivate(ctxOf({ method: 'POST' }))).toBe(true);
  });

  it('nhân sự nền tảng không bị gói của tenant chặn', () => {
    const ctx = ctxOf({
      feature: PLAN_FEATURE.FINANCE,
      method: 'POST',
      tenant: tenantWith(FEATURE_STATE.HIDDEN),
      platform: true,
    });
    expect(makeGuard('on').canActivate(ctx)).toBe(true);
  });

  it('không có tenant scope thì KHÔNG đổi mã lỗi của tình huống khác (TenantScopeGuard đã ném)', () => {
    const ctx = ctxOf({ feature: PLAN_FEATURE.FINANCE, method: 'POST', tenant: null });
    expect(makeGuard('on').canActivate(ctx)).toBe(true);
  });

  it('enabled: đọc lẫn ghi đều qua', () => {
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      const ctx = ctxOf({
        feature: PLAN_FEATURE.FINANCE,
        method,
        tenant: tenantWith(FEATURE_STATE.ENABLED),
      });
      expect(makeGuard('on').canActivate(ctx)).toBe(true);
    }
  });
});

describe('PlanFeatureGuard — ma trận method × trạng thái (chế độ on)', () => {
  const guard = makeGuard('on');

  it('read_only + GET/HEAD/OPTIONS: QUA — không ai mất quyền xem sổ của chính mình', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      const ctx = ctxOf({
        feature: PLAN_FEATURE.FINANCE,
        method,
        tenant: tenantWith(FEATURE_STATE.READ_ONLY),
      });
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });

  it('read_only + GHI: FEATURE_READ_ONLY kèm planEndsAt để FE hiện đúng mốc', () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      const ctx = ctxOf({
        feature: PLAN_FEATURE.FINANCE,
        method,
        tenant: tenantWith(FEATURE_STATE.READ_ONLY),
      });
      let thrown: unknown;
      try {
        guard.canActivate(ctx);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(ForbiddenException);
      expect((thrown as ForbiddenException).getResponse()).toMatchObject({
        code: API_ERROR_CODE.FEATURE_READ_ONLY,
        details: { feature: PLAN_FEATURE.FINANCE, planEndsAt: '2026-08-01T00:00:00.000Z' },
      });
    }
  });

  it('hidden: chặn CẢ đọc lẫn ghi bằng FEATURE_NOT_IN_PLAN (mã khác read_only)', () => {
    for (const method of ['GET', 'POST']) {
      const ctx = ctxOf({
        feature: PLAN_FEATURE.FINANCE,
        method,
        tenant: tenantWith(FEATURE_STATE.HIDDEN),
      });
      let thrown: unknown;
      try {
        guard.canActivate(ctx);
      } catch (err) {
        thrown = err;
      }
      expect((thrown as ForbiddenException).getResponse()).toMatchObject({
        code: API_ERROR_CODE.FEATURE_NOT_IN_PLAN,
        details: { feature: PLAN_FEATURE.FINANCE },
      });
    }
  });

  it('@FeatureReadSafe: POST hình-đọc vẫn qua ở read_only, nhưng KHÔNG cứu được hidden', () => {
    const readOnly = ctxOf({
      feature: PLAN_FEATURE.FINANCE,
      method: 'POST',
      readSafe: true,
      tenant: tenantWith(FEATURE_STATE.READ_ONLY),
    });
    expect(guard.canActivate(readOnly)).toBe(true);

    const hidden = ctxOf({
      feature: PLAN_FEATURE.FINANCE,
      method: 'POST',
      readSafe: true,
      tenant: tenantWith(FEATURE_STATE.HIDDEN),
    });
    expect(() => guard.canActivate(hidden)).toThrow(ForbiddenException);
  });

  it('cờ KHÁC không ảnh hưởng nhau — một cờ gác đúng nhóm của nó', () => {
    const ctx = ctxOf({
      feature: PLAN_FEATURE.DRIVERS,
      method: 'POST',
      // Tenant có FINANCE bật, DRIVERS thì không.
      tenant: tenantWith(FEATURE_STATE.ENABLED, PLAN_FEATURE.FINANCE),
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});

describe('PlanFeatureGuard — chế độ thi hành', () => {
  it('⚠️ warn KHÔNG BAO GIỜ ném, kể cả hidden + ghi — điều kiện an toàn của đợt phát hành', () => {
    const guard = makeGuard('warn');
    for (const state of [FEATURE_STATE.HIDDEN, FEATURE_STATE.READ_ONLY]) {
      const ctx = ctxOf({
        feature: PLAN_FEATURE.FINANCE,
        method: 'POST',
        tenant: tenantWith(state),
      });
      expect(guard.canActivate(ctx)).toBe(true);
    }
  });

  it('off cũng cho qua — lối thoát hiểm không cần revert code', () => {
    const ctx = ctxOf({
      feature: PLAN_FEATURE.FINANCE,
      method: 'DELETE',
      tenant: tenantWith(FEATURE_STATE.HIDDEN),
    });
    expect(makeGuard('off').canActivate(ctx)).toBe(true);
  });
});
