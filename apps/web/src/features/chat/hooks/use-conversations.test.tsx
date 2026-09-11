import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_SIDE } from '@xeprime/types';
import type { ReactNode } from 'react';

/**
 * Danh sách hộp thư phải nhảy dòng khi có tin mới — kể cả tin đến ở hội thoại KHÁC.
 *
 * Đây là lỗi thật đã gặp: listener realtime của thread chỉ nghe ĐÚNG hội thoại đang mở, nên một
 * tin đến ở hội thoại khác chỉ làm đổi con số trên biểu tượng chat, còn dòng trong danh sách bên
 * trái đứng im cho tới nhịp poll kế tiếp. Bản chiếu huy hiệu là tín hiệu đúng cho một danh sách
 * vì nó bao trùm MỌI hội thoại của người này.
 */
const chat = vi.hoisted(() => ({ list: vi.fn() }));
const badges = vi.hoisted(() => ({
  counts: { chatCustomer: 0, chatShop: 0, notificationsUnread: 0 },
  live: false,
}));

vi.mock('../api', () => ({ chatApi: chat }));
vi.mock('@/features/badges/BadgeRealtimeProvider', () => ({ useBadgeRealtime: () => badges }));

import { useConversationsInfinite } from './use-conversations';

function Probe() {
  useConversationsInfinite(CHAT_SIDE.CUSTOMER);
  return null;
}

/**
 * MỘT QueryClient cho cả lượt test.
 *
 * Tạo client mới trong mỗi lần `rerender` sẽ thay cả provider — React gỡ toàn bộ cây và dựng lại
 * với cache rỗng, nên "tải lại vì huy hiệu đổi" và "tải lại vì vừa mount" trở thành một, và bài
 * test không còn kiểm được điều nó định kiểm.
 */
let queryClient: QueryClient;

function wrapper(children: ReactNode) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  chat.list.mockReset().mockResolvedValue({
    items: [],
    meta: { page: 1, limit: 20, total: 0, hasNext: false },
  });
  badges.counts = { chatCustomer: 0, chatShop: 0, notificationsUnread: 0 };
  badges.live = false;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useConversationsInfinite', () => {
  it('số chưa đọc đổi → tải lại danh sách ngay, không đợi nhịp poll', async () => {
    const view = render(wrapper(<Probe />));
    await waitFor(() => expect(chat.list).toHaveBeenCalledTimes(1));

    // Một tin đến ở hội thoại nào đó — bản chiếu huy hiệu đổi con số.
    badges.counts = { ...badges.counts, chatCustomer: 1 };
    view.rerender(wrapper(<Probe />));

    await waitFor(() => expect(chat.list.mock.calls.length).toBeGreaterThan(1));
  });

  it('lượt render đầu KHÔNG tự sinh thêm một request', async () => {
    render(wrapper(<Probe />));
    await waitFor(() => expect(chat.list).toHaveBeenCalledTimes(1));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(chat.list).toHaveBeenCalledTimes(1);
  });

  it('số chưa đọc KHÔNG đổi thì không tải lại', async () => {
    const view = render(wrapper(<Probe />));
    await waitFor(() => expect(chat.list).toHaveBeenCalledTimes(1));

    // Đổi con số của bề mặt KHÁC — không liên quan tới danh sách này.
    badges.counts = { ...badges.counts, chatShop: 5, notificationsUnread: 3 };
    view.rerender(wrapper(<Probe />));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(chat.list).toHaveBeenCalledTimes(1);
  });

  it('không nghe được realtime thì poll dày; nghe được thì thưa hẳn', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    const offline = render(wrapper(<Probe />));
    await vi.waitFor(() => expect(chat.list).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(12_000);
    expect(chat.list.mock.calls.length).toBeGreaterThan(1);
    offline.unmount();

    chat.list.mockClear();
    badges.live = true;

    render(wrapper(<Probe />));
    await vi.waitFor(() => expect(chat.list).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(12_000);
    expect(chat.list).toHaveBeenCalledTimes(1);
  });
});
