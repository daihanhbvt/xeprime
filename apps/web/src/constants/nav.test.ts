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
  flattenLeaves,
  groupKeyOf,
  isNavGroup,
  matchSelectedKey,
  mobileTabsForScope,
  navForScope,
} from './nav';
import { ROUTES } from './routes';

/**
 * Test ĐẶC TẢ cho cây điều hướng — chốt hiện trạng TRƯỚC khi Wave 1D đổi vỏ portal.
 *
 * Ba điều bộ này khoá lại:
 *  1. **Menu nào hiện với vai trò nào** — Wave 1D đổi trình bày, KHÔNG được đổi tập mục;
 *  2. **Quy tắc chọn mục đang mở** (`matchSelectedKey`) — đổi vỏ hay làm collapsed đều không
 *     được làm sáng nhầm mục;
 *  3. **Ranh giới gian hàng ↔ nền tảng** — `navForScope` chọn MỘT cây, không trộn.
 *
 * ⚠️ Quyền lúc chạy đọc từ DB (`/auth/me`), KHÔNG phải từ `DEFAULT_*_ROLE_PERMISSIONS`.
 * Ở đây dùng bộ mặc định làm MÔ HÌNH ĐẠI DIỆN cho từng vai trò để phát biểu được câu
 * "vai trò này thấy gì" — chủ shop vẫn tạo được custom role và admin vẫn thu hồi được quyền.
 * Và ẩn một mục menu KHÔNG bảo vệ gì: chặn thật nằm ở guard backend (CLAUDE.md mục 6).
 */

/** Nhãn của các mục lá mà một tập quyền cho phép nhìn thấy, theo đúng thứ tự khai báo. */
function visibleLabels(granted: readonly Permission[], isPlatform: boolean): string[] {
  const set = new Set<string>(granted);
  return flattenLeaves(navForScope(isPlatform))
    .filter((leaf) => set.has(leaf.permission))
    .map((leaf) => leaf.label);
}

