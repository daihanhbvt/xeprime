import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { PERMISSION, type Permission } from '@xeprime/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeStore, type AppStore } from '@/store/make-store';

import { Sidebar } from './Sidebar';

/**
 * Sidebar desktop — nền TỐI (P1) với hai trạng thái: mở rộng 232px và thu gọn 64px.
 *
 * Điều bộ này bảo vệ: thu gọn KHÔNG được làm mất thông tin. Menu vẫn lọc theo quyền, mục đang
 * mở vẫn nhận ra được, và mọi mục vẫn còn tên truy cập được — nếu không thì "thu gọn" chỉ là
 * cách làm cho điều hướng không dùng được bằng bàn phím hay trình đọc màn hình.
 */

const nav = vi.hoisted(() => ({ pathname: '/manage' }));
const user = vi.hoisted(() => ({
  displayName: 'Nguyễn Văn A',
  email: 'a@congty.vn',
  avatarUrl: null as string | null,
  platformRole: null as string | null,
  tenant: { name: 'Thuê Xe Minh Anh', roleKey: 'shop_owner' } as {
    name: string;
    roleKey: string;
  } | null,
}));
const perms = vi.hoisted(() => ({ granted: new Set<string>() }));

vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
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

vi.mock('@/features/auth/hooks/use-portal-logout', () => ({
  usePortalLogout: () => vi.fn(async () => undefined),
}));

let store: AppStore;

function grant(...permissions: Permission[]) {
  perms.granted = new Set<string>(permissions);
}

function renderSidebar() {
  store = makeStore();
  return render(
    <Provider store={store}>
      <Sidebar />
    </Provider>,
  );
}

function toggle(): HTMLElement {
  return screen.getByRole('button', { name: /menu$/ });
}

function menuRegion(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Điều hướng cổng quản lý' });
}

const HERE = dirname(fileURLToPath(import.meta.url));

beforeEach(() => {
  nav.pathname = '/manage';
  user.platformRole = null;
  user.displayName = 'Nguyễn Văn A';
  user.tenant = { name: 'Thuê Xe Minh Anh', roleKey: 'shop_owner' };
  grant(PERMISSION.TENANT_VIEW, PERMISSION.VEHICLE_VIEW, PERMISSION.CALENDAR_VIEW);
});

afterEach(cleanup);

describe('Sidebar — trạng thái mở rộng', () => {
  it('dựng vùng điều hướng CÓ TÊN', () => {
    renderSidebar();

    expect(menuRegion()).toBeTruthy();
  });

  it('hiện tên gian hàng làm dòng phụ dưới logo', () => {
    renderSidebar();

    expect(screen.getByText('Thuê Xe Minh Anh')).toBeTruthy();
  });

  it('nhân sự nền tảng không có gian hàng → không dựng dòng phụ rỗng', () => {
    user.platformRole = 'platform_admin';
    user.tenant = null;
    grant(PERMISSION.PLATFORM_DASHBOARD_VIEW);
    renderSidebar();

    expect(screen.queryByText('Thuê Xe Minh Anh')).toBeNull();
  });

  it('mục menu là link có nhãn đọc được', () => {
    renderSidebar();

    expect(within(menuRegion()).getByRole('link', { name: 'Xe' })).toBeTruthy();
  });
});

