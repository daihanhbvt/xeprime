import { act, renderHook } from '@testing-library/react-native';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { MESSAGES_DEFAULT_LIMIT } from '@/features/chat/api';
import { useChatRealtime } from './ChatRealtimeProvider';
import { LISTENER_SKIP_REASON, chatDebug } from '@/lib/chat-debug';
import { useThreadRealtime } from './use-thread-realtime';

jest.mock('@/lib/chat-debug', () => {
  const actual = jest.requireActual('@/lib/chat-debug');
  return {
    ...actual,
    chatDebug: { ...actual.chatDebug, listenerSkipped: jest.fn() },
  };
});

/**
 * Listener Firestore của MỘT thread.
 *
 * Bốn bất biến:
 *   1. chỉ gắn khi CẢ HAI có: hội thoại đang mở và phiên realtime sẵn sàng;
 *   2. truy vấn phải là `orderBy(sentAt desc) + limit` — trần chi phí của ADR 0009 §2, và cùng
 *      truy vấn web dùng để hai client tốn đúng một lượng đọc như nhau;
 *   3. snapshot CHỈ báo "có gì đó đổi" — nó không mang nội dung vào danh sách;
 *   4. tháo listener khi đổi hội thoại hoặc khi unmount, nếu không mỗi lần mở một thread là một
 *      đăng ký Firestore nữa còn sống và tính tiền.
 */
jest.mock('firebase/firestore', () => ({
  collection: jest.fn((_db: unknown, path: string) => ({ path })),
  orderBy: jest.fn((field: string, dir: string) => ({ field, dir })),
  limit: jest.fn((n: number) => ({ n })),
  query: jest.fn((base: unknown, ...constraints: unknown[]) => ({ base, constraints })),
  onSnapshot: jest.fn(() => jest.fn()),
}));

jest.mock('./ChatRealtimeProvider', () => ({
  useChatRealtime: jest.fn(),
}));

const realtime = useChatRealtime as jest.MockedFunction<typeof useChatRealtime>;
const fb = {
  collection: collection as jest.Mock,
  orderBy: orderBy as jest.Mock,
  limit: limit as jest.Mock,
  query: query as jest.Mock,
  onSnapshot: onSnapshot as jest.Mock,
};

const DB = { __brand: 'firestore' };

function setRealtime(ready: boolean): void {
  realtime.mockReturnValue({ db: ready ? (DB as never) : null, ready });
}

beforeEach(() => {
  Object.values(fb).forEach((mock) => mock.mockClear());
  (chatDebug.listenerSkipped as jest.Mock).mockClear();
  fb.onSnapshot.mockImplementation(() => jest.fn());
  setRealtime(true);
});

/** Hình dạng tối thiểu của một snapshot Firestore mà hook này đụng tới. */
interface SnapshotLike {
  size: number;
  metadata: { fromCache: boolean };
}

/** Snapshot TỪ SERVER — bằng chứng DUY NHẤT để tin là realtime đang chạy. */
const serverSnapshot = (size: number): SnapshotLike => ({
  size,
  metadata: { fromCache: false },
});

/** Snapshot phát lại từ cache cục bộ: chứng minh máy còn nhớ, KHÔNG chứng minh backend còn sống. */
const cachedSnapshot = (size: number): SnapshotLike => ({
  size,
  metadata: { fromCache: true },
});

