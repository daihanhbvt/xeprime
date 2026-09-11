import { describe, expect, it } from 'vitest';
import { TENANT_ROLE } from '@xeprime/types';

import type { CurrentUser } from '@/hooks/use-current-user';

import {
  ACCOUNT_NAV,
  OWNER_NAV,
  flattenAccountNav,
  isCommissionOwner,
  isShopOwner,
  matchAccountNavKey,
  resolveAccountNav,
} from './account-nav';
import { ROUTES } from './routes';

/**
 * Menu khu tài khoản.
 *
 * Ba nhóm bất biến: **mục nào ĐƯỢC có mặt** (ADR 0014 đã loại ba mục khỏi mockup — quên lý do
 * thì chúng sẽ lặng lẽ quay lại), **ai thấy nhóm chủ xe** (menu chủ xe cho `shop_owner`, không
 * cho nhân viên gian hàng), và **mục nào đang sáng** (một menu chỉ ra sai chỗ đứng còn tệ hơn
 * menu không đánh dấu gì).
 *
 * Bản 08/09/2026 mở rộng: khu tài khoản nay phục vụ CẢ chủ xe ít xe, nên menu có hai hình dạng.
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
    slug: 'viet-car',
    status: 'active',
    roleKey: TENANT_ROLE.SHOP_OWNER,
    features: [],
    planCode: null,
    planEndsAt: null,
    ...overrides,
  } as NonNullable<CurrentUser['tenant']>;
}

describe('ACCOUNT_NAV — thành phần', () => {
  it('mở đầu bằng hồ sơ, và hồ sơ là mục duy nhất trỏ về gốc khu tài khoản', () => {
    expect(ACCOUNT_NAV[0]?.key).toBe('profile');
    expect(ACCOUNT_NAV.filter((i) => i.href === ROUTES.ACCOUNT.ROOT)).toHaveLength(1);
  });

  it('KHÔNG có ví/ưu đãi — ADR 0028 điều 8: số dư chủ xe là sổ công nợ, không phải ví', () => {
    expect(ACCOUNT_NAV.some((i) => /wallet|voucher|promo/i.test(i.key))).toBe(false);
  });

  it('KHÔNG có mục nào dẫn thẳng vào cổng quản lý — đó là việc của ShopEntryCard/CTA chủ xe', () => {
    expect(ACCOUNT_NAV.some((i) => i.href.startsWith('/manage'))).toBe(false);
  });

  it('Chuyến của tôi trỏ sang route /trips có sẵn, đánh dấu external', () => {
    const trips = ACCOUNT_NAV.find((i) => i.key === 'trips');
    expect(trips?.href).toBe(ROUTES.TRIPS);
    expect(trips?.external).toBe(true);
  });

  /**
   * Điều kiện chung thay vì đếm số mục: mọi mục còn lại phải dẫn tới một nơi CÓ THẬT. Thêm mục
   * mới vào menu mà quên dựng trang thì đỏ ở đây.
   */
  it('mọi mục đều dẫn tới một route đã dựng — không còn mục "Sắp có"', () => {
    const built = new Set<string>([
      ROUTES.ACCOUNT.ROOT,
      ROUTES.ACCOUNT.VEHICLES,
      ROUTES.ACCOUNT.CALENDAR,
      ROUTES.ACCOUNT.HOST_GUIDE,
      ROUTES.ACCOUNT.TAX,
      ROUTES.ACCOUNT.CONTRACTS_DOCUMENTS,
      ROUTES.ACCOUNT.DATA_PROTECTION,
      ROUTES.ACCOUNT.BALANCE,
      ROUTES.ACCOUNT.BANK_ACCOUNTS,
      ROUTES.ACCOUNT.CHANGE_PASSWORD,
      ROUTES.ACCOUNT.DELETE_ACCOUNT,
      ROUTES.TRIPS,
    ]);
    for (const item of [...ACCOUNT_NAV, ...OWNER_NAV]) {
      expect(built.has(item.href)).toBe(true);
    }
  });

  it('mọi mục nằm trong /account đều là route đã khai báo ở ROUTES', () => {
    const declared = new Set<string>(Object.values(ROUTES.ACCOUNT));
    for (const item of [...ACCOUNT_NAV, ...OWNER_NAV]) {
      if (item.external) continue;
      expect(declared.has(item.href)).toBe(true);
    }
  });

  it('khoá của các mục là duy nhất', () => {
    expect(new Set(ACCOUNT_NAV.map((i) => i.key)).size).toBe(ACCOUNT_NAV.length);
    expect(new Set(OWNER_NAV.map((i) => i.key)).size).toBe(OWNER_NAV.length);
  });
});

