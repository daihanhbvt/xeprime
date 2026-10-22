import { describe, expect, it } from 'vitest';
import { BILLING_MODE, TENANT_ROLE } from '@xeprime/types';

import type { CurrentUser } from '@/hooks/use-current-user';

import {
  ACCOUNT_NAV,
  flattenAccountNav,
  isCommissionOwner,
  isShopOwner,
  matchAccountNavKey,
  resolveAccountNav,
} from './account-nav';
import { ROUTES } from './routes';

/**
 * Menu tài khoản của site KHÁCH (`xeprime.vn`).
 *
 * Từ ADR 0053 tài khoản khách không có gian hàng: menu chủ xe (Owner Lite) và hai mục của tài khoản
 * gian hàng đã sang site partner. Ba nhóm bất biến: **mục nào được có mặt**, **không mục nào dẫn vào
 * việc của site partner** (ngoài đúng một lối "Đăng xe cho thuê" sang trang đăng ký), và **mục nào
 * đang sáng**.
 */

function tenant(overrides: Partial<NonNullable<CurrentUser['tenant']>> = {}) {
  return {
    id: 't1',
    name: 'Việt Car Hà Nội',
    slug: 'viet-car',
    status: 'active',
    roleKey: TENANT_ROLE.SHOP_OWNER,
    features: [],
    planCode: 'BASIC',
    billingMode: BILLING_MODE.COMMISSION,
    planEndsAt: null,
    publicVehicleCount: 2,
    ...overrides,
  } as NonNullable<CurrentUser['tenant']>;
}

const keys = (items: readonly { key: string }[]) => items.map((item) => item.key);

describe('ACCOUNT_NAV — thành phần', () => {
  it('đúng mười một mục, đúng thứ tự', () => {
    expect(keys(ACCOUNT_NAV)).toEqual([
      'profile',
      // Giấy tờ & Xác minh — bằng lái, điều kiện đặt xe tự lái (ADR 0057).
      'documents',
      'becomeOwner',
      'trips',
      // Xe yêu thích — BRD customer favorites (21/10/2026).
      'favorites',
      'driving',
      'payments',
      'balance',
      'bankAccounts',
      'changePassword',
      'deleteAccount',
    ]);
  });

  it('mở đầu bằng hồ sơ, và hồ sơ là mục duy nhất trỏ về gốc khu tài khoản', () => {
    expect(ACCOUNT_NAV[0]!.href).toBe(ROUTES.ACCOUNT.ROOT);
    expect(ACCOUNT_NAV.filter((item) => item.href === ROUTES.ACCOUNT.ROOT)).toHaveLength(1);
  });

  it('"Đăng xe cho thuê" dẫn tới trang giới thiệu đăng xe (tab mới); không mục nào trỏ thẳng sang site partner', () => {
    expect(ACCOUNT_NAV.filter((item) => item.href.startsWith(ROUTES.MANAGE.ROOT))).toEqual([]);
    const owner = ACCOUNT_NAV.find((item) => item.key === 'becomeOwner');
    expect(owner!.href).toBe(ROUTES.LIST_YOUR_VEHICLE.ROOT);
    expect(owner!.external).toBe(true);
  });

  it('KHÔNG có mục chủ xe nào của Owner Lite cũ (đã sang site partner)', () => {
    const hrefs = ACCOUNT_NAV.map((item) => item.href);
    for (const gone of [
      '/account/vehicles',
      '/account/calendar',
      '/account/earnings',
      '/account/registration',
      '/account/subscription',
      '/account/messages',
      ROUTES.MANAGE.VEHICLES,
      ROUTES.MANAGE.BALANCE,
    ]) {
      expect(hrefs).not.toContain(gone);
    }
  });

  it('KHÔNG có ví/ưu đãi — số dư là sổ công nợ (ADR 0033 điều 1), nhãn là "Ví điểm"', () => {
    expect(keys(ACCOUNT_NAV)).not.toContain('wallet');
    expect(keys(ACCOUNT_NAV)).not.toContain('promotions');
  });

  it('Chuyến của tôi trỏ sang route /trips có sẵn, đánh dấu external', () => {
    const trips = ACCOUNT_NAV.find((item) => item.key === 'trips')!;
    expect(trips.href).toBe(ROUTES.TRIPS);
    expect(trips.external).toBe(true);
  });

  it('mọi mục nằm trong /account đều là route đã khai báo ở ROUTES.ACCOUNT', () => {
    const known = new Set<string>(Object.values(ROUTES.ACCOUNT));
    for (const item of ACCOUNT_NAV.filter((i) => !i.external)) {
      expect(known.has(item.href), item.href).toBe(true);
    }
  });

  it('khoá của các mục là duy nhất', () => {
    expect(new Set(keys(ACCOUNT_NAV)).size).toBe(ACCOUNT_NAV.length);
  });
});

