import { BILLING_MODE, TENANT_ROLE } from '@xeprime/types';
import type { CurrentUser } from '@/features/auth/api';
import { ROUTES } from '@/navigation/routes';
import {
  NAV_TARGET,
  OWNER_NAV,
  OWNER_REGISTERING_NAV,
  flattenAccountNav,
  canUseManagePortal,
  isShopOwner,
  matchAccountNavKey,
  navItemPath,
  resolveAccountNav,
  resolveOwnerCtaHref,
  showsDeleteAccountCard,
} from './account-nav';

/**
 * Menu khu tài khoản của app native — GƯƠNG của `apps/web/src/constants/account-nav.test.ts`.
 *
 * Ba nhóm bất biến, đúng ba nhóm mà bản web khoá: **ai thấy menu nào** (TUYẾN quyết định, không
 * phải vai — ADR 0038 điều 7), **mục nào đứng ở đâu** (thứ tự là hợp đồng với người dùng, không
 * phải chi tiết trình bày), và **mục nào dẫn tới đâu** — cộng thêm một nhóm chỉ app mới có: **mở
 * bằng cách nào** (`tab` / `screen` / `manage`), vì chọn sai kiểu là thanh tab khách nằm dưới một
 * màn quản lý, hoặc nút lui rơi vào màn người dùng chưa từng mở.
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
    openRenterTripCount: 0,
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
    onboardingState: 'commission',
    logoUrl: null,
    roleKey: TENANT_ROLE.SHOP_OWNER,
    features: [],
    planCode: null,
    planName: null,
    serviceFeePercent: null,
    billingMode: BILLING_MODE.COMMISSION,
    planEndsAt: null,
    billingPhase: 'current',
    graceEndsAt: null,
    publicVehicleCount: 1,
    ...overrides,
  } as NonNullable<CurrentUser['tenant']>;
}

/** Gian hàng TUYẾN GÓI — người có khu quản lý, nên khu khách của họ chỉ còn hai mục. */
function packageTenant(overrides: Partial<NonNullable<CurrentUser['tenant']>> = {}) {
  return tenant({ billingMode: BILLING_MODE.PACKAGE, ...overrides });
}

