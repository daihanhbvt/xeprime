import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { STALE_TIME } from '@xeprime/api-client';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { CHAT_SIDE } from '@xeprime/types';
import type { ReactNode } from 'react';
import { chatApi } from '@/features/chat/api';
import { queryKeys } from '@/queries/query-keys';
import { useChatRealtime } from '../realtime/ChatRealtimeProvider';
import { useBadges } from '@/features/badges/hooks/use-badges';
import { useChatBadge, useConversationsInfinite } from './use-chat';

/**
 * HAI hộp thư, không phải một danh sách có bộ lọc.
 *
 * Một tài khoản có thể vừa thuê xe của gian hàng khác vừa là nhân viên gian hàng mình. Bất biến
 * đắt nhất ở đây: `side` phải đi vào CẢ query string LẪN queryKey — khoá chung nghĩa là mở inbox
 * gian hàng sẽ ghi đè cache của hộp thư khách, và quay lại thấy công việc nằm trong hộp thư
 * cá nhân cho tới khi request mới về.
 */
jest.mock('@/features/chat/api', () => {
  const actual = jest.requireActual('@/features/chat/api');
  return {
    ...actual,
    chatApi: {
      list: jest.fn(),
    },
  };
});

jest.mock('../realtime/ChatRealtimeProvider', () => ({
  useChatRealtime: jest.fn(() => ({ db: null, ready: false })),
}));

/*
 * `useChatBadge` nay đọc từ `/me/badges` qua `useBadges`, không còn từ
 * `/conversations/unread-summary`. Mock ở tầng hook — dựng cả `BadgeRealtimeProvider` chỉ để
 * kiểm phép chọn đích là kéo theo Firestore lẫn phiên đăng nhập vào một bài test về điều hướng.
 */
jest.mock('@/features/badges/hooks/use-badges', () => ({
  useBadges: jest.fn(() => ({ chatCustomer: 0, chatShop: 0, notificationsUnread: 0 })),
}));

/*
 * Danh sách hội thoại nay nghe TÍN HIỆU từ bản chiếu huy hiệu: con số chưa đọc của bề mặt này
 * đổi ⇒ tải lại danh sách. Mock provider thay vì dựng nó — bài test này kiểm phân trang và
 * queryKey, không kiểm realtime.
 */
jest.mock('@/features/badges/BadgeRealtimeProvider', () => ({
  useBadgeRealtime: jest.fn(() => ({
    counts: { chatCustomer: 0, chatShop: 0, notificationsUnread: 0 },
    live: false,
  })),
}));

jest.mock('@/hooks/use-app-active', () => ({
  useAppActive: jest.fn(() => true),
  useRefetchOnForeground: jest.fn(),
}));

const api = chatApi as jest.Mocked<typeof chatApi>;
const realtime = useChatRealtime as jest.MockedFunction<typeof useChatRealtime>;

/**
 * ĐỌC các trường ngay trong lúc render.
 *
 * Kết quả của TanStack Query v5 là một proxy `notifyOnChangeProps: 'tracked'`: observer chỉ
 * render lại khi những trường ĐÃ ĐƯỢC ĐỌC TRONG RENDER thay đổi. Hook ở đây chỉ đụng tới
 * `refetch`, nên trả thẳng object query ra cho `renderHook` sẽ khiến `result.current` đứng im ở
 * ảnh chụp `pending` mãi mãi — test treo tới hết `waitFor` dù query đã xong từ lâu.
 *
 * Trong app thật không có vấn đề này: màn hình đọc `data`/`isPending` ngay trong render của
 * chính nó, cùng một lượt với hook.
 */
const readList = (query: ReturnType<typeof useConversationsInfinite>) => ({
  isSuccess: query.isSuccess,
  hasNextPage: query.hasNextPage,
  items: query.data?.pages.flatMap((p) => p.items) ?? [],
  fetchNextPage: query.fetchNextPage,
});

const page = (ids: string[], hasNext = false, pageNumber = 1) => ({
  items: ids.map((id) => ({ id })),
  meta: { page: pageNumber, limit: 20, total: 40, hasNext },
});

let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  api.list.mockReset().mockResolvedValue(page(['a']) as never);
  realtime.mockReturnValue({ db: null, ready: false });
});

