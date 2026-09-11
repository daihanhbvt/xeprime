import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

/**
 * Huy hiệu "Đơn thuê" phải nhảy cùng lúc với chuông, không đợi hết nhịp một phút.
 *
 * Con số này CỐ Ý không nằm trong bản chiếu huy hiệu: nó bị thu hẹp theo chi nhánh đang chọn, một
 * trạng thái chỉ tồn tại ở client (ADR 0034 điều 2), nên một con số toàn tài khoản sẽ nói khác
 * danh sách mà người dùng mở ra. Bản chiếu vì vậy chỉ làm TÍN HIỆU — còn con số vẫn đến từ query
 * đúng scope. Bài test này khoá đúng ranh giới đó.
 */
const requestsApi = vi.hoisted(() => ({
  fetchBookingRequests: vi.fn(),
  filtersToParams: (f: unknown) => f as Record<string, unknown>,
}));
const badges = vi.hoisted(() => ({
  counts: { chatCustomer: 0, chatShop: 0, notificationsUnread: 0 },
  live: false,
}));

vi.mock('../api', () => requestsApi);
vi.mock('@/features/badges/BadgeRealtimeProvider', () => ({ useBadgeRealtime: () => badges }));
vi.mock('@/features/branches/hooks/use-branch-scope', () => ({
  useBranchScopeParams: () => ({}),
}));

import { usePendingBookingRequestCount } from './use-pending-booking-request-count';

function Probe() {
  usePendingBookingRequestCount(true);
  return null;
}

let queryClient: QueryClient;

function wrapper(children: ReactNode) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  requestsApi.fetchBookingRequests
    .mockReset()
    .mockResolvedValue({ items: [], meta: { page: 1, limit: 1, total: 3, hasNext: false } });
  badges.counts = { chatCustomer: 0, chatShop: 0, notificationsUnread: 0 };
  badges.live = false;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
});

afterEach(cleanup);

describe('usePendingBookingRequestCount', () => {
  it('có thông báo mới → tải lại con số ngay, không đợi nhịp poll', async () => {
    const view = render(wrapper(<Probe />));
    await waitFor(() => expect(requestsApi.fetchBookingRequests).toHaveBeenCalledTimes(1));

    // Yêu cầu thuê mới luôn kèm một thông báo cho thành viên gian hàng.
    badges.counts = { ...badges.counts, notificationsUnread: 1 };
    view.rerender(wrapper(<Probe />));

    await waitFor(() =>
      expect(requestsApi.fetchBookingRequests.mock.calls.length).toBeGreaterThan(1),
    );
  });

  it('chỉ có tin nhắn chat tới thì KHÔNG tải lại — đó là việc của hộp thư', async () => {
    const view = render(wrapper(<Probe />));
    await waitFor(() => expect(requestsApi.fetchBookingRequests).toHaveBeenCalledTimes(1));

    badges.counts = { ...badges.counts, chatCustomer: 4, chatShop: 7 };
    view.rerender(wrapper(<Probe />));

    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(requestsApi.fetchBookingRequests).toHaveBeenCalledTimes(1);
  });
});