describe('resolveAccountNav — hình dạng theo vai', () => {
  it('chủ xe tuyến hoa hồng: MỘT nhóm phẳng, chín mục, KHÔNG tiêu đề', () => {
    const groups = resolveAccountNav(user({ tenant: tenant() }));

    expect(groups.map((g) => g.key)).toEqual(['owner']);
    expect(groups[0]?.items.map((i) => i.key)).toEqual([
      'vehicles',
      'calendar',
      'hostGuide',
      'trips',
      'tax',
      'contractsDocuments',
      'dataProtection',
      'profile',
      'changePassword',
    ]);
    // Không tiêu đề: chủ xe không đổi vai khi bấm từ "Lịch xe" sang "Tài khoản của tôi".
    expect(groups[0]?.labelKey).toBeUndefined();
  });

  /**
   * "Yêu cầu xoá tài khoản" rời MENU (ADR 0038 điều 9) — nó nằm trong "Tài khoản của tôi". Route
   * vẫn mở được; đây là thay đổi điều hướng, không xoá màn nào.
   */
  it('menu chủ xe không còn mục xoá tài khoản, và không có mục tiền nào', () => {
    const keys = flattenAccountNav(resolveAccountNav(user({ tenant: tenant() }))).map((i) => i.key);

    for (const gone of ['deleteAccount', 'balance', 'bankAccounts', 'payments', 'messages']) {
      expect(keys).not.toContain(gone);
    }
  });

  /**
   * Chưa có xe nào trên chợ ⇒ những màn nói về việc cho thuê chưa có gì để nói. Cùng bậc
   * `resolveOwnerStage` mà web dùng.
   */
  it('chủ xe ĐANG ĐĂNG KÝ nhận menu ngắn, không phải chín mục', () => {
    const groups = resolveAccountNav(user({ tenant: tenant({ publicVehicleCount: 0 }) }));

    expect(groups.map((g) => g.key)).toEqual(['owner']);
    expect(groups[0]?.items).toEqual(OWNER_REGISTERING_NAV);
    expect(groups[0]?.items.map((i) => i.key)).not.toContain('calendar');
    /*
     * "Hồ sơ đăng ký" đứng ĐẦU: đó là việc duy nhất còn dang dở, và cũng là chỗ duy nhất họ sửa
     * được hồ sơ gian hàng — khu quản lý đóng với tuyến hoa hồng (ADR 0038 điều 4).
     */
    expect(groups[0]?.items[0]?.key).toBe('registration');
  });

  /**
   * ADR 0038 điều 7: khu khách của một tài khoản gian hàng còn ĐÚNG HAI mục. Hồ sơ con người,
   * đổi mật khẩu và yêu cầu xoá tài khoản sống ở khu quản lý.
   */
  it('gian hàng tuyến GÓI: đúng ba mục, và cả ba đều ĐỔI KHU', () => {
    const groups = resolveAccountNav(user({ tenant: packageTenant() }));

    expect(groups.map((g) => g.key)).toEqual(['account']);
    expect(groups[0]?.items.map((i) => i.key)).toEqual(['manageShop', 'shopProfile', 'personalProfile']);
    expect(groups[0]?.items.every((i) => i.target === NAV_TARGET.MANAGE)).toBe(true);
  });

  /**
   * Câu hỏi "ai vào được Manage" hỏi TENANT, không hỏi vai — nên quản lý/nhân viên/người xem của
   * một gian hàng tuyến gói nhận CÙNG menu ba mục với chủ.
   */
  it('mọi vai của gian hàng tuyến GÓI nhận cùng ba mục', () => {
    for (const roleKey of [
      TENANT_ROLE.SHOP_OWNER,
      TENANT_ROLE.SHOP_MANAGER,
      TENANT_ROLE.SHOP_STAFF,
      TENANT_ROLE.SHOP_VIEWER,
    ]) {
      const groups = resolveAccountNav(user({ tenant: packageTenant({ roleKey }) }));
      expect(groups[0]?.items.map((i) => i.key)).toEqual(['manageShop', 'shopProfile', 'personalProfile']);
    }
  });

  /**
   * `unconfigured` KHÔNG phải một tuyến (ADR 0038 điều 1), nhưng người đó vẫn SỞ HỮU một gian
   * hàng và không có `/manage` — khoá luôn khu này sẽ để họ không còn chỗ nào.
   */
  it('chủ xe chưa xác định được tuyến vẫn làm việc ở Owner Lite', () => {
    const groups = resolveAccountNav(user({ tenant: tenant({ billingMode: null }) }));

    expect(groups.map((g) => g.key)).toEqual(['owner']);
    expect(groups[0]?.items).toEqual(OWNER_NAV);
  });

  it('khách thuê: một nhóm, có "Trở thành chủ xe", KHÔNG có mục quản lý xe', () => {
    const groups = resolveAccountNav(user());

    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((i) => i.key)).toEqual([
      'profile',
      'becomeOwner',
      'trips',
      'payments',
      'balance',
      'bankAccounts',
      'changePassword',
      'deleteAccount',
    ]);
    expect(groups[0]?.items.some((i) => i.target === NAV_TARGET.MANAGE)).toBe(false);
  });

  /**
   * Khách thuê CÓ số dư: tiền hoàn khoản giữ chỗ chảy vào ví điểm của họ (ADR 0033 điều 5). Menu
   * của họ phải luôn còn đường tới tiền và tới ô khai tài khoản nhận tiền.
   */
  it('khách thuê luôn có lối tới ví điểm và tài khoản nhận tiền', () => {
    const paths = flattenAccountNav(resolveAccountNav(user())).map((i) => navItemPath(i.href));

    expect(paths).toContain(navItemPath(ROUTES.account.balance()));
    expect(paths).toContain(navItemPath(ROUTES.account.bankAccounts()));
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
      const shopGroups = resolveAccountNav(user({ tenant: packageTenant({ roleKey }) }));
      const commissionGroups = resolveAccountNav(user({ tenant: tenant({ roleKey }) }));

      expect(shopGroups.some((g) => g.key === 'owner')).toBe(false);
      expect(commissionGroups.some((g) => g.key === 'owner')).toBe(false);

      // Tuyến GÓI: khu khách còn hai mục, và "Quản lý gian hàng" ĐỔI KHU.
      const manage = shopGroups[0]?.items.find((i) => i.key === 'manageShop');
      expect(navItemPath(manage!.href)).toBe(navItemPath(ROUTES.manage.home()));
      expect(manage?.target).toBe(NAV_TARGET.MANAGE);

      /*
       * Tuyến HOA HỒNG: họ vẫn giữ menu cá nhân, nhưng CTA KHÔNG được trỏ vào khu quản lý —
       * ScopeGuard sẽ đá họ ra ngay khung hình sau. Web khoá đúng bất biến này: đích của một
       * thành viên tenant hoa hồng không bao giờ bắt đầu bằng "/manage".
       */
      const cta = commissionGroups[0]?.items.find((i) => i.key === 'becomeOwner');
      expect(cta?.labelKey).toBe('public.manageShop');
      expect(navItemPath(cta!.href).startsWith('/manage')).toBe(false);
      expect(cta?.target).toBe(NAV_TARGET.SCREEN);
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
        ROUTES.account.balance(),
        ROUTES.account.bankAccounts(),
        ROUTES.account.payments(),
        ROUTES.account.registration(),
        ROUTES.booking.list(),
        ROUTES.manage.home(),
        ROUTES.manage.shop(),
        ROUTES.manage.account(),
        ROUTES.listYourVehicle.root(),
      ].map(navItemPath),
    );

    const everyItem = [
      ...flattenAccountNav(resolveAccountNav(user({ tenant: tenant() }))),
      ...flattenAccountNav(resolveAccountNav(user({ tenant: tenant({ publicVehicleCount: 0 }) }))),
      ...flattenAccountNav(resolveAccountNav(user({ tenant: packageTenant() }))),
      ...flattenAccountNav(resolveAccountNav(user())),
      ...flattenAccountNav(
        resolveAccountNav(user({ tenant: tenant({ roleKey: TENANT_ROLE.SHOP_STAFF }) })),
      ),
    ];

    for (const item of everyItem) expect(declared.has(navItemPath(item.href))).toBe(true);
  });

  /**
   * Cả chín mục chủ xe ở LẠI khu khách — kể cả "Danh sách xe" và "Lịch xe", vốn chỉ là feature của
   * `/manage` mặc vỏ tài khoản. Đẩy chúng sang khu quản lý là đổi cả thanh tab dưới chân màn hình
   * cho một người đang xem hồ sơ của chính mình — và chủ xe tuyến hoa hồng không vào khu đó được.
   */
  it('không mục nào của menu chủ xe đổi khu — chín màn đều thuộc khu khách', () => {
    expect(OWNER_NAV.some((i) => i.target === NAV_TARGET.MANAGE)).toBe(false);
    expect(OWNER_NAV.map((i) => navItemPath(i.href))).toEqual([
      '/account/vehicles',
      '/account/calendar',
      '/account/host-guide',
      '/trips',
      '/account/tax',
      '/account/contracts-documents',
      '/account/data-protection',
      '/account',
      '/account/change-password',
    ]);
  });

  /**
   * ADR 0038 điều 9 đẩy "Yêu cầu xoá tài khoản" ra khỏi menu Owner Lite và hẹn nó nằm TRONG
   * "Tài khoản của tôi". Ba nhánh dưới đây canh đúng một điều: MỌI người đăng nhập đều có đúng
   * MỘT lối tới màn đó — không ai mất lối, và không ai thấy hai lối cho cùng một thao tác.
   */
  describe('lối vào yêu cầu xoá tài khoản', () => {
    it('chủ xe tuyến hoa hồng: menu không có ⇒ thẻ ở màn Tài khoản của tôi phải có', () => {
      expect(showsDeleteAccountCard(user({ tenant: tenant() }))).toBe(true);
      expect(showsDeleteAccountCard(user({ tenant: tenant({ publicVehicleCount: 0 }) }))).toBe(true);
    });

    it('khách thuê: đã có mục trong MENU ⇒ không dựng thêm thẻ', () => {
      expect(showsDeleteAccountCard(user())).toBe(false);
    });

    it('gian hàng tuyến gói: lối vào ở /manage/account ⇒ khu khách không dựng thẻ', () => {
      expect(showsDeleteAccountCard(user({ tenant: packageTenant() }))).toBe(false);
    });

    it('chưa đăng nhập thì không có gì để xoá', () => {
      expect(showsDeleteAccountCard(null)).toBe(false);
    });
  });

  it('hai mục của THANH TAB mở bằng `replace`, không push chồng lên chính nó', () => {
    const byKey = new Map(
      flattenAccountNav(resolveAccountNav(user())).map((i) => [i.key, i.target]),
    );
    expect(byKey.get('profile')).toBe(NAV_TARGET.TAB);
    expect(byKey.get('trips')).toBe(NAV_TARGET.TAB);
  });

  it('khoá của các mục là duy nhất trong mọi hình dạng menu', () => {
    for (const u of [user(), user({ tenant: tenant() }), user({ tenant: packageTenant() })]) {
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

  it('CTA chủ xe trong MENU: chưa có gian hàng → landing', () => {
    expect(navItemPath(resolveOwnerCtaHref(user()))).toBe(
      navItemPath(ROUTES.listYourVehicle.root()),
    );
  });

  /**
   * Đích hỏi TUYẾN, không hỏi "có tenant hay không" (ADR 0038 điều 4).
   *
   * Trả đích khu quản lý cho một tenant tuyến hoa hồng là đẩy họ vào khu mà ScopeGuard đá ra ngay
   * khung hình sau — người dùng thấy một cái nháy kèm toast "bạn không còn quyền truy cập", trong
   * khi họ chẳng mất gì cả.
   */
  it('gian hàng tuyến GÓI → cổng quản lý', () => {
    expect(navItemPath(resolveOwnerCtaHref(user({ tenant: packageTenant() })))).toBe(
      navItemPath(ROUTES.manage.home()),
    );
    expect(canUseManagePortal(user({ tenant: packageTenant() }))).toBe(true);
  });

  it('chủ xe tuyến hoa hồng → danh sách xe của KHU KHÁCH, không phải khu quản lý', () => {
    const u = user({ tenant: tenant() });
    expect(navItemPath(resolveOwnerCtaHref(u))).toBe(navItemPath(ROUTES.account.vehicles()));
    expect(canUseManagePortal(u)).toBe(false);
  });

  it('chủ xe đang đăng ký → màn tài khoản, nơi thẻ gian hàng nói tiến trình duyệt', () => {
    const u = user({ tenant: tenant({ publicVehicleCount: 0 }) });
    expect(navItemPath(resolveOwnerCtaHref(u))).toBe(navItemPath(ROUTES.account.home()));
  });

  it('nhân viên của tenant tuyến hoa hồng → hồ sơ của chính mình, KHÔNG phải khu quản lý', () => {
    for (const roleKey of [
      TENANT_ROLE.SHOP_MANAGER,
      TENANT_ROLE.SHOP_STAFF,
      TENANT_ROLE.SHOP_VIEWER,
    ]) {
      const u = user({ tenant: tenant({ roleKey }) });
      expect(navItemPath(resolveOwnerCtaHref(u))).toBe(navItemPath(ROUTES.account.home()));
      expect(canUseManagePortal(u)).toBe(false);
    }
  });

  it('CTA của khu khách chỉ ĐỔI KHU khi đích thật sự nằm ở khu quản lý', () => {
    const commissionStaff = user({ tenant: tenant({ roleKey: TENANT_ROLE.SHOP_STAFF }) });
    const cta = resolveAccountNav(commissionStaff)[0]?.items.find((i) => i.key === 'becomeOwner');
    expect(cta?.target).toBe(NAV_TARGET.SCREEN);
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