describe('resolveAccountNav', () => {
  it('MỘT nhóm, mọi tài khoản khách như nhau', () => {
    const groups = resolveAccountNav({ hasDriverLinks: true });
    expect(groups).toHaveLength(1);
    expect(flattenAccountNav(groups)).toEqual([...ACCOUNT_NAV]);
  });

  it('chưa từng được mời làm tài xế thì ẩn mục "Nơi tôi làm tài xế" (ADR 0063)', () => {
    const keys = flattenAccountNav(resolveAccountNav()).map((item) => item.key);
    expect(keys).not.toContain('driving');
    expect(keys).toContain('trips');
  });
});

describe('isShopOwner / isCommissionOwner (dùng ở site partner)', () => {
  it('chỉ vai chủ gian hàng mới là chủ', () => {
    expect(isShopOwner({ tenant: tenant() })).toBe(true);
    for (const roleKey of [
      TENANT_ROLE.SHOP_MANAGER,
      TENANT_ROLE.SHOP_STAFF,
      TENANT_ROLE.SHOP_VIEWER,
    ]) {
      expect(isShopOwner({ tenant: tenant({ roleKey }) }), roleKey).toBe(false);
    }
    expect(isShopOwner({ tenant: null })).toBe(false);
    expect(isShopOwner(null)).toBe(false);
  });

  it('tuyến hoa hồng đọc từ billingMode', () => {
    expect(isCommissionOwner({ tenant: tenant() })).toBe(true);
    expect(isCommissionOwner({ tenant: tenant({ billingMode: BILLING_MODE.PACKAGE }) })).toBe(
      false,
    );
    expect(isCommissionOwner({ tenant: null })).toBe(false);
  });
});

describe('matchAccountNavKey', () => {
  it('khớp tuyệt đối', () => {
    expect(matchAccountNavKey(ROUTES.ACCOUNT.ROOT)).toBe('profile');
    expect(matchAccountNavKey(ROUTES.ACCOUNT.BALANCE)).toBe('balance');
    expect(matchAccountNavKey(ROUTES.ACCOUNT.PAYMENTS)).toBe('payments');
    expect(matchAccountNavKey(ROUTES.ACCOUNT.BANK_ACCOUNTS)).toBe('bankAccounts');
  });

  it('trang con vẫn sáng mục cha', () => {
    expect(matchAccountNavKey(`${ROUTES.ACCOUNT.PAYMENTS}/01P`)).toBe('payments');
  });

  it('gốc /account KHÔNG nuốt các trang con', () => {
    expect(matchAccountNavKey(ROUTES.ACCOUNT.SETTINGS)).toBeUndefined();
    expect(matchAccountNavKey(`${ROUTES.ACCOUNT.ROOT}/unknown`)).toBeUndefined();
  });

  it('/trips sáng mục Chuyến của tôi dù nó nằm ngoài /account', () => {
    expect(matchAccountNavKey(ROUTES.TRIPS)).toBe('trips');
    expect(matchAccountNavKey(`${ROUTES.TRIPS}/01T`)).toBe('trips');
  });

  it('link sang site partner không bao giờ là mục đang mở', () => {
    // Ở chế độ `host` href là URL tuyệt đối — không sáng trên một trang của site khách.
    expect(
      matchAccountNavKey(ROUTES.ACCOUNT.ROOT, [
        { ...ACCOUNT_NAV[1]!, href: 'https://partner.xeprime.vn/register' },
      ]),
    ).toBeUndefined();
  });

  it('đường dẫn ngoài khu thì không mục nào sáng', () => {
    expect(matchAccountNavKey('/vehicles')).toBeUndefined();
  });
});