describe('useConversationsInfinite', () => {
  it('gửi `side` xuống server và cắt trang Ở SERVER', async () => {
    const { result } = await renderHook(
      () => readList(useConversationsInfinite(CHAT_SIDE.SHOP, { q: 'an', unreadOnly: true })),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.list).toHaveBeenCalledWith({ side: 'shop', q: 'an', unreadOnly: true }, 1);
  });

  /**
   * Đổi tab "Tất cả" ↔ "Chưa đọc" phải HỎI LẠI, không hiện bản cache cũ.
   *
   * Lỗi thật người dùng gặp: tin B tới, "Tất cả" đã có nó, bấm sang "Chưa đọc" vẫn chỉ thấy tin
   * A, phải chờ 5–10 giây mới khớp. Nguyên nhân: hai tab là hai KHOÁ cache, chỉ khoá đang hiển
   * thị chạy `refetchInterval`, và `staleTime` mặc định 30 giây làm khoá kia vẫn được coi là
   * còn tươi khi quay lại.
   *
   * `QueryClient` ở đây khai ĐÚNG `staleTime` của app (`query-client.ts`) — dùng mặc định 0 của
   * TanStack thì bài test này không bao giờ bắt được lỗi.
   */
  it('đổi bộ lọc thì HỎI LẠI, kể cả khi khoá đó vừa có cache', async () => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: STALE_TIME.TRANSACTIONAL } },
    });

    const view = await renderHook(
      ({ unreadOnly }: { unreadOnly: boolean }) =>
        readList(useConversationsInfinite(CHAT_SIDE.CUSTOMER, { unreadOnly })),
      { wrapper, initialProps: { unreadOnly: false } },
    );
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    expect(api.list).toHaveBeenCalledTimes(1);

    view.rerender({ unreadOnly: true });
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));

    // Quay lại khoá ĐÃ có cache: phải hỏi lần thứ ba, không được hiện bản cũ rồi thôi.
    view.rerender({ unreadOnly: false });
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(3));
  });

  it('hai bề mặt dùng HAI queryKey khác nhau — không đè cache của nhau', async () => {
    const customer = await renderHook(
      () => readList(useConversationsInfinite(CHAT_SIDE.CUSTOMER)),
      { wrapper },
    );
    await waitFor(() => expect(customer.result.current.isSuccess).toBe(true));

    api.list.mockResolvedValue(page(['s1']) as never);
    const shop = await renderHook(() => readList(useConversationsInfinite(CHAT_SIDE.SHOP)), {
      wrapper,
    });
    await waitFor(() => expect(shop.result.current.isSuccess).toBe(true));

    expect(
      queryClient.getQueryData(queryKeys.chat.conversations(CHAT_SIDE.CUSTOMER, {})),
    ).toBeDefined();
    expect(queryClient.getQueryData(queryKeys.chat.conversations(CHAT_SIDE.SHOP, {}))).toBeDefined();
    expect(customer.result.current.items.map((c) => c.id)).toEqual(['a']);
    expect(shop.result.current.items.map((c) => c.id)).toEqual(['s1']);
  });

  it('nối trang kế khi còn `hasNext`, và dừng khi hết', async () => {
    api.list.mockResolvedValueOnce(page(['a', 'b'], true, 1) as never);
    const { result } = await renderHook(
      () => readList(useConversationsInfinite(CHAT_SIDE.CUSTOMER)),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);

    api.list.mockResolvedValueOnce(page(['c'], false, 2) as never);
    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.hasNextPage).toBe(false));
    expect(api.list).toHaveBeenLastCalledWith({ side: 'customer' }, 2);
    expect(result.current.items.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  /** `page` là `pageParam`, KHÔNG nằm trong khoá — có nó thì mỗi trang là một cache riêng. */
  it('`page` không nằm trong queryKey', async () => {
    const { result } = await renderHook(
      () => readList(useConversationsInfinite(CHAT_SIDE.CUSTOMER)),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => JSON.stringify(q.queryKey));
    expect(keys).toContain(JSON.stringify(queryKeys.chat.conversations(CHAT_SIDE.CUSTOMER, {})));
  });
});

const badges = useBadges as jest.MockedFunction<typeof useBadges>;

const counts = (chatCustomer: number, chatShop: number) => ({
  chatCustomer,
  chatShop,
  notificationsUnread: 0,
});

describe('useChatBadge', () => {
  it('đếm TỔNG cả hai vai', async () => {
    badges.mockReturnValue(counts(2, 5));
    const { result } = await renderHook(() => useChatBadge(CHAT_SIDE.CUSTOMER), { wrapper });

    await waitFor(() => expect(result.current.count).toBe(7));
  });

  it('ở lại hộp thư của bề mặt đang đứng khi bên này CÒN tin', async () => {
    badges.mockReturnValue(counts(2, 5));
    const { result } = await renderHook(() => useChatBadge(CHAT_SIDE.CUSTOMER), { wrapper });

    await waitFor(() => expect(result.current.count).toBe(7));
    expect(result.current.href).toBe('/chat');
  });

  it('nhảy sang bề mặt KIA khi bên này không còn gì mà bên kia có', async () => {
    badges.mockReturnValue(counts(0, 3));
    const { result } = await renderHook(() => useChatBadge(CHAT_SIDE.CUSTOMER), { wrapper });

    await waitFor(() => expect(result.current.count).toBe(3));
    expect(result.current.href).toBe('/manage/chat');
  });

  it('đối xứng: đứng ở gian hàng mà chỉ khách có tin thì dẫn về hộp thư khách', async () => {
    badges.mockReturnValue(counts(4, 0));
    const { result } = await renderHook(() => useChatBadge(CHAT_SIDE.SHOP), { wrapper });

    await waitFor(() => expect(result.current.count).toBe(4));
    expect(result.current.href).toBe('/chat');
  });

  it('không có tin nào thì ở nguyên bề mặt đang đứng', async () => {
    badges.mockReturnValue(counts(0, 0));
    const { result } = await renderHook(() => useChatBadge(CHAT_SIDE.SHOP), { wrapper });

    expect(result.current.count).toBe(0);
    expect(result.current.href).toBe('/manage/chat');
  });
});
