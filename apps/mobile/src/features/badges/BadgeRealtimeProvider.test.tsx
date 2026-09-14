import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { badgesApi } from '@/api/badges/api';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { BadgeRealtimeProvider } from './BadgeRealtimeProvider';
import { useBadges } from './hooks/use-badges';

/**
 * Provider huy hiệu — MỘT query cho cả khung ứng dụng.
 *
 * Hai bất biến đắt nhất được khoá ở đây, và cả hai đều là lỗi im lặng nếu sai:
 *
 *  1. **Chưa đăng nhập thì KHÔNG gọi.** Luật này vừa chuyển từ prop `enabled` của từng component
 *     về provider; mất nó là khu công khai sinh một chuỗi 401 mà không màn nào báo gì.
 *  2. **`asOf` quyết định ai thắng**, không phải thứ tự đến. Lưới an toàn chỉ chạy hai phút một
 *     lần, nên một lần ghi đè sai sẽ đứng đó tới hai phút.
 */
jest.mock('@/api/badges/api', () => ({
  badgesApi: { me: jest.fn() },
}));

jest.mock('@/features/auth/hooks/use-auth', () => ({
  useCurrentUser: jest.fn(),
}));

// Không có Firestore trong bài test này: đường REST phải tự đứng vững.
jest.mock('@/features/chat/realtime/ChatRealtimeProvider', () => ({
  useChatRealtime: jest.fn(() => ({ db: null, ready: false })),
}));

jest.mock('@/hooks/use-app-active', () => ({
  useAppActive: jest.fn(() => true),
  useRefetchOnForeground: jest.fn(),
}));

const api = badgesApi as jest.Mocked<typeof badgesApi>;
const session = useCurrentUser as jest.MockedFunction<typeof useCurrentUser>;

const snapshot = (notificationsUnread: number, asOf: number) => ({
  chatCustomer: 0,
  chatShop: 0,
  notificationsUnread,
  asOf,
});

function signedIn(id: string | null) {
  session.mockReturnValue({
    data: id ? { id } : undefined,
    isPending: false,
  } as never);
}

async function renderBadges() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <BadgeRealtimeProvider>{children}</BadgeRealtimeProvider>
    </QueryClientProvider>
  );
  const view = await renderHook(() => useBadges(), { wrapper });
  return { ...view, queryClient };
}

beforeEach(() => {
  api.me.mockReset().mockResolvedValue(snapshot(0, 1));
  signedIn('u1');
});

describe('BadgeRealtimeProvider', () => {
  it('bootstrap bằng REST sau khi đăng nhập', async () => {
    api.me.mockResolvedValue(snapshot(3, 1));
    const { result } = await renderBadges();

    await waitFor(() => expect(result.current.notificationsUnread).toBe(3));
    expect(api.me).toHaveBeenCalledTimes(1);
  });

  /** Khu công khai không được sinh 401 — và không nơi gọi nào phải nhớ luật đó. */
  it('CHƯA đăng nhập thì không gọi `/me/badges`', async () => {
    signedIn(null);
    const { result } = await renderBadges();

    expect(api.me).not.toHaveBeenCalled();
    expect(result.current).toEqual({ chatCustomer: 0, chatShop: 0, notificationsUnread: 0 });
  });

  /**
   * Cuộc đua hai chiều: một response REST khởi hành TRƯỚC nhưng về SAU không được đè lên bản
   * chiếu mới hơn đã nằm trong cache.
   *
   * So bằng `asOf` — mốc do MÁY CHỦ đặt ở cả hai nguồn — thay vì theo thứ tự đến.
   */
  it('bản chiếu MỚI HƠN trong cache thắng lượt đọc REST cũ', async () => {
    const { result, queryClient } = await renderBadges();
    await waitFor(() => expect(api.me).toHaveBeenCalled());

    // Bản chiếu realtime tới, mốc muộn hơn hẳn.
    queryClient.setQueryData(['badges', 'me'], snapshot(9, 500));

    // Một lượt REST CŨ về sau đó.
    api.me.mockResolvedValue(snapshot(1, 100));
    await queryClient.refetchQueries({ queryKey: ['badges', 'me'] });

    await waitFor(() => expect(result.current.notificationsUnread).toBe(9));
  });

  it('ngược lại: REST mới hơn thì THẮNG bản chiếu cũ', async () => {
    const { result, queryClient } = await renderBadges();
    await waitFor(() => expect(api.me).toHaveBeenCalled());

    queryClient.setQueryData(['badges', 'me'], snapshot(9, 100));

    api.me.mockResolvedValue(snapshot(2, 900));
    await queryClient.refetchQueries({ queryKey: ['badges', 'me'] });

    await waitFor(() => expect(result.current.notificationsUnread).toBe(2));
  });
});
