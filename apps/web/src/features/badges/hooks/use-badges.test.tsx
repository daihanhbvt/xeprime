import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_SIDE } from '@xeprime/types';
import type { ReactNode } from 'react';

/**
 * Huy hiệu: MỘT nguồn cho mọi con số ở khung ứng dụng, và một luật rõ ràng khi hai nguồn nói
 * khác nhau.
 *
 * Bốn điều được khoá ở đây, và cả bốn là lý do tồn tại của thay đổi này:
 *
 *  1. **Một request, dù có bao nhiêu nơi đọc.** Bản trước chuông, biểu tượng chat và menu mỗi
 *     thứ một query riêng — ba request song song ở mọi trang, mỗi vài giây, cho ba con số của
 *     cùng một người. Đây cũng là lý do query sống ở PROVIDER chứ không ở hook: TanStack gắn
 *     đồng hồ `refetchInterval` cho từng observer, nên ba `useQuery` cùng khoá vẫn là ba đồng hồ.
 *  2. **`asOf` quyết định ai thắng, không phải thứ tự đến.** Cả hai chiều đua đều có hậu quả kéo
 *     dài tới hai phút (nhịp lưới an toàn).
 *  3. **Nhịp thưa chỉ khi listener THẬT SỰ sống** — không phải khi Firebase đăng nhập xong.
 *  4. **Snapshot từ cache cục bộ không chứng minh gì cả.**
 *
 * Test dựng PROVIDER THẬT (chỉ giả lập Firestore và phiên Firebase) thay vì mock provider: cả ba
 * bất biến trên đều nằm ở đường dây giữa listener, cache và query — mock provider đi là mock mất
 * đúng thứ cần kiểm.
 */
const badgesApi = vi.hoisted(() => ({ fetchBadges: vi.fn() }));
const chatRealtime = vi.hoisted(() => ({ db: {} as unknown, ready: true }));
const currentUser = vi.hoisted(() => ({ data: { id: 'u1' } as { id: string } | undefined }));
const listener = vi.hoisted(() => ({
  onNext: null as ((snap: unknown) => void) | null,
  onError: null as ((err: unknown) => void) | null,
}));

vi.mock('../api', () => badgesApi);
vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => currentUser }));
vi.mock('@/features/chat/context/ChatRealtimeContext', () => ({
  useChatRealtime: () => chatRealtime,
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})),
  onSnapshot: vi.fn((_ref: unknown, next: (s: unknown) => void, error: (e: unknown) => void) => {
    listener.onNext = next;
    listener.onError = error;
    return () => undefined;
  }),
}));

import { BadgeRealtimeProvider } from '../BadgeRealtimeProvider';
import { useBadges } from './use-badges';
import { useChatBadge } from '@/features/chat/hooks/use-chat-badge';
import { useChatUnreadCount } from '@/features/chat/hooks/use-chat-unread-count';
import { useUnreadCount } from '@/features/notifications/hooks/use-unread-count';

const snapshotOf = (data: unknown, fromCache = false) => ({
  metadata: { fromCache },
  data: () => data,
});

/** Ba nơi đọc badge trong ứng dụng thật: chuông, biểu tượng chat, huy hiệu menu. */
function AllThreeConsumers() {
  const bell = useUnreadCount();
  const icon = useChatBadge(CHAT_SIDE.CUSTOMER);
  const nav = useChatUnreadCount(CHAT_SIDE.SHOP);
  return <output>{`${bell}/${icon.count}/${nav}`}</output>;
}

function Probe() {
  const badges = useBadges();
  return <output>{`${badges.chatCustomer}/${badges.chatShop}/${badges.notificationsUnread}`}</output>;
}

