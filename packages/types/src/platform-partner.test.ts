import { describe, expect, it } from 'vitest';
import { BILLING_MODE } from './status/billing';
import { SHOP_ONBOARDING_STATE } from './shop-onboarding';
import { PLATFORM_PARTNER_KIND, platformPartnerKindOf } from './platform-partner';

const { PACKAGE_SHOP, INDIVIDUAL_OWNER } = PLATFORM_PARTNER_KIND;

describe('platformPartnerKindOf', () => {
  it('gian hàng đang onboarding gói (chưa có thuê bao) ⇒ gian hàng gói, không phải cá nhân', () => {
    expect(
      platformPartnerKindOf({
        onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING,
        billingMode: null,
      }),
    ).toBe(PACKAGE_SHOP);
  });

  it('gian hàng đã kích hoạt gói ⇒ gian hàng gói, kể cả khi gói đã hết hạn về hoa hồng', () => {
    for (const billingMode of [BILLING_MODE.PACKAGE, BILLING_MODE.COMMISSION, null]) {
      expect(
        platformPartnerKindOf({
          onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
          billingMode,
        }),
      ).toBe(PACKAGE_SHOP);
    }
  });

  it('vào cửa hoa hồng rồi MUA gói ⇒ gian hàng gói (onboarding_state vẫn là commission)', () => {
    expect(
      platformPartnerKindOf({
        onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
        billingMode: BILLING_MODE.PACKAGE,
      }),
    ).toBe(PACKAGE_SHOP);
  });

  it('tuyến hoa hồng, hoặc chưa xác định tuyến ⇒ chủ xe cá nhân', () => {
    expect(
      platformPartnerKindOf({
        onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
        billingMode: BILLING_MODE.COMMISSION,
      }),
    ).toBe(INDIVIDUAL_OWNER);
    expect(
      platformPartnerKindOf({
        onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
        billingMode: null,
      }),
    ).toBe(INDIVIDUAL_OWNER);
  });
});
