import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

/**
 * Chuông báo có việc mới, mở ra không thấy gì — lỗi đã gặp ở staging.
 *
 * Gốc của nó: CON SỐ trên chuông đến từ bản chiếu realtime (cập nhật tức thì), còn DANH SÁCH là
 * một query riêng với `staleTime` 30 giây mặc định của toàn app. Mở lại popover trong vòng 30
 * giây thì TanStack phục vụ bản cache cũ, và hai thứ nói hai điều khác nhau.
 *
 * Chỉ lộ rõ ở staging vì đó là nơi realtime chạy thật: ở môi trường không có bản chiếu, cả hai
 * cùng chậm nên độ lệch không nhìn thấy.
 */
const notificationsApi = vi.hoisted(() => ({
  fetchNotifications: vi.fn(),
  filtersToParams: (f: unknown) => f as Record<string, unknown>,
  NOTIFICATIONS_DEFAULT_LIMIT: 15,
}));
const badges = vi.hoisted(() => ({
  counts: { chatCustomer: 0, chatShop: 0, notificationsUnread: 0 },
  live: false,
}));

vi.mock('../api', () => notificationsApi);
vi.mock('@/features/badges/BadgeRealtimeProvider', () => ({ useBadgeRealtime: () => badges }));

import { useNotifications } from './use-notifications';

function Probe({ open }: { open: boolean }) {
  useNotifications({ limit: 15 }, open);
  return null;
}

let queryClient: QueryClient;

function wrapper(children: ReactNode) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  notificationsApi.fetchNotifications.mockReset().mockResolvedValue({
    items: [],
    meta: { page: 1, limit: 15, total: 0, hasNext: false },
  });
  badges.counts = { chatCustomer: 0, chatShop: 0, notificationsUnread: 0 };
  // `staleTime` 30s giống hệt cấu hình toàn app — đây chính là thứ bài test phải thắng được.
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 30_000 } },
  });
});

afterEach(cleanup);

describe('useNotifications', () => {
  it('con số chuông đổi → danh sách được làm mới, không đợi hết staleTime', async () => {
    const view = render(wrapper(<Probe open />));
    await waitFor(() => expect(notificationsApi.fetchNotifications).toHaveBeenCalledTimes(1));

    badges.counts = { ...badges.counts, notificationsUnread: 1 };
    view.rerender(wrapper(<Probe open />));

    await waitFor(() =>
      expect(notificationsApi.fetchNotifications.mock.calls.length).toBeGreaterThan(1),
    );
  });

  it('mở lại chuông là tải lại — không phục vụ bản cache trong 30 giây', async () => {
    const view = render(wrapper(<Probe open />));
    await waitFor(() => expect(notificationsApi.fetchNotifications).toHaveBeenCalledTimes(1));

    view.rerender(wrapper(<Probe open={false} />));
    view.rerender(wrapper(<Probe open />));

    await waitFor(() => expect(notificationsApi.fetchNotifications).toHaveBeenCalledTimes(2));
  });

  it('chưa mở chuông thì không gọi API', async () => {
    render(wrapper(<Probe open={false} />));
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(notificationsApi.fetchNotifications).not.toHaveBeenCalled();
  });
});
