import {
  DEFAULT_PLATFORM_ROLE_PERMISSIONS,
  DEFAULT_TENANT_ROLE_PERMISSIONS,
  FEATURE_STATE,
  PERMISSION,
  PLAN_FEATURE,
  PLATFORM_ROLE,
  SUPPORT_WORKSPACE,
  TENANT_ROLE,
  isFeatureVisible,
  type FeatureState,
  type PlanFeature,
  type Permission,
  type TenantRole,
} from '@xeprime/types';
import { describe, expect, it } from 'vitest';

import {
  NAV_BADGE,
  OWNER_LITE_NAV,
  PLATFORM_NAV,
  SHOP_NAV,
  branchKeyOf,
  flattenLeaves,
  isNavBranch,
  isNavPermissionGranted,
  leavesOfSection,
  matchSelectedKey,
  mobileTabsForZone,
  navForZone,
  sectionKeyOf,
  supportMobileTabs,
  supportNavSections,
  type NavLeaf,
} from './nav';
import enNavigation from '@xeprime/domain/messages/en/navigation.json';
import viNavigation from '@xeprime/domain/messages/vi/navigation.json';
import { PARTNER_TRACK, isCommissionPage } from '@/features/auth/post-auth-destination';
import { ZONE } from '@/zones';
import { ROUTES, SHOP_SECTION, SHOP_SECTION_VALUES, adminTenantSupportPath } from './routes';

/** Cây menu của một khu: site quản trị, hoặc site partner theo tuyến (gói · hoa hồng). */
function navFor(isPlatform: boolean) {
  return isPlatform
    ? navForZone(ZONE.ADMIN, PARTNER_TRACK.NONE)
    : navForZone(ZONE.PARTNER, PARTNER_TRACK.PACKAGE);
}

function tabsFor(isPlatform: boolean) {
  return isPlatform
    ? mobileTabsForZone(ZONE.ADMIN, PARTNER_TRACK.NONE)
    : mobileTabsForZone(ZONE.PARTNER, PARTNER_TRACK.PACKAGE);
}

