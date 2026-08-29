import {
  DEFAULT_PLATFORM_ROLE_PERMISSIONS,
  DEFAULT_TENANT_ROLE_PERMISSIONS,
  PLATFORM_ROLE,
  TENANT_ROLE,
  type Permission,
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
 * Test ĐẶC TẢ cho cây điều hướng, viết lại theo mô hình khối (Tổng quan · Quản lý · Kinh doanh
 * · Gian hàng · Cấu hình · Hỗ trợ).
 *
 * Bốn điều bộ này khoá lại:
 *  1. **Không mục nào biến mất khi gom nhóm** — 18 mục cũ vẫn còn nguyên, chỉ đổi chỗ đứng;
 *  2. **Menu nào hiện với vai trò nào** — đổi trình bày KHÔNG được đổi tập mục;
 *  3. **Quy tắc chọn mục đang mở** (`matchSelectedKey`) — gom nhóm không được làm sáng nhầm;
 *  4. **Ranh giới gian hàng ↔ nền tảng** — `navForScope` chọn MỘT cây, không trộn.
 *
 * ⚠️ Quyền lúc chạy đọc từ DB (`/auth/me`), KHÔNG phải từ `DEFAULT_*_ROLE_PERMISSIONS`.
 * Ở đây dùng bộ mặc định làm MÔ HÌNH ĐẠI DIỆN cho từng vai trò để phát biểu được câu
 * "vai trò này thấy gì" — chủ shop vẫn tạo được custom role và admin vẫn thu hồi được quyền.
 * Và ẩn một mục menu KHÔNG bảo vệ gì: chặn thật nằm ở guard backend (CLAUDE.md mục 6).
 */

/**
 * Khoá nhãn của các mục lá mà một tập quyền cho phép nhìn thấy, theo đúng thứ tự khai báo.
 *
 * Khẳng định trên KHOÁ chứ không trên câu tiếng Việt: cây menu là dữ liệu, và khoá là thứ
 * không đổi khi đổi ngôn ngữ. Việc khoá có bản dịch ở CẢ HAI ngôn ngữ do bài test toàn vẹn ở
 * cuối file giữ.
 */
function visibleLabels(granted: readonly Permission[], isPlatform: boolean): string[] {
  const set = new Set<string>(granted);
  return flattenLeaves(navForScope(isPlatform))
    .filter((leaf) => set.has(leaf.permission))
    .map((leaf) => leaf.labelKey);
}

/** Toàn bộ href của một cây — dùng để chứng minh "gom nhóm không mất mục nào". */
function hrefsOf(sections: typeof SHOP_NAV): string[] {
  return flattenLeaves(sections).map((leaf) => leaf.href);
}

describe('nav — cấu trúc khối', () => {
  it('gian hàng: 6 khối theo hành trình chủ xe, tổng 20 mục lá', () => {
    expect(SHOP_NAV.map((section) => section.key)).toEqual([
      'overview',
      'operations',
      'business',
      'storefront',
      'settings',
      'support',
    ]);
    // 20 từ W2: thêm "Gói của tôi" (subscription.view — ADR 0015/0026).
    expect(flattenLeaves(SHOP_NAV)).toHaveLength(20);
  });

  it('Tổng quan và Hỗ trợ luôn hiện (`pinned`), bốn khối giữa gập được', () => {
    const pinned = SHOP_NAV.filter((section) => section.pinned).map((section) => section.key);
    expect(pinned).toEqual(['overview', 'support']);
  });

  it('nền tảng: 2 khối, tổng 12 mục lá — cây này KHÔNG bị sắp lại', () => {
    expect(PLATFORM_NAV.map((section) => section.key)).toEqual(['overview', 'platform']);
    expect(flattenLeaves(PLATFORM_NAV)).toHaveLength(12);
  });

  it('đúng ba mục cha (submenu): đội xe, đơn thuê, tài chính', () => {
    const branches = SHOP_NAV.flatMap((section) => section.children)
      .filter(isNavBranch)
      .map((branch) => branch.key);
    expect(branches).toEqual(['fleet', 'orders', 'finance']);
  });

  it('KHÔNG mất mục nào so với bản 18 mục ngang cấp — chỉ thêm Trung tâm hỗ trợ', () => {
    // Đây là bài test quan trọng nhất của đợt sắp lại: mọi route cũ vẫn phải có lối vào.
    for (const href of [
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
      ROUTES.MANAGE.PICKUP_AREAS,
      ROUTES.MANAGE.DRIVERS,
      ROUTES.MANAGE.CHAT,
      ROUTES.MANAGE.TRASH,
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
      ROUTES.MANAGE.FINANCE,
      ROUTES.MANAGE.RECEIPTS,
      ROUTES.MANAGE.DEBTS,
    ]);
  });

  it('Đơn đặt xe giữ nguyên route riêng, đứng dưới Đơn thuê', () => {
    const operations = SHOP_NAV.find((section) => section.key === 'operations')!;
    const orders = operations.children.filter(isNavBranch).find((node) => node.key === 'orders')!;
    expect(orders.children.map((leaf) => leaf.href)).toEqual([
      ROUTES.MANAGE.BOOKING_REQUESTS,
      ROUTES.MANAGE.BOOKINGS,
    ]);
  });

  it('Thùng rác lui về Cấu hình, không nằm giữa các mục vận hành', () => {
    const settings = SHOP_NAV.find((section) => section.key === 'settings')!;
    expect(leavesOfSection(settings).map((leaf) => leaf.href)).toContain(ROUTES.MANAGE.TRASH);
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

  it('đúng 2 mục gian hàng là placeholder (`comingSoon`)', () => {
    const coming = flattenLeaves(SHOP_NAV)
      .filter((leaf) => leaf.comingSoon)
      .map((leaf) => leaf.key);
    expect(coming).toEqual(['pickup-areas', 'trash']);
    // Nền tảng không có mục nào chưa dựng.
    expect(flattenLeaves(PLATFORM_NAV).some((leaf) => leaf.comingSoon)).toBe(false);
  });

  it('mục placeholder VẪN nằm trong menu — chủ dự án yêu cầu "chưa làm thì để menu trống"', () => {
    expect(visibleLabels(DEFAULT_TENANT_ROLE_PERMISSIONS[TENANT_ROLE.SHOP_OWNER], false)).toContain(
      'manage.trash',
    );
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
  it('shop_owner thấy đủ 20 mục', () => {
    expect(
      visibleLabels(DEFAULT_TENANT_ROLE_PERMISSIONS[TENANT_ROLE.SHOP_OWNER], false),
    ).toHaveLength(20);
  });

  it('shop_manager cũng thấy đủ 20 mục (có MEMBER_VIEW, FINANCE_VIEW và SUBSCRIPTION_VIEW)', () => {
    expect(
      visibleLabels(DEFAULT_TENANT_ROLE_PERMISSIONS[TENANT_ROLE.SHOP_MANAGER], false),
    ).toHaveLength(20);
  });

  it('shop_staff KHÔNG thấy tài chính và người dùng', () => {
    const labels = visibleLabels(DEFAULT_TENANT_ROLE_PERMISSIONS[TENANT_ROLE.SHOP_STAFF], false);

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
    expect(visibleLabels(DEFAULT_TENANT_ROLE_PERMISSIONS[TENANT_ROLE.SHOP_VIEWER], false)).toEqual(
      visibleLabels(DEFAULT_TENANT_ROLE_PERMISSIONS[TENANT_ROLE.SHOP_STAFF], false),
    );
  });
});

describe('nav — vai trò nền tảng nhìn thấy gì', () => {
  it('platform_admin thấy đủ 12 mục', () => {
    expect(
      visibleLabels(DEFAULT_PLATFORM_ROLE_PERMISSIONS[PLATFORM_ROLE.PLATFORM_ADMIN], true),
    ).toHaveLength(12);
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
