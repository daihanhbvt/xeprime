import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import {
  API_ERROR_CODE,
  BILLING_MODE,
  BILLING_PHASE,
  FEATURE_STATE,
  PLAN_FEATURE_VALUES,
  SHOP_ONBOARDING_STATE,
  TENANT_ROLE,
  tenantUsesManagePortal,
  type BillingMode,
  type BillingPhase,
  type FeatureState,
  type PlanFeature,
  type ShopOnboardingState,
  type TenantRole,
} from '@xeprime/types';

import { SUBSCRIPTION_TRACK_ONLY_KEY } from '../src/common/decorators';
import { SubscriptionTrackGuard } from '../src/common/guards/subscription-track.guard';
import type { PlatformContext, TenantContext } from '../src/common/types/request-context';

/**
 * RANH GIỚI HAI TUYẾN, CHẶN Ở SERVER (ADR 0032 điều 6).
 *
 * Trước 15/09/2026 ranh giới này sống ở đúng một nhánh render trong `AppShell.tsx`. Docblock ở
 * đó nói lớp chặn thật là backend — nhưng `req.tenant` không mang `billingMode`, và
 * `PlanFeatureGuard` chạy `warn` ở mọi cấu hình được ship. Tức là gọi thẳng API quản lý nâng cao
 * từ một tài khoản tuyến hoa hồng đi lọt trên staging và production.
 *
 * Ba điều được khoá ở đây:
 *
 *  1. Tuyến GÓI qua; tuyến HOA HỒNG bị chặn — **bất kể vai**, gồm cả `shop_owner`.
 *  2. ÂN HẠN vẫn qua: gian hàng vừa hết hạn chưa mất gì, đúng như tin nhắn vòng đời hứa.
 *  3. Cổng này **không** đi qua `PLAN_FEATURE_ENFORCEMENT` — nó chặn thật ngay cả khi công tắc
 *     hạ-cấp-năng-lực đang tắt. Đây là điều dễ làm sai nhất: gắn nhờ vào công tắc đó thì ranh
 *     giới sản phẩm biến mất trên chính môi trường đang chạy thật.
 */
const reflector = new Reflector();
const guard = new SubscriptionTrackGuard(reflector);

function features(state: FeatureState = FEATURE_STATE.HIDDEN): Record<PlanFeature, FeatureState> {
  return Object.fromEntries(PLAN_FEATURE_VALUES.map((f) => [f, state])) as Record<
    PlanFeature,
    FeatureState
  >;
}

function tenantCtx(
  billingMode: BillingMode | null,
  billingPhase: BillingPhase,
  roleKey: TenantRole = TENANT_ROLE.SHOP_OWNER,
  onboardingState: ShopOnboardingState = SHOP_ONBOARDING_STATE.COMMISSION,
): TenantContext {
  return {
    tenantId: 'T1',
    tenantStatus: 'active',
    onboardingState,
    roleKey,
    permissions: [],
    features: features(),
    usedFeatures: [],
    planCode: 'free',
    planEndsAt: '2026-09-01T00:00:00.000Z',
    billingMode,
    billingPhase,
    graceEndsAt: null,
  };
}

