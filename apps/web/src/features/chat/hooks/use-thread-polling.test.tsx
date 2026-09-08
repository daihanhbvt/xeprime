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

// `onSnapshot` trả về một hàm huỷ đăng ký và KHÔNG bao giờ gọi callback — đúng hiện trạng khi
// worker không đẩy gì sang Firestore.
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => () => undefined),
}));

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
