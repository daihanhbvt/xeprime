import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CHAT_SIDE } from '@xeprime/types';
import { chatApi, type ChatMessage } from '@/features/chat/api';
import { CHAT_SEND_STATE, isOwnSideMessage } from '@xeprime/domain';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { useAppActive, useRefetchOnForeground } from '@/hooks/use-app-active';
import { useChatRealtime } from '../realtime/ChatRealtimeProvider';
import { REALTIME_STATE } from '@/hooks/use-realtime-subscription';
import { useThreadRealtime } from '../realtime/use-thread-realtime';
import { useThread } from './use-thread';

/**
 * Vòng đời một thread trên native.
 *
 * Việc GỘP tin đã có unit test ở `@xeprime/domain`; ở đây kiểm ba thứ mà chỉ hook mới có:
 * tin lạc quan hiện ra NGAY, bản server thay chỗ nó thay vì nằm cạnh, và — quan trọng nhất —
 * phản hồi của hội thoại A không được rơi vào hội thoại B sau khi người dùng đã chuyển màn.
 */
jest.mock('@/features/chat/api', () => {
  const actual = jest.requireActual('@/features/chat/api');
  return {
    ...actual,
    chatApi: {
      messages: jest.fn(),
      send: jest.fn(),
      markRead: jest.fn().mockResolvedValue({ conversationId: 'c1', unread: 0 }),
    },
  };
});

jest.mock('../realtime/ChatRealtimeProvider', () => ({
  useChatRealtime: jest.fn(() => ({ db: null, ready: false })),
}));

jest.mock('../realtime/use-thread-realtime', () => ({
  useThreadRealtime: jest.fn(),
}));

jest.mock('@/hooks/use-app-active', () => ({
  useAppActive: jest.fn(() => true),
  useRefetchOnForeground: jest.fn(),
}));


const api = chatApi as jest.Mocked<typeof chatApi>;
const realtime = useChatRealtime as jest.MockedFunction<typeof useChatRealtime>;
const threadRealtime = useThreadRealtime as jest.MockedFunction<typeof useThreadRealtime>;
const appActive = useAppActive as jest.MockedFunction<typeof useAppActive>;
const refetchOnForeground = useRefetchOnForeground as jest.MockedFunction<
  typeof useRefetchOnForeground
>;

