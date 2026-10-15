import { QueryClientProvider } from '@tanstack/react-query';
import { App } from 'antd';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@xeprime/api-client';

import { makeQueryClient } from '@/lib/query-client';

import { PartnerRegisterView } from './PartnerRegisterView';

/**
 * Hồi quy: `/manage/register` của người CHƯA đăng nhập từng gọi `GET /auth/me` thành vòng (~400
 * lượt / 30s rồi 429). Spinner dựng lại mỗi lần query 401 được hỏi lại ⇒ tháo cây con (mỗi cây một
 * observer `useCurrentUser`) ⇒ observer mới hỏi lại ⇒ … Dùng `useCurrentUser` + QueryClient THẬT.
 */
const nav = vi.hoisted(() => ({ replace: vi.fn(), search: '' }));
const me = vi.hoisted(() => ({ fetchCurrentUser: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => '/manage/register',
}));
vi.mock('@/services/auth.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchCurrentUser: me.fetchCurrentUser,
}));
vi.mock('@/features/auth/hooks/use-portal-logout', () => ({ usePortalLogout: () => vi.fn() }));
vi.mock('./AuthPanel', () => ({ AuthPanel: () => <div data-testid="auth-panel" /> }));
vi.mock('@/features/locations/hooks/use-provinces', () => ({
  useProvinceOptions: () => ({ options: [], isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/features/locations/hooks/use-wards', () => ({
  useWardOptions: () => ({ options: [], items: [], total: 0, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock('@/features/locations/hooks/use-places', () => ({
  PLACE_SEARCH_MIN_LENGTH: 3,
  usePlaceSearch: () => ({ data: { items: [], available: false }, isFetching: false }),
  usePlaceDetail: () => ({ mutateAsync: vi.fn() }),
}));

function renderView() {
  return render(
    <QueryClientProvider client={makeQueryClient()}>
      <App>
        <PartnerRegisterView />
      </App>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  nav.replace.mockReset();
  me.fetchCurrentUser
    .mockReset()
    .mockRejectedValue(new ApiClientError({ code: 'UNAUTHENTICATED', message: 'Chưa đăng nhập', status: 401 }));
});
afterEach(cleanup);

describe('PartnerRegisterView — /auth/me 401 không thành vòng lặp', () => {
  it.each([
    ['trang chọn tuyến', ''],
    ['form tuyến gói', 'track=package'],
    ['form tuyến hoa hồng', 'track=commission'],
  ])('%s: hỏi /auth/me đúng MỘT lần, không chuyển trang', async (_label, search) => {
    nav.search = search;
    renderView();

    await waitFor(() => expect(screen.queryByRole('link', { name: 'Đăng nhập' })).toBeTruthy());
    // Cho mọi effect/observer kịp chạy — một vòng lặp sẽ đẩy số lượt lên hàng chục ở đây.
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(me.fetchCurrentUser).toHaveBeenCalledTimes(1);
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
