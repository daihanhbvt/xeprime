import { cleanup, render, screen, within } from '@testing-library/react';
import { PERMISSION, type Permission } from '@xeprime/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ManageMenu } from './ManageMenu';
import { useManageNav } from './use-manage-nav';

/**
 * Test ĐẶC TẢ cho lớp nối giữa cây menu (`constants/nav`) và giao diện: `useManageNav` lọc
 * theo quyền + scope, `ManageMenu` vẽ ra.
 *
 * Wave 1D đổi TRÌNH BÀY của menu (nền tối, thu gọn, ranh 1024). Bộ này khoá lại phần KHÔNG
 * được đổi: mục nào hiện, nhóm nào hiện, mục nào đang sáng.
 *
 * Ở đây kiểm qua giao diện thật thay vì `renderHook` vì thứ cần bảo vệ là "người dùng thấy
 * gì" — `items` là cấu trúc nội bộ của AntD Menu, đổi được mà không ai mất chức năng.
 */

const nav = vi.hoisted(() => ({ pathname: '/manage' }));
const user = vi.hoisted(() => ({ platformRole: null as string | null }));
const perms = vi.hoisted(() => ({ granted: new Set<string>() }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: user, isLoading: false }),
}));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.has(p),
    hasAny: (...ps: string[]) => ps.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
}));

function grant(...permissions: Permission[]) {
  perms.granted = new Set<string>(permissions);
}

/** Dựng menu đúng như `Sidebar` dựng nó. */
function Menu() {
  const { items, selectedKey } = useManageNav();
  return <ManageMenu items={items} selectedKey={selectedKey} />;
}

function renderMenu() {
  return render(<Menu />);
}

/** Cùng `items`, chỉ khác chế độ hiển thị — không có cây menu thứ hai cho collapsed. */
function CollapsedMenu() {
  const { items, selectedKey } = useManageNav();
  return <ManageMenu items={items} selectedKey={selectedKey} tone="dark" collapsed />;
}

/** Nhãn của mọi mục lá đang hiện — mục lá là link, nhãn nhóm không phải. */
function itemLabels(): string[] {
  return screen.getAllByRole('link').map((link) => link.textContent ?? '');
}

/** Mục đang sáng, theo class công khai của AntD (không phải class sinh từ CSS Module). */
function selectedLabel(container: HTMLElement): string | null {
  const el = container.querySelector('.ant-menu-item-selected');
  return el ? (el.textContent ?? '') : null;
}

beforeEach(() => {
  nav.pathname = '/manage';
  user.platformRole = null;
  grant();
});

afterEach(cleanup);