/** Nhịp poll khi realtime CHẾT — cùng con số web dùng ở nhánh dự phòng. */
const POLL_FALLBACK_MS = 5_000;
/** Nhịp poll khi realtime sống: lưới an toàn, không phải đường chính. */
const POLL_LIVE_MS = 25_000;

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
  realtime.mockReturnValue({ db: null, ready: false });
  // Mặc định: KHÔNG nghe được ⇒ nhịp poll nhanh. Ca nào cần khác thì tự khai.
  threadRealtime.mockReset().mockReturnValue(REALTIME_STATE.DISABLED);
  appActive.mockReturnValue(true);
  refetchOnForeground.mockReset();
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

    const { result } = await renderHook(() => useThread('c1', CHAT_SIDE.CUSTOMER), { wrapper });

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

    const { result } = await renderHook(() => useThread('c1', CHAT_SIDE.CUSTOMER), { wrapper });
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

  /**
   * Tin lạc quan phải nằm đúng PHÍA ngay khung hình đầu.
   *
   * Bug thật: nó để `senderType: ''`, `isOwnSideMessage` trả `false`, nên câu mình vừa gõ hiện
   * ở phía đối phương rồi mới nhảy sang phải khi lượt REST kế tiếp về.
   */
  it.each([CHAT_SIDE.CUSTOMER, CHAT_SIDE.SHOP])(
    'tin lạc quan mang senderType của CHÍNH phía đang xem (%s)',
    async (viewerSide) => {
      api.send.mockImplementation(() => new Promise<ChatMessage>(() => {}));

      const { result } = await renderHook(() => useThread('c1', viewerSide), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        void result.current.send({ text: 'Chào' });
      });
      await waitFor(() => expect(result.current.entries).toHaveLength(1));

      const sent = result.current.entries[0]?.message.senderType;
      expect(isOwnSideMessage(sent, viewerSide)).toBe(true);
    },
  );

  it('gửi hỏng thì GIỮ tin lại ở trạng thái failed để bấm gửi lại', async () => {
    api.send.mockRejectedValue(new Error('mạng rớt'));

    const { result } = await renderHook(() => useThread('c1', CHAT_SIDE.CUSTOMER), { wrapper });
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

    const { result } = await renderHook(() => useThread('c1', CHAT_SIDE.CUSTOMER), { wrapper });
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

    const { result } = await renderHook(() => useThread('c1', CHAT_SIDE.CUSTOMER), { wrapper });
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

    const { result, rerender } = await renderHook((props: { id: string }) => useThread(props.id, CHAT_SIDE.CUSTOMER), {
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

/**
 * Đường ĐƯA TIN VỀ: realtime và đồng hồ chạy SONG SONG, và cả hai chỉ kích hoạt đúng một lượt
 * đọc REST (`refreshLatest`). Đây là chỗ ADR 0009 sống: Firestore không bao giờ vẽ ra màn hình.
 */
describe('useThread — realtime + poll dự phòng', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  it('gắn listener cho ĐÚNG hội thoại đang mở', async () => {
    realtime.mockReturnValue({ db: {} as never, ready: true });

    await renderHook(() => useThread('c1', CHAT_SIDE.CUSTOMER), { wrapper });

    expect(threadRealtime).toHaveBeenCalled();
    const [conversationId] = threadRealtime.mock.calls.at(-1) as [string | null, () => void];
    expect(conversationId).toBe('c1');
  });

  it('app xuống NỀN thì tháo listener (truyền id null) và dừng đồng hồ', async () => {
    realtime.mockReturnValue({ db: {} as never, ready: true });
    appActive.mockReturnValue(false);

    await renderHook(() => useThread('c1', CHAT_SIDE.CUSTOMER), { wrapper });
    await flush();
    const callsAfterLoad = api.messages.mock.calls.length;

    const [conversationId] = threadRealtime.mock.calls.at(-1) as [string | null, () => void];
    expect(conversationId).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(POLL_FALLBACK_MS * 4);
    });
    expect(api.messages).toHaveBeenCalledTimes(callsAfterLoad);
  });

  it('snapshot chỉ KÍCH HOẠT một lượt đọc REST, không mang nội dung vào danh sách', async () => {
    realtime.mockReturnValue({ db: {} as never, ready: true });
    api.messages.mockResolvedValue({ data: [message({ id: 'A' })], next: null });

    const { result } = await renderHook(() => useThread('c1', CHAT_SIDE.CUSTOMER), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const before = api.messages.mock.calls.length;
    const [, onChange] = threadRealtime.mock.calls.at(-1) as [string | null, () => void];

    api.messages.mockResolvedValue({
      data: [message({ id: 'A' }), message({ id: 'B', sentAt: '2026-09-07T03:02:00.000Z' })],
      next: null,
    });
    await act(async () => {
      onChange();
      await Promise.resolve();
    });

    expect(api.messages.mock.calls.length).toBeGreaterThan(before);
    await waitFor(() =>
      expect(result.current.entries.map((e) => e.message.id)).toEqual(['A', 'B']),
    );
  });

  it('realtime CHẾT ⇒ đồng hồ chạy nhịp NHANH', async () => {
    threadRealtime.mockReturnValue(REALTIME_STATE.ERROR);

    await renderHook(() => useThread('c1', CHAT_SIDE.CUSTOMER), { wrapper });
    await flush();

    const before = api.messages.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(POLL_FALLBACK_MS);
    });
    expect(api.messages.mock.calls.length).toBe(before + 1);
  });

  /**
   * Nhận được SNAPSHOT vẫn KHÔNG chứng minh đường ống projection còn sống mãi (worker outbox có
   * thể chết sau đó). Nên poll chỉ THƯA ĐI, không bao giờ tắt — nếu không, bên A nhắn thì bên B
   * phải tự kéo xuống làm mới.
   */
  it('listener LIVE ⇒ đồng hồ vẫn chạy, chỉ thưa hơn', async () => {
    threadRealtime.mockReturnValue(REALTIME_STATE.LIVE);

    await renderHook(() => useThread('c1', CHAT_SIDE.CUSTOMER), { wrapper });
    await flush();

    const before = api.messages.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(POLL_FALLBACK_MS);
    });
    expect(api.messages.mock.calls.length).toBe(before);

    await act(async () => {
      jest.advanceTimersByTime(POLL_LIVE_MS - POLL_FALLBACK_MS);
    });
    expect(api.messages.mock.calls.length).toBe(before + 1);
  });

  /**
   * ĐÃ đăng nhập Firebase nhưng listener CHƯA nhận snapshot nào ⇒ vẫn phải poll nhịp NHANH.
   *
   * Đây là bản sửa trung tâm của đợt này. Bản trước chọn nhịp theo `ready` của
   * `ChatRealtimeProvider` — mà `ready` chỉ chứng minh `signInWithCustomToken` thành công.
   * Rules chưa đẩy thì listener bị từ chối ngay mà không có dấu hiệu nào, client vẫn tin mình
   * đang realtime và hạ nhịp xuống 25 giây, và người nhận đợi trọn nhịp đó.
   */
  it('đăng nhập Firebase xong nhưng CHƯA nghe được ⇒ vẫn poll nhịp nhanh', async () => {
    realtime.mockReturnValue({ db: {} as never, ready: true });
    threadRealtime.mockReturnValue(REALTIME_STATE.CONNECTING);

    await renderHook(() => useThread('c1', CHAT_SIDE.CUSTOMER), { wrapper });
    await flush();

    const before = api.messages.mock.calls.length;
    await act(async () => {
      jest.advanceTimersByTime(POLL_FALLBACK_MS);
    });
    expect(api.messages.mock.calls.length).toBe(before + 1);
  });

  it('dừng đồng hồ khi unmount — không để một request bay sau khi rời màn', async () => {
    const { unmount } = await renderHook(() => useThread('c1', CHAT_SIDE.CUSTOMER), { wrapper });
    await flush();

    const before = api.messages.mock.calls.length;
    await act(async () => unmount());
    await act(async () => {
      jest.advanceTimersByTime(POLL_FALLBACK_MS * 3);
    });

    expect(api.messages.mock.calls.length).toBe(before);
  });

  /** Quay lại app sau mười phút mà đợi hết một nhịp mới thấy tin là mười phút im lặng thấy được. */
  it('đăng ký làm mới NGAY khi app quay lại tiền cảnh', async () => {
    await renderHook(() => useThread('c1', CHAT_SIDE.CUSTOMER), { wrapper });
    await flush();

    expect(refetchOnForeground).toHaveBeenCalled();
    const onForeground = refetchOnForeground.mock.calls.at(-1)?.[0] as () => void;

    const before = api.messages.mock.calls.length;
    await act(async () => {
      onForeground();
      await Promise.resolve();
    });
    expect(api.messages.mock.calls.length).toBe(before + 1);
  });

  /** Một lượt làm mới NỀN hỏng không được biến màn đang đọc thành màn lỗi. */
  it('lượt poll hỏng KHÔNG đẩy thread sang trạng thái lỗi', async () => {
    api.messages.mockResolvedValueOnce({ data: [message({ id: 'A' })], next: null });
    const { result } = await renderHook(() => useThread('c1', CHAT_SIDE.CUSTOMER), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    api.messages.mockRejectedValue(new Error('mất sóng'));
    await act(async () => {
      jest.advanceTimersByTime(POLL_FALLBACK_MS);
      await Promise.resolve();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.entries.map((e) => e.message.id)).toEqual(['A']);
  });
});
