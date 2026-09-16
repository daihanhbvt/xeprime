import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import {
  API_ERROR_CODE,
  BILLING_MODE,
  BILLING_PHASE,
  FEATURE_STATE,
  PERMISSION,
  PLAN_FEATURE_VALUES,
  SHOP_ONBOARDING_STATE,
  TENANT_ROLE,
  canAccessShopWallet,
  type FeatureState,
  type PlanFeature,
  type Permission,
  type TenantRole,
} from '@xeprime/types';

import { SHOP_OWNER_ONLY_KEY } from '../src/common/decorators';
import { ShopOwnerGuard } from '../src/common/guards/shop-owner.guard';
import type { PlatformContext, TenantContext } from '../src/common/types/request-context';

/**
 * F2 — VÍ GIAN HÀNG CHỈ THUỘC VỀ CHỦ.
 *
 * Trước 15/09/2026, năm route ví và bốn route tài khoản ngân hàng của gian hàng gác bằng
 * `seller_profile.view`/`.manage`. `shop_manager` có `seller_profile.view` trong bộ quyền MẶC
 * ĐỊNH, nên quản lý đọc được SỐ DƯ, TOÀN BỘ SỔ CÁI và LỊCH SỬ RÚT — rò quyền thật ở backend, và
 * không một test nào phủ nó.
 *
 * Spec này khoá ba điều, và điều thứ ba mới là thứ khó:
 *
 *  1. `shop_owner` qua; `shop_manager`/`shop_staff`/`shop_viewer` nhận 403 `SHOP_OWNER_ONLY`.
 *  2. Nhân sự nền tảng KHÔNG bị chặn — họ xử lý tiền bằng trục riêng (`platform.money.manage`),
 *     và chặn ở đây là cắt một đường vận hành hợp lệ.
 *  3. **Quyền tuỳ biến không lách được.** Đây là lý do cổng này là VAI chứ không phải permission:
 *     chủ shop có thể tạo vai riêng và cấp bất kỳ khoá nào, kể cả `seller_profile.manage` hay
 *     mọi khoá tài chính — ví vẫn đóng.
 */
const reflector = new Reflector();
const guard = new ShopOwnerGuard(reflector);

function features(): Record<PlanFeature, FeatureState> {
  return Object.fromEntries(PLAN_FEATURE_VALUES.map((f) => [f, FEATURE_STATE.ENABLED])) as Record<
    PlanFeature,
    FeatureState
  >;
}

function tenantCtx(roleKey: TenantRole, permissions: Permission[] = []): TenantContext {
  return {
    tenantId: 'T1',
    tenantStatus: 'active',
    onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
    roleKey,
    permissions,
    features: features(),
    usedFeatures: [],
    planCode: 'per-vehicle',
    planEndsAt: null,
    billingMode: BILLING_MODE.PACKAGE,
    billingPhase: BILLING_PHASE.CURRENT,
    graceEndsAt: null,
  };
}

/** Ngữ cảnh của một route CÓ `@ShopOwnerOnly()` ở tầng class — đúng cách controller ví gắn. */
function ctx(options: { tenant?: TenantContext; platform?: PlatformContext }): ExecutionContext {
  const handler = function handlerFn(): void {};
  class ShopWalletControllerStub {}
  Reflect.defineMetadata(SHOP_OWNER_ONLY_KEY, true, ShopWalletControllerStub);

  return {
    getHandler: () => handler,
    getClass: () => ShopWalletControllerStub,
    switchToHttp: () => ({
      getRequest: () => ({
        method: 'GET',
        user: { id: 'U1' },
        tenant: options.tenant,
        platform: options.platform,
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('ShopOwnerGuard — ai chạm được vào tiền của gian hàng', () => {
  it('shop_owner: qua', () => {
    expect(guard.canActivate(ctx({ tenant: tenantCtx(TENANT_ROLE.SHOP_OWNER) }))).toBe(true);
  });

  it.each([TENANT_ROLE.SHOP_MANAGER, TENANT_ROLE.SHOP_STAFF, TENANT_ROLE.SHOP_VIEWER])(
    '%s: 403 SHOP_OWNER_ONLY',
    (roleKey) => {
      const context = ctx({ tenant: tenantCtx(roleKey) });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(context)).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            code: API_ERROR_CODE.SHOP_OWNER_ONLY,
            details: expect.objectContaining({ roleKey }),
          }),
        }),
      );
    },
  );

  /*
   * ĐIỀU QUAN TRỌNG NHẤT của spec này.
   *
   * `shop_manager` có `seller_profile.view` MẶC ĐỊNH — chính khoá đã mở ví trước đợt này. Và vì
   * guard đọc quyền từ DB mỗi request (ADR 0002), chủ shop hoàn toàn có thể cấp thêm khoá cho
   * một vai tuỳ biến. Nếu cổng ví là một permission thì mọi phép cấp đó đều mở được ví.
   */
  it('quản lý CÓ seller_profile.view (mặc định) vẫn bị chặn — đúng khoá đã rò trước đây', () => {
    const context = ctx({
      tenant: tenantCtx(TENANT_ROLE.SHOP_MANAGER, [PERMISSION.SELLER_PROFILE_VIEW]),
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('quyền TUỲ BIẾN không lách được — cấp trọn bộ khoá tenant vẫn đóng ví', () => {
    const everyTenantKey = (Object.values(PERMISSION) as Permission[]).filter(
      (p) => !p.startsWith('platform.'),
    );
    for (const roleKey of [
      TENANT_ROLE.SHOP_MANAGER,
      TENANT_ROLE.SHOP_STAFF,
      TENANT_ROLE.SHOP_VIEWER,
    ]) {
      const context = ctx({ tenant: tenantCtx(roleKey, everyTenantKey) });
      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    }
  });

  it('nhân sự nền tảng đi qua — họ có trục tiền riêng (platform.money.manage)', () => {
    const platform: PlatformContext = {
      roleKey: 'platform_admin',
      permissions: [PERMISSION.PLATFORM_MONEY_MANAGE],
    };
    // Kể cả khi họ cũng là nhân viên của chính gian hàng đó.
    expect(
      guard.canActivate(ctx({ platform, tenant: tenantCtx(TENANT_ROLE.SHOP_STAFF) })),
    ).toBe(true);
  });

  it('route KHÔNG gắn marker thì guard không nói gì (opt-in như @TenantScoped)', () => {
    const handler = function handlerFn(): void {};
    class PlainController {}
    const bare = {
      getHandler: () => handler,
      getClass: () => PlainController,
      switchToHttp: () => ({
        getRequest: () => ({ tenant: tenantCtx(TENANT_ROLE.SHOP_VIEWER) }),
      }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(bare)).toBe(true);
  });
});

describe('canAccessShopWallet — luật thuần dùng chung với menu web', () => {
  it('chỉ shop_owner', () => {
    expect(canAccessShopWallet(TENANT_ROLE.SHOP_OWNER)).toBe(true);
    for (const role of [
      TENANT_ROLE.SHOP_MANAGER,
      TENANT_ROLE.SHOP_STAFF,
      TENANT_ROLE.SHOP_VIEWER,
      null,
      undefined,
      'quan_ly_tai_chinh',
    ]) {
      expect(canAccessShopWallet(role)).toBe(false);
    }
  });
});
