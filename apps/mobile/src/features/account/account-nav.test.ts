import { TENANT_ROLE } from '@xeprime/types';
import type { CurrentUser } from '@/features/auth/api';
import { ROUTES } from '@/navigation/routes';
import {
  NAV_TARGET,
  OWNER_NAV,
  flattenAccountNav,
  isShopOwner,
  matchAccountNavKey,
  navItemPath,
  resolveAccountNav,
  resolveOwnerCtaHref,
} from './account-nav';

/**
 * Menu khu tài khoản của app native — GƯƠNG của `apps/web/src/constants/account-nav.test.ts`.
 *
 * Ba nhóm bất biến, đúng ba nhóm mà bản web khoá: **ai thấy nhóm chủ xe** (chủ gian hàng có, nhân
 * viên gian hàng KHÔNG), **mục nào đứng ở đâu** (thứ tự là hợp đồng với người dùng, không phải
 * chi tiết trình bày), và **mục nào dẫn tới đâu** — cộng thêm một nhóm chỉ app mới có: **mở bằng
 * cách nào** (`tab` / `screen` / `manage`), vì chọn sai kiểu là thanh tab khách nằm dưới một màn
 * quản lý, hoặc nút lui rơi vào màn người dùng chưa từng mở.
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

describe('resolveAccountNav — hình dạng theo vai', () => {
  it('chủ gian hàng: nhóm chủ xe đứng trước, rồi nhóm "Tài khoản" có tiêu đề', () => {
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
    // Tiêu đề nhóm là thứ làm đường phân cách ĐỌC RA được, không chỉ là một nét kẻ.
    expect(groups[1]?.labelKey).toBe('account.groupAccount');
    expect(groups[0]?.labelKey).toBeUndefined();
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
    expect(groups[0]?.items.some((i) => i.target === NAV_TARGET.MANAGE)).toBe(false);
  });

  /**
   * Điều quan trọng nhất của bộ này: nhân viên gian hàng KHÔNG phải chủ xe. Cho họ menu chủ xe là
   * dẫn họ tới những màn mà `TenantScopeGuard` + permission sẽ từ chối.
   */
  it('quản lý/nhân viên/người xem dùng menu cá nhân, và CTA của họ là "Quản lý gian hàng"', () => {
    for (const roleKey of [
      TENANT_ROLE.SHOP_MANAGER,
      TENANT_ROLE.SHOP_STAFF,
      TENANT_ROLE.SHOP_VIEWER,
    ]) {
      const groups = resolveAccountNav(user({ tenant: tenant({ roleKey }) }));

      expect(groups.some((g) => g.key === 'owner')).toBe(false);
      const cta = groups[0]?.items.find((i) => i.key === 'becomeOwner');
      expect(cta?.labelKey).toBe('public.manageShop');
      expect(navItemPath(cta!.href)).toBe(navItemPath(ROUTES.manage.home()));
      // Họ đã thuộc một gian hàng ⇒ ĐỔI KHU, không push một màn quản lý vào ngăn xếp khách.
      expect(cta?.target).toBe(NAV_TARGET.MANAGE);
    }
  });

  /**
   * 09/09/2026 bên web: mục menu dừng ở LANDING công khai, không ném thẳng người ta vào form hỏi
   * tên gian hàng và mã số thuế. Nút "Bắt đầu" trên `ShopEntryCard` mới vào form đó — HAI luồng.
   */
  it('người chưa có gian hàng: nhãn "Trở thành chủ xe", đích là LANDING đăng xe', () => {
    const cta = resolveAccountNav(user())[0]?.items.find((i) => i.key === 'becomeOwner');

    expect(cta?.labelKey).toBe('public.becomeOwner');
    expect(navItemPath(cta!.href)).toBe(navItemPath(ROUTES.listYourVehicle.root()));
    expect(cta?.target).toBe(NAV_TARGET.SCREEN);
  });

  it('nhân sự nền tảng không có gian hàng vẫn nhận menu cá nhân, không nhận menu chủ xe', () => {
    const groups = resolveAccountNav(
      user({ platformRole: 'platform_admin' } as Partial<CurrentUser>),
    );
    expect(groups.some((g) => g.key === 'owner')).toBe(false);
  });
});

