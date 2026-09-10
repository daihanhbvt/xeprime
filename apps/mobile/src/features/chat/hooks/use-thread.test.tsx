import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { chatApi, type ChatMessage } from '@/api/chat/api';
import { CHAT_SEND_STATE } from '@xeprime/domain';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { useThread } from './use-thread';

/**
 * Vòng đời một thread trên native.
 *
 * Việc GỘP tin đã có unit test ở `@xeprime/domain`; ở đây kiểm ba thứ mà chỉ hook mới có:
 * tin lạc quan hiện ra NGAY, bản server thay chỗ nó thay vì nằm cạnh, và — quan trọng nhất —
 * phản hồi của hội thoại A không được rơi vào hội thoại B sau khi người dùng đã chuyển màn.
 */
jest.mock('@/api/chat/api', () => {
  const actual = jest.requireActual('@/api/chat/api');
  return {
    ...actual,
    chatApi: {
      messages: jest.fn(),
      send: jest.fn(),
      markRead: jest.fn().mockResolvedValue({ conversationId: 'c1', unread: 0 }),
    },
  };
});

const api = chatApi as jest.Mocked<typeof chatApi>;

const message = (over: Partial<ChatMessage> & Pick<ChatMessage, 'id'>): ChatMessage => ({
  conversationId: 'c1',
  senderUserId: 'u1',
  senderName: 'Khách',
  senderType: 'customer',
  messageType: 'text',
  text: over.id,
  clientMessageId: null,
  attachments: [],
  sentAt: '2026-09-07T03:00:00.000Z',
  ...over,
});

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

/*
 * Dựng LẠI cả ba hiện thực ở mỗi test.
 *
 * `jest.config.js` bật `restoreMocks: true`, nên hiện thực khai trong factory của `jest.mock`
 * bị gỡ sau test đầu tiên — từ test thứ hai, `chatApi.markRead()` trả `undefined` và `.then()`
 * trên đó ném ngay trong effect nạp tin. Triệu chứng là `result.current` bằng null ở một test
 * hoàn toàn không liên quan tới markRead, nên khai lại đủ bộ ở đây thay vì đi tìm từng lần.
 */
beforeEach(() => {
  api.messages.mockReset().mockResolvedValue({ data: [], next: null });
  api.send.mockReset();
  api.markRead.mockReset().mockResolvedValue({ conversationId: 'c1', unread: 0 });
});

describe('useThread (native)', () => {
  it('nạp trang mới nhất và sắp theo thời gian', async () => {
    api.messages.mockResolvedValue({
      data: [
        message({ id: 'B', sentAt: '2026-09-07T03:01:00.000Z' }),
        message({ id: 'A', sentAt: '2026-09-07T03:00:00.000Z' }),
      ],
      next: null,
    });

    const { result } = await renderHook(() => useThread('c1'), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries.map((e) => e.message.id)).toEqual(['A', 'B']);
  });

  it('tin gửi đi hiện NGAY ở trạng thái pending, rồi bản server thay chỗ nó', async () => {
    let resolveSend: ((m: ChatMessage) => void) | undefined;
    api.send.mockImplementation(
      () =>
        new Promise<ChatMessage>((resolve) => {
          resolveSend = resolve;
        }),
    );

    const { result } = await renderHook(() => useThread('c1'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    let sending: Promise<void> | undefined;
    await act(async () => {
      sending = result.current.send({ text: 'Chào shop' });
    });

    // Chưa đợi server trả lời: tin đã nằm trong danh sách.
    await waitFor(() => expect(result.current.entries).toHaveLength(1));
    expect(result.current.entries[0]?.state).toBe(CHAT_SEND_STATE.PENDING);
    expect(result.current.entries[0]?.message.text).toBe('Chào shop');

    const clientMessageId = result.current.entries[0]?.message.clientMessageId as string;
    expect(clientMessageId).toBeTruthy();

    await act(async () => {
      resolveSend?.(
        message({
          id: 'SERVER-1',
          text: 'Chào shop',
          clientMessageId,
          sentAt: '2026-09-07T03:05:00.000Z',
        }),
      );
      await sending;
    });

    // MỘT tin, không phải hai: bản server khớp bản lạc quan theo `clientMessageId`.
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]?.message.id).toBe('SERVER-1');
    expect(result.current.entries[0]?.state).toBe(CHAT_SEND_STATE.SENT);
  });

  it('gửi hỏng thì GIỮ tin lại ở trạng thái failed để bấm gửi lại', async () => {
    api.send.mockRejectedValue(new Error('mạng rớt'));

    const { result } = await renderHook(() => useThread('c1'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.send({ text: 'Không đi được' }).catch(() => undefined);
    });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]?.state).toBe(CHAT_SEND_STATE.FAILED);
    expect(result.current.entries[0]?.message.text).toBe('Không đi được');
  });

  it('gửi lại dùng ĐÚNG clientMessageId cũ — server nhận ra là một lần gửi', async () => {
    api.send.mockRejectedValueOnce(new Error('mạng rớt'));

    const { result } = await renderHook(() => useThread('c1'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.send({ text: 'Thử lại nhé' }).catch(() => undefined);
    });

    const clientMessageId = result.current.entries[0]?.message.clientMessageId as string;
    api.send.mockResolvedValueOnce(
      message({ id: 'SERVER-9', text: 'Thử lại nhé', clientMessageId }),
    );

    await act(async () => {
      await result.current.retry(clientMessageId);
    });

    expect(api.send).toHaveBeenLastCalledWith('c1', expect.objectContaining({ clientMessageId }));
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]?.state).toBe(CHAT_SEND_STATE.SENT);
  });

  it('bỏ một tin gửi hỏng thì nó biến mất khỏi danh sách', async () => {
    api.send.mockRejectedValue(new Error('mạng rớt'));

    const { result } = await renderHook(() => useThread('c1'), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.send({ text: 'bỏ đi' }).catch(() => undefined);
    });

    const clientMessageId = result.current.entries[0]?.message.clientMessageId as string;
    await act(async () => {
      result.current.discard(clientMessageId);
    });

    expect(result.current.entries).toHaveLength(0);
  });

  /**
   * Acceptance: chuyển nhanh A → B không được hiển thị hay ghi nhầm tin của A vào B. Phản hồi
   * chậm của A về SAU khi đã đổi màn — và nó phải rơi vào hư không.
   */
  it('phản hồi CHẬM của hội thoại A không rơi vào hội thoại B', async () => {
    let resolveA: ((page: { data: ChatMessage[]; next: null }) => void) | undefined;

    api.messages.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveA = resolve as typeof resolveA;
        }),
    );

    const { result, rerender } = await renderHook((props: { id: string }) => useThread(props.id), {
      wrapper,
      initialProps: { id: 'A' },
    });

    // Người dùng lui ra và mở hội thoại khác trong lúc A còn đang tải.
    api.messages.mockResolvedValue({
      data: [message({ id: 'B-1', conversationId: 'B', text: 'tin của B' })],
      next: null,
    });
    await rerender({ id: 'B' });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      resolveA?.({
        data: [message({ id: 'A-1', conversationId: 'A', text: 'tin của A' })],
        next: null,
      });
    });

    const ids = result.current.entries.map((e) => e.message.id);
    expect(ids).toEqual(['B-1']);
    expect(ids).not.toContain('A-1');
  });
});
