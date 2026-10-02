import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CurrentUser } from '@/hooks/use-current-user';
import { makeStore, type AppStore } from '@/store/make-store';

import { Topbar } from './Topbar';

/**
 * Thanh trên của cổng quản lý.
 *
 * Hai điều bộ này bảo vệ:
 *  1. **không có điều khiển chết** — ô "Tất cả chi nhánh" chỉ được dựng khi nó THẬT SỰ chọn
 *     được (≥2 chi nhánh + có quyền `branches.view`); gian hàng một chi nhánh thì đó là ngữ
 *     cảnh, không phải dropdown một mục như bản trước 1D-B;
 *  2. **không có nút icon vô danh** — mọi nút chỉ có icon phải có `aria-label`.
 */

const push = vi.hoisted(() => vi.fn());
const logout = vi.hoisted(() => vi.fn(async () => undefined));
const nav = vi.hoisted(() => ({ pathname: '/manage/vehicles' }));

vi.mock('next/navigation', () => ({
  // Link menu mang chi nhánh theo URL (ADR 0052) — test không lọc gì nên URL sạch tham số.
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => nav.pathname,
}));

vi.mock('@/features/auth/hooks/use-portal-logout', () => ({
  usePortalLogout: () => logout,
}));

// Biểu tượng tin nhắn có test riêng (ChatMenu.test.tsx) — ở đây nó chỉ cần là một nút có tên.
vi.mock('@/features/chat/components/ChatMenu', () => ({
  ChatMenu: () => <button type="button" aria-label="Tin nhắn" />,
}));

vi.mock('@/i18n/actions', () => ({ setLocale: vi.fn().mockResolvedValue({ ok: true }) }));

vi.mock('@/features/notifications/components/NotificationBell', () => ({
  NotificationBell: () => <button type="button" aria-label="Thông báo" />,
}));

const perms = vi.hoisted(() => ({ granted: new Set<string>(['tenant.view', 'vehicles.view']) }));

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    has: (p: string) => perms.granted.has(p),
    hasAny: (...ps: string[]) => ps.some((p) => perms.granted.has(p)),
    isLoading: false,
  }),
}));

const currentUser = vi.hoisted(() => ({ value: null as unknown }));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: currentUser.value, isLoading: false }),
}));

const OWNER = {
  displayName: 'Nguyễn Văn A',
  email: 'a@congty.vn',
  avatarUrl: null,
  platformRole: null,
  tenant: {
    id: 'T1',
    name: 'Thuê Xe Minh Anh',
    slug: 's',
    status: 'active',
    roleKey: 'shop_owner',
  },
} as unknown as CurrentUser;

const ADMIN = {
  displayName: 'Quản trị viên',
  email: 'admin@xeprime.test',
  avatarUrl: null,
  platformRole: 'platform_admin',
  tenant: null,
} as unknown as CurrentUser;

let store: AppStore;

function renderTopbar(user: CurrentUser = OWNER) {
  currentUser.value = user;
  store = makeStore();
  return render(
    <Provider store={store}>
      <Topbar user={user} />
    </Provider>,
  );
}

beforeEach(() => {
  push.mockReset();
  logout.mockReset();
  nav.pathname = '/manage/vehicles';
  perms.granted = new Set<string>(['tenant.view', 'vehicles.view']);
});

afterEach(cleanup);

describe('Topbar — dựng', () => {
  it('là landmark banner', () => {
    renderTopbar();

    expect(screen.getByRole('banner')).toBeTruthy();
  });

  it('hiện ngữ cảnh gian hàng bằng dữ liệu THẬT, không phải chỗ giữ chỗ', () => {
    renderTopbar();

    expect(screen.getByText('Thuê Xe Minh Anh')).toBeTruthy();
  });

  /**
   * ADR 0052: bộ chọn chi nhánh KHÔNG còn ở thanh trên.
   *
   * Nó từng hiện trên mọi trang nên đọc như một bộ lọc toàn hệ thống, trong khi chỉ sáu màn vận
   * hành tuân theo — ví điểm, sổ thu chi, khách hàng và hội thoại thì không có gì để lọc. Test
   * này khoá lại điều đó: một lần "tiện tay" đưa ô chọn trở lên đây là tái lập đúng cái hiểu lầm
   * cũ, và nó sẽ lại không có cách nào sống sót qua một lần F5.
   */
  it('KHÔNG dựng bộ chọn chi nhánh — nó thuộc thanh lọc của từng màn (ADR 0052)', () => {
    renderTopbar();

    expect(screen.queryByLabelText('Chi nhánh đang xem')).toBeNull();
    expect(screen.queryByLabelText('Chi nhánh')).toBeNull();
    expect(screen.queryByText('Tất cả chi nhánh')).toBeNull();
  });

  it('nhân sự nền tảng không thuộc gian hàng nào → không dựng khối gian hàng rỗng', () => {
    renderTopbar(ADMIN);

    expect(screen.queryByText('Thuê Xe Minh Anh')).toBeNull();
  });

  it('KHÔNG dựng ô tìm kiếm — chưa có API tìm kiếm nào đứng sau', () => {
    renderTopbar();

    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByPlaceholderText(/Tìm kiếm/)).toBeNull();
  });

  it('KHÔNG dựng nút thu gọn thứ hai — nút đó thuộc sidebar (Figma `47:12`)', () => {
    renderTopbar();

    expect(screen.queryByRole('button', { name: /Thu gọn menu|Mở rộng menu/ })).toBeNull();
  });
});

describe('Topbar — ngữ cảnh trang', () => {
  it('breadcrumb hiện trang đang mở, lấy nhãn từ chính cây menu', () => {
    renderTopbar();

    const banner = screen.getByRole('banner');
    expect(within(banner).getByText('Trang chủ')).toBeTruthy();
    expect(within(banner).getByText('Danh sách xe')).toBeTruthy();
  });

  it('route con vẫn ra ngữ cảnh cha', () => {
    nav.pathname = '/manage/vehicles/01H/edit';
    renderTopbar();

    expect(within(screen.getByRole('banner')).getByText('Danh sách xe')).toBeTruthy();
  });

  it('route ngoài cây menu chỉ hiện cấp một, KHÔNG bịa tiêu đề', () => {
    nav.pathname = '/manage/contracts/01H';
    renderTopbar();

    const banner = screen.getByRole('banner');
    expect(within(banner).getByText('Trang chủ')).toBeTruthy();
    expect(within(banner).queryByText('Xe')).toBeNull();
  });
});

describe('Topbar — mọi nút icon đều có tên', () => {
  it('không còn nút nào không có tên truy cập được', () => {
    renderTopbar();

    for (const button of screen.getAllByRole('button')) {
      expect(button.getAttribute('aria-label') || button.textContent).toBeTruthy();
    }
  });

  it('nút chat, chuông, hamburger và avatar đều gọi tên được', () => {
    renderTopbar();

    expect(screen.getByRole('button', { name: 'Tin nhắn' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thông báo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mở menu' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tài khoản' })).toBeTruthy();
  });
});

describe('Topbar — hành động người dùng', () => {
  it('hamburger mở drawer mobile', () => {
    renderTopbar();

    fireEvent.click(screen.getByRole('button', { name: 'Mở menu' }));

    expect(store.getState().app.mobileNavOpen).toBe(true);
  });

  it('đăng xuất đi qua luồng DÙNG CHUNG, không phải bản sao riêng của topbar', async () => {
    renderTopbar();

    fireEvent.click(screen.getByRole('button', { name: 'Tài khoản' }));
    fireEvent.click(await screen.findByText('Đăng xuất'));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });
});