describe('đích của từng mục', () => {
  it('mỗi mục dẫn tới một route ĐÃ KHAI ở bản đồ route — không có mục "sắp có"', () => {
    const declared = new Set(
      [
        ROUTES.account.home(),
        ROUTES.account.vehicles(),
        ROUTES.account.calendar(),
        ROUTES.account.hostGuide(),
        ROUTES.account.tax(),
        ROUTES.account.contractsDocuments(),
        ROUTES.account.dataProtection(),
        ROUTES.account.changePassword(),
        ROUTES.account.deleteAccount(),
        ROUTES.booking.list(),
        ROUTES.manage.home(),
        ROUTES.listYourVehicle.root(),
      ].map(navItemPath),
    );

    const everyItem = [
      ...flattenAccountNav(resolveAccountNav(user({ tenant: tenant() }))),
      ...flattenAccountNav(resolveAccountNav(user())),
      ...flattenAccountNav(
        resolveAccountNav(user({ tenant: tenant({ roleKey: TENANT_ROLE.SHOP_STAFF }) })),
      ),
    ];

    for (const item of everyItem) expect(declared.has(navItemPath(item.href))).toBe(true);
  });

  /**
   * Cả bảy mục chủ xe ở LẠI khu khách — kể cả "Danh sách xe" và "Lịch xe", vốn chỉ là feature của
   * `/manage` mặc vỏ tài khoản. Đẩy chúng sang khu quản lý là đổi cả thanh tab dưới chân màn hình
   * cho một người đang xem hồ sơ của chính mình.
   */
  it('không mục nào của menu chủ xe đổi khu — bảy màn đều thuộc khu khách', () => {
    expect(OWNER_NAV.some((i) => i.target === NAV_TARGET.MANAGE)).toBe(false);
    expect(OWNER_NAV.map((i) => navItemPath(i.href))).toEqual([
      '/account/vehicles',
      '/account/calendar',
      '/account/host-guide',
      '/trips',
      '/account/tax',
      '/account/contracts-documents',
      '/account/data-protection',
    ]);
  });

  it('hai mục của THANH TAB mở bằng `replace`, không push chồng lên chính nó', () => {
    const byKey = new Map(
      flattenAccountNav(resolveAccountNav(user())).map((i) => [i.key, i.target]),
    );
    expect(byKey.get('profile')).toBe(NAV_TARGET.TAB);
    expect(byKey.get('trips')).toBe(NAV_TARGET.TAB);
  });

  it('khoá của các mục là duy nhất trong mọi hình dạng menu', () => {
    for (const u of [user(), user({ tenant: tenant() })]) {
      const keys = flattenAccountNav(resolveAccountNav(u)).map((i) => i.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('isShopOwner / resolveOwnerCtaHref', () => {
  it('chỉ vai chủ gian hàng mới là chủ xe', () => {
    expect(isShopOwner(user({ tenant: tenant() }))).toBe(true);
    expect(isShopOwner(user({ tenant: tenant({ roleKey: TENANT_ROLE.SHOP_MANAGER }) }))).toBe(
      false,
    );
    expect(isShopOwner(user())).toBe(false);
  });

  it('CTA chủ xe trong MENU: chưa có gian hàng → landing; đã có → cổng quản lý', () => {
    expect(navItemPath(resolveOwnerCtaHref(user()))).toBe(
      navItemPath(ROUTES.listYourVehicle.root()),
    );
    expect(navItemPath(resolveOwnerCtaHref(user({ tenant: tenant() })))).toBe(
      navItemPath(ROUTES.manage.home()),
    );
  });
});

describe('matchAccountNavKey', () => {
  const ownerItems = flattenAccountNav(resolveAccountNav(user({ tenant: tenant() })));
  const guestItems = flattenAccountNav(resolveAccountNav(user()));

  it('khớp tuyệt đối', () => {
    expect(matchAccountNavKey('/account/change-password', ownerItems)).toBe('changePassword');
  });

  it('màn con vẫn sáng mục cha', () => {
    expect(matchAccountNavKey('/trips/abc', ownerItems)).toBe('trips');
  });

  it('gốc /account KHÔNG nuốt các màn con — nếu không thì mọi màn đều sáng "Tài khoản của tôi"', () => {
    expect(matchAccountNavKey('/account', ownerItems)).toBe('profile');
    expect(matchAccountNavKey('/account/tax', ownerItems)).toBe('tax');
  });

  it('đường dẫn ngoài khu thì không mục nào sáng', () => {
    expect(matchAccountNavKey('/search', guestItems)).toBeUndefined();
  });
});
