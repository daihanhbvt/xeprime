import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { CHAT_SIDE } from '@xeprime/types';
import type { ReactNode } from 'react';
import { chatApi, type ConversationSummary } from '@/features/chat/api';
import { withIntl } from '@/i18n/test-utils';
import { ChatListScreen } from './ChatListScreen';

/**
 * HAI hộp thư trên cùng một màn — `side` là thứ duy nhất phân biệt.
 *
 * Bất biến quan trọng nhất: bấm vào một hội thoại phải mở thread của ĐÚNG bề mặt đó. Dùng chung
 * một route là mở hội thoại của gian hàng bằng `side=customer`, và server trả 403 — hoặc tệ hơn,
 * trả về đúng nhưng đánh dấu đã đọc nhầm phía.
 */
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/chat',
}));

jest.mock('@/features/shell/ManageHeader', () => ({ ManageHeader: () => null }));

jest.mock('@/features/chat/api', () => {
  const actual = jest.requireActual('@/features/chat/api');
  return { ...actual, chatApi: { list: jest.fn() } };
});

jest.mock('./realtime/ChatRealtimeProvider', () => ({
  useChatRealtime: jest.fn(() => ({ db: null, ready: false })),
}));

jest.mock('@/hooks/use-app-active', () => ({
  useAppActive: jest.fn(() => true),
  useRefetchOnForeground: jest.fn(),
}));

/*
 * Các hook danh sách nay nghe TÍN HIỆU từ bản chiếu huy hiệu (`useOnBadgeChange`): con số đổi
 * ⇒ tải lại danh sách. Mock provider thay vì dựng nó — dựng thật sẽ kéo Firestore và phiên
 * đăng nhập vào những bài test không kiểm realtime.
 */
jest.mock('@/features/badges/BadgeRealtimeProvider', () => ({
  useBadgeRealtime: jest.fn(() => ({
    counts: { chatCustomer: 0, chatShop: 0, notificationsUnread: 0 },
    live: false,
  })),
}));

const api = chatApi as jest.Mocked<typeof chatApi>;

const conversation = (over: Partial<ConversationSummary> & { id: string }): ConversationSummary => ({
  vehicleId: null,
  vehicleName: null,
  vehicleImageUrl: null,
  partyName: 'Gian hàng Đà Nẵng',
  partyAvatarUrl: null,
  side: CHAT_SIDE.CUSTOMER,
  lastMessageText: 'Xe còn trống không ạ?',
  lastMessageAt: '2026-09-09T02:00:00.000Z',
  lastSenderType: 'customer',
  unread: 0,
  status: 'active',
  ...over,
});

const page = (items: ConversationSummary[], hasNext = false, pageNumber = 1) => ({
  items,
  meta: { page: pageNumber, limit: 20, total: items.length, hasNext },
});

async function renderScreen(side: (typeof CHAT_SIDE)[keyof typeof CHAT_SIDE]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(withIntl(wrapper({ children: <ChatListScreen side={side} /> })));
}

beforeEach(() => {
  mockPush.mockReset();
  api.list.mockReset().mockResolvedValue(page([conversation({ id: 'c1' })]) as never);
});

describe('ChatListScreen', () => {
  it('hộp thư KHÁCH hỏi server với `side=customer`', async () => {
    await renderScreen(CHAT_SIDE.CUSTOMER);

    await waitFor(() => expect(api.list).toHaveBeenCalled());
    expect(api.list.mock.calls[0]?.[0]).toMatchObject({ side: 'customer' });
  });

  it('inbox GIAN HÀNG hỏi server với `side=shop` — không trộn vai', async () => {
    await renderScreen(CHAT_SIDE.SHOP);

    await waitFor(() => expect(api.list).toHaveBeenCalled());
    expect(api.list.mock.calls[0]?.[0]).toMatchObject({ side: 'shop' });
  });

  it('bấm một hội thoại ở hộp thư khách mở `/chat/[id]`', async () => {
    const view = await renderScreen(CHAT_SIDE.CUSTOMER);

    const row = await view.findByLabelText('Gian hàng Đà Nẵng');
    fireEvent.press(row);

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/chat/[id]', params: { id: 'c1' } });
  });

  it('bấm một hội thoại ở inbox gian hàng mở `/manage/chat/[id]`', async () => {
    api.list.mockResolvedValue(
      page([conversation({ id: 'c9', partyName: 'Khách An', side: CHAT_SIDE.SHOP })]) as never,
    );
    const view = await renderScreen(CHAT_SIDE.SHOP);

    const row = await view.findByLabelText('Khách An');
    fireEvent.press(row);

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/manage/chat/[id]', params: { id: 'c9' } });
  });

  it('lọc "Chưa đọc" chạy Ở SERVER, không lọc trên trang đã tải', async () => {
    const view = await renderScreen(CHAT_SIDE.CUSTOMER);
    await waitFor(() => expect(api.list).toHaveBeenCalled());

    fireEvent.press(view.getByText('Chưa đọc'));

    await waitFor(() =>
      expect(api.list).toHaveBeenCalledWith(
        expect.objectContaining({ side: 'customer', unreadOnly: true }),
        1,
      ),
    );
  });

  /**
   * Cuộn vô hạn KHÔNG có thanh phân trang để nói "3/3", nên dấu chấm hết là thứ duy nhất phân
   * biệt "đã hết" với "đang tải tiếp". Việc nối trang tự nó có test ở `use-chat.test.tsx`; ở đây
   * kiểm phần người dùng NHÌN THẤY.
   */
  it('còn trang sau thì KHÔNG hiện dấu chấm hết', async () => {
    api.list.mockResolvedValue(page([conversation({ id: 'c1' })], true, 1) as never);
    const view = await renderScreen(CHAT_SIDE.CUSTOMER);
    await view.findByLabelText('Gian hàng Đà Nẵng');

    expect(view.queryByText('Đã hết danh sách')).toBeNull();
  });

  it('hết trang thì hiện dấu chấm hết', async () => {
    const view = await renderScreen(CHAT_SIDE.CUSTOMER);
    await view.findByLabelText('Gian hàng Đà Nẵng');

    expect(await view.findByText('Đã hết danh sách')).toBeTruthy();
  });

  it('danh sách rỗng hiện trạng thái rỗng, không phải màn lỗi', async () => {
    api.list.mockResolvedValue(page([]) as never);
    const view = await renderScreen(CHAT_SIDE.CUSTOMER);

    expect(await view.findByText('Chưa có hội thoại')).toBeTruthy();
  });

  it('lỗi tải hiện màn lỗi kèm nút thử lại', async () => {
    api.list.mockRejectedValue(new Error('mạng rớt'));
    const view = await renderScreen(CHAT_SIDE.CUSTOMER);

    expect(await view.findByText('Không tải được hội thoại')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });
});