/**
 * Test ĐẶC TẢ cho cây điều hướng theo mô hình khối (Tổng quan · Quản lý · Kinh doanh · Gian
 * hàng · Cấu hình · Tài khoản & thanh toán · Hỗ trợ).
 *
 * Bốn điều bộ này khoá lại:
 *  1. **Những lối vào PHẢI còn** — theo route cụ thể, không theo tổng số mục;
 *  2. **Vai trò nào thấy gì** — trên BA trục runtime thật (quyền · sở hữu · cờ năng lực);
 *  3. **Quy tắc chọn mục đang mở** (`matchSelectedKey`) — gom nhóm không được làm sáng nhầm;
 *  4. **Ranh giới site/tuyến** — `navForZone` chọn MỘT cây theo khu + tuyến, không trộn.
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
  return flattenLeaves(navFor(isPlatform))
    .filter(
      (leaf) =>
        isNavPermissionGranted(leaf.permission, (permission) => set.has(permission)) &&
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

describe('nav - cấu trúc khối', () => {
  /*
   * 02/11/2026 — menu NGANG của design Partner-XePrime: sáu mục cấp 1, đúng thứ tự design. Bản đồ
   * cũ → mới ở `docs/design/09_PARTNER_REDESIGN.md` §2.
   */
  it('gian hàng: sáu khối của menu ngang, đúng thứ tự design', () => {
    expect(SHOP_NAV.map((section) => section.key)).toEqual([
      'overview',
      'operations',
      'fleet',
      'revenue',
      'settings',
      'support',
    ]);
    // "Tổng quan" là liên kết thẳng, các khối còn lại mở dropdown.
    expect(SHOP_NAV.filter((section) => section.direct).map((section) => section.key)).toEqual([
      'overview',
    ]);
    // Mỗi mục cấp 1 có biểu tượng riêng trên menu ngang.
    expect(SHOP_NAV.every((section) => section.icon)).toBe(true);
  });

  it('chủ xe tuyến hoa hồng dùng CÙNG khung sáu khối - nâng gói thấy mọi thứ ở đúng chỗ cũ', () => {
    expect(OWNER_LITE_NAV.map((section) => section.labelKey)).toEqual(
      SHOP_NAV.map((section) => section.labelKey),
    );
  });

  it('Tổng quan và Hỗ trợ luôn hiện (`pinned`), các khối giữa gập được', () => {
    const pinned = SHOP_NAV.filter((section) => section.pinned).map((section) => section.key);
    expect(pinned).toEqual(['overview', 'support']);
  });

  /*
   * 23/09/2026 — cây nền tảng thôi là 17 mục ngang cấp trong một khối.
   *
   * Bản trước khoá `['overview', 'platform']` kèm tiêu đề "cây này KHÔNG bị sắp lại" — đó là
   * phát biểu của đợt dọn 16/09, khi chỉ `SHOP_NAV` được đụng tới. Giờ nền tảng được chia theo
   * cùng nguyên tắc: mỗi khối trả lời một câu hỏi của người trực.
   */
  /*
   * 28/09/2026 — khối "Chợ xe" cũ tách làm ba: Chợ xe (chỉ còn xe), Đối tác (hai danh sách độc
   * lập), Đơn & khách hàng.
   */
  it('nền tảng: 7 khối theo câu hỏi của người trực, đúng thứ tự', () => {
    expect(PLATFORM_NAV.map((section) => section.key)).toEqual([
      'overview',
      'platform-marketplace',
      'platform-partners',
      'platform-orders',
      'platform-finance',
      'platform-policy',
      'platform-system',
    ]);
  });

  /*
   * Bất biến THẬT của một đợt sắp lại menu: gom nhóm không được làm MẤT lối vào nào.
   *
   * Đây là thứ đáng khoá thay cho "đếm 2 khối" — một lần gộp sai làm một trang admin không còn
   * đường tới sẽ đỏ ở đây, còn việc đổi chỗ một mục giữa hai khối thì không (và không nên).
   */
  it('sắp lại khối KHÔNG làm mất lối vào nào của nền tảng', () => {
    const hrefs = flattenLeaves(PLATFORM_NAV).map((leaf) => leaf.href);

    expect([...hrefs].sort()).toEqual(
      [
        // Tổng quan nền tảng rời trang gốc `/manage` sang `/dashboard` của site quản trị (ADR 0051).
        ROUTES.ADMIN.DASHBOARD,
        ROUTES.ADMIN.ROOT,
        ROUTES.ADMIN.PARTNER_SHOPS,
        ROUTES.ADMIN.PARTNER_OWNERS,
        ROUTES.ADMIN.VEHICLES,
        // Vận hành chuyến (07/10/2026) — hàng đợi theo chặng, cùng quyền với đơn thuê.
        ROUTES.ADMIN.TRIPS,
        ROUTES.ADMIN.BOOKINGS,
        ROUTES.ADMIN.CUSTOMERS,
        // Tra cứu xuyên realm (ADR 0053 điều 9).
        ROUTES.ADMIN.ACCOUNT_LOOKUP,
        // `ADMIN_BANK_TRANSACTIONS` không mất mà được GỘP (01/10/2026): hàng đợi tiền vào sống
        // trong màn Tài chính, URL cũ chuyển tiếp về `ADMIN_MONEY?queue=bank-in`.
        ROUTES.ADMIN.MONEY,
        // Bảo hiểm chuyến (ADR 0064): danh mục sản phẩm + hàng đợi giấy chứng nhận.
        ROUTES.ADMIN.INSURANCE,
        ROUTES.ADMIN.SUPPORT,
        ROUTES.ADMIN.PLANS,
        ROUTES.ADMIN.FEE_POLICIES,
        ROUTES.ADMIN.PROMO_CODES,
        ROUTES.ADMIN.SELLERS,
        ROUTES.ADMIN.STAFF,
        ROUTES.ADMIN.CATALOG,
        ROUTES.ADMIN.LOCATIONS,
        ROUTES.ADMIN.BANNERS,
        ROUTES.ADMIN.APP_CONFIG,
        ROUTES.ADMIN.AUDIT,
      ].sort(),
    );
    // …và không mục nào bị khai hai lần khi chuyển sang mô hình khối.
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  /*
   * 16/09/2026 — "Thanh toán giữ chỗ qua XePrime" thôi làm mục độc lập: cả trang cũ chỉ có đúng
   * một công tắc, nên nó về làm một section của "Chính sách thuê". Route cũ vẫn sống (redirect),
   * nhưng KHÔNG được quay lại menu: đây đúng là loại mục làm sidebar phình ra.
   */
  it('"Thanh toán giữ chỗ" KHÔNG còn là mục điều hướng - nó nằm trong Chính sách thuê', () => {
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
  it('KHÔNG còn mục riêng cho gói, hồ sơ người bán hay tài khoản - chúng đã gộp', () => {
    const hrefs = hrefsOf(SHOP_NAV);

    expect(hrefs).not.toContain(ROUTES.MANAGE.SUBSCRIPTION);
    expect(hrefs).not.toContain(ROUTES.MANAGE.SELLER_PROFILE);
    expect(hrefs).not.toContain(ROUTES.MANAGE.ACCOUNT);
    expect(hrefs).not.toContain(ROUTES.MANAGE.SECURITY);

    // …và lối vào thật vẫn còn: trang Cửa hàng là nơi chứa chúng.
    expect(hrefs).toContain(ROUTES.MANAGE.SHOP);
  });

  /** Mục VẼ thành dòng của một khối (bỏ mục `hidden`), theo thứ tự. */
  function shownHrefs(sectionKey: string): string[] {
    const section = SHOP_NAV.find((item) => item.key === sectionKey)!;
    return leavesOfSection(section)
      .filter((leaf) => leaf.hidden !== true)
      .map((leaf) => leaf.href);
  }

  it('menu ngang không còn mục cha (submenu) - mỗi khối là một dropdown phẳng', () => {
    expect(SHOP_NAV.flatMap((section) => section.children).filter(isNavBranch)).toEqual([]);
  });

  it('mỗi dropdown đúng các dòng của design, đúng thứ tự', () => {
    // "Đơn thuê xe" gộp yêu cầu + đơn thành MỘT dòng (05/11/2026).
    expect(shownHrefs('operations')).toEqual([
      ROUTES.MANAGE.CALENDAR,
      ROUTES.MANAGE.BOOKINGS,
      ROUTES.MANAGE.CUSTOMERS,
    ]);
    expect(shownHrefs('fleet')).toEqual([
      ROUTES.MANAGE.VEHICLES,
      ROUTES.MANAGE.DRIVERS,
      ROUTES.MANAGE.MAINTENANCE,
    ]);
    expect(shownHrefs('revenue')).toEqual([
      ROUTES.MANAGE.FINANCE,
      ROUTES.MANAGE.BALANCE,
      ROUTES.MANAGE.RECEIPTS,
    ]);
    expect(shownHrefs('settings')).toEqual([
      ROUTES.MANAGE.SHOP,
      ROUTES.MANAGE.SHOP_POLICIES,
      ROUTES.MANAGE.MEMBERS,
    ]);
    // "Trợ giúp" có hai trang thật — dropdown hai dòng (chốt 02/11/2026).
    expect(shownHrefs('support')).toEqual([ROUTES.MANAGE.SUPPORT, ROUTES.MANAGE.SUPPORT_CASES]);
  });

  /*
   * Bài test quan trọng nhất của mỗi đợt sắp lại: gom nhóm, đổi tên hay gộp trang đều KHÔNG được làm
   * mất đường vào một trang đang sống. Từ menu ngang (02/11/2026) một số trang rời dòng menu — mỗi
   * trang như vậy phải có lối vào ghi ở `docs/design/09_PARTNER_REDESIGN.md` §2, và test chốt lối đó.
   */
  it('mọi route quan trọng vẫn có lối vào - trên menu, hoặc ở chỗ đã ghi', () => {
    const inTree = hrefsOf(SHOP_NAV);
    for (const href of [
      ROUTES.MANAGE.BALANCE,
      ROUTES.MANAGE.SUPPORT,
      ROUTES.MANAGE.SUPPORT_CASES,
      ROUTES.MANAGE.ROOT,
      ROUTES.MANAGE.CALENDAR,
      ROUTES.MANAGE.VEHICLES,
      ROUTES.MANAGE.MAINTENANCE,
      ROUTES.MANAGE.BOOKINGS,
      ROUTES.MANAGE.CUSTOMERS,
      ROUTES.MANAGE.FINANCE,
      ROUTES.MANAGE.RECEIPTS,
      ROUTES.MANAGE.SHOP,
      ROUTES.MANAGE.SHOP_POLICIES,
      ROUTES.MANAGE.MEMBERS,
      ROUTES.MANAGE.DRIVERS,
    ]) {
      expect(inTree, href).toContain(href);
    }
    // Công nợ: tab `?view=debts` của "Lịch sử giao dịch" (04/11/2026); route cũ chuyển tiếp tới đó.
    expect(inTree).not.toContain(ROUTES.MANAGE.DEBTS);
    // Chi nhánh: section của "Thông tin cửa hàng"; route cũ chuyển tiếp tới đó.
    expect(SHOP_SECTION_VALUES).toContain(SHOP_SECTION.BRANCHES);
    expect(inTree).not.toContain(ROUTES.MANAGE.SHOP_BRANCHES);
    // "Chờ giao xe": ngăn `?group=awaiting_pickup` của "Quản lý đơn thuê xe" (02/11/2026); route cũ
    // chuyển tiếp tới đó nên không còn là một mục của cây.
    expect(inTree).not.toContain(ROUTES.MANAGE.BOOKINGS_AWAITING_PICKUP);
    // Hộp thư "Yêu cầu đặt xe" + "Đơn đã kết thúc": nhóm và nút của màn "Đơn thuê xe" (05/11/2026);
    // route hộp thư cũ chuyển tiếp tới nhóm tương ứng nên không còn là một mục của cây.
    expect(inTree).not.toContain(ROUTES.MANAGE.BOOKING_REQUESTS);
    expect(inTree).not.toContain(ROUTES.MANAGE.BOOKINGS_ENDED);
    // Tin nhắn: icon ở header (`ChatMenu`), không còn là dòng menu.
    expect(inTree).not.toContain(ROUTES.MANAGE.CHAT);
  });

  it('không còn mục ẨN nào - Công nợ đã về tab của "Lịch sử giao dịch" (04/11/2026)', () => {
    const leaves = flattenLeaves(SHOP_NAV);
    expect(leaves.filter((leaf) => leaf.hidden)).toEqual([]);
    expect(leaves.map((leaf) => leaf.href)).not.toContain(ROUTES.MANAGE.DEBTS);
    // Tab Công nợ tự gác bằng cờ gói của nó; mục menu chứa nó vẫn là cờ FINANCE.
    const receipts = leaves.find((leaf) => leaf.href === ROUTES.MANAGE.RECEIPTS)!;
    expect(receipts.feature).toBe(PLAN_FEATURE.FINANCE);
  });

  /**
   * Ví KHÔNG gắn `feature`: số dư là tiền của chính gian hàng. Gói hết hạn là `read_only` chứ
   * không `hidden` (ADR 0027 điều 3), và tiền thì không thuộc về gói — ẩn nó đi nghĩa là giữ
   * tiền của người khác mà không cho họ thấy.
   */
  it('Ví điểm KHÔNG bị gác bằng cờ tính năng - tiền của gian hàng không thuộc về gói', () => {
    const balance = flattenLeaves(SHOP_NAV).find((leaf) => leaf.href === ROUTES.MANAGE.BALANCE)!;
    expect(balance.feature).toBeUndefined();
  });

  it('mọi mục lá có href riêng - không hai mục cùng đích', () => {
    for (const sections of [SHOP_NAV, PLATFORM_NAV, OWNER_LITE_NAV]) {
      const hrefs = hrefsOf(sections);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });

  it('mọi href đến từ ROUTES, không có chuỗi gõ tay', () => {
    const known = new Set<string>([
      ...Object.values(ROUTES.MANAGE),
      ...Object.values(ROUTES.ADMIN),
    ]);
    for (const leaf of [
      ...flattenLeaves(SHOP_NAV),
      ...flattenLeaves(PLATFORM_NAV),
      ...flattenLeaves(OWNER_LITE_NAV),
    ]) {
      expect(known.has(leaf.href), leaf.href).toBe(true);
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

  it('chỉ mục "cần xử lý" mang huy hiệu - không đếm tổng xe/tài xế (chốt 04/11/2026)', () => {
    const badged = flattenLeaves(SHOP_NAV)
      .filter((leaf) => leaf.badge)
      .map((leaf) => [leaf.href, leaf.badge]);
    // Tin chưa đọc giờ nằm trên icon tin nhắn ở header, không còn mục menu.
    // Yêu cầu: chờ duyệt · Đơn: lượt giao/trả ĐẾN HẠN (04/11/2026). Lịch KHÔNG mang số nữa: lượt
    // giao/nhận hôm nay đã nằm trong số của Đơn, khối "Vận hành" sẽ đếm trùng.
    // Danh sách xe: số XE CÓ VIỆC CHẶN, không phải tổng xe (03/11/2026).
    // "Đơn thuê xe" gộp (05/11/2026): yêu cầu chờ duyệt + lượt giao/trả đến hạn ở CÙNG một mục.
    expect(badged).toEqual([
      [ROUTES.MANAGE.BOOKINGS, NAV_BADGE.RENTALS_WORK],
      [ROUTES.MANAGE.VEHICLES, NAV_BADGE.VEHICLES_NEEDS_ACTION],
    ]);
    // Nền tảng chưa có nguồn đếm nào — không gắn huy hiệu suông.
    expect(flattenLeaves(PLATFORM_NAV).some((leaf) => leaf.badge)).toBe(false);
  });
});

describe('nav - ranh giới site quản trị ↔ site partner', () => {
  it('site quản trị → CHỈ cây nền tảng, bất kể tuyến', () => {
    for (const track of Object.values(PARTNER_TRACK)) {
      expect(navForZone(ZONE.ADMIN, track)).toBe(PLATFORM_NAV);
    }
    const labels = flattenLeaves(PLATFORM_NAV).map((leaf) => leaf.labelKey);
    expect(labels).not.toContain('manage.rentalCalendar');
    expect(labels).not.toContain('manage.debts');
  });

  it('site partner tuyến gói → CHỈ cây gian hàng', () => {
    expect(navForZone(ZONE.PARTNER, PARTNER_TRACK.PACKAGE)).toBe(SHOP_NAV);
    const labels = flattenLeaves(SHOP_NAV).map((leaf) => leaf.labelKey);
    expect(labels).not.toContain('platform.audit');
    expect(labels).not.toContain('platform.staff');
  });

  it('mục gian hàng không đòi quyền `platform.*` và ngược lại', () => {
    const permissionsOf = (leaf: NavLeaf): readonly string[] =>
      typeof leaf.permission === 'string' ? [leaf.permission] : leaf.permission;
    expect(
      flattenLeaves(SHOP_NAV).every((leaf) =>
        permissionsOf(leaf).every((permission) => !permission.startsWith('platform.')),
      ),
    ).toBe(true);
    expect(
      flattenLeaves(PLATFORM_NAV).every((leaf) =>
        permissionsOf(leaf).every((permission) => permission.startsWith('platform.')),
      ),
    ).toBe(true);
  });

  it('"Tài chính" hiện với người CHỈ có quyền gói - khớp hàng đợi tiền vào trong màn', () => {
    expect(visibleLabels([PERMISSION.PLATFORM_BILLING_MANAGE], true)).toContain('platform.money');
    expect(visibleLabels([PERMISSION.PLATFORM_MONEY_MANAGE], true)).toContain('platform.money');
    expect(visibleLabels([PERMISSION.PLATFORM_AUDIT_VIEW], true)).not.toContain('platform.money');
  });
});

describe('nav - vai trò gian hàng nhìn thấy gì', () => {
  /** Nhãn mà một vai trò thấy, với ĐÚNG vai đó trên trục sở hữu. */
  function labelsOfRole(role: TenantRole): string[] {
    return visibleLabels(DEFAULT_TENANT_ROLE_PERMISSIONS[role], false, { roleKey: role });
  }

  it('shop_owner thấy tiền của mình lẫn mặt tiền gian hàng: Số dư & rút tiền + Cửa hàng', () => {
    const labels = labelsOfRole(TENANT_ROLE.SHOP_OWNER);

    expect(labels).toEqual(expect.arrayContaining(['manage.wallet', 'manage.shopInfo']));
  });

  it('shop_manager vào được trang Cửa hàng nhưng KHÔNG thấy Số dư', () => {
    const labels = labelsOfRole(TENANT_ROLE.SHOP_MANAGER);

    /*
     * Trang Cửa hàng gác bằng `tenant.view` — mức thấp nhất, vì hồ sơ gian hàng là việc điều
     * hành. Hai section NHẠY CẢM bên trong tự lọc theo đúng guard của API: "Tài khoản nhận
     * tiền" chỉ chủ gian hàng (`@ShopOwnerOnly`), "Gói & hạn mức" theo `subscription.view` và
     * CTA mua theo `subscription.purchase`.
     */
    expect(labels).toContain('manage.shopInfo');
    // Ví là NGHĨA VỤ với một người cụ thể (ADR 0038 điều 3) — quyền không mở được nó.
    expect(labels).not.toContain('manage.wallet');
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
        'manage.wallet',
      );
    }
    expect(
      visibleLabels(ALL_TENANT_PERMISSIONS, false, { roleKey: TENANT_ROLE.SHOP_OWNER }),
    ).toContain('manage.wallet');
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
    expect(labels).toContain('manage.wallet');
  });

  it('shop_staff KHÔNG thấy tài chính và người dùng', () => {
    const labels = labelsOfRole(TENANT_ROLE.SHOP_STAFF);

    expect(labels).not.toContain('manage.financeOverview');
    expect(labels).not.toContain('manage.transactionHistory');
    expect(labels).not.toContain('manage.debts');
    expect(labels).not.toContain('manage.staffPermissions');
    // Nhưng vẫn thấy phần vận hành hằng ngày.
    expect(labels).toEqual(
      expect.arrayContaining([
        'manage.dashboard',
        'manage.rentalCalendar',
        'manage.vehicleList',
        'manage.rentals',
      ]),
    );
  });

  it('shop_viewer thấy ĐÚNG BẰNG shop_staff - menu không phân biệt được hai vai trò này', () => {
    // Khác biệt thật nằm ở quyền GHI (`booking.create`…), không ở quyền XEM.
    expect(labelsOfRole(TENANT_ROLE.SHOP_VIEWER)).toEqual(labelsOfRole(TENANT_ROLE.SHOP_STAFF));
  });
});

describe('nav - vai trò nền tảng nhìn thấy gì', () => {
  it('platform_admin thấy TOÀN BỘ cây nền tảng - không mục nào ngoài tầm với', () => {
    // Khẳng định theo TẬP, không theo tổng số: super admin ôm mọi quyền nên tập mục họ thấy
    // đúng bằng cây. Thêm một mục nền tảng mới thì test này vẫn đúng mà không phải sửa số.
    expect(
      visibleLabels(DEFAULT_PLATFORM_ROLE_PERMISSIONS[PLATFORM_ROLE.PLATFORM_ADMIN], true),
    ).toEqual(flattenLeaves(PLATFORM_NAV).map((leaf) => leaf.labelKey));
  });

  it('platform_staff chỉ thấy 7 mục đọc, KHÔNG thấy mục quản trị của super admin', () => {
    const labels = visibleLabels(
      DEFAULT_PLATFORM_ROLE_PERMISSIONS[PLATFORM_ROLE.PLATFORM_STAFF],
      true,
    );

    // `Tỉnh/thành` là mục ĐỌC: staff cần tra danh mục để hiểu dữ liệu giám sát; bật/tắt hiển thị
    // công khai là quyền riêng (`platform.locations.manage`) mà staff không có.
    expect(labels).toEqual([
      'manage.dashboard',
      'platform.vehicles',
      // Vận hành chuyến đi cùng quyền đơn thuê: cùng dữ liệu, xếp lại theo chặng (07/10/2026).
      'platform.trips',
      'platform.bookings',
      'platform.customers',
      // Tra cứu xuyên realm: CHỈ ĐỌC, liên hệ đã che — cùng quyền với "Khách thuê".
      'platform.accountLookup',
      'platform.locations',
    ]);
    for (const adminOnly of [
      'platform.approvals',
      'platform.packageShops',
      'platform.individualOwners',
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
    // Hàng đợi bằng lái đã gỡ (ADR 0070) — không còn mục menu riêng cho bất kỳ vai nào.
    expect(labels).not.toContain('platform.driverLicences');
    expect(labels).not.toContain('platform.staff');
    expect(labels).not.toContain('platform.plans');
  });

  it('finance_admin thấy hai danh sách đối tác + Gói dịch vụ, KHÔNG thấy Kiểm duyệt xe', () => {
    const labels = visibleLabels(
      DEFAULT_PLATFORM_ROLE_PERMISSIONS[PLATFORM_ROLE.FINANCE_ADMIN],
      true,
    );

    expect(labels).toEqual(
      expect.arrayContaining([
        'platform.packageShops',
        'platform.individualOwners',
        'platform.plans',
        'platform.bookings',
      ]),
    );
    expect(labels).not.toContain('platform.approvals');
    expect(labels).not.toContain('platform.audit');
  });

  it('không có quyền nào → không mục nào (khách chưa từng vào portal)', () => {
    expect(visibleLabels([], false)).toEqual([]);
    expect(visibleLabels([], true)).toEqual([]);
  });
});

describe('matchSelectedKey - quy tắc mục đang mở', () => {
  const shopLeaves = flattenLeaves(SHOP_NAV);
  const platformLeaves = flattenLeaves(PLATFORM_NAV);

  it('khớp tuyệt đối', () => {
    expect(matchSelectedKey('/manage/vehicles', shopLeaves)).toBe('/manage/vehicles');
  });

  /*
   * Phiên được mở từ MỘT trong hai danh sách đối tác và đường dẫn không nói là danh sách nào —
   * trên cây nền tảng không mục nào sáng, thay vì đoán (và càng không phải "Kiểm duyệt xe", mục
   * có href là tiền tố của đường dẫn phiên). Trong phiên, sidebar là cây của gian hàng — xem
   * `supportNavSections` ở cuối file.
   */
  it('phiên hỗ trợ gian hàng KHÔNG sáng mục nền tảng nào - không Kiểm duyệt, không hỗ trợ/tranh chấp (ADR 0050)', () => {
    const session = adminTenantSupportPath.vehicleEdit('A1B2C3D4E5F6G7H8J9K0M1N2P3', 'v1');
    expect(matchSelectedKey(session, platformLeaves)).toBeUndefined();
    // Hàng đợi hỗ trợ/tranh chấp của chính nó vẫn sáng đúng mục.
    expect(matchSelectedKey(ROUTES.ADMIN.SUPPORT, platformLeaves)).toBe(ROUTES.ADMIN.SUPPORT);
  });

  it('route con khớp mục cha', () => {
    expect(matchSelectedKey('/manage/vehicles/new', shopLeaves)).toBe('/manage/vehicles');
    expect(matchSelectedKey('/manage/vehicles/01H/edit', shopLeaves)).toBe('/manage/vehicles');
  });

  it('`/manage` CHỈ khớp tuyệt đối - nếu không thì mọi trang đều sáng "Tổng quan"', () => {
    expect(matchSelectedKey('/manage', shopLeaves)).toBe('/manage');
    expect(matchSelectedKey('/manage/receipts', shopLeaves)).toBe('/manage/receipts');
  });

  it('tiền tố GẦN GIỐNG không chọn nhầm: booking-requests không sáng mục "Đơn thuê xe"', () => {
    // Route hộp thư cũ chỉ chuyển tiếp (05/11/2026) — nó không phải một mục, và "/bookings" là
    // tiền tố CHUỖI chứ không phải tiền tố ĐƯỜNG DẪN của nó.
    expect(matchSelectedKey('/manage/booking-requests', shopLeaves)).toBeUndefined();
    expect(matchSelectedKey('/manage/bookings', shopLeaves)).toBe('/manage/bookings');
    expect(matchSelectedKey(ROUTES.MANAGE.BOOKINGS_ENDED, shopLeaves)).toBe('/manage/bookings');
  });

  it('mọi trang dưới /bookings thuộc mục "Quản lý đơn thuê xe"', () => {
    // "Chờ giao xe" là một ngăn (query) của chính màn đó từ 02/11/2026 — route cũ chỉ chuyển tiếp.
    expect(matchSelectedKey(ROUTES.MANAGE.BOOKINGS_AWAITING_PICKUP, shopLeaves)).toBe(
      ROUTES.MANAGE.BOOKINGS,
    );
    expect(matchSelectedKey(ROUTES.MANAGE.BOOKINGS, shopLeaves)).toBe(ROUTES.MANAGE.BOOKINGS);
    expect(matchSelectedKey('/manage/bookings/01HZZZZZZZZZZZZZZZZZZZZZZZ', shopLeaves)).toBe(
      ROUTES.MANAGE.BOOKINGS,
    );
  });

  it('`/manage/shop` không nuốt `/manage/shop/policies` - tiền tố dài nhất thắng', () => {
    expect(matchSelectedKey('/manage/shop', shopLeaves)).toBe('/manage/shop');
    expect(matchSelectedKey('/manage/shop/policies', shopLeaves)).toBe('/manage/shop/policies');
    // Chi nhánh là section của Thông tin cửa hàng (02/11/2026) — route cũ thuộc về trang đó.
    expect(matchSelectedKey('/manage/shop/branches', shopLeaves)).toBe('/manage/shop');
  });

  it('hai danh sách đối tác sáng riêng, không kéo theo nhau', () => {
    expect(matchSelectedKey(ROUTES.ADMIN.PARTNER_SHOPS, platformLeaves)).toBe(
      ROUTES.ADMIN.PARTNER_SHOPS,
    );
    expect(matchSelectedKey(ROUTES.ADMIN.PARTNER_OWNERS, platformLeaves)).toBe(
      ROUTES.ADMIN.PARTNER_OWNERS,
    );
  });

  /*
   * "Kiểm duyệt xe" sống ở `/manage/admin` — tiền tố của MỌI trang quản trị. Nó chỉ sáng khi đứng
   * đúng ở đó; một trang admin không có mục riêng (URL cũ đang chuyển tiếp, gốc khối Đối tác) không
   * được sáng nhầm nó.
   */
  it('"Kiểm duyệt xe" chỉ khớp tuyệt đối - không nhận route con nào', () => {
    expect(matchSelectedKey(ROUTES.ADMIN.ROOT, platformLeaves)).toBe(ROUTES.ADMIN.ROOT);
    expect(matchSelectedKey(ROUTES.ADMIN.TENANTS, platformLeaves)).toBeUndefined();
    expect(matchSelectedKey(ROUTES.ADMIN.PARTNERS, platformLeaves)).toBeUndefined();
    expect(matchSelectedKey('/manage/admin/khong-ton-tai', platformLeaves)).toBeUndefined();
  });

  it('"Tất cả xe" và "Kiểm duyệt xe" là hai mục độc lập, route con của xe sáng "Tất cả xe"', () => {
    expect(matchSelectedKey(ROUTES.ADMIN.VEHICLES, platformLeaves)).toBe(ROUTES.ADMIN.VEHICLES);
    expect(matchSelectedKey(`${ROUTES.ADMIN.VEHICLES}/01H`, platformLeaves)).toBe(
      ROUTES.ADMIN.VEHICLES,
    );
  });

  it('mỗi mục nền tảng: đứng ở href của nó thì sáng CHÍNH nó, và route con không sáng mục khác', () => {
    for (const leaf of platformLeaves) {
      expect(matchSelectedKey(leaf.href, platformLeaves)).toBe(leaf.href);
      const child = `${leaf.href}/01H`;
      const selected = matchSelectedKey(child, platformLeaves);
      // Route con: hoặc chính mục cha của nó, hoặc (mục khớp tuyệt đối) không mục nào.
      expect([leaf.href, undefined]).toContain(selected);
    }
  });

  it('route ngoài cây → không mục nào sáng', () => {
    expect(matchSelectedKey('/manage/contracts/01H', shopLeaves)).toBeUndefined();
    expect(matchSelectedKey('/manage/onboarding', shopLeaves)).toBeUndefined();
    expect(matchSelectedKey('/listings/01H', shopLeaves)).toBeUndefined();
  });

  it('chỉ dò trong cây được truyền vào - không rò mục nền tảng sang gian hàng', () => {
    expect(matchSelectedKey('/manage/admin/staff', shopLeaves)).toBeUndefined();
  });
});

describe('sectionKeyOf / branchKeyOf - bung đúng khối và đúng mục cha', () => {
  it('khối chứa mục đang chọn', () => {
    expect(sectionKeyOf(SHOP_NAV, ROUTES.MANAGE.RECEIPTS)).toBe('revenue');
    expect(sectionKeyOf(SHOP_NAV, ROUTES.MANAGE.BALANCE)).toBe('revenue');
    expect(sectionKeyOf(SHOP_NAV, ROUTES.MANAGE.SHOP)).toBe('settings');
    expect(sectionKeyOf(SHOP_NAV, ROUTES.MANAGE.MEMBERS)).toBe('settings');
    expect(sectionKeyOf(SHOP_NAV, ROUTES.MANAGE.MAINTENANCE)).toBe('fleet');
    expect(sectionKeyOf(SHOP_NAV, ROUTES.MANAGE.BOOKINGS)).toBe('operations');
    expect(sectionKeyOf(SHOP_NAV, ROUTES.MANAGE.ROOT)).toBe('overview');
  });

  it('menu partner phẳng → không mục nào có mục cha; menu nền tảng vẫn có', () => {
    expect(branchKeyOf(SHOP_NAV, ROUTES.MANAGE.MAINTENANCE)).toBeUndefined();
    expect(branchKeyOf(SHOP_NAV, ROUTES.MANAGE.BOOKINGS)).toBeUndefined();
    expect(branchKeyOf(PLATFORM_NAV, ROUTES.ADMIN.PLANS)).toBe('platform-billing');
  });

  it('không có mục nào đang chọn → không bung gì', () => {
    expect(sectionKeyOf(SHOP_NAV, undefined)).toBeUndefined();
    expect(branchKeyOf(SHOP_NAV, undefined)).toBeUndefined();
  });
});

describe('mobileTabsForZone - 4 tab dưới đáy', () => {
  it('mỗi cây đúng 4 tab, tab đầu là trang chủ của site', () => {
    expect(tabsFor(false)).toHaveLength(4);
    expect(tabsFor(false)[0]!.href).toBe(ROUTES.MANAGE.ROOT);
    expect(tabsFor(true)).toHaveLength(4);
    expect(tabsFor(true)[0]!.href).toBe(ROUTES.ADMIN.DASHBOARD);
    const ownerLite = mobileTabsForZone(ZONE.PARTNER, PARTNER_TRACK.COMMISSION);
    expect(ownerLite).toHaveLength(4);
    expect(ownerLite[0]!.href).toBe(ROUTES.MANAGE.ROOT);
  });

  it('tab mobile là TẬP CON của cây menu cùng khu + tuyến', () => {
    const pairs = [
      [navFor(false), tabsFor(false)],
      [navFor(true), tabsFor(true)],
      [
        navForZone(ZONE.PARTNER, PARTNER_TRACK.COMMISSION),
        mobileTabsForZone(ZONE.PARTNER, PARTNER_TRACK.COMMISSION),
      ],
    ] as const;
    for (const [sections, tabs] of pairs) {
      const hrefs = new Set(flattenLeaves(sections).map((leaf) => leaf.href));
      for (const tab of tabs) expect(hrefs.has(tab.href), tab.href).toBe(true);
    }
  });

  it('chưa có tuyến (chưa có gian hàng / đang chờ thanh toán gói) → không tab nào', () => {
    expect(mobileTabsForZone(ZONE.PARTNER, PARTNER_TRACK.NONE)).toEqual([]);
    expect(mobileTabsForZone(ZONE.PARTNER, PARTNER_TRACK.PACKAGE_PENDING)).toEqual([]);
  });

  it('bốn đích chính của gian hàng giữ nguyên sau khi sắp lại menu', () => {
    // Yêu cầu + đơn gộp một ô (05/11/2026); ô thứ tư là đội xe.
    expect(tabsFor(false).map((tab) => tab.key)).toEqual([
      'dashboard',
      'calendar',
      'bookings',
      'vehicles',
    ]);
  });
});

/**
 * Site partner có HAI menu theo tuyến (ADR 0051 điều 3 · ADR 0053): tuyến gói thấy Full Manage, tuyến
 * hoa hồng thấy Owner Lite. Trang chỉ của tuyến gói KHÔNG được xuất hiện trong menu hoa hồng — bấm
 * vào là bị `partnerPageRedirect` đá về trang chủ, tức là một mục menu chết.
 */
describe('navForZone - menu theo tuyến ở site partner', () => {
  const commissionNav = navForZone(ZONE.PARTNER, PARTNER_TRACK.COMMISSION);

  it('tuyến hoa hồng → cây Owner Lite; chưa có tuyến → không menu', () => {
    expect(commissionNav).toBe(OWNER_LITE_NAV);
    expect(navForZone(ZONE.PARTNER, PARTNER_TRACK.NONE)).toEqual([]);
    expect(navForZone(ZONE.PARTNER, PARTNER_TRACK.PACKAGE_PENDING)).toEqual([]);
  });

  it('mọi mục của menu hoa hồng là trang tuyến hoa hồng được ở', () => {
    for (const leaf of flattenLeaves(commissionNav)) {
      expect(isCommissionPage(leaf.href), leaf.href).toBe(true);
    }
  });

  it('menu hoa hồng KHÔNG có trang chỉ của tuyến gói', () => {
    const hrefs = new Set(hrefsOf(commissionNav));
    for (const href of [
      ROUTES.MANAGE.CUSTOMERS,
      ROUTES.MANAGE.FINANCE,
      ROUTES.MANAGE.RECEIPTS,
      ROUTES.MANAGE.DEBTS,
      ROUTES.MANAGE.MEMBERS,
      ROUTES.MANAGE.SHOP,
      ROUTES.MANAGE.MAINTENANCE,
      ROUTES.MANAGE.VEHICLE_NEW,
    ]) {
      expect(hrefs.has(href), href).toBe(false);
    }
  });

  it('menu hoa hồng có đủ việc cho thuê + tiền + hồ sơ chủ xe + tài liệu', () => {
    const hrefs = new Set(hrefsOf(commissionNav));
    // Tin nhắn là icon ở header (02/11/2026), không còn là dòng menu — ở cả hai tuyến.
    expect(hrefs.has(ROUTES.MANAGE.CHAT)).toBe(false);
    for (const href of [
      ROUTES.MANAGE.ROOT,
      ROUTES.MANAGE.VEHICLES,
      ROUTES.MANAGE.DRIVERS,
      ROUTES.MANAGE.CALENDAR,
      ROUTES.MANAGE.BOOKINGS,
      ROUTES.MANAGE.BALANCE,
      ROUTES.MANAGE.ACCOUNT,
      ROUTES.MANAGE.HOST_GUIDE,
      ROUTES.MANAGE.CONTRACTS_DOCUMENTS,
      ROUTES.MANAGE.DATA_PROTECTION,
      ROUTES.MANAGE.SUPPORT_CASES,
    ]) {
      expect(hrefs.has(href), href).toBe(true);
    }
  });

  /*
   * 06/11/2026: chủ xe tuyến hoa hồng dùng CHUNG màn "Đơn thuê xe" với gian hàng — "Chuyến cho
   * thuê" riêng (07/10) đã gỡ, vì màn của gian hàng nay cũng gộp yêu cầu + đơn vào một nơi.
   */
  it('menu hoa hồng: MỘT mục "Đơn thuê xe" cho cả chủ lẫn thành viên, huy hiệu như gian hàng', () => {
    const leaves = flattenLeaves(commissionNav);
    const bookings = leaves.filter((leaf) => leaf.href === ROUTES.MANAGE.BOOKINGS);
    expect(bookings).toHaveLength(1);
    expect(bookings[0]?.ownerOnly).toBeUndefined();
    expect(bookings[0]?.badge).toBe(NAV_BADGE.RENTALS_WORK);
    expect(leaves.some((leaf) => leaf.href === ROUTES.MANAGE.TRIPS)).toBe(false);
    expect(leaves.some((leaf) => leaf.href === ROUTES.MANAGE.BOOKING_REQUESTS)).toBe(false);
    // Lượt giao/trả đến hạn đã nằm trong số của "Đơn thuê xe" — Lịch xe mang số là đếm đôi.
    expect(leaves.find((leaf) => leaf.href === ROUTES.MANAGE.CALENDAR)?.badge).toBeUndefined();

    const tabs = mobileTabsForZone(ZONE.PARTNER, PARTNER_TRACK.COMMISSION);
    const tab = tabs.find((item) => item.href === ROUTES.MANAGE.BOOKINGS);
    expect(tab?.badge).toBe(NAV_BADGE.RENTALS_WORK);
    expect(tabs.some((item) => item.href === ROUTES.MANAGE.TRIPS)).toBe(false);
  });

  it('cùng một câu hỏi "ai được thấy mục" cho mục đơn của hai tuyến', () => {
    const shopBookings = flattenLeaves(SHOP_NAV).find(
      (leaf) => leaf.href === ROUTES.MANAGE.BOOKINGS,
    );
    const ownerBookings = flattenLeaves(commissionNav).find(
      (leaf) => leaf.href === ROUTES.MANAGE.BOOKINGS,
    );
    expect(ownerBookings?.permission).toEqual(shopBookings?.permission);
    expect(ownerBookings?.labelKey).toBe(shopBookings?.labelKey);
  });

  /*
   * Chủ xe cá nhân có MỘT hồ sơ (06/10/2026): không còn nhóm "Gian hàng", và "Hồ sơ chủ xe" là trang
   * tài khoản của chính họ — không phải màn đăng ký cũ (nay chỉ là redirect).
   */
  it('menu hoa hồng không có nhóm "Gian hàng" và không trỏ tới màn đăng ký cũ', () => {
    expect(commissionNav.some((section) => section.labelKey === 'manageGroups.storefront')).toBe(
      false,
    );
    expect(new Set(hrefsOf(commissionNav)).has(ROUTES.MANAGE.REGISTRATION)).toBe(false);
  });

  it('menu tuyến gói KHÔNG có trang chỉ của tuyến hoa hồng (đã có bản trong Cửa hàng)', () => {
    const hrefs = new Set(hrefsOf(SHOP_NAV));
    for (const href of [
      ROUTES.MANAGE.REGISTRATION,
      ROUTES.MANAGE.TAX,
      ROUTES.MANAGE.BANK_ACCOUNTS,
    ]) {
      expect(hrefs.has(href), href).toBe(false);
    }
  });

  it('không cây nào của site partner trỏ sang site quản trị và ngược lại', () => {
    for (const sections of [SHOP_NAV, commissionNav]) {
      for (const href of hrefsOf(sections)) expect(href.startsWith('/admin'), href).toBe(false);
    }
    for (const href of hrefsOf(PLATFORM_NAV)) expect(href.startsWith('/manage'), href).toBe(false);
  });
});

/**
 * Cây menu giữ KHOÁ, không giữ chữ — nên phải có gì đó bảo đảm mỗi khoá thật sự có bản dịch.
 * Thiếu một khoá thì mục menu hiện ra chính chuỗi khoá đó trên production, và không có
 * typecheck nào bắt được vì `NavLabelKey` chỉ suy từ bó TIẾNG VIỆT.
 */
describe('nav - mọi khoá nhãn đều có bản dịch ở cả hai ngôn ngữ', () => {
  const lookup = (bundle: Record<string, unknown>, key: string): unknown =>
    key
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], bundle);

  const allSections = [...SHOP_NAV, ...PLATFORM_NAV, ...OWNER_LITE_NAV];
  const allKeys = [
    ...allSections.map((section) => section.labelKey),
    ...allSections
      .flatMap((section) => section.children.filter(isNavBranch))
      .map((b) => b.labelKey),
    ...flattenLeaves(allSections).map((leaf) => leaf.labelKey),
    ...tabsFor(false).map((tab) => tab.labelKey),
    ...tabsFor(true).map((tab) => tab.labelKey),
    ...mobileTabsForZone(ZONE.PARTNER, PARTNER_TRACK.COMMISSION).map((tab) => tab.labelKey),
    ...flattenLeaves(supportNavSections('X', SUPPORT_WORKSPACE.OWNER_LITE)).map(
      (leaf) => leaf.labelKey,
    ),
    ...supportNavSections('X', SUPPORT_WORKSPACE.OWNER_LITE).map((section) => section.labelKey),
    ...supportMobileTabs('X', SUPPORT_WORKSPACE.OWNER_LITE).map((tab) => tab.labelKey),
  ];

  it.each([
    ['vi', viNavigation],
    ['en', enNavigation],
  ])('%s có đủ nhãn', (_locale, bundle) => {
    const missing = allKeys.filter((key) => typeof lookup(bundle, key) !== 'string');
    expect(missing).toEqual([]);
  });
});

/**
 * Menu của một phiên hỗ trợ gian hàng (ADR 0050 §12): CHÍNH cây của gian hàng, href trong phiên,
 * không một mục nào dẫn ra ngoài phiên hay vào khu bị ẩn (tài chính, ví, chat, tài khoản…).
 */
describe('supportNavSections - menu của phiên hỗ trợ', () => {
  const CTX = 'A1B2C3D4E5F6G7H8J9K0M1N2P3';
  const base = adminTenantSupportPath.root(CTX);
  const manage = flattenLeaves(supportNavSections(CTX, SUPPORT_WORKSPACE.MANAGE));
  const lite = flattenLeaves(supportNavSections(CTX, SUPPORT_WORKSPACE.OWNER_LITE));

  it('Full Manage: mọi mục đều nằm trong phiên, đúng các màn đọc của gian hàng', () => {
    expect(manage.every((leaf) => leaf.href.startsWith(`${base}/`))).toBe(true);
    const rel = manage.map((leaf) => leaf.href.slice(base.length + 1));
    expect(rel).toEqual(
      expect.arrayContaining([
        'dashboard',
        'vehicles',
        'calendar',
        'bookings',
        'customers',
        // Chi nhánh là section của trang Cửa hàng trong phiên cũng như ở site partner.
        'shop',
        'shop/policies',
        'drivers',
        'members',
        'support/cases',
      ]),
    );
  });

  it('Full Manage: không có mục tài chính/ví/chat/tài khoản/mua gói', () => {
    const rel = manage.map((leaf) => leaf.href.slice(base.length + 1));
    for (const hidden of [
      'finance',
      'wallet',
      'debts',
      'chat',
      'billing',
      'account',
      'tax',
      'contracts',
    ]) {
      expect(rel.some((r) => r.startsWith(hidden))).toBe(false);
    }
    // Mục chỉ-chủ-shop (ví, tài khoản ngân hàng) không bao giờ vào phiên.
    expect(manage.some((leaf) => leaf.ownerOnly)).toBe(false);
  });

  it('Owner Lite: chỉ công việc cho thuê - không Tổng quan, không sổ khách, không khu tài khoản', () => {
    const rel = lite.map((leaf) => leaf.href.slice(base.length + 1));
    expect(rel).toEqual(['vehicles', 'calendar', 'bookings', 'support/cases']);
  });

  it('package_pending: không có menu nào (chỉ trạng thái đăng ký)', () => {
    expect(supportNavSections(CTX, SUPPORT_WORKSPACE.ONBOARDING)).toEqual([]);
    expect(supportMobileTabs(CTX, SUPPORT_WORKSPACE.ONBOARDING)).toEqual([]);
  });

  it('tab dưới đáy (mobile) cũng nằm trong phiên', () => {
    for (const workspace of [SUPPORT_WORKSPACE.MANAGE, SUPPORT_WORKSPACE.OWNER_LITE]) {
      const tabs = supportMobileTabs(CTX, workspace);
      expect(tabs.length).toBeGreaterThan(0);
      expect(tabs.every((tab) => tab.href.startsWith(`${base}/`))).toBe(true);
    }
  });

  it('mục đang mở trong phiên là mục của GIAN HÀNG, kể cả ở trang con', () => {
    expect(matchSelectedKey(`${base}/vehicles`, manage)).toBe(`${base}/vehicles`);
    expect(matchSelectedKey(`${base}/vehicles/v1/edit`, manage)).toBe(`${base}/vehicles`);
    expect(matchSelectedKey(`${base}/dashboard`, manage)).toBe(`${base}/dashboard`);
    expect(matchSelectedKey(`${base}/bookings/b1`, lite)).toBe(`${base}/bookings`);
  });

  it('mục của phiên KHÁC không bao giờ sáng', () => {
    const other = adminTenantSupportPath.root('Z9Y8X7W6V5T4S3R2Q1P0N9M8K7');
    expect(matchSelectedKey(`${other}/vehicles`, manage)).toBeUndefined();
  });
});