function ctx(options: { tenant?: TenantContext; platform?: PlatformContext }): ExecutionContext {
  const handler = function handlerFn(): void {};
  class ManageControllerStub {}
  Reflect.defineMetadata(SUBSCRIPTION_TRACK_ONLY_KEY, true, ManageControllerStub);
  return {
    getHandler: () => handler,
    getClass: () => ManageControllerStub,
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

describe('SubscriptionTrackGuard', () => {
  it('tuyến GÓI: qua', () => {
    expect(
      guard.canActivate(ctx({ tenant: tenantCtx(BILLING_MODE.PACKAGE, BILLING_PHASE.CURRENT) })),
    ).toBe(true);
  });

  /*
   * Ân hạn là ưu đãi của người ĐÃ TRẢ TIỀN. `resolveEffectiveBilling` giữ tuyến gói suốt cửa sổ
   * đó, nên guard không cần biết gì về ân hạn — nó chỉ đọc `billingMode`.
   */
  it('ÂN HẠN (đã hết hạn, chưa hết ân hạn): vẫn qua', () => {
    expect(
      guard.canActivate(ctx({ tenant: tenantCtx(BILLING_MODE.PACKAGE, BILLING_PHASE.GRACE) })),
    ).toBe(true);
  });

  it.each([
    TENANT_ROLE.SHOP_OWNER,
    TENANT_ROLE.SHOP_MANAGER,
    TENANT_ROLE.SHOP_STAFF,
    TENANT_ROLE.SHOP_VIEWER,
  ])('tuyến HOA HỒNG, vai %s: 403 SUBSCRIPTION_TRACK_ONLY', (roleKey) => {
    const context = ctx({
      tenant: tenantCtx(BILLING_MODE.COMMISSION, BILLING_PHASE.CURRENT, roleKey),
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: API_ERROR_CODE.SUBSCRIPTION_TRACK_ONLY }),
      }),
    );
  });

  /*
   * F7: nhân viên/quản lý của tenant ĐÃ HẾT ÂN HẠN ra khỏi Manage cùng chủ. Bản cũ để họ ở lại
   * chỉ vì `roleKey` của họ khác `shop_owner`.
   */
  it('HẾT ÂN HẠN: cả gian hàng ra khỏi Manage, không ai ở lại nhờ roleKey', () => {
    for (const roleKey of [
      TENANT_ROLE.SHOP_OWNER,
      TENANT_ROLE.SHOP_MANAGER,
      TENANT_ROLE.SHOP_STAFF,
      TENANT_ROLE.SHOP_VIEWER,
    ]) {
      const context = ctx({
        tenant: tenantCtx(BILLING_MODE.COMMISSION, BILLING_PHASE.LAPSED, roleKey),
      });
      expect(() => guard.canActivate(context)).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            code: API_ERROR_CODE.SUBSCRIPTION_TRACK_ONLY,
            // Câu chữ phải nói ĐÚNG tình huống: "đã hết hạn" khác "chưa từng mua gói".
            message: expect.stringContaining('hết hạn'),
          }),
        }),
      );
    }
  });

  it('chưa xác định được tuyến (unconfigured): chặn — không đoán thành tuyến gói', () => {
    expect(() =>
      guard.canActivate(ctx({ tenant: tenantCtx(null, BILLING_PHASE.UNCONFIGURED) })),
    ).toThrow(ForbiddenException);
  });

  /*
   * ADR 0040: gian hàng trả phí CHƯA thanh toán cũng bị chặn — nhưng bằng mã KHÁC.
   *
   * Cả hai đều là "không có thuê bao tuyến gói hiệu lực", nên nếu chỉ đọc `billingMode` thì hai
   * tình huống không phân biệt được. Lối đi tiếp thì ngược nhau: `SUBSCRIPTION_TRACK_ONLY` đẩy
   * người dùng về Owner Lite, còn người đang chờ đối soát phải về đúng màn chuyển khoản. Trả sai
   * mã ở đây là dựng lại đúng cái bug mà ADR 0040 sửa, chỉ ở một tầng khác.
   */
  it('gian hàng tuyến gói CHƯA thanh toán: 403 PACKAGE_ONBOARDING_INCOMPLETE, không phải TRACK_ONLY', () => {
    const context = ctx({
      tenant: tenantCtx(
        null,
        BILLING_PHASE.UNCONFIGURED,
        TENANT_ROLE.SHOP_OWNER,
        SHOP_ONBOARDING_STATE.PACKAGE_PENDING,
      ),
    });
    expect(() => guard.canActivate(context)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: API_ERROR_CODE.PACKAGE_ONBOARDING_INCOMPLETE,
          details: { onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING },
        }),
      }),
    );
  });

  /*
   * Đã trả tiền rồi thì gói hết hạn là chuyện của `billingMode`, và câu trả lời phải là
   * "gia hạn đi" — không phải "hoàn tất thanh toán lượt đầu". `package_active` không bao giờ lùi
   * lại, đó chính là thứ giữ cho hai câu này không đổi chỗ.
   */
  it('gian hàng ĐÃ từng trả tiền mà hết ân hạn: vẫn là TRACK_ONLY, không phải onboarding', () => {
    const context = ctx({
      tenant: tenantCtx(
        BILLING_MODE.COMMISSION,
        BILLING_PHASE.LAPSED,
        TENANT_ROLE.SHOP_OWNER,
        SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
      ),
    });
    expect(() => guard.canActivate(context)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: API_ERROR_CODE.SUBSCRIPTION_TRACK_ONLY }),
      }),
    );
  });

  /*
   * Admin gán gói tay có thể để lại `package_pending` cạnh một gói ĐANG hiệu lực (dữ liệu cũ,
   * hoặc một đường gán khác). Tiền đã về ⇒ phải cho qua. `isPackageOnboardingPending` hỏi cả
   * `billingMode` chính vì ca này.
   */
  it('`package_pending` nhưng ĐÃ có gói hiệu lực: qua — tiền đã về thì không chặn', () => {
    expect(
      guard.canActivate(
        ctx({
          tenant: tenantCtx(
            BILLING_MODE.PACKAGE,
            BILLING_PHASE.CURRENT,
            TENANT_ROLE.SHOP_OWNER,
            SHOP_ONBOARDING_STATE.PACKAGE_PENDING,
          ),
        }),
      ),
    ).toBe(true);
  });

  it('nhân sự nền tảng: qua (ADR 0032 điều 6 — admin mở Manage của gian hàng bất kỳ)', () => {
    const platform: PlatformContext = { roleKey: 'platform_admin', permissions: [] };
    expect(
      guard.canActivate(
        ctx({ platform, tenant: tenantCtx(BILLING_MODE.COMMISSION, BILLING_PHASE.LAPSED) }),
      ),
    ).toBe(true);
  });

  it('route không gắn marker: guard không nói gì (opt-in)', () => {
    const handler = function handlerFn(): void {};
    class PlainController {}
    const bare = {
      getHandler: () => handler,
      getClass: () => PlainController,
      switchToHttp: () => ({
        getRequest: () => ({ tenant: tenantCtx(BILLING_MODE.COMMISSION, BILLING_PHASE.CURRENT) }),
      }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(bare)).toBe(true);
  });

  /*
   * ĐIỀU QUAN TRỌNG NHẤT.
   *
   * `SubscriptionTrackGuard` không nhận `ConfigService` — nó KHÔNG THỂ đọc
   * `PLAN_FEATURE_ENFORCEMENT`. Test này khoá thiết kế đó lại: nếu một ngày ai đó thêm công tắc
   * vào guard, chữ ký constructor đổi và test đỏ.
   */
  it('KHÔNG phụ thuộc PLAN_FEATURE_ENFORCEMENT — guard không nhận ConfigService', () => {
    expect(SubscriptionTrackGuard.length).toBe(1); // chỉ Reflector
    const fresh = new SubscriptionTrackGuard(new Reflector());
    expect(() =>
      fresh.canActivate(ctx({ tenant: tenantCtx(BILLING_MODE.COMMISSION, BILLING_PHASE.CURRENT) })),
    ).toThrow(ForbiddenException);
  });
});

describe('tenantUsesManagePortal — luật thuần dùng chung với web', () => {
  it('chỉ tuyến gói', () => {
    expect(tenantUsesManagePortal({ billingMode: BILLING_MODE.PACKAGE })).toBe(true);
    for (const mode of [BILLING_MODE.COMMISSION, null, undefined, 'goi_vip']) {
      expect(tenantUsesManagePortal({ billingMode: mode })).toBe(false);
    }
    expect(tenantUsesManagePortal(null)).toBe(false);
  });
});
