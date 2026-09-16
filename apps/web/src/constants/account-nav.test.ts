import { describe, expect, it } from 'vitest';
import { BILLING_MODE, TENANT_ROLE } from '@xeprime/types';

import type { CurrentUser } from '@/hooks/use-current-user';

import {
  ACCOUNT_NAV,
  OWNER_NAV,
  OWNER_REGISTERING_NAV,
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
    /*
     * Hình dạng THẬT của một chủ xe đã đi hết vòng đăng ký: có gói bậc `commission` (mọi tenant
     * mới đều được gán — `assignDefaultPlanWithinTx`) và có xe trên chợ.
     */
    planCode: 'BASIC',
    billingMode: BILLING_MODE.COMMISSION,
    planEndsAt: null,
    publicVehicleCount: 2,
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
      ROUTES.ACCOUNT.EARNINGS,
      ROUTES.ACCOUNT.BANK_ACCOUNTS,
      ROUTES.ACCOUNT.PAYMENTS,
      ROUTES.ACCOUNT.CHANGE_PASSWORD,
      ROUTES.ACCOUNT.DELETE_ACCOUNT,
      ROUTES.ACCOUNT.REGISTRATION,
      ROUTES.ACCOUNT.MESSAGES,
      ROUTES.ACCOUNT.SUBSCRIPTION,
      ROUTES.TRIPS,
    ]);
    for (const item of [...ACCOUNT_NAV, ...OWNER_NAV, ...OWNER_REGISTERING_NAV]) {
      expect(built.has(item.href)).toBe(true);
    }
  });

  it('mọi mục nằm trong /account đều là route đã khai báo ở ROUTES', () => {
    const declared = new Set<string>(Object.values(ROUTES.ACCOUNT));
    for (const item of [...ACCOUNT_NAV, ...OWNER_NAV, ...OWNER_REGISTERING_NAV]) {
      if (item.external) continue;
      expect(declared.has(item.href)).toBe(true);
    }
  });

  it('khoá của các mục là duy nhất', () => {
    expect(new Set(ACCOUNT_NAV.map((i) => i.key)).size).toBe(ACCOUNT_NAV.length);
    expect(new Set(OWNER_NAV.map((i) => i.key)).size).toBe(OWNER_NAV.length);
    expect(new Set(OWNER_REGISTERING_NAV.map((i) => i.key)).size).toBe(OWNER_REGISTERING_NAV.length);
  });
});

describe('isShopOwner / isCommissionOwner', () => {
  it('chỉ vai chủ gian hàng mới là chủ xe — quản lý/nhân viên thì không', () => {
    expect(isShopOwner(user({ tenant: tenant() }))).toBe(true);
    expect(isShopOwner(user({ tenant: tenant({ roleKey: TENANT_ROLE.SHOP_MANAGER }) }))).toBe(false);
    expect(isShopOwner(user({ tenant: tenant({ roleKey: TENANT_ROLE.SHOP_STAFF }) }))).toBe(false);
    expect(isShopOwner(user())).toBe(false);
  });

  /**
   * Sửa 14/09/2026 — đây là một BUG THẬT, không phải đổi ý.
   *
   * Bản cũ hỏi `planCode == null`, nhưng `BillingService.assignDefaultPlanWithinTx` gán cho MỌI
   * gian hàng mới một gói bậc `commission` ngay trong transaction đăng ký. Nghĩa là `planCode`
   * gần như không bao giờ rỗng, và 100% chủ xe tuyến hoa hồng bị xếp nhầm sang tuyến gói. Nguồn
   * đúng là `billingMode` của gói hiện hành (ADR 0024 đóng băng nó trên dòng thuê bao).
   */
  it('tuyến hoa hồng đọc từ billingMode, KHÔNG suy từ planCode', () => {
    // Có gói, nhưng gói đó là bậc hoa hồng ⇒ vẫn là Basic Owner.
    expect(
      isCommissionOwner(
        user({ tenant: tenant({ planCode: 'BASIC', billingMode: BILLING_MODE.COMMISSION }) }),
      ),
    ).toBe(true);
    expect(
      isCommissionOwner(
        user({ tenant: tenant({ planCode: 'slot_flat', billingMode: BILLING_MODE.PACKAGE }) }),
      ),
    ).toBe(false);
    // Không có gói hiệu lực (hết hạn) ⇒ không có thuê bao ⇒ tuyến hoa hồng.
    expect(
      isCommissionOwner(user({ tenant: tenant({ planCode: null, billingMode: null }) })),
    ).toBe(true);
    // Khách thuê không phải "chủ xe tuyến hoa hồng" chỉ vì họ chưa có gói.
    expect(isCommissionOwner(user())).toBe(false);
  });
});