describe('useManageNav — hiển thị theo quyền (gian hàng)', () => {
  it('không có quyền nào → menu rỗng, không có mục lá nào', () => {
    renderMenu();

    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('chỉ TENANT_VIEW → thấy mục cơ bản, KHÔNG thấy Xe/Đơn thuê/Tài chính', () => {
    grant(PERMISSION.TENANT_VIEW);
    renderMenu();

    const labels = itemLabels();
    expect(labels).toEqual(
      expect.arrayContaining(['Tổng quan', 'Cửa hàng', 'Trò chuyện', 'Thùng rác']),
    );
    expect(labels).not.toContain('Xe');
    expect(labels).not.toContain('Đơn thuê');
    expect(labels).not.toContain('Thu chi');
    expect(labels).not.toContain('Người dùng');
  });

  it('FINANCE_VIEW mở đúng ba mục tài chính', () => {
    grant(PERMISSION.TENANT_VIEW, PERMISSION.FINANCE_VIEW);
    renderMenu();

    expect(itemLabels()).toEqual(expect.arrayContaining(['Tài chính', 'Thu chi', 'Công nợ']));
  });

  it('MEMBER_VIEW mở "Người dùng"; thiếu nó thì mục biến mất hoàn toàn', () => {
    grant(PERMISSION.TENANT_VIEW);
    const { unmount } = renderMenu();
    expect(itemLabels()).not.toContain('Người dùng');
    unmount();

    grant(PERMISSION.TENANT_VIEW, PERMISSION.MEMBER_VIEW);
    renderMenu();
    expect(itemLabels()).toContain('Người dùng');
  });

  it('nhóm biến mất khi mọi mục con bị lọc — không để lại nhãn nhóm rỗng', () => {
    // Chỉ VEHICLE_VIEW: nhóm "Quản lý" còn mục "Xe", nhóm "Cài đặt" không còn mục nào.
    grant(PERMISSION.VEHICLE_VIEW);
    renderMenu();

    expect(screen.getByText('Quản lý')).toBeTruthy();
    expect(screen.queryByText('Cài đặt')).toBeNull();
  });

  it('mục placeholder vẫn hiện và vẫn là link thật', () => {
    grant(PERMISSION.TENANT_VIEW);
    renderMenu();

    const trash = screen.getByRole('link', { name: 'Thùng rác' });
    expect(trash.getAttribute('href')).toBe('/manage/trash');
  });
});

describe('useManageNav — hiển thị theo quyền (nền tảng)', () => {
  it('platformRole → cây nền tảng, KHÔNG có mục gian hàng nào', () => {
    user.platformRole = 'platform_admin';
    grant(PERMISSION.PLATFORM_DASHBOARD_VIEW, PERMISSION.PLATFORM_TENANT_MANAGE);
    renderMenu();

    const labels = itemLabels();
    expect(labels).toContain('Gian hàng');
    expect(labels).not.toContain('Lịch thuê xe');
    expect(labels).not.toContain('Công nợ');
  });

  it('platform_staff KHÔNG thấy mục chỉ dành cho super admin', () => {
    user.platformRole = 'platform_staff';
    grant(
      PERMISSION.PLATFORM_DASHBOARD_VIEW,
      PERMISSION.PLATFORM_VEHICLE_VIEW,
      PERMISSION.PLATFORM_BOOKING_VIEW,
      PERMISSION.PLATFORM_CUSTOMER_VIEW,
    );
    renderMenu();

    const labels = itemLabels();
    expect(labels).toEqual([
      'Tổng quan',
      'Xe toàn hệ thống',
      'Đơn thuê toàn hệ thống',
      'Khách thuê',
    ]);
    expect(labels).not.toContain('Nhân sự nền tảng');
    expect(labels).not.toContain('Nhật ký hệ thống');
    expect(labels).not.toContain('Duyệt hồ sơ');
  });

  it('có CẢ tenant lẫn platform → vẫn CHỈ cây nền tảng (hiện trạng, brief 00 B2)', () => {
    // Không có bộ chuyển scope. Ghi lại để Wave 1D không "sửa" thành trộn hai cây.
    user.platformRole = 'platform_admin';
    grant(PERMISSION.TENANT_VIEW, PERMISSION.VEHICLE_VIEW, PERMISSION.PLATFORM_DASHBOARD_VIEW);
    renderMenu();

    expect(itemLabels()).toEqual(['Tổng quan']);
  });
});

describe('useManageNav — mục đang sáng', () => {
  beforeEach(() => {
    grant(
      PERMISSION.TENANT_VIEW,
      PERMISSION.VEHICLE_VIEW,
      PERMISSION.BOOKING_VIEW,
      PERMISSION.BOOKING_REQUEST_VIEW,
      PERMISSION.CALENDAR_VIEW,
      PERMISSION.FINANCE_VIEW,
      PERMISSION.MEMBER_VIEW,
    );
  });

  it('route đúng bằng href → mục đó sáng', () => {
    nav.pathname = '/manage/vehicles';
    const { container } = renderMenu();

    expect(selectedLabel(container)).toBe('Xe');
  });

  it('route con → mục cha sáng', () => {
    nav.pathname = '/manage/vehicles/01H/edit';
    const { container } = renderMenu();

    expect(selectedLabel(container)).toBe('Xe');
  });

  it('tiền tố gần giống KHÔNG chọn nhầm: /manage/booking-requests ≠ Đơn thuê', () => {
    nav.pathname = '/manage/booking-requests';
    const { container } = renderMenu();

    expect(selectedLabel(container)).toBe('Đơn đặt xe');
  });

  it('/manage chỉ sáng Tổng quan khi ở ĐÚNG /manage', () => {
    nav.pathname = '/manage';
    const first = renderMenu();
    expect(selectedLabel(first.container)).toBe('Tổng quan');
    first.unmount();

    nav.pathname = '/manage/receipts';
    const second = renderMenu();
    expect(selectedLabel(second.container)).toBe('Thu chi');
  });

  it('route ngoài cây → KHÔNG mục nào sáng', () => {
    nav.pathname = '/manage/contracts/01H';
    const { container } = renderMenu();

    expect(selectedLabel(container)).toBeNull();
  });
});

describe('ManageMenu — trình bày', () => {
  it('nhãn nhóm hiện dạng chữ, không phải link bấm được', () => {
    grant(PERMISSION.TENANT_VIEW, PERMISSION.VEHICLE_VIEW);
    renderMenu();

    const group = screen.getByText('Quản lý');
    expect(group.closest('a')).toBeNull();
  });

  it('mỗi mục là một link điều hướng thật (không phải nút giả)', () => {
    grant(PERMISSION.VEHICLE_VIEW, PERMISSION.CALENDAR_VIEW);
    renderMenu();

    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute('href')).toMatch(/^\/manage/);
    }
  });

  it('mục đang sáng nói ra bằng aria-current, không chỉ bằng màu', () => {
    // Đảo có chủ ý ở 1D-B (D16.3). Nền tối + icon gold là tín hiệu thị giác; `aria-current`
    // mới là thứ trình đọc màn hình nghe được.
    grant(PERMISSION.VEHICLE_VIEW);
    nav.pathname = '/manage/vehicles';
    const { container } = renderMenu();

    const selected = container.querySelector('.ant-menu-item-selected');
    expect(selected).toBeTruthy();
    expect(
      within(selected as HTMLElement)
        .getByRole('link')
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('CHỈ mục đang mở có aria-current', () => {
    grant(PERMISSION.VEHICLE_VIEW, PERMISSION.CALENDAR_VIEW, PERMISSION.BOOKING_VIEW);
    nav.pathname = '/manage/vehicles';
    renderMenu();

    const current = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current).toHaveLength(1);
    expect(current[0]!.textContent).toBe('Xe');
  });

  it('route con → aria-current nằm ở mục cha', () => {
    grant(PERMISSION.VEHICLE_VIEW);
    nav.pathname = '/manage/vehicles/01H/edit';
    renderMenu();

    expect(screen.getByRole('link', { name: 'Xe' }).getAttribute('aria-current')).toBe('page');
  });

  it('route ngoài cây → không mục nào mang aria-current', () => {
    grant(PERMISSION.VEHICLE_VIEW, PERMISSION.CALENDAR_VIEW);
    nav.pathname = '/manage/contracts/01H';
    renderMenu();

    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('aria-current')).toBeNull();
    }
  });

  it('nhãn dài giữ được bản đầy đủ ở `title` dù bị cắt bằng ellipsis', () => {
    user.platformRole = 'platform_admin';
    grant(PERMISSION.PLATFORM_BOOKING_VIEW);
    renderMenu();

    const long = screen.getByRole('link', { name: 'Đơn thuê toàn hệ thống' });
    expect(long.getAttribute('title')).toBe('Đơn thuê toàn hệ thống');
  });

  it('thu gọn: nhãn vẫn là tên truy cập được của mục', () => {
    // AntD ẩn phần chữ bằng CSS khi `inlineCollapsed`; `aria-label` trên thẻ <a> là thứ giữ
    // cho mục thu gọn không thành nút vô danh.
    grant(PERMISSION.VEHICLE_VIEW);
    render(<CollapsedMenu />);

    expect(screen.getByRole('link', { name: 'Xe' })).toBeTruthy();
  });
});