describe('nav — cấu trúc cây', () => {
  it('gian hàng: 1 mục gốc + 2 nhóm, tổng 18 mục lá', () => {
    expect(SHOP_NAV).toHaveLength(3);
    expect(SHOP_NAV.filter(isNavGroup).map((g) => g.label)).toEqual(['Quản lý', 'Cài đặt']);
    expect(flattenLeaves(SHOP_NAV)).toHaveLength(18);
  });

  it('nền tảng: 1 mục gốc + 1 nhóm, tổng 12 mục lá', () => {
    expect(PLATFORM_NAV).toHaveLength(2);
    expect(PLATFORM_NAV.filter(isNavGroup).map((g) => g.label)).toEqual(['Quản trị nền tảng']);
    expect(flattenLeaves(PLATFORM_NAV)).toHaveLength(12);
  });

  it('mọi mục lá có href riêng — không hai mục cùng đích', () => {
    for (const nodes of [SHOP_NAV, PLATFORM_NAV]) {
      const hrefs = flattenLeaves(nodes).map((leaf) => leaf.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });

  it('mọi href đến từ ROUTES, không có chuỗi gõ tay', () => {
    const known = new Set<string>(Object.values(ROUTES.MANAGE));
    for (const leaf of [...flattenLeaves(SHOP_NAV), ...flattenLeaves(PLATFORM_NAV)]) {
      expect(known.has(leaf.href)).toBe(true);
    }
  });

  it('đúng 3 mục gian hàng là placeholder (`comingSoon`) — drivers thành trang thật 17/08', () => {
    const coming = flattenLeaves(SHOP_NAV)
      .filter((leaf) => leaf.comingSoon)
      .map((leaf) => leaf.key);
    expect(coming).toEqual(['customers', 'pickup-areas', 'trash']);
    // Nền tảng không có mục nào chưa dựng.
    expect(flattenLeaves(PLATFORM_NAV).some((leaf) => leaf.comingSoon)).toBe(false);
  });

  it('mục placeholder VẪN nằm trong menu — chủ dự án yêu cầu "chưa làm thì để menu trống"', () => {
    expect(visibleLabels(DEFAULT_TENANT_ROLE_PERMISSIONS[TENANT_ROLE.SHOP_OWNER], false)).toContain(
      'Thùng rác',
    );
  });
});

describe('nav — ranh giới gian hàng ↔ nền tảng', () => {
  it('có platformRole → CHỈ cây nền tảng, không trộn mục gian hàng', () => {
    expect(navForScope(true)).toBe(PLATFORM_NAV);
    const labels = flattenLeaves(PLATFORM_NAV).map((leaf) => leaf.label);
    expect(labels).not.toContain('Lịch thuê xe');
    expect(labels).not.toContain('Công nợ');
  });

  it('không có platformRole → CHỈ cây gian hàng', () => {
    expect(navForScope(false)).toBe(SHOP_NAV);
    const labels = flattenLeaves(SHOP_NAV).map((leaf) => leaf.label);
    expect(labels).not.toContain('Nhật ký hệ thống');
    expect(labels).not.toContain('Nhân sự nền tảng');
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
  it('shop_owner thấy đủ 18 mục', () => {
    expect(
      visibleLabels(DEFAULT_TENANT_ROLE_PERMISSIONS[TENANT_ROLE.SHOP_OWNER], false),
    ).toHaveLength(18);
  });

  it('shop_manager cũng thấy đủ 18 mục (có MEMBER_VIEW và FINANCE_VIEW)', () => {
    expect(
      visibleLabels(DEFAULT_TENANT_ROLE_PERMISSIONS[TENANT_ROLE.SHOP_MANAGER], false),
    ).toHaveLength(18);
  });

  it('shop_staff KHÔNG thấy tài chính và người dùng', () => {
    const labels = visibleLabels(DEFAULT_TENANT_ROLE_PERMISSIONS[TENANT_ROLE.SHOP_STAFF], false);

    expect(labels).not.toContain('Tài chính');
    expect(labels).not.toContain('Thu chi');
    expect(labels).not.toContain('Công nợ');
    expect(labels).not.toContain('Người dùng');
    // Nhưng vẫn thấy phần vận hành hằng ngày.
    expect(labels).toEqual(
      expect.arrayContaining(['Tổng quan', 'Lịch thuê xe', 'Xe', 'Đơn thuê', 'Đơn đặt xe']),
    );
  });

  it('shop_viewer thấy ĐÚNG BẰNG shop_staff — menu không phân biệt được hai vai trò này', () => {
    // Khác biệt thật nằm ở quyền GHI (`booking.create`…), không ở quyền XEM. Ghi lại đây để
    // Wave 1D không tưởng nhầm là thiếu sót rồi "sửa".
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
      'Tổng quan',
      'Xe toàn hệ thống',
      'Đơn thuê toàn hệ thống',
      'Khách thuê',
      'Tỉnh/thành',
    ]);
    for (const adminOnly of [
      'Duyệt hồ sơ',
      'Gian hàng',
      'Nhân sự nền tảng',
      'Gói dịch vụ',
      'Nhật ký hệ thống',
    ]) {
      expect(labels).not.toContain(adminOnly);
    }
  });

  it('reviewer thấy Duyệt hồ sơ nhưng KHÔNG thấy Nhân sự/Gói dịch vụ', () => {
    const labels = visibleLabels(DEFAULT_PLATFORM_ROLE_PERMISSIONS[PLATFORM_ROLE.REVIEWER], true);

    expect(labels).toContain('Duyệt hồ sơ');
    expect(labels).not.toContain('Nhân sự nền tảng');
    expect(labels).not.toContain('Gói dịch vụ');
  });

  it('finance_admin thấy Gian hàng + Gói dịch vụ, KHÔNG thấy Duyệt hồ sơ', () => {
    const labels = visibleLabels(
      DEFAULT_PLATFORM_ROLE_PERMISSIONS[PLATFORM_ROLE.FINANCE_ADMIN],
      true,
    );

    expect(labels).toEqual(
      expect.arrayContaining(['Gian hàng', 'Gói dịch vụ', 'Đơn thuê toàn hệ thống']),
    );
    expect(labels).not.toContain('Duyệt hồ sơ');
    expect(labels).not.toContain('Nhật ký hệ thống');
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

  it('tiền tố dài nhất thắng: /manage/admin/tenants không dừng ở /manage/admin', () => {
    expect(matchSelectedKey('/manage/admin/tenants', platformLeaves)).toBe('/manage/admin/tenants');
    expect(matchSelectedKey('/manage/admin/tenants/01H', platformLeaves)).toBe(
      '/manage/admin/tenants',
    );
    expect(matchSelectedKey('/manage/admin', platformLeaves)).toBe('/manage/admin');
  });

  it('route ngoài cây → không mục nào sáng', () => {
    // `/manage/contracts/:id` không có mục menu; trước đây rơi vào đây là sáng nhầm.
    expect(matchSelectedKey('/manage/contracts/01H', shopLeaves)).toBeUndefined();
    expect(matchSelectedKey('/manage/onboarding', shopLeaves)).toBeUndefined();
    expect(matchSelectedKey('/listings/01H', shopLeaves)).toBeUndefined();
  });

  it('chỉ dò trong cây được truyền vào — không rò mục nền tảng sang gian hàng', () => {
    expect(matchSelectedKey('/manage/admin/staff', shopLeaves)).toBeUndefined();
  });
});

describe('groupKeyOf — nhóm cha của mục đang chọn', () => {
  it('trả về nhóm chứa mục', () => {
    expect(groupKeyOf(SHOP_NAV, '/manage/receipts')).toEqual(['operations']);
    expect(groupKeyOf(SHOP_NAV, '/manage/members')).toEqual(['settings']);
  });

  it('mục gốc không thuộc nhóm nào', () => {
    expect(groupKeyOf(SHOP_NAV, ROUTES.MANAGE.ROOT)).toEqual([]);
    expect(groupKeyOf(SHOP_NAV, undefined)).toEqual([]);
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

  it('tab mobile KHÔNG lọc theo quyền — khác hẳn menu đầy đủ', () => {
    // Hiện trạng: `mobileTabsForScope` chỉ nhận MỘT tham số (`isPlatform`) — không có đường
    // nào truyền quyền vào. Nghĩa là shop_viewer thấy đúng 4 tab như shop_owner, kể cả tab
    // dẫn tới trang mà họ không thao tác được. Ghi lại để Wave 1D quyết có lọc hay không.
    expect(mobileTabsForScope).toHaveLength(1);
    expect(mobileTabsForScope(false).map((tab) => tab.key)).toEqual([
      'dashboard',
      'calendar',
      'booking-requests',
      'bookings',
    ]);
  });
});