describe('Sidebar — nút thu gọn', () => {
  it('có tên truy cập được và nói ra trạng thái bằng aria-expanded', () => {
    renderSidebar();

    const button = toggle();
    expect(button.getAttribute('aria-label')).toBe('Thu gọn menu');
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('trỏ vào đúng vùng nó điều khiển', () => {
    renderSidebar();

    expect(toggle().getAttribute('aria-controls')).toBe(menuRegion().id);
  });

  it('bấm thì đổi state và đổi cả nhãn lẫn aria-expanded', () => {
    renderSidebar();

    fireEvent.click(toggle());

    expect(store.getState().app.sidebarCollapsed).toBe(true);
    expect(toggle().getAttribute('aria-label')).toBe('Mở rộng menu');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('bấm hai lần quay lại trạng thái đầu', () => {
    renderSidebar();

    fireEvent.click(toggle());
    fireEvent.click(toggle());

    expect(store.getState().app.sidebarCollapsed).toBe(false);
  });
});

describe('Sidebar — trạng thái thu gọn', () => {
  function renderCollapsed() {
    const result = renderSidebar();
    fireEvent.click(toggle());
    return result;
  }

  it('mọi mục menu GIỮ tên truy cập được', () => {
    renderCollapsed();

    expect(within(menuRegion()).getByRole('link', { name: 'Xe' })).toBeTruthy();
    expect(within(menuRegion()).getByRole('link', { name: 'Lịch thuê xe' })).toBeTruthy();
  });

  it('mục đang mở vẫn nhận ra được bằng aria-current', () => {
    nav.pathname = '/manage/vehicles';
    renderCollapsed();

    expect(
      within(menuRegion()).getByRole('link', { name: 'Xe' }).getAttribute('aria-current'),
    ).toBe('page');
  });

  it('vẫn lọc theo quyền — thu gọn không lộ thêm mục nào', () => {
    grant(PERMISSION.VEHICLE_VIEW);
    renderCollapsed();

    expect(within(menuRegion()).getByRole('link', { name: 'Xe' })).toBeTruthy();
    expect(within(menuRegion()).queryByRole('link', { name: 'Cửa hàng' })).toBeNull();
  });

  it('tên gian hàng bị ẩn (không đủ chỗ), KHÔNG để lại chữ bị cắt dở', () => {
    renderCollapsed();

    expect(screen.queryByText('Thuê Xe Minh Anh')).toBeNull();
  });

  it('cùng số mục như lúc mở rộng — không có cây menu thứ hai', () => {
    const expanded = renderSidebar();
    const before = within(menuRegion()).getAllByRole('link').length;
    expanded.unmount();

    renderCollapsed();

    expect(within(menuRegion()).getAllByRole('link')).toHaveLength(before);
  });

  it('vẫn còn lối đăng xuất', () => {
    renderCollapsed();

    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeTruthy();
  });
});

describe('Sidebar — hợp đồng token nền tối', () => {
  /** Bỏ comment trước khi khẳng định: docblock ở đây CỐ Ý nêu tên thứ bị loại trừ. */
  const code = (file: string) =>
    readFileSync(join(HERE, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  const css = code('Sidebar.module.css');
  const menuCss = code('ManageMenu.module.css');

  it('nền và chữ lấy từ token sidebar, không phải token nền sáng', () => {
    expect(css).toContain('background: var(--xp-shell-sidebar-bg)');
    expect(css).not.toContain('var(--xp-color-bg-container)');
  });

  it('bề rộng hai trạng thái đều là token', () => {
    expect(css).toContain('var(--xp-shell-sidebar-width)');
    expect(css).toContain('var(--xp-shell-sidebar-collapsed-width)');
  });

  it('KHÔNG dùng lại hai token trượt AA trên nền tối', () => {
    // `--xp-color-text-secondary` = 2.99 và `--xp-gold-deep` = 4.33 trên `#1e1b16`.
    // Chúng vẫn hợp lệ ở khối `.wrap` (nền sáng, Drawer mobile) nhưng không được vào `.dark`.
    const darkBlock = menuCss.slice(menuCss.indexOf('.dark '));
    expect(darkBlock).not.toContain('--xp-color-text-secondary');
    expect(darkBlock).not.toContain('--xp-gold-deep');
  });

  it('có trạng thái focus-visible riêng cho nền tối', () => {
    expect(menuCss).toContain(':focus-visible');
    expect(css).toContain(':focus-visible');
  });

  it('gold chỉ dùng cho mục đang mở và nhấn thương hiệu, không cho trạng thái nghiệp vụ', () => {
    for (const semantic of ['--xp-color-warning', '--xp-color-success', '--xp-color-error']) {
      expect(css).not.toContain(semantic);
      expect(menuCss).not.toContain(semantic);
    }
  });
});
