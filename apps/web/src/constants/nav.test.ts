import {
  DEFAULT_PLATFORM_ROLE_PERMISSIONS,
  DEFAULT_TENANT_ROLE_PERMISSIONS,
  FEATURE_STATE,
  PLATFORM_ROLE,
  TENANT_ROLE,
  isFeatureVisible,
  type FeatureState,
  type PlanFeature,
  type Permission,
  type TenantRole,
} from '@xeprime/types';
import { describe, expect, it } from 'vitest';

import {
  PLATFORM_NAV,
  SHOP_NAV,
  branchKeyOf,
  flattenLeaves,
  isNavBranch,
  leavesOfSection,
  matchSelectedKey,
  mobileTabsForScope,
  navForScope,
  sectionKeyOf,
} from './nav';
import enNavigation from '@xeprime/domain/messages/en/navigation.json';
import viNavigation from '@xeprime/domain/messages/vi/navigation.json';
import { ROUTES } from './routes';

/**
 * Test ĐẶC TẢ cho cây điều hướng theo mô hình khối (Tổng quan · Quản lý · Kinh doanh · Gian
 * hàng · Cấu hình · Tài khoản & thanh toán · Hỗ trợ).
 *
 * Bốn điều bộ này khoá lại:
 *  1. **Những lối vào PHẢI còn** — theo route cụ thể, không theo tổng số mục;
 *  2. **Vai trò nào thấy gì** — trên BA trục runtime thật (quyền · sở hữu · cờ năng lực);
 *  3. **Quy tắc chọn mục đang mở** (`matchSelectedKey`) — gom nhóm không được làm sáng nhầm;
 *  4. **Ranh giới gian hàng ↔ nền tảng** — `navForScope` chọn MỘT cây, không trộn.
 *
 * ⚠️ KHÔNG khoá tổng số mục lá (bản trước khoá cứng "23"). Con số đó không phải một bất biến
 * nghiệp vụ: nó chỉ đếm những gì đang có, nên mỗi lần thêm mục là một lần sửa số cho test xanh
 * lại — tức là bộ test khuyến khích menu phình ra và phản đối mọi lần dọn. Thứ đáng khoá là
 * *route nào phải tới được* và *ai thấy cái gì*, và đó là những gì bộ này khẳng định.
 *
 * ⚠️ Quyền lúc chạy đọc từ DB (`/auth/me`), KHÔNG phải từ `DEFAULT_*_ROLE_PERMISSIONS`.
 * Ở đây dùng bộ mặc định làm MÔ HÌNH ĐẠI DIỆN cho từng vai trò để phát biểu được câu
 * "vai trò này thấy gì" — chủ shop vẫn tạo được custom role và admin vẫn thu hồi được quyền.
 * Và ẩn một mục menu KHÔNG bảo vệ gì: chặn thật nằm ở guard backend (CLAUDE.md mục 6).
 */

interface VisibilityContext {
  /** Vai trong gian hàng — trục SỞ HỮU của `ownerOnly` (ADR 0038 điều 3). */
  readonly roleKey?: TenantRole;
  /** Cờ năng lực theo gói (ADR 0027). Vắng ⇒ `enabled`, đúng mặc định "không khoá ai". */
  readonly features?: Partial<Record<PlanFeature, FeatureState>>;
}

/**
 * Khoá nhãn của các mục lá mà một người CỤ THỂ nhìn thấy, theo đúng thứ tự khai báo.
 *
 * Kiểm đủ BA trục như `useManageNav.canSeeLeaf` lúc chạy — quyền, sở hữu, cờ năng lực. Bản
 * trước chỉ kiểm `permission`, nên nó khẳng định một thế giới không tồn tại: ở đó
 * `shop_manager` "thấy đủ 23 mục" kể cả mục ví mà runtime luôn ẩn vì `ownerOnly`. Hai bộ test
 * nói ngược nhau về cùng một màn hình thì bộ sai là bộ không mô phỏng runtime.
 *
 * Khẳng định trên KHOÁ chứ không trên câu tiếng Việt: cây menu là dữ liệu, và khoá là thứ
 * không đổi khi đổi ngôn ngữ. Việc khoá có bản dịch ở CẢ HAI ngôn ngữ do bài test toàn vẹn ở
 * cuối file giữ.
 */
