import { BILLING_MODE, TENANT_ROLE } from '@xeprime/types';
import type { CurrentUser } from '@/features/auth/api';
import { ROUTES } from '@/navigation/routes';
import {
  ACCOUNT_NAV,
  NAV_TARGET,
  canUseManagePortal,
  flattenAccountNav,
  matchAccountNavKey,
  navItemPath,
  resolveAccountNav,
  resolveWorkspaceHref,
  showsDeleteAccountCard,
} from './account-nav';

/**
 * Menu khu tài khoản của app XePrime — GƯƠNG của `apps/web/src/constants/account-nav.ts` sau
 * ADR 0053: tài khoản ở app này là tài khoản KHÁCH, nên chỉ còn MỘT menu cho mọi người; Owner Lite
 * và lối "về khu quản lý" đã sang app XePrime Partner.
 */
function user(overrides: Partial<CurrentUser> = {}): CurrentUser {
  return {
    id: 'u1',
    displayName: 'Nguyễn Văn A',
    email: null,
    avatarUrl: null,
    phone: null,
    phoneVerified: false,
    hasPassword: true,
    tenant: null,
    platformRole: null,
    permissions: [],
    ...overrides,
  } as CurrentUser;
}

function tenant(overrides: Partial<NonNullable<CurrentUser['tenant']>> = {}) {
  return {
    id: 't1',
    name: 'Việt Car Hà Nội',
    roleKey: TENANT_ROLE.SHOP_OWNER,
    billingMode: BILLING_MODE.COMMISSION,
    onboardingState: 'commission',
    publicVehicleCount: 1,
    ...overrides,
  } as NonNullable<CurrentUser['tenant']>;
}

describe('resolveAccountNav — MỘT menu khách', () => {
  it('mười mục, cùng thứ tự với ACCOUNT_NAV bên web', () => {
    const groups = resolveAccountNav(user(), { hasDriverLinks: true });
    expect(groups.map((g) => g.key)).toEqual(['account']);
    expect(groups[0]?.items.map((i) => i.key)).toEqual([
      'profile',
      // Giấy tờ & Xác minh — bằng lái (ADR 0057).
      'documents',
      'becomeOwner',
      'trips',
      // Nơi tôi làm tài xế (ADR 0063).
      'driving',
      'payments',
      'balance',
      'bankAccounts',
      'changePassword',
      'deleteAccount',
    ]);
  });

  it('chưa từng được mời làm tài xế thì ẩn mục "Nơi tôi làm tài xế"', () => {
    const keys = flattenAccountNav(resolveAccountNav(user())).map((i) => i.key);
    expect(keys).not.toContain('driving');
    expect(keys).toContain('trips');
  });

  it('không phụ thuộc vai hay tuyến — kể cả khi một API cũ còn trả tenant', () => {
    for (const u of [
      user(),
      user({ tenant: tenant() }),
      user({ tenant: tenant({ billingMode: BILLING_MODE.PACKAGE }) }),
      user({ tenant: tenant({ roleKey: TENANT_ROLE.SHOP_STAFF }) }),
    ]) {
      expect(flattenAccountNav(resolveAccountNav(u, { hasDriverLinks: true }))).toEqual(ACCOUNT_NAV);
    }
  });

  it('không còn mục Owner Lite nào trong khu tài khoản', () => {
    const paths = ACCOUNT_NAV.map((i) => navItemPath(i.href));
    for (const ownerLite of [
      '/account/vehicles',
      '/account/calendar',
      '/account/tax',
      '/account/registration',
      '/account/earnings',
      '/account/host-guide',
    ]) {
      expect(paths).not.toContain(ownerLite);
    }
  });

  it('"Trở thành chủ xe" sang màn chọn cách cho thuê của app Partner, mở như một màn thường', () => {
    const becomeOwner = ACCOUNT_NAV.find((i) => i.key === 'becomeOwner');
    expect(becomeOwner?.labelKey).toBe('public.becomeOwner');
    expect(becomeOwner?.href).toEqual(ROUTES.manage.register());
    expect(becomeOwner?.target).toBe(NAV_TARGET.SCREEN);
  });

  it('hai mục của THANH TAB mở bằng `replace`, không push chồng lên chính nó', () => {
    const byKey = new Map(ACCOUNT_NAV.map((i) => [i.key, i.target]));
    expect(byKey.get('profile')).toBe(NAV_TARGET.TAB);
    expect(byKey.get('trips')).toBe(NAV_TARGET.TAB);
  });

  it('khoá của các mục là duy nhất', () => {
    const keys = ACCOUNT_NAV.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('lối vào yêu cầu xoá tài khoản', () => {
  it('menu đã có mục ⇒ không dựng thêm thẻ ở màn Tài khoản', () => {
    expect(showsDeleteAccountCard(user())).toBe(false);
  });

  it('chưa đăng nhập thì không có gì để xoá', () => {
    expect(showsDeleteAccountCard(null)).toBe(false);
  });
});

describe('resolveWorkspaceHref / canUseManagePortal', () => {
  it('tài khoản khách không có khu làm việc', () => {
    expect(resolveWorkspaceHref(user())).toBeNull();
    expect(canUseManagePortal(user())).toBe(false);
  });

  it('API cũ còn trả tenant ⇒ dẫn về khu quản lý (app Partner), không vỡ', () => {
    expect(resolveWorkspaceHref(user({ tenant: tenant() }))).toEqual(ROUTES.manage.home());
    expect(
      canUseManagePortal(user({ tenant: tenant({ billingMode: BILLING_MODE.PACKAGE }) })),
    ).toBe(true);
  });
});

describe('matchAccountNavKey', () => {
  const items = flattenAccountNav(resolveAccountNav(user(), { hasDriverLinks: true }));

  it('khớp tuyệt đối', () => {
    expect(matchAccountNavKey('/account/change-password', items)).toBe('changePassword');
  });

  it('màn con vẫn sáng mục cha', () => {
    expect(matchAccountNavKey('/trips/abc', items)).toBe('trips');
  });

  it('gốc /account KHÔNG nuốt các màn con', () => {
    expect(matchAccountNavKey('/account', items)).toBe('profile');
    expect(matchAccountNavKey('/account/balance', items)).toBe('balance');
  });

  it('đường dẫn ngoài khu thì không mục nào sáng', () => {
    expect(matchAccountNavKey('/search', items)).toBeUndefined();
  });
});
