import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

/**
 * Realtime KHÔNG BAO GIỜ được tắt hẳn nhịp hỏi lại.
 *
 * Đây là lỗi đã gặp thật: Firebase cấu hình đủ nên client đăng nhập được và hook rẽ sang nhánh
 * `onSnapshot`, nhưng worker outbox không chạy nên Firestore chẳng bao giờ có gì để bắn. Hook
 * tắt poll theo, và thread đứng im cho tới khi người dùng F5.
 *
 * Bài học nằm ở chỗ: "đăng nhập được Firebase" và "đường ống projection còn sống" là hai điều
 * KHÁC NHAU. Test này khoá đúng điều đó — có realtime thì vẫn phải còn một nhịp hỏi lại.
 */
const chat = vi.hoisted(() => ({
  messages: vi.fn(),
  markRead: vi.fn(),
}));

const realtime = vi.hoisted(() => ({ db: null as unknown, ready: false }));

vi.mock('../api', () => ({ chatApi: chat }));
vi.mock('../context/ChatRealtimeContext', () => ({
  useChatRealtime: () => realtime,
}));

/**
 * `onSnapshot` được điều khiển từ test: mặc định im lặng (đúng hiện trạng khi worker không đẩy
 * gì sang Firestore), nhưng test giữ được cả hai callback để mô phỏng snapshot và lỗi.
 */
const listener = vi.hoisted(() => ({
  onNext: null as ((snap: { metadata: { fromCache: boolean } }) => void) | null,
  onError: null as ((err: unknown) => void) | null,
  unsubscribes: 0,
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  onSnapshot: vi.fn(
    (
      _q: unknown,
      next: (snap: { metadata: { fromCache: boolean } }) => void,
      error: (err: unknown) => void,
    ) => {
      listener.onNext = next;
      listener.onError = error;
      return () => {
        listener.unsubscribes++;
      };
    },
  ),
}));

const serverSnapshot = { metadata: { fromCache: false } };
const cachedSnapshot = { metadata: { fromCache: true } };

import { useThread } from './use-thread';

function Probe({ conversationId }: { conversationId: string }) {
  useThread(conversationId);
  return null;
}

function wrapper(children: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  listener.onNext = null;
  listener.onError = null;
  listener.unsubscribes = 0;
  vi.useFakeTimers({ shouldAdvanceTime: true });
  chat.messages.mockReset().mockResolvedValue({ data: [], next: null });
  chat.markRead.mockReset().mockResolvedValue({ conversationId: 'c1', unread: 0 });
  realtime.db = null;
  realtime.ready = false;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useThread — nhịp làm mới', () => {
  it('KHÔNG có realtime: hỏi lại nhanh', async () => {
    render(wrapper(<Probe conversationId="c1" />));
    await waitFor(() => expect(chat.messages).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(6_000);
    expect(chat.messages.mock.calls.length).toBeGreaterThan(1);
  });

  /** Nhánh hồi quy: trước đây đúng cấu hình này làm thread đứng im vĩnh viễn. */
  it('CÓ realtime nhưng snapshot im lặng: vẫn tự hỏi lại, không cần F5', async () => {
    realtime.db = {};
    realtime.ready = true;

    render(wrapper(<Probe conversationId="c1" />));
    await waitFor(() => expect(chat.messages).toHaveBeenCalledTimes(1));

    const afterMount = chat.messages.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);

    expect(chat.messages.mock.calls.length).toBeGreaterThan(afterMount);
  });

  it('rời thread thì dừng hẳn — không để đồng hồ chạy mồ côi', async () => {
    const view = render(wrapper(<Probe conversationId="c1" />));
    await waitFor(() => expect(chat.messages).toHaveBeenCalledTimes(1));

    view.unmount();
    const afterUnmount = chat.messages.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);

    expect(chat.messages.mock.calls.length).toBe(afterUnmount);
  });
});

/**
 * Đây là lỗi thật đã gặp, và là lý do cả `useRealtimeSubscription` tồn tại.
 *
 * Firebase đăng nhập được (rules chưa đẩy vẫn cho `signInWithCustomToken` thành công), client
 * tưởng mình đang realtime nên chuyển sang nhịp 25 giây — trong khi listener bị Firestore từ chối
 * ngay từ đầu và sẽ không bao giờ có snapshot nào. Người gửi thấy tin của mình ngay (bản lạc
 * quan), người nhận đợi 25 giây. Không cờ nào ở tầng xác thực phân biệt được hai tình huống này.
 */
describe('useThread — trạng thái listener quyết định nhịp, không phải trạng thái đăng nhập', () => {
  it('auth THÀNH CÔNG nhưng listener bị từ chối: rơi về nhịp dày NGAY, không đợi 25 giây', async () => {
    realtime.db = {};
    realtime.ready = true;

    render(wrapper(<Probe conversationId="c1" />));
    await vi.waitFor(() => expect(listener.onError).not.toBeNull());

    listener.onError?.({ code: 'permission-denied', message: 'Missing or insufficient permissions' });

    const afterError = chat.messages.mock.calls.length;
    // Sáu giây: quá nhịp dự phòng (5s), còn xa nhịp "live" (25s).
    await vi.advanceTimersByTimeAsync(6_000);

    expect(chat.messages.mock.calls.length).toBeGreaterThan(afterError);
  });

  it('nhận snapshot TỪ SERVER: làm mới ngay và chuyển sang nhịp thưa', async () => {
    realtime.db = {};
    realtime.ready = true;

    render(wrapper(<Probe conversationId="c1" />));
    await vi.waitFor(() => expect(listener.onNext).not.toBeNull());

    const beforeSnapshot = chat.messages.mock.calls.length;
    listener.onNext?.(serverSnapshot);
    await vi.waitFor(() =>
      expect(chat.messages.mock.calls.length).toBeGreaterThan(beforeSnapshot),
    );

    // Để React commit xong effect đổi nhịp (đồng hồ cũ bị clear, đồng hồ 25s được dựng).
    await vi.advanceTimersByTimeAsync(100);

    // Đã live ⇒ trong 6 giây tiếp theo KHÔNG được có lượt hỏi định kỳ nào nữa.
    const afterSnapshot = chat.messages.mock.calls.length;
    await vi.advanceTimersByTimeAsync(6_000);
    expect(chat.messages.mock.calls.length).toBe(afterSnapshot);
  });

  it('snapshot chỉ từ CACHE cục bộ không được tính là realtime khoẻ', async () => {
    realtime.db = {};
    realtime.ready = true;

    render(wrapper(<Probe conversationId="c1" />));
    await vi.waitFor(() => expect(listener.onNext).not.toBeNull());

    listener.onNext?.(cachedSnapshot);
    const afterCached = chat.messages.mock.calls.length;
    await vi.advanceTimersByTimeAsync(6_000);

    expect(chat.messages.mock.calls.length).toBeGreaterThan(afterCached);
  });

  it('đổi hội thoại: listener cũ bị huỷ, không để hai listener cùng sống', async () => {
    realtime.db = {};
    realtime.ready = true;

    const view = render(wrapper(<Probe conversationId="c1" />));
    await vi.waitFor(() => expect(listener.onNext).not.toBeNull());

    const before = listener.unsubscribes;
    view.rerender(wrapper(<Probe conversationId="c2" />));

    await vi.waitFor(() => expect(listener.unsubscribes).toBeGreaterThan(before));
  });
});
