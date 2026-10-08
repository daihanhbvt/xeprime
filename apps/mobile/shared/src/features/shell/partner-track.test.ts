import { BILLING_MODE, SHOP_ONBOARDING_STATE, TENANT_ROLE } from '@xeprime/types';
import type { CurrentUser } from '@/features/auth/api';
import {
  PARTNER_PATH,
  PARTNER_TRACK,
  isCommissionPath,
  partnerPathRedirect,
  resolvePartnerTrack,
} from './partner-track';

/**
 * Luật trang theo TUYẾN của app XePrime Partner — gương của `post-auth-destination.test.ts` và
 * `commission-track-continuity.test.ts` bên web (ADR 0053).
 */
type Tenant = NonNullable<CurrentUser['tenant']>;

function me(tenant: Partial<Tenant> | null): Pick<CurrentUser, 'tenant'> {
  return { tenant: tenant ? (tenant as Tenant) : null };
}

const commission = me({
  roleKey: TENANT_ROLE.SHOP_OWNER,
  billingMode: BILLING_MODE.COMMISSION,
  onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
});
const pkg = me({
  roleKey: TENANT_ROLE.SHOP_OWNER,
  billingMode: BILLING_MODE.PACKAGE,
  onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
});
const pending = me({
  roleKey: TENANT_ROLE.SHOP_OWNER,
  billingMode: null,
  onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING,
});
const none = me(null);

describe('resolvePartnerTrack', () => {
  it('bốn tuyến theo đúng thứ tự B1', () => {
    expect(resolvePartnerTrack(none)).toBe(PARTNER_TRACK.NONE);
    expect(resolvePartnerTrack(pending)).toBe(PARTNER_TRACK.PACKAGE_PENDING);
    expect(resolvePartnerTrack(pkg)).toBe(PARTNER_TRACK.PACKAGE);
    expect(resolvePartnerTrack(commission)).toBe(PARTNER_TRACK.COMMISSION);
  });

  it('gói hết ân hạn (billingMode về commission) rơi về tuyến hoa hồng', () => {
    const lapsed = me({
      roleKey: TENANT_ROLE.SHOP_OWNER,
      billingMode: BILLING_MODE.COMMISSION,
      onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
    });
    expect(resolvePartnerTrack(lapsed)).toBe(PARTNER_TRACK.COMMISSION);
  });
});

describe('isCommissionPath', () => {
  it.each([
    '/manage',
    '/manage/vehicles',
    '/manage/vehicles/v1',
    '/manage/vehicles/v1/manage',
    '/manage/vehicles/v1/manage/pricing',
    '/manage/calendar',
    '/manage/requests',
    '/manage/bookings/b1/handover/pickup',
    '/manage/chat/c1',
    '/manage/balance',
    '/manage/tax',
    '/manage/bank-accounts',
    '/manage/registration',
    '/manage/support/cases',
  ])('mở cho tuyến hoa hồng: %s', (path) => {
    expect(isCommissionPath(path)).toBe(true);
  });

  it.each([
    '/manage/vehicles/new',
    '/manage/vehicles/v1/edit',
    '/manage/vehicles/v1/edit/pricing',
    '/manage/customers',
    '/manage/finance',
    '/manage/receipts',
    '/manage/maintenance',
    '/manage/members',
    '/manage/shop/branches',
  ])('KHÔNG mở cho tuyến hoa hồng: %s', (path) => {
    expect(isCommissionPath(path)).toBe(false);
  });

  it('bỏ qua query khi so', () => {
    expect(isCommissionPath('/manage/calendar?q=abc')).toBe(true);
  });
});

describe('partnerPathRedirect', () => {
  it('chưa có gian hàng: chỉ ở màn chọn tuyến và onboarding', () => {
    expect(partnerPathRedirect(none, PARTNER_PATH.REGISTER)).toBeNull();
    expect(partnerPathRedirect(none, PARTNER_PATH.ONBOARDING)).toBeNull();
    expect(partnerPathRedirect(none, PARTNER_PATH.HOME)).toBe(PARTNER_PATH.REGISTER);
    expect(partnerPathRedirect(none, '/manage/vehicles')).toBe(PARTNER_PATH.REGISTER);
  });

  it('gói chưa thanh toán: chỉ onboarding', () => {
    expect(partnerPathRedirect(pending, PARTNER_PATH.ONBOARDING)).toBeNull();
    expect(partnerPathRedirect(pending, PARTNER_PATH.HOME)).toBe(PARTNER_PATH.ONBOARDING);
  });

  it('tuyến hoa hồng: trang Full Manage về trang chủ; trang Owner Lite ở lại', () => {
    expect(partnerPathRedirect(commission, '/manage/customers')).toBe(PARTNER_PATH.HOME);
    expect(partnerPathRedirect(commission, '/manage/vehicles/v1/edit')).toBe(PARTNER_PATH.HOME);
    expect(partnerPathRedirect(commission, PARTNER_PATH.BALANCE)).toBeNull();
    expect(partnerPathRedirect(commission, PARTNER_PATH.ONBOARDING)).toBeNull();
    expect(partnerPathRedirect(commission, PARTNER_PATH.REGISTER)).toBe(PARTNER_PATH.HOME);
  });

  it('tuyến hoa hồng: thông báo gian hàng (/manage/shop) mở hồ sơ chủ xe', () => {
    expect(partnerPathRedirect(commission, PARTNER_PATH.SHOP)).toBe(PARTNER_PATH.REGISTRATION);
  });

  it('tuyến gói: ba trang chỉ của tuyến hoa hồng đổi sang bản trong khu Gian hàng', () => {
    expect(partnerPathRedirect(pkg, PARTNER_PATH.REGISTRATION)).toBe(PARTNER_PATH.SHOP);
    expect(partnerPathRedirect(pkg, PARTNER_PATH.TAX)).toBe('/manage/shop?section=legal');
    expect(partnerPathRedirect(pkg, PARTNER_PATH.BANK_ACCOUNTS)).toBe(
      '/manage/shop?section=payout',
    );
    expect(partnerPathRedirect(pkg, '/manage/customers')).toBeNull();
    expect(partnerPathRedirect(pkg, PARTNER_PATH.REGISTER)).toBe(PARTNER_PATH.HOME);
  });
});