function wrapper(children: ReactNode, client?: QueryClient) {
  const queryClient =
    client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <BadgeRealtimeProvider>{children}</BadgeRealtimeProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  badgesApi.fetchBadges
    .mockReset()
    .mockResolvedValue({ chatCustomer: 2, chatShop: 3, notificationsUnread: 4, asOf: 1_000 });
  chatRealtime.db = {};
  chatRealtime.ready = true;
  currentUser.data = { id: 'u1' };
  listener.onNext = null;
  listener.onError = null;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useBadges', () => {
  it('ba nơi đọc badge chỉ tạo ĐÚNG MỘT request', async () => {
    const { container } = render(wrapper(<AllThreeConsumers />));

    // Biểu tượng chat cố ý đếm TỔNG cả hai vai (2+3) — xem docblock của useChatBadge.
    await waitFor(() => expect(container.textContent).toBe('4/5/3'));
    expect(badgesApi.fetchBadges).toHaveBeenCalledTimes(1);
  });

  it('ba nơi đọc vẫn chỉ MỘT đồng hồ hỏi lại, không phải ba', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(wrapper(<AllThreeConsumers />));
    await vi.waitFor(() => expect(badgesApi.fetchBadges).toHaveBeenCalledTimes(1));

    // Không có listener nào báo live ⇒ nhịp dự phòng 30s. Sau 35s phải là ĐÚNG một lượt nữa.
    await vi.advanceTimersByTimeAsync(35_000);
    expect(badgesApi.fetchBadges).toHaveBeenCalledTimes(2);
  });

  it('chưa đăng nhập thì không gọi API', async () => {
    currentUser.data = undefined;
    render(wrapper(<Probe />));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(badgesApi.fetchBadges).not.toHaveBeenCalled();
  });

  it('snapshot MỚI HƠN tới trong lúc request đang bay thì không bị bản đọc cũ đè lên', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    badgesApi.fetchBadges.mockImplementation(async () => {
      queryClient.setQueryData(['badges', 'me'], {
        chatCustomer: 9,
        chatShop: 9,
        notificationsUnread: 9,
        asOf: 5_000,
      });
      return { chatCustomer: 2, chatShop: 3, notificationsUnread: 4, asOf: 1_000 };
    });

    const { container } = render(wrapper(<Probe />, queryClient));
    await waitFor(() => expect(container.textContent).toBe('9/9/9'));
  });

  /**
   * Chiều ngược lại, và là chiều mà một bản chiếu cũ gây hại: document Firestore còn sót sau một
   * quãng `FIRESTORE_ENABLED=false` không được thắng lượt đọc REST đầu tiên.
   */
  it('snapshot CŨ HƠN không đè được kết quả REST mới', async () => {
    badgesApi.fetchBadges.mockResolvedValue({
      chatCustomer: 2,
      chatShop: 3,
      notificationsUnread: 4,
      asOf: 9_000,
    });

    const { container } = render(wrapper(<Probe />));
    await waitFor(() => expect(container.textContent).toBe('2/3/4'));

    // Bản chiếu cũ tới sau — phải bị bỏ qua.
    listener.onNext?.(
      snapshotOf({ chatCustomer: 9, chatShop: 9, notificationsUnread: 9, updatedAt: 500 }),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.textContent).toBe('2/3/4');
  });

  it('snapshot MỚI từ server được áp vào cache ngay, không cần request nào', async () => {
    const { container } = render(wrapper(<Probe />));
    await waitFor(() => expect(container.textContent).toBe('2/3/4'));

    const before = badgesApi.fetchBadges.mock.calls.length;
    listener.onNext?.(
      snapshotOf({ chatCustomer: 7, chatShop: 8, notificationsUnread: 9, updatedAt: 9_999 }),
    );

    await waitFor(() => expect(container.textContent).toBe('7/8/9'));
    expect(badgesApi.fetchBadges).toHaveBeenCalledTimes(before);
  });

  it('snapshot chỉ từ CACHE cục bộ: không áp vào cache và không được tính là live', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { container } = render(wrapper(<Probe />));
    await vi.waitFor(() => expect(container.textContent).toBe('2/3/4'));

    listener.onNext?.(
      snapshotOf({ chatCustomer: 9, chatShop: 9, notificationsUnread: 9, updatedAt: 9_999 }, true),
    );
    expect(container.textContent).toBe('2/3/4');

    // Vẫn ở nhịp dự phòng 30s — cache không chứng minh backend còn sống.
    const before = badgesApi.fetchBadges.mock.calls.length;
    await vi.advanceTimersByTimeAsync(35_000);
    expect(badgesApi.fetchBadges.mock.calls.length).toBeGreaterThan(before);
  });

  it('chưa nghe được thì hỏi lại thường xuyên; nghe được rồi thì thưa hẳn', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(wrapper(<Probe />));
    await vi.waitFor(() => expect(badgesApi.fetchBadges).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(35_000);
    expect(badgesApi.fetchBadges.mock.calls.length).toBeGreaterThan(1);

    // Snapshot từ SERVER ⇒ live ⇒ nhịp 120s.
    listener.onNext?.(
      snapshotOf({ chatCustomer: 2, chatShop: 3, notificationsUnread: 4, updatedAt: 20_000 }),
    );
    await vi.advanceTimersByTimeAsync(100);

    const afterLive = badgesApi.fetchBadges.mock.calls.length;
    await vi.advanceTimersByTimeAsync(35_000);
    expect(badgesApi.fetchBadges.mock.calls.length).toBe(afterLive);
  });

  it('listener lỗi: quay về nhịp dự phòng, không giữ trạng thái live', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(wrapper(<Probe />));
    await vi.waitFor(() => expect(listener.onError).not.toBeNull());

    listener.onNext?.(
      snapshotOf({ chatCustomer: 2, chatShop: 3, notificationsUnread: 4, updatedAt: 20_000 }),
    );
    await vi.advanceTimersByTimeAsync(100);

    listener.onError?.({ code: 'permission-denied' });
    // Để React commit trạng thái `error` và TanStack dựng lại đồng hồ ở nhịp dự phòng.
    await vi.advanceTimersByTimeAsync(100);

    const afterError = badgesApi.fetchBadges.mock.calls.length;
    await vi.advanceTimersByTimeAsync(35_000);

    expect(badgesApi.fetchBadges.mock.calls.length).toBeGreaterThan(afterError);
  });
});