describe('isShopOwner / isCommissionOwner', () => {
  it('chỉ vai chủ gian hàng mới là chủ xe — quản lý/nhân viên thì không', () => {
    expect(isShopOwner(user({ tenant: tenant() }))).toBe(true);
    expect(isShopOwner(user({ tenant: tenant({ roleKey: TENANT_ROLE.SHOP_MANAGER }) }))).toBe(false);
    expect(isShopOwner(user({ tenant: tenant({ roleKey: TENANT_ROLE.SHOP_STAFF }) }))).toBe(false);
    expect(isShopOwner(user())).toBe(false);
  });

  it('tuyến hoa hồng = chủ gian hàng CHƯA có gói (ADR 0028 điều 1)', () => {
    expect(isCommissionOwner(user({ tenant: tenant({ planCode: null }) }))).toBe(true);
    expect(isCommissionOwner(user({ tenant: tenant({ planCode: 'slot_flat' }) }))).toBe(false);
    // Khách thuê không phải "chủ xe tuyến hoa hồng" chỉ vì họ chưa có gói.
    expect(isCommissionOwner(user())).toBe(false);
  });
});

describe('resolveAccountNav', () => {
  it('chủ gian hàng: nhóm chủ xe đứng trước, rồi nhóm Tài khoản', () => {
    const groups = resolveAccountNav(user({ tenant: tenant() }));
    expect(groups.map((g) => g.key)).toEqual(['owner', 'account']);
    expect(groups[0]?.items.map((i) => i.key)).toEqual([
      'vehicles',
      'calendar',
      'hostGuide',
      'trips',
      'tax',
      'contractsDocuments',
      'dataProtection',
    ]);
    expect(groups[1]?.items.map((i) => i.key)).toEqual([
      'profile',
      'changePassword',
      'deleteAccount',
    ]);
  });

  it('khách thuê: một nhóm, có "Trở thành chủ xe", KHÔNG có mục quản lý xe', () => {
    const groups = resolveAccountNav(user());
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((i) => i.key)).toEqual([
      'profile',
      'becomeOwner',
      'trips',
      'changePassword',
      'deleteAccount',
    ]);
    expect(groups[0]?.items.some((i) => i.href === ROUTES.ACCOUNT.VEHICLES)).toBe(false);
  });

  /**
   * Điều quan trọng nhất của bản này: nhân viên gian hàng KHÔNG phải chủ xe. Cho họ menu chủ xe
   * là dẫn họ tới những màn mà `TenantScopeGuard` + permission sẽ từ chối.
   */
  it('quản lý/nhân viên của một gian hàng dùng menu cá nhân, không phải menu chủ xe', () => {
    for (const roleKey of [
      TENANT_ROLE.SHOP_MANAGER,
      TENANT_ROLE.SHOP_STAFF,
      TENANT_ROLE.SHOP_VIEWER,
    ]) {
      const groups = resolveAccountNav(user({ tenant: tenant({ roleKey }) }));
      expect(groups.some((g) => g.key === 'owner')).toBe(false);
      // Họ đã thuộc một gian hàng ⇒ CTA dẫn về cổng quản lý, không mời "trở thành chủ xe".
      const cta = groups[0]?.items.find((i) => i.key === 'becomeOwner');
      expect(cta?.href).toBe(ROUTES.MANAGE.ROOT);
      expect(cta?.labelKey).toBe('public.manageShop');
    }
  });

  it('người chưa có gian hàng được mời qua LANDING đăng xe, không phải form tạo shop', () => {
    const cta = resolveAccountNav(user())[0]?.items.find((i) => i.key === 'becomeOwner');
    // 09/09/2026: CTA dừng ở trang giới thiệu công khai; gian hàng chỉ được tạo khi người dùng
    // bấm tiếp ở đó (`resolveOwnerCtaHref`).
    expect(cta?.href).toBe(ROUTES.LIST_YOUR_VEHICLE.ROOT);
    expect(cta?.labelKey).toBe('public.becomeOwner');
  });
});

describe('matchAccountNavKey', () => {
  const ownerItems = flattenAccountNav(resolveAccountNav(user({ tenant: tenant() })));

  it('khớp tuyệt đối', () => {
    expect(matchAccountNavKey(ROUTES.ACCOUNT.CHANGE_PASSWORD, ownerItems)).toBe('changePassword');
  });

  it('trang con vẫn sáng mục cha', () => {
    expect(matchAccountNavKey(`${ROUTES.ACCOUNT.VEHICLES}/abc`, ownerItems)).toBe('vehicles');
    expect(matchAccountNavKey(`${ROUTES.TRIPS}/abc`, ownerItems)).toBe('trips');
  });

  it('gốc /account KHÔNG nuốt các trang con', () => {
    // Nếu khớp theo tiền tố thì mọi trang trong khu đều sáng "Tài khoản của tôi".
    expect(matchAccountNavKey(ROUTES.ACCOUNT.ROOT, ownerItems)).toBe('profile');
    // `/account/payments` còn route nhưng KHÔNG còn trong menu ⇒ không mục nào sáng. Đó là
    // đúng: làm sáng một mục người dùng không nhìn thấy còn khó hiểu hơn là không sáng gì.
    expect(matchAccountNavKey(ROUTES.ACCOUNT.PAYMENTS, ownerItems)).toBeUndefined();
  });

  it('đường dẫn ngoài khu thì không mục nào sáng', () => {
    expect(matchAccountNavKey('/search', ownerItems)).toBeUndefined();
  });

  it('/trips sáng mục Chuyến của tôi dù nó nằm ngoài /account', () => {
    expect(matchAccountNavKey('/trips')).toBe('trips');
    expect(matchAccountNavKey('/trips/abc')).toBe('trips');
  });
});
