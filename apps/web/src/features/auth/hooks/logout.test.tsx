import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { queryKeys } from '@/services/query-keys';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useMarketLogout } from './use-market-logout';
import { usePortalLogout } from './use-portal-logout';

/**
 * Đăng xuất phải ĐỔI GIAO DIỆN NGAY, không đợi F5.
 *
 * Lỗi thật (28/08/2026): bấm "Đăng xuất" lần đầu thì phiên phía server đã bị xoá, nhưng header
 * vẫn hiện avatar người vừa thoát cho tới khi tải lại trang. Nguyên nhân nằm ở
 * `queryClient.clear()`: nó vứt cache nhưng KHÔNG báo cho observer đang mount (TanStack Query
 * v5 — `QueryObserver` không nghe sự kiện `removed` của cache), nên component vẫn cầm kết quả
 * cũ trong `currentResult` cho tới lần render kế tiếp. Mà `router.replace()` về đúng trang đang
 * đứng thì không tạo ra lần render nào.
 *
 * Test dựng đúng tình huống đó: một observer `useCurrentUser` ĐANG mount, rồi bấm đăng xuất.
 */
const nav = vi.hoisted(() => ({ replace: vi.fn() }));
const api = vi.hoisted(() => ({ me: vi.fn(), destroySession: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
}));

vi.mock('@/services/auth.service', () => ({
  destroySession: () => api.destroySession(),
  fetchCurrentUser: () => api.me(),
}));

const USER = { id: 'U1', displayName: 'Khách A' };

/** Ô hiển thị "tôi là ai" — đứng thay cho header thật, cùng một observer `useCurrentUser`. */
function Probe({ onLogout }: { onLogout: () => Promise<void> }) {
  const { data: user } = useCurrentUser();
  return (
    <>
      <span data-testid="who">{user ? user.displayName : 'chưa đăng nhập'}</span>
      <button type="button" onClick={() => void onLogout()}>
        Đăng xuất
      </button>
    </>
  );
}

function MarketProbe() {
  return <Probe onLogout={useMarketLogout()} />;
}

function PortalProbe() {
  return <Probe onLogout={usePortalLogout()} />;
}

function renderLoggedIn(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // Đúng trạng thái sau khi đăng nhập: cache đã có `/auth/me`, observer đang mount.
  queryClient.setQueryData(queryKeys.auth.me(), USER);
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  nav.replace.mockReset();
  api.destroySession.mockReset().mockResolvedValue(undefined);
  // Sau khi cookie bị xoá, `/auth/me` trả 401 — đó là trạng thái hợp lệ, không phải lỗi hạ tầng.
  api.me.mockReset().mockRejectedValue(new Error('401'));
});

afterEach(cleanup);

describe('Đăng xuất khu khách', () => {
  it('đổi sang trạng thái chưa đăng nhập NGAY, không cần tải lại trang', async () => {
    renderLoggedIn(<MarketProbe />);
    expect(screen.getByTestId('who').textContent).toBe('Khách A');

    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));

    await waitFor(() => expect(screen.getByTestId('who').textContent).toBe('chưa đăng nhập'));
    expect(api.destroySession).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith('/');
  });
});

describe('Đăng xuất cổng quản lý', () => {
  it('đổi sang trạng thái chưa đăng nhập NGAY và về trang đăng nhập portal', async () => {
    renderLoggedIn(<PortalProbe />);
    expect(screen.getByTestId('who').textContent).toBe('Khách A');

    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));

    await waitFor(() => expect(screen.getByTestId('who').textContent).toBe('chưa đăng nhập'));
    expect(nav.replace).toHaveBeenCalledWith('/manage/login');
  });

  /**
   * `DELETE /auth/session` hỏng (mất mạng, cookie đã hết hạn) KHÔNG được biến nút Đăng xuất
   * thành nút chết: người dùng bấm, không có gì xảy ra, và họ vẫn đang ở trong phiên cũ.
   */
  it('API xoá phiên hỏng thì vẫn dọn cache và vẫn đưa người dùng ra ngoài', async () => {
    api.destroySession.mockRejectedValue(new Error('network'));
    renderLoggedIn(<PortalProbe />);

    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));

    await waitFor(() => expect(screen.getByTestId('who').textContent).toBe('chưa đăng nhập'));
    expect(nav.replace).toHaveBeenCalledWith('/manage/login');
  });
});