describe('resolveAccountNav', () => {
  /*
   * BỐ CỤC GỌN của Owner Lite (16/09/2026) — MỘT nhóm phẳng, chín mục, đúng thứ tự này.
   *
   * Khẳng định bằng `toEqual` chứ không `toContain`: thứ tự LÀ nội dung ở đây. Việc hằng ngày
   * (xe · lịch · cẩm nang · chuyến) đứng trước giấy tờ, danh tính và tiền đứng cuối. Một mục mới
   * chen vào giữa phải làm test này đỏ, vì đó chính là cách menu phình lại thành mười một mục.
   *
   * Không còn nhóm "Tài khoản" thứ hai: đường kẻ giữa hai nhóm hứa một ranh giới không tồn tại —
   * chủ xe không đổi vai khi bấm từ "Lịch xe" sang "Tài khoản của tôi".
   */
  it('chủ xe: MỘT nhóm phẳng, chín mục, đúng thứ tự bố cục gọn', () => {
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
  });

  /*
   * Bảy mục đã RỜI KHỎI menu. Đây là thay đổi ĐIỀU HƯỚNG — route và dữ liệu còn nguyên, và các
   * test ngay dưới chứng minh tiền vẫn tới được. Nhưng chúng không được quay lại thành mục menu:
   * mỗi lần một màn tiền mọc thêm một cửa là một lần chủ xe phải đoán xem tiền nằm sau cửa nào.
   */
  it('chủ xe: bảy mục cũ KHÔNG còn trong menu', () => {
    const keys = flattenAccountNav(resolveAccountNav(user({ tenant: tenant() }))).map(
      (i) => i.key,
    );

    for (const gone of [
      'earnings',
      'messages',
      'ownerProfile',
      'subscription',
      'payments',
      'bankAccounts',
      'deleteAccount',
    ]) {
      expect(keys).not.toContain(gone);
    }
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
    expect(groups[0]?.items.some((i) => i.href === ROUTES.ACCOUNT.VEHICLES)).toBe(false);
    // Ví gian hàng KHÔNG hiện cho người không có gian hàng — với họ sổ đó không tồn tại.
    expect(groups[0]?.items.some((i) => i.href === ROUTES.ACCOUNT.EARNINGS)).toBe(false);
  });

  /**
   * Điều quan trọng nhất của bản này: nhân viên gian hàng KHÔNG phải chủ xe. Cho họ menu chủ xe
   * là dẫn họ tới những màn mà `TenantScopeGuard` + permission sẽ từ chối.
   */
  const STAFF_ROLES = [
    TENANT_ROLE.SHOP_MANAGER,
    TENANT_ROLE.SHOP_STAFF,
    TENANT_ROLE.SHOP_VIEWER,
  ] as const;

  it('quản lý/nhân viên dùng menu cá nhân, không phải menu chủ xe', () => {
    for (const roleKey of STAFF_ROLES) {
      const groups = resolveAccountNav(user({ tenant: tenant({ roleKey }) }));
      expect(groups.some((g) => g.key === 'owner')).toBe(false);
    }
  });

  /*
   * CTA của nhân viên dẫn về ĐÚNG khu làm việc của gian hàng họ, và khu đó phụ thuộc TUYẾN —
   * không phụ thuộc vai (F7, sửa 15/09/2026).
   *
   * Bản trước khẳng định nhân viên luôn về `/manage` "bất kể tuyến". Điều đó đúng với hàm cũ
   * nhưng sai với sản phẩm: gian hàng tuyến hoa hồng (và gian hàng đã hết gói) không có bộ quản
   * lý đầy đủ, nên dẫn nhân viên tới đó là dẫn tới một cánh cửa đóng.
   */
  /*
   * TÀI KHOẢN GIAN HÀNG TRONG KHU USER (15/09/2026).
   *
   * Áp cho MỌI vai của một gian hàng tuyến gói, kể cả chủ. Khu `/account` của họ còn ĐÚNG HAI
   * mục: lối vào nơi làm việc và hồ sơ pháp nhân.
   *
   * Hồ sơ CON NGƯỜI, đổi mật khẩu và yêu cầu xoá tài khoản KHÔNG còn ở đây — cả ba chuyển sang
   * "Tài khoản & bảo mật" trong Manage (`/manage/account`), nơi chúng đứng cạnh ví, lệnh rút và
   * pháp nhân mà một quyết định xoá tài khoản thật sự đụng tới. Giữ chúng ở khu khách nghĩa là
   * hai màn đổi mật khẩu cho cùng một người, và `AccountShell` chuyển hướng cả khu này đi rồi.
   */
  it('tài khoản gian hàng: ĐÚNG hai mục — quản lý gian hàng và hồ sơ gian hàng', () => {
    for (const roleKey of [TENANT_ROLE.SHOP_OWNER, ...STAFF_ROLES]) {
      const groups = resolveAccountNav(
        user({ tenant: tenant({ roleKey, billingMode: BILLING_MODE.PACKAGE }) }),
      );
      expect(groups).toHaveLength(1);
      const keys = groups[0]!.items.map((i) => i.key);
      expect(keys).toEqual(['manageShop', 'shopProfile']);

      const manage = groups[0]!.items.find((i) => i.key === 'manageShop');
      expect(manage?.href).toBe(ROUTES.MANAGE.ROOT);
      // "Hồ sơ gian hàng" là hồ sơ PHÁP NHÂN — không được gọi là "Tài khoản của tôi".
      const shopProfile = groups[0]!.items.find((i) => i.key === 'shopProfile');
      expect(shopProfile?.labelKey).toBe('account.shopProfile');
      expect(shopProfile?.href).toBe(ROUTES.MANAGE.SHOP);
      // Không mục nào trong menu này trỏ ngược vào khu khách — đó là cả điểm của nó.
      expect(keys).not.toContain('profile');
      expect(keys).not.toContain('changePassword');
      expect(keys).not.toContain('deleteAccount');
      expect(keys).not.toContain('trips');
    }
  });

  /*
   * QUY TẮC CHUYỂN TIẾP — ca thật: chủ xe tuyến hoa hồng đang đi thuê xe của người khác thì nâng
   * lên gói. Chuyến chưa xong, tiền hoàn chưa về, chat với chủ xe kia vẫn mở.
   *
   * Nghĩa vụ đó KHÔNG được biến mất — nhưng nó cũng không quay lại đây. Lối đi của nó là một thẻ
   * theo ngữ cảnh trong `/manage/account` dẫn tới `/manage/account/trips` (vai `renter`, xem
   * menu tài khoản của vỏ quản lý — `ManageUserCard`). Menu khu khách không có ngoại lệ nào: một mục chỉ đôi khi xuất
   * hiện khiến hai người dùng cùng vai nhìn thấy hai menu khác nhau và không ai giải thích được.
   */
  it('tài khoản gian hàng: KHÔNG có mục Chuyến, kể cả khi còn chuyến đi thuê chưa khép', () => {
    const shopTenant = tenant({ billingMode: BILLING_MODE.PACKAGE });

    for (const openRenterTripCount of [0, 2]) {
      const groups = resolveAccountNav(user({ tenant: shopTenant, openRenterTripCount }));
      expect(groups[0]!.items.map((i) => i.key)).toEqual(['manageShop', 'shopProfile']);
    }
  });

  it('nhân viên gian hàng TUYẾN HOA HỒNG: CTA KHÔNG dẫn vào /manage', () => {
    for (const roleKey of STAFF_ROLES) {
      const groups = resolveAccountNav(
        user({ tenant: tenant({ roleKey, billingMode: BILLING_MODE.COMMISSION }) }),
      );
      const cta = groups[0]?.items.find((i) => i.key === 'becomeOwner');
      expect(cta?.href).not.toBe(ROUTES.MANAGE.ROOT);
      expect(cta?.href.startsWith('/manage')).toBe(false);
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
    expect(matchAccountNavKey(ROUTES.ACCOUNT.TAX, ownerItems)).toBe('tax');
  });

  /*
   * `/account/payments` từng bị bỏ khỏi menu khi nó còn là placeholder. Màn thật đã có
   * (PROMPT 5), nên nó phải có đường vào — và phải có cho CẢ HAI loại người dùng, vì một chủ xe
   * cũng đi thuê xe của người khác.
   */
  /*
   * Lịch sử thanh toán KHÔNG còn là một mục menu của chủ xe (16/09/2026) — nó là tiền họ TRẢ khi
   * đi thuê, và chỗ đọc nó là chi tiết từng chuyến. Route vẫn sống để tra soát, nên nó vẫn phải
   * sáng đúng mục khi ai đó mở bằng link cũ… ở menu của người CÒN có mục đó.
   */
  it('lịch sử thanh toán vẫn sáng đúng mục trong menu khách thuê', () => {
    const renterItems = flattenAccountNav(resolveAccountNav(user()));

    expect(matchAccountNavKey(ROUTES.ACCOUNT.PAYMENTS, renterItems)).toBe('payments');
  });

  /**
   * BẤT BIẾN TIỀN — ADR 0033 điều 1.
   *
   * Tiền phải LUÔN tới được từ menu — nhưng từ 16/09/2026 cửa đó là "Tài khoản của tôi", không
   * còn là ba mục riêng.
   *
   *   · khách thuê : `balance` (ví cá nhân) + `bankAccounts` — menu ngắn của họ giữ nguyên
   *   · chủ xe     : `profile` — số dư ví TENANT hiện ngay trong đó, sổ đầy đủ sau một cú bấm
   *
   * Cả ba sổ từng biến khỏi menu một lần trong đợt làm lại nav: route vẫn còn, màn vẫn chạy,
   * nhưng không ai tới được. Với một sổ CÔNG NỢ thì ẩn đường vào tương đương không trả — điểm
   * không hết hạn và không thu hồi (ADR 0033 điều 1) thì cũng không được vô hình. Test này là cái
   * chốt để lần sau đỏ ngay thay vì im lặng.
   */
  it('BẤT BIẾN: tiền luôn tới được từ menu, cho đúng loại người dùng', () => {
    const renterItems = flattenAccountNav(resolveAccountNav(user()));

    // Khách thuê (chưa là chủ xe): ví CÁ NHÂN + nơi khai số tài khoản để rút.
    for (const href of [ROUTES.ACCOUNT.BALANCE, ROUTES.ACCOUNT.BANK_ACCOUNTS]) {
      expect(matchAccountNavKey(href, renterItems)).toBeDefined();
    }

    /*
     * CHỦ XE: một ví duy nhất, thuộc tenant (ADR 0038 điều 2). Menu của họ không có mục ví nào —
     * đường tới tiền là "Tài khoản của tôi", nơi `AccountMoneyPanel` hiện ba con số và liên kết
     * sang sổ đầy đủ. Một mục ví riêng sẽ là cửa thứ hai vào cùng một sổ.
     */
    expect(matchAccountNavKey(ROUTES.ACCOUNT.ROOT, ownerItems)).toBe('profile');
    expect(matchAccountNavKey(ROUTES.ACCOUNT.BALANCE, ownerItems)).toBeUndefined();
    expect(matchAccountNavKey(ROUTES.ACCOUNT.EARNINGS, ownerItems)).toBeUndefined();

    /*
     * Và cả ở bậc ĐANG ĐĂNG KÝ. Bậc đó không chỉ có người mới: một chủ xe từng cho thuê rồi tạm
     * ẩn hết xe cũng tụt về đây (`publicVehicleCount = 0`), và tiền họ đã kiếm vẫn nằm trong sổ —
     * nên hồ sơ phải có mặt trong menu rút gọn đó.
     */
    const registeringItems = flattenAccountNav(
      resolveAccountNav(user({ tenant: tenant({ publicVehicleCount: 0 }) })),
    );
    expect(matchAccountNavKey(ROUTES.ACCOUNT.ROOT, registeringItems)).toBe('profile');
    expect(matchAccountNavKey(ROUTES.ACCOUNT.CALENDAR, registeringItems)).toBeUndefined();
  });

  it('đường dẫn ngoài khu thì không mục nào sáng', () => {
    expect(matchAccountNavKey('/search', ownerItems)).toBeUndefined();
  });

  it('/trips sáng mục Chuyến của tôi dù nó nằm ngoài /account', () => {
    expect(matchAccountNavKey('/trips')).toBe('trips');
    expect(matchAccountNavKey('/trips/abc')).toBe('trips');
  });
});
