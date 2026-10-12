import { BILLING_MODE, SHOP_ONBOARDING_STATE, TENANT_ROLE } from '@xeprime/types';
import type { CurrentUser } from '@/features/auth/api';
import {
  PARTNER_PATH,
  PARTNER_TRACK,
  isCommissionOwner,
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

describe('partnerPathRedirect — "Chuyến cho thuê" (PR #158)', () => {
  const commissionStaff = me({
    roleKey: TENANT_ROLE.SHOP_STAFF,
    billingMode: BILLING_MODE.COMMISSION,
    onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
  });

  it('chỉ CHỦ gian hàng tuyến hoa hồng là commission owner', () => {
    expect(isCommissionOwner(commission)).toBe(true);
    expect(isCommissionOwner(commissionStaff)).toBe(false);
    expect(isCommissionOwner(pkg)).toBe(false);
  });

  it('chủ xe hoa hồng: hộp thư, bảng đơn, chờ giao xe → chuyến cho thuê; trips ở lại', () => {
    for (const path of [
      PARTNER_PATH.REQUESTS,
      PARTNER_PATH.BOOKINGS,
      PARTNER_PATH.BOOKINGS_AWAITING_PICKUP,
    ]) {
      expect(partnerPathRedirect(commission, path)).toBe(PARTNER_PATH.TRIPS);
    }
    expect(partnerPathRedirect(commission, PARTNER_PATH.TRIPS)).toBeNull();
    // Chi tiết đơn là màn dùng chung, nơi bàn giao — không bị chuyển.
    expect(
      partnerPathRedirect(commission, `${PARTNER_PATH.BOOKINGS}/01JQZX0000000000000000000B`),
    ).toBeNull();
  });

  it('thành viên hoa hồng và tuyến gói mở trips → hộp thư', () => {
    expect(partnerPathRedirect(commissionStaff, PARTNER_PATH.TRIPS)).toBe(PARTNER_PATH.REQUESTS);
    expect(partnerPathRedirect(commissionStaff, PARTNER_PATH.REQUESTS)).toBeNull();
    expect(partnerPathRedirect(pkg, PARTNER_PATH.TRIPS)).toBe(PARTNER_PATH.REQUESTS);
  });
});

describe('partnerPathRedirect', () => {
  it('PR #159: chủ mở /bank-accounts về khối payout của trang số dư ở cả hai tuyến', () => {
    expect(partnerPathRedirect(commission, PARTNER_PATH.BANK_ACCOUNTS)).toBe(
      PARTNER_PATH.BALANCE_PAYOUT,
    );
    expect(partnerPathRedirect(pkg, PARTNER_PATH.BANK_ACCOUNTS)).toBe(PARTNER_PATH.BALANCE_PAYOUT);
    // Đích không tự chuyển tiếp lần nữa.
    expect(partnerPathRedirect(commission, PARTNER_PATH.BALANCE_PAYOUT)).toBeNull();
    expect(partnerPathRedirect(pkg, PARTNER_PATH.BALANCE_PAYOUT)).toBeNull();
  });

  it.each([PARTNER_PATH.TAX, PARTNER_PATH.SUBSCRIPTION, PARTNER_PATH.BANK_ACCOUNTS])(
    'PR #159: thành viên gian hàng mở %s về trang tài khoản (cả hai tuyến)',
    (path) => {
      const staffOf = (base: typeof pkg) =>
        me({ ...(base.tenant as Tenant), roleKey: TENANT_ROLE.SHOP_STAFF });
      expect(partnerPathRedirect(staffOf(pkg), path)).toBe(PARTNER_PATH.ACCOUNT);
      expect(partnerPathRedirect(staffOf(commission), path)).toBe(PARTNER_PATH.ACCOUNT);
    },
  );

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

  it('tuyến hoa hồng: /manage/shop và alias /manage/registration mở section hồ sơ của trang tài khoản', () => {
    expect(partnerPathRedirect(commission, PARTNER_PATH.SHOP)).toBe(PARTNER_PATH.ACCOUNT_PROFILE);
    expect(partnerPathRedirect(commission, PARTNER_PATH.REGISTRATION)).toBe(
      '/manage/account?section=profile',
    );
    // Đích không tự chuyển tiếp lần nữa — không vòng lặp trong ScopeGuard.
    expect(partnerPathRedirect(commission, PARTNER_PATH.ACCOUNT_PROFILE)).toBeNull();
  });

  it('tuyến gói: ba trang chỉ của tuyến hoa hồng đổi sang bản trong khu Gian hàng', () => {
    expect(partnerPathRedirect(pkg, PARTNER_PATH.REGISTRATION)).toBe(PARTNER_PATH.SHOP);
    expect(partnerPathRedirect(pkg, PARTNER_PATH.TAX)).toBe('/manage/shop?section=tax');
    expect(partnerPathRedirect(pkg, PARTNER_PATH.SELLER_PROFILE)).toBe('/manage/shop?section=tax');
    expect(partnerPathRedirect(pkg, PARTNER_PATH.SUBSCRIPTION)).toBe('/manage/shop?section=plan');
    expect(partnerPathRedirect(pkg, PARTNER_PATH.BANK_ACCOUNTS)).toBe(
      '/manage/balance?section=payout',
    );
    expect(partnerPathRedirect(pkg, '/manage/customers')).toBeNull();
    expect(partnerPathRedirect(pkg, PARTNER_PATH.REGISTER)).toBe(PARTNER_PATH.HOME);
  });
});
