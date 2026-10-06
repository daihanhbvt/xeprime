import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { makeStore } from '@/store/make-store';

import { AdminShell } from './AdminShell';

/**
 * Khung của SITE QUẢN TRỊ (ADR 0051 · ADR 0053). Bốn điều được khoá:
 *  - trang đăng nhập/đặt lại mật khẩu render trần, không đòi phiên (chống loop với phiên hỏng);
 *  - phiên hỏng → dọn cookie và về trang đăng nhập CỦA site quản trị, giữ `next`;
 *  - tài khoản realm `platform` đã bị gỡ vai → màn 403 kèm đăng xuất, KHÔNG đẩy sang site khác;
 *  - nhân sự có vai → khung đầy đủ.
 */
const nav = vi.hoisted(() => ({ replace: vi.fn(), pathname: '/admin' }));
const state = vi.hoisted(() => ({
  user: null as unknown,
  isLoading: false,
  isError: false,
}));
const logout = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => nav.pathname,
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: state.user, isLoading: state.isLoading, isError: state.isError }),
}));

vi.mock('@/features/auth/hooks/use-portal-logout', () => ({ usePortalLogout: () => logout }));
vi.mock('@/services/auth.service', () => ({ destroySession: vi.fn(async () => undefined) }));
vi.mock('./ShellFrame', () => ({
  ShellFrame: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="frame">{children}</div>
  ),
}));

const STAFF = { id: 'P1', displayName: 'Nhân sự', tenant: null, platformRole: 'platform_admin' };
const REMOVED = { id: 'P2', displayName: 'Đã nghỉ', tenant: null, platformRole: null };

function renderShell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <Provider store={makeStore()}>
      <QueryClientProvider client={queryClient}>
        <AdminShell>
          <div data-testid="page">Nội dung</div>
        </AdminShell>
      </QueryClientProvider>
    </Provider>,
  );
}

beforeEach(() => {
  nav.replace.mockReset();
  nav.pathname = '/admin';
  state.user = null;
  state.isLoading = false;
  state.isError = false;
  logout.mockReset();
});

afterEach(cleanup);

describe('AdminShell', () => {
  it.each(['/admin/login', '/admin/forgot-password', '/admin/reset-password'])(
    '%s render trần, không đòi phiên',
    (pathname) => {
      nav.pathname = pathname;
      renderShell();

      expect(screen.getByTestId('page')).toBeTruthy();
      expect(screen.queryByTestId('frame')).toBeNull();
      expect(nav.replace).not.toHaveBeenCalled();
    },
  );

  it('phiên hỏng → về trang đăng nhập của site quản trị, giữ next', async () => {
    state.isError = true;
    nav.pathname = '/admin/tenants';
    renderShell();

    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith('/admin/login?next=%2Fadmin%2Ftenants'),
    );
    expect(screen.queryByTestId('page')).toBeNull();
  });

  it('tài khoản platform đã bị gỡ vai → 403 kèm đăng xuất, không chuyển đi đâu', () => {
    state.user = REMOVED;
    renderShell();

    expect(screen.getByText('Không có quyền truy cập')).toBeTruthy();
    expect(screen.queryByTestId('page')).toBeNull();
    expect(nav.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('nhân sự có vai → khung đầy đủ', () => {
    state.user = STAFF;
    renderShell();

    expect(screen.getByTestId('frame')).toBeTruthy();
    expect(screen.getByTestId('page')).toBeTruthy();
  });
});