function visibleLabels(
  granted: readonly Permission[],
  isPlatform: boolean,
  context: VisibilityContext = {},
): string[] {
  const set = new Set<string>(granted);
  const isShopOwner = context.roleKey === TENANT_ROLE.SHOP_OWNER;
  return flattenLeaves(navForScope(isPlatform))
    .filter(
      (leaf) =>
        set.has(leaf.permission) &&
        (leaf.ownerOnly !== true || isShopOwner) &&
        (leaf.feature === undefined ||
          isFeatureVisible(context.features?.[leaf.feature] ?? FEATURE_STATE.ENABLED)),
    )
    .map((leaf) => leaf.labelKey);
}

/** Mọi quyền của gian hàng — để chứng minh một mục KHÔNG mở được bằng trục quyền. */
const ALL_TENANT_PERMISSIONS = DEFAULT_TENANT_ROLE_PERMISSIONS[TENANT_ROLE.SHOP_OWNER];

/** Toàn bộ href của một cây — dùng để chứng minh "gom nhóm không mất mục nào". */
function hrefsOf(sections: typeof SHOP_NAV): string[] {
  return flattenLeaves(sections).map((leaf) => leaf.href);
}

describe('nav — cấu trúc khối', () => {
  it('gian hàng: các khối theo hành trình chủ xe, đúng thứ tự', () => {
    expect(SHOP_NAV.map((section) => section.key)).toEqual([
      'overview',
      'operations',
      'business',
      'storefront',
      'settings',
      'support',
    ]);
  });

  it('Tổng quan và Hỗ trợ luôn hiện (`pinned`), các khối giữa gập được', () => {
    const pinned = SHOP_NAV.filter((section) => section.pinned).map((section) => section.key);
    expect(pinned).toEqual(['overview', 'support']);
  });

  it('nền tảng: 2 khối — cây này KHÔNG bị sắp lại', () => {
    expect(PLATFORM_NAV.map((section) => section.key)).toEqual(['overview', 'platform']);
  });

  /*
   * 16/09/2026 — "Thanh toán giữ chỗ qua XePrime" thôi làm mục độc lập: cả trang cũ chỉ có đúng
   * một công tắc, nên nó về làm một section của "Chính sách thuê". Route cũ vẫn sống (redirect),
   * nhưng KHÔNG được quay lại menu: đây đúng là loại mục làm sidebar phình ra.
   */
  it('"Thanh toán giữ chỗ" KHÔNG còn là mục điều hướng — nó nằm trong Chính sách thuê', () => {
    const leaves = flattenLeaves(SHOP_NAV);
    expect(leaves.map((leaf) => leaf.key)).not.toContain('shop-payment-settings');
    expect(leaves.map((leaf) => leaf.href)).not.toContain(ROUTES.MANAGE.SHOP_PAYMENT_SETTINGS);
    // …và lối vào thật vẫn còn: trang chính sách là nơi chứa nó.
    expect(leaves.map((leaf) => leaf.href)).toContain(ROUTES.MANAGE.SHOP_POLICIES);
  });

  /*
   * 16/09/2026 — khối "Tài khoản & thanh toán" biến mất cùng ba mục của nó.
   *
   * "Gói & hoá đơn" và "Hồ sơ người bán" về làm hai section của trang Cửa hàng: cả ba mục cũ
   * đều trả lời cùng một câu hỏi ("gian hàng của tôi khai gì / trả tiền thế nào"), nên chúng là
   * một trang chứ không phải ba. "Tài khoản & bảo mật" thì rời sidebar hẳn — mật khẩu và xoá
   * tài khoản là việc của một CON NGƯỜI, và nó sống trong menu tài khoản ở thẻ người dùng.
   *
   * Cả ba route cũ vẫn sống dưới dạng redirect (xem `app/(manage)/manage/*`), nhưng KHÔNG được
   * quay lại menu.
   */
  it('KHÔNG còn mục riêng cho gói, hồ sơ người bán hay tài khoản — chúng đã gộp', () => {
    const hrefs = hrefsOf(SHOP_NAV);

    expect(hrefs).not.toContain(ROUTES.MANAGE.SUBSCRIPTION);
    expect(hrefs).not.toContain(ROUTES.MANAGE.SELLER_PROFILE);
    expect(hrefs).not.toContain(ROUTES.MANAGE.ACCOUNT);
    expect(hrefs).not.toContain(ROUTES.MANAGE.SECURITY);

    // …và lối vào thật vẫn còn: trang Cửa hàng là nơi chứa chúng.
    expect(hrefs).toContain(ROUTES.MANAGE.SHOP);
  });

  it('khối "Gian hàng" chỉ còn MỘT mục — trang Cửa hàng gộp năm section', () => {
    const storefront = SHOP_NAV.find((section) => section.key === 'storefront')!;

    expect(leavesOfSection(storefront).map((leaf) => leaf.href)).toEqual([ROUTES.MANAGE.SHOP]);
  });

  it('đúng ba mục cha (submenu): đội xe, đơn thuê, tài chính', () => {
    const branches = SHOP_NAV.flatMap((section) => section.children)
      .filter(isNavBranch)
      .map((branch) => branch.key);
    expect(branches).toEqual(['fleet', 'orders', 'finance']);
  });

  it('mọi route quan trọng vẫn có lối vào trong menu', () => {
    // Đây là bài test quan trọng nhất của mỗi đợt sắp lại: gom nhóm, đổi tên hay gộp trang đều
    // KHÔNG được làm mất đường vào một trang đang sống.
    for (const href of [
      ROUTES.MANAGE.BALANCE,
      ROUTES.MANAGE.SUPPORT_CASES,
      ROUTES.MANAGE.ROOT,
      ROUTES.MANAGE.CALENDAR,
      ROUTES.MANAGE.VEHICLES,
      ROUTES.MANAGE.MAINTENANCE,
      ROUTES.MANAGE.BOOKINGS,
      ROUTES.MANAGE.BOOKING_REQUESTS,
      ROUTES.MANAGE.CUSTOMERS,
      ROUTES.MANAGE.FINANCE,
      ROUTES.MANAGE.RECEIPTS,
      ROUTES.MANAGE.DEBTS,
      ROUTES.MANAGE.SHOP,
      ROUTES.MANAGE.SHOP_BRANCHES,
      ROUTES.MANAGE.SHOP_POLICIES,
      ROUTES.MANAGE.MEMBERS,
      ROUTES.MANAGE.DRIVERS,
      ROUTES.MANAGE.CHAT,
    ]) {
      expect(hrefsOf(SHOP_NAV)).toContain(href);
    }
  });

  it('Trung tâm bảo dưỡng nằm DƯỚI đội xe, không còn là mục ngang cấp', () => {
    const operations = SHOP_NAV.find((section) => section.key === 'operations')!;
    const fleet = operations.children.filter(isNavBranch).find((node) => node.key === 'fleet')!;
    expect(fleet.children.map((leaf) => leaf.href)).toEqual([
      ROUTES.MANAGE.VEHICLES,
      ROUTES.MANAGE.MAINTENANCE,
    ]);
  });

  it('Thu chi và Công nợ nằm DƯỚI Tài chính, không còn ba mục ngang cấp', () => {
    const business = SHOP_NAV.find((section) => section.key === 'business')!;
    const finance = business.children.filter(isNavBranch).find((node) => node.key === 'finance')!;
    expect(finance.children.map((leaf) => leaf.href)).toEqual([
      // Ví điểm đứng ĐẦU nhóm Tài chính: nó là tiền THẬT của gian hàng và có hành động (rút),
      // còn ba mục sau là sổ sách để đọc.
      ROUTES.MANAGE.BALANCE,
      ROUTES.MANAGE.FINANCE,
      ROUTES.MANAGE.RECEIPTS,
      ROUTES.MANAGE.DEBTS,
    ]);
  });

  /**
   * Ví KHÔNG gắn `feature`: số dư là tiền của chính gian hàng. Gói hết hạn là `read_only` chứ
   * không `hidden` (ADR 0027 điều 3), và tiền thì không thuộc về gói — ẩn nó đi nghĩa là giữ
   * tiền của người khác mà không cho họ thấy.
   */
  it('Ví điểm KHÔNG bị gác bằng cờ tính năng — tiền của gian hàng không thuộc về gói', () => {
    const balance = flattenLeaves(SHOP_NAV).find((leaf) => leaf.href === ROUTES.MANAGE.BALANCE)!;
    expect(balance.feature).toBeUndefined();
  });

  it('Đơn đặt xe giữ nguyên route riêng, đứng dưới Đơn thuê', () => {
    const operations = SHOP_NAV.find((section) => section.key === 'operations')!;
    const orders = operations.children.filter(isNavBranch).find((node) => node.key === 'orders')!;
    expect(orders.children.map((leaf) => leaf.href)).toEqual([
      ROUTES.MANAGE.BOOKING_REQUESTS,
      ROUTES.MANAGE.BOOKINGS,
    ]);
  });

  it('mọi mục lá có href riêng — không hai mục cùng đích', () => {
    for (const sections of [SHOP_NAV, PLATFORM_NAV]) {
      const hrefs = hrefsOf(sections);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });

  it('mọi href đến từ ROUTES, không có chuỗi gõ tay', () => {
    const known = new Set<string>(Object.values(ROUTES.MANAGE));
    for (const leaf of [...flattenLeaves(SHOP_NAV), ...flattenLeaves(PLATFORM_NAV)]) {
      expect(known.has(leaf.href)).toBe(true);
    }
  });

  /**
   * Hai mục 'Khu vực nhận xe' và 'Thùng rác' đã bị GỠ ngày 03/09/2026 (R1 — 'ẩn dead link và
   * menu placeholder chưa có luồng'). Chúng từng mang cờ `comingSoon` mà `useManageNav` không
   * bao giờ đọc, nên trên thực tế chúng là hai liên kết bấm được dẫn tới một trang trống.
   *
   * Test này khoá lại điều ngược lại của cái nó từng khoá: menu không được chứa mục nào không
   * dẫn tới đâu.
   */
  it('không mục nào trong menu trỏ tới trang chưa dựng', () => {
    const keys = flattenLeaves(SHOP_NAV).map((leaf) => leaf.key);
    expect(keys).not.toContain('pickup-areas');
    expect(keys).not.toContain('trash');
  });

  it('chỉ hai mục được phép mang huy hiệu — và đúng là hai việc phải xử lý', () => {
    const badged = flattenLeaves(SHOP_NAV)
      .filter((leaf) => leaf.badge)
      .map((leaf) => leaf.href);
    expect(badged).toEqual([ROUTES.MANAGE.BOOKING_REQUESTS, ROUTES.MANAGE.CHAT]);
    // Nền tảng chưa có nguồn đếm nào — không gắn huy hiệu suông.
    expect(flattenLeaves(PLATFORM_NAV).some((leaf) => leaf.badge)).toBe(false);
  });
});

describe('nav — ranh giới gian hàng ↔ nền tảng', () => {
  it('có platformRole → CHỈ cây nền tảng, không trộn mục gian hàng', () => {
    expect(navForScope(true)).toBe(PLATFORM_NAV);
    const labels = flattenLeaves(PLATFORM_NAV).map((leaf) => leaf.labelKey);
    expect(labels).not.toContain('manage.calendar');
    expect(labels).not.toContain('manage.debts');
  });

  it('không có platformRole → CHỈ cây gian hàng', () => {
    expect(navForScope(false)).toBe(SHOP_NAV);
    const labels = flattenLeaves(SHOP_NAV).map((leaf) => leaf.labelKey);
    expect(labels).not.toContain('platform.audit');
    expect(labels).not.toContain('platform.staff');
  });

  it('mục gian hàng không đòi quyền `platform.*` và ngược lại', () => {
    expect(flattenLeaves(SHOP_NAV).every((leaf) => !leaf.permission.startsWith('platform.'))).toBe(
      true,
    );
    expect(
      flattenLeaves(PLATFORM_NAV).every((leaf) => leaf.permission.startsWith('platform.')),
    ).toBe(true);
  });
});

describe('nav — vai trò gian hàng nhìn thấy gì', () => {
  /** Nhãn mà một vai trò thấy, với ĐÚNG vai đó trên trục sở hữu. */
  function labelsOfRole(role: TenantRole): string[] {
    return visibleLabels(DEFAULT_TENANT_ROLE_PERMISSIONS[role], false, { roleKey: role });
  }

  it('shop_owner thấy tiền của mình lẫn mặt tiền gian hàng: Số dư & rút tiền + Cửa hàng', () => {
    const labels = labelsOfRole(TENANT_ROLE.SHOP_OWNER);

    expect(labels).toEqual(expect.arrayContaining(['manage.balance', 'manage.shop']));
  });

  it('shop_manager vào được trang Cửa hàng nhưng KHÔNG thấy Số dư', () => {
    const labels = labelsOfRole(TENANT_ROLE.SHOP_MANAGER);

    /*
     * Trang Cửa hàng gác bằng `tenant.view` — mức thấp nhất, vì hồ sơ gian hàng là việc điều
     * hành. Hai section NHẠY CẢM bên trong tự lọc theo đúng guard của API: "Tài khoản nhận
     * tiền" chỉ chủ gian hàng (`@ShopOwnerOnly`), "Gói & hạn mức" theo `subscription.view` và
     * CTA mua theo `subscription.purchase`.
     */
    expect(labels).toContain('manage.shop');
    // Ví là NGHĨA VỤ với một người cụ thể (ADR 0038 điều 3) — quyền không mở được nó.
    expect(labels).not.toContain('manage.balance');
  });

  /*
   * Trục SỞ HỮU không phải trục quyền: kể cả khi được cấp TOÀN BỘ quyền của gian hàng, người
   * không phải chủ vẫn không thấy mục ví. Đây là khẳng định mà bản test cũ (chỉ lọc
   * `permission`) không thể phát biểu — và vì thế nó từng "chứng minh" shop_manager thấy đủ mọi
   * mục, ngược hẳn với runtime.
   */
  it('mọi quyền cũng KHÔNG mở được Số dư cho người không phải chủ', () => {
    for (const role of [
      TENANT_ROLE.SHOP_MANAGER,
      TENANT_ROLE.SHOP_STAFF,
      TENANT_ROLE.SHOP_VIEWER,
    ]) {
      expect(visibleLabels(ALL_TENANT_PERMISSIONS, false, { roleKey: role })).not.toContain(
        'manage.balance',
      );
    }
    expect(
      visibleLabels(ALL_TENANT_PERMISSIONS, false, { roleKey: TENANT_ROLE.SHOP_OWNER }),
    ).toContain('manage.balance');
  });

  /*
   * Trục CỜ NĂNG LỰC (ADR 0027) — trục thứ ba, cũng phải được mô phỏng ở đây. Ví KHÔNG mang cờ:
   * tiền của gian hàng không thuộc về gói, nên hết gói vẫn phải thấy và rút được (ADR 0027 điều
   * 3, ADR 0033).
   */
  it('cờ tính năng ẩn được sổ sách, KHÔNG ẩn được Số dư', () => {
    const labels = visibleLabels(ALL_TENANT_PERMISSIONS, false, {
      roleKey: TENANT_ROLE.SHOP_OWNER,
      features: { finance: FEATURE_STATE.HIDDEN, debts: FEATURE_STATE.HIDDEN },
    });

    expect(labels).not.toContain('manage.financeOverview');
    expect(labels).not.toContain('manage.debts');
    expect(labels).toContain('manage.balance');
  });

  it('shop_staff KHÔNG thấy tài chính và người dùng', () => {
    const labels = labelsOfRole(TENANT_ROLE.SHOP_STAFF);

    expect(labels).not.toContain('manage.financeOverview');
    expect(labels).not.toContain('manage.receipts');
    expect(labels).not.toContain('manage.debts');
    expect(labels).not.toContain('manage.members');
    // Nhưng vẫn thấy phần vận hành hằng ngày.
    expect(labels).toEqual(
      expect.arrayContaining([
        'manage.dashboard',
        'manage.calendar',
        'manage.vehicleList',
        'manage.bookings',
        'manage.bookingRequests',
      ]),
    );
  });

  it('shop_viewer thấy ĐÚNG BẰNG shop_staff — menu không phân biệt được hai vai trò này', () => {
    // Khác biệt thật nằm ở quyền GHI (`booking.create`…), không ở quyền XEM.
    expect(labelsOfRole(TENANT_ROLE.SHOP_VIEWER)).toEqual(
      labelsOfRole(TENANT_ROLE.SHOP_STAFF),
    );
  });
});

describe('nav — vai trò nền tảng nhìn thấy gì', () => {
  it('platform_admin thấy TOÀN BỘ cây nền tảng — không mục nào ngoài tầm với', () => {
    // Khẳng định theo TẬP, không theo tổng số: super admin ôm mọi quyền nên tập mục họ thấy
    // đúng bằng cây. Thêm một mục nền tảng mới thì test này vẫn đúng mà không phải sửa số.
    expect(
      visibleLabels(DEFAULT_PLATFORM_ROLE_PERMISSIONS[PLATFORM_ROLE.PLATFORM_ADMIN], true),
    ).toEqual(flattenLeaves(PLATFORM_NAV).map((leaf) => leaf.labelKey));
  });

  it('platform_staff chỉ thấy 5 mục đọc, KHÔNG thấy mục quản trị của super admin', () => {
    const labels = visibleLabels(
      DEFAULT_PLATFORM_ROLE_PERMISSIONS[PLATFORM_ROLE.PLATFORM_STAFF],
      true,
    );

    // `Tỉnh/thành` là mục ĐỌC: staff cần tra danh mục để hiểu dữ liệu giám sát; bật/tắt hiển thị
    // công khai là quyền riêng (`platform.locations.manage`) mà staff không có.
    expect(labels).toEqual([
      'manage.dashboard',
      'platform.vehicles',
      'platform.bookings',
      'platform.customers',
      'platform.locations',
    ]);
    for (const adminOnly of [
      'platform.approvals',
      'platform.tenants',
      'platform.staff',
      'platform.plans',
      'platform.audit',
    ]) {
      expect(labels).not.toContain(adminOnly);
    }
  });

  it('reviewer thấy Duyệt hồ sơ nhưng KHÔNG thấy Nhân sự/Gói dịch vụ', () => {
    const labels = visibleLabels(DEFAULT_PLATFORM_ROLE_PERMISSIONS[PLATFORM_ROLE.REVIEWER], true);

    expect(labels).toContain('platform.approvals');
    expect(labels).not.toContain('platform.staff');
    expect(labels).not.toContain('platform.plans');
  });

  it('finance_admin thấy Gian hàng + Gói dịch vụ, KHÔNG thấy Duyệt hồ sơ', () => {
    const labels = visibleLabels(
      DEFAULT_PLATFORM_ROLE_PERMISSIONS[PLATFORM_ROLE.FINANCE_ADMIN],
      true,
    );

    expect(labels).toEqual(
      expect.arrayContaining(['platform.tenants', 'platform.plans', 'platform.bookings']),
    );
    expect(labels).not.toContain('platform.approvals');
    expect(labels).not.toContain('platform.audit');
  });

  it('không có quyền nào → không mục nào (khách chưa từng vào portal)', () => {
    expect(visibleLabels([], false)).toEqual([]);
    expect(visibleLabels([], true)).toEqual([]);
  });
});

describe('matchSelectedKey — quy tắc mục đang mở', () => {
  const shopLeaves = flattenLeaves(SHOP_NAV);
  const platformLeaves = flattenLeaves(PLATFORM_NAV);

  it('khớp tuyệt đối', () => {
    expect(matchSelectedKey('/manage/vehicles', shopLeaves)).toBe('/manage/vehicles');
  });

  it('route con khớp mục cha', () => {
    expect(matchSelectedKey('/manage/vehicles/new', shopLeaves)).toBe('/manage/vehicles');
    expect(matchSelectedKey('/manage/vehicles/01H/edit', shopLeaves)).toBe('/manage/vehicles');
  });

  it('`/manage` CHỈ khớp tuyệt đối — nếu không thì mọi trang đều sáng "Tổng quan"', () => {
    expect(matchSelectedKey('/manage', shopLeaves)).toBe('/manage');
    expect(matchSelectedKey('/manage/receipts', shopLeaves)).toBe('/manage/receipts');
  });

  it('tiền tố GẦN GIỐNG không chọn nhầm: booking-requests ≠ bookings', () => {
    expect(matchSelectedKey('/manage/booking-requests', shopLeaves)).toBe(
      '/manage/booking-requests',
    );
    expect(matchSelectedKey('/manage/bookings', shopLeaves)).toBe('/manage/bookings');
  });

  it('`/manage/shop` không nuốt `/manage/shop/branches` — tiền tố dài nhất thắng', () => {
    expect(matchSelectedKey('/manage/shop', shopLeaves)).toBe('/manage/shop');
    expect(matchSelectedKey('/manage/shop/branches', shopLeaves)).toBe('/manage/shop/branches');
    expect(matchSelectedKey('/manage/shop/policies', shopLeaves)).toBe('/manage/shop/policies');
  });

  it('tiền tố dài nhất thắng: /manage/admin/tenants không dừng ở /manage/admin', () => {
    expect(matchSelectedKey('/manage/admin/tenants', platformLeaves)).toBe('/manage/admin/tenants');
    expect(matchSelectedKey('/manage/admin/tenants/01H', platformLeaves)).toBe(
      '/manage/admin/tenants',
    );
    expect(matchSelectedKey('/manage/admin', platformLeaves)).toBe('/manage/admin');
  });

  it('route ngoài cây → không mục nào sáng', () => {
    expect(matchSelectedKey('/manage/contracts/01H', shopLeaves)).toBeUndefined();
    expect(matchSelectedKey('/manage/onboarding', shopLeaves)).toBeUndefined();
    expect(matchSelectedKey('/listings/01H', shopLeaves)).toBeUndefined();
  });

  it('chỉ dò trong cây được truyền vào — không rò mục nền tảng sang gian hàng', () => {
    expect(matchSelectedKey('/manage/admin/staff', shopLeaves)).toBeUndefined();
  });
});

describe('sectionKeyOf / branchKeyOf — bung đúng khối và đúng mục cha', () => {
  it('khối chứa mục đang chọn, kể cả khi mục nằm trong một mục cha', () => {
    expect(sectionKeyOf(SHOP_NAV, ROUTES.MANAGE.RECEIPTS)).toBe('business');
    expect(sectionKeyOf(SHOP_NAV, ROUTES.MANAGE.BALANCE)).toBe('business');
    expect(sectionKeyOf(SHOP_NAV, ROUTES.MANAGE.SHOP)).toBe('storefront');
    expect(sectionKeyOf(SHOP_NAV, ROUTES.MANAGE.MEMBERS)).toBe('settings');
    expect(sectionKeyOf(SHOP_NAV, ROUTES.MANAGE.MAINTENANCE)).toBe('operations');
    expect(sectionKeyOf(SHOP_NAV, ROUTES.MANAGE.ROOT)).toBe('overview');
  });

  it('mục cha chứa mục đang chọn — mục đứng trực tiếp trong khối thì không có mục cha', () => {
    expect(branchKeyOf(SHOP_NAV, ROUTES.MANAGE.MAINTENANCE)).toBe('fleet');
    expect(branchKeyOf(SHOP_NAV, ROUTES.MANAGE.BOOKING_REQUESTS)).toBe('orders');
    expect(branchKeyOf(SHOP_NAV, ROUTES.MANAGE.DEBTS)).toBe('finance');
    expect(branchKeyOf(SHOP_NAV, ROUTES.MANAGE.CHAT)).toBeUndefined();
  });

  it('không có mục nào đang chọn → không bung gì', () => {
    expect(sectionKeyOf(SHOP_NAV, undefined)).toBeUndefined();
    expect(branchKeyOf(SHOP_NAV, undefined)).toBeUndefined();
  });
});

describe('mobileTabsForScope — 4 tab dưới đáy', () => {
  it('gian hàng và nền tảng đều đúng 4 tab, tab đầu luôn là /manage', () => {
    for (const isPlatform of [false, true]) {
      const tabs = mobileTabsForScope(isPlatform);
      expect(tabs).toHaveLength(4);
      expect(tabs[0]!.href).toBe(ROUTES.MANAGE.ROOT);
    }
  });

  it('tab mobile là TẬP CON của cây menu cùng scope', () => {
    for (const isPlatform of [false, true]) {
      const hrefs = new Set(flattenLeaves(navForScope(isPlatform)).map((leaf) => leaf.href));
      for (const tab of mobileTabsForScope(isPlatform)) {
        expect(hrefs.has(tab.href)).toBe(true);
      }
    }
  });

  it('bốn đích chính của gian hàng giữ nguyên sau khi sắp lại menu', () => {
    expect(mobileTabsForScope(false).map((tab) => tab.key)).toEqual([
      'dashboard',
      'calendar',
      'booking-requests',
      'bookings',
    ]);
  });
});

/**
 * Cây menu giữ KHOÁ, không giữ chữ — nên phải có gì đó bảo đảm mỗi khoá thật sự có bản dịch.
 * Thiếu một khoá thì mục menu hiện ra chính chuỗi khoá đó trên production, và không có
 * typecheck nào bắt được vì `NavLabelKey` chỉ suy từ bó TIẾNG VIỆT.
 */
describe('nav — mọi khoá nhãn đều có bản dịch ở cả hai ngôn ngữ', () => {
  const lookup = (bundle: Record<string, unknown>, key: string): unknown =>
    key
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle);

  const allSections = [...SHOP_NAV, ...PLATFORM_NAV];
  const allKeys = [
    ...allSections.map((section) => section.labelKey),
    ...allSections
      .flatMap((section) => section.children.filter(isNavBranch))
      .map((b) => b.labelKey),
    ...flattenLeaves(allSections).map((leaf) => leaf.labelKey),
    ...mobileTabsForScope(false).map((tab) => tab.labelKey),
    ...mobileTabsForScope(true).map((tab) => tab.labelKey),
  ];

  it.each([
    ['vi', viNavigation],
    ['en', enNavigation],
  ])('%s có đủ nhãn', (_locale, bundle) => {
    const missing = allKeys.filter((key) => typeof lookup(bundle, key) !== 'string');
    expect(missing).toEqual([]);
  });
});
