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
const chat = vi.hoisted(() => ({ data: undefined as { count: number } | undefined }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => nav.pathname,
}));

vi.mock('@/features/auth/hooks/use-portal-logout', () => ({
  usePortalLogout: () => logout,
}));

vi.mock('@/features/chat/hooks/use-chat-unread-count', () => ({
  useChatUnreadCount: () => chat,
}));

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

/**
 * Chi nhánh: mock ở tầng HOOK SCOPE (không mock `useBranches`) để test nói đúng thứ nó quan tâm —
 * "thanh trên hiện gì với N chi nhánh", chứ không phải cách hook gọi API.
 */
const branchScope = vi.hoisted(() => ({
  value: {
    branchId: null as string | null,
    branch: null as unknown,
    options: [] as { id: string; name: string; provinceName: string | null; isDefault: boolean }[],
    canSelect: false,
    isLoading: false,
    select: vi.fn(),
  },
}));

vi.mock('@/features/branches/hooks/use-branch-scope', () => ({
  useBranchScope: () => branchScope.value,
  useBranchScopeParams: () => ({}),
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
  chat.data = undefined;
  perms.granted = new Set<string>(['tenant.view', 'vehicles.view']);
  branchScope.value = {
    branchId: null,
    branch: null,
    options: [],
    canSelect: false,
    isLoading: false,
    select: vi.fn(),
  };
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
    // Không có chi nhánh nào chọn được → KHÔNG dựng dropdown (điều khiển chết đã gỡ ở 1D-B).
    expect(screen.queryByText('Tất cả chi nhánh')).toBeNull();
  });

  it('gian hàng MỘT chi nhánh: hiện ngữ cảnh, không dựng dropdown một mục', () => {
    branchScope.value = {
      ...branchScope.value,
      options: [{ id: 'B1', name: 'Chi nhánh Đà Nẵng', provinceName: 'Đà Nẵng', isDefault: true }],
      canSelect: false,
    };
    renderTopbar();

    expect(screen.getByText('Chi nhánh Đà Nẵng · Đà Nẵng')).toBeTruthy();
    expect(screen.queryByLabelText('Chi nhánh đang xem')).toBeNull();
  });

  it('gian hàng NHIỀU chi nhánh: bộ chọn là điều khiển thật, đổi được scope', () => {
    const select = vi.fn();
    branchScope.value = {
      ...branchScope.value,
      options: [
        { id: 'B1', name: 'Chi nhánh HCM', provinceName: 'Hồ Chí Minh', isDefault: true },
        { id: 'B2', name: 'Chi nhánh Đà Nẵng', provinceName: 'Đà Nẵng', isDefault: false },
      ],
      canSelect: true,
      select,
    };
    renderTopbar();

    // Đang ở "Tất cả chi nhánh" và ô chọn có tên truy cập được.
    expect(screen.getByLabelText('Chi nhánh đang xem')).toBeTruthy();
    expect(screen.getByTitle('Tất cả chi nhánh')).toBeTruthy();
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

    expect(screen.getByRole('button', { name: 'Trò chuyện' })).toBeTruthy();
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

  it('nút chat điều hướng sang trang trò chuyện của cổng quản lý', () => {
    renderTopbar();

    fireEvent.click(screen.getByRole('button', { name: 'Trò chuyện' }));

    expect(push).toHaveBeenCalledWith('/manage/chat');
  });

  it('huy hiệu chat hiện số tin chưa đọc', () => {
    chat.data = { count: 7 };
    renderTopbar();

    expect(screen.getByText('7')).toBeTruthy();
  });

  it('đăng xuất đi qua luồng DÙNG CHUNG, không phải bản sao riêng của topbar', async () => {
    renderTopbar();

    fireEvent.click(screen.getByRole('button', { name: 'Tài khoản' }));
    fireEvent.click(await screen.findByText('Đăng xuất'));

    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });
});