describe('useThreadRealtime', () => {
  it('gắn listener đúng đường dẫn projection, sắp xếp và giới hạn như web', async () => {
    await renderHook(() => useThreadRealtime('conv-1', jest.fn()));

    expect(fb.collection).toHaveBeenCalledWith(DB, 'conversations/conv-1/messages');
    expect(fb.orderBy).toHaveBeenCalledWith('sentAt', 'desc');
    expect(fb.limit).toHaveBeenCalledWith(MESSAGES_DEFAULT_LIMIT);
    expect(fb.onSnapshot).toHaveBeenCalledTimes(1);
  });

  it('KHÔNG gắn gì khi realtime chưa sẵn sàng', async () => {
    setRealtime(false);
    await renderHook(() => useThreadRealtime('conv-1', jest.fn()));

    expect(fb.onSnapshot).not.toHaveBeenCalled();
  });

  /**
   * Bỏ qua thì phải NÓI RA LÝ DO.
   *
   * Không có dòng này, một bản log chỉ còn `thread.transport {source:"poll"}` — và nó không phân
   * biệt được "realtime hỏng giữa chừng" với "realtime chưa từng bật được". Đó đúng là chỗ bí
   * khi đọc log từ máy thật.
   */
  it('chưa đăng nhập Firebase ⇒ ghi log LÝ DO, không im lặng', async () => {
    // Firestore dựng được (`db` có) nhưng phiên Firebase chưa xong — đúng tình huống trên máy thật.
    realtime.mockReturnValue({ db: DB as never, ready: false });
    await renderHook(() => useThreadRealtime('conv-1', jest.fn()));

    expect(chatDebug.listenerSkipped).toHaveBeenCalledWith(
      'conv-1',
      LISTENER_SKIP_REASON.NOT_SIGNED_IN,
    );
  });

  it('không dựng được Firestore ⇒ lý do KHÁC hẳn, không lẫn với chưa đăng nhập', async () => {
    realtime.mockReturnValue({ db: null, ready: true });
    await renderHook(() => useThreadRealtime('conv-1', jest.fn()));

    expect(chatDebug.listenerSkipped).toHaveBeenCalledWith(
      'conv-1',
      LISTENER_SKIP_REASON.NO_CONFIG,
    );
  });

  /** Rời màn / app xuống nền là chuyện BÌNH THƯỜNG — log nó là làm nhiễu chính bản log. */
  it('KHÔNG gắn gì khi không có hội thoại nào đang mở, và KHÔNG log', async () => {
    await renderHook(() => useThreadRealtime(null, jest.fn()));

    expect(fb.onSnapshot).not.toHaveBeenCalled();
    expect(chatDebug.listenerSkipped).not.toHaveBeenCalled();
  });

  it('snapshot chỉ gọi `onChange` — không truyền nội dung doc nào ra ngoài', async () => {
    const onChange = jest.fn();
    await renderHook(() => useThreadRealtime('conv-1', onChange));

    const next = fb.onSnapshot.mock.calls[0]?.[1] as (snap: SnapshotLike) => void;
    next(serverSnapshot(12));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith();
  });

  /**
   * Rules từ chối hay mạng chết chỉ TẮT realtime; đồng hồ poll của `useThread` vẫn mang tin về.
   * Lỗi ở đây tuyệt đối không được ném lên giao diện.
   */
  /**
   * Snapshot TỪ CACHE không được tính là "đang nghe được".
   *
   * Firestore phát lại từ cache cục bộ khi mạng chập chờn. Tin nó là client hạ nhịp poll
   * xuống 25 giây dựa trên một bằng chứng không nói gì về backend — đúng cái bẫy web đã trả
   * giá để tìm ra. Nhưng vẫn phải gọi `onChange`: một lượt đọc REST thừa thì vô hại, còn bỏ
   * qua nó thì tin đến lúc mạng chập chờn phải đợi nhịp poll.
   */
  it('snapshot từ CACHE vẫn làm mới, nhưng KHÔNG chuyển sang trạng thái live', async () => {
    const onChange = jest.fn();
    const view = await renderHook(() => useThreadRealtime('conv-1', onChange));

    const next = fb.onSnapshot.mock.calls[0]?.[1] as (snap: SnapshotLike) => void;
    await act(async () => next(cachedSnapshot(3)));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(view.result.current).not.toBe('live');
  });

  it('snapshot TỪ SERVER mới chuyển sang live', async () => {
    const view = await renderHook(() => useThreadRealtime('conv-1', jest.fn()));

    const next = fb.onSnapshot.mock.calls[0]?.[1] as (snap: SnapshotLike) => void;
    await act(async () => next(serverSnapshot(3)));

    expect(view.result.current).toBe('live');
  });
  it('lỗi listener KHÔNG ném ra và KHÔNG gọi `onChange`', async () => {
    const onChange = jest.fn();
    await renderHook(() => useThreadRealtime('conv-1', onChange));

    const onError = fb.onSnapshot.mock.calls[0]?.[2] as (error: unknown) => void;
    expect(() => onError({ code: 'permission-denied' })).not.toThrow();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('tháo listener khi unmount', async () => {
    const unsubscribe = jest.fn();
    fb.onSnapshot.mockImplementation(() => unsubscribe);

    const { unmount } = await renderHook(() => useThreadRealtime('conv-1', jest.fn()));
    expect(unsubscribe).not.toHaveBeenCalled();

    await act(async () => unmount());
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('đổi hội thoại thì tháo listener cũ rồi gắn listener mới', async () => {
    const unsubscribe = jest.fn();
    fb.onSnapshot.mockImplementation(() => unsubscribe);

    const { rerender } = await renderHook(
      ({ id }: { id: string }) => useThreadRealtime(id, jest.fn()),
      { initialProps: { id: 'conv-1' } },
    );
    await rerender({ id: 'conv-2' });

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(fb.collection).toHaveBeenLastCalledWith(DB, 'conversations/conv-2/messages');
    expect(fb.onSnapshot).toHaveBeenCalledTimes(2);
  });

  /** Mất phiên realtime giữa chừng (đăng xuất) phải gỡ đăng ký, không để nó treo lơ lửng. */
  it('realtime tắt giữa chừng thì tháo listener', async () => {
    const unsubscribe = jest.fn();
    fb.onSnapshot.mockImplementation(() => unsubscribe);

    const { rerender } = await renderHook(() => useThreadRealtime('conv-1', jest.fn()));
    setRealtime(false);
    await rerender(undefined);

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
