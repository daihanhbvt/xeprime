import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { CHAT_SIDE, type ChatSide } from '@xeprime/types';
import type { ReactNode } from 'react';
import { chatApi, type ChatMessage, type ConversationSummary } from '@/features/chat/api';
import { withIntl } from '@/i18n/test-utils';
import { ChatThreadScreen } from './ChatThreadScreen';

/**
 * Màn một cuộc trò chuyện.
 *
 * Hai thứ ở đây chỉ đúng khi việc GỘP NHÓM chạy qua `groupThreadMessages` của `@xeprime/domain`:
 * tên người gửi chỉ hiện ở tin ĐẦU của một nhóm, và dải ngày chỉ mở đầu mỗi ngày. Luật gộp tự
 * nó (hai nhân viên nối nhau là hai nhóm) đã có unit test ở chính package đó — ở đây kiểm phần
 * màn hình nối dây vào nó.
 */
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/chat/c1',
}));

jest.mock('@/features/chat/api', () => {
  const actual = jest.requireActual('@/features/chat/api');
  return {
    ...actual,
    chatApi: {
      detail: jest.fn(),
      messages: jest.fn(),
      markRead: jest.fn(),
      send: jest.fn(),
    },
  };
});

jest.mock('./realtime/ChatRealtimeProvider', () => ({
  useChatRealtime: jest.fn(() => ({ db: null, ready: false })),
}));

jest.mock('./realtime/use-thread-realtime', () => ({ useThreadRealtime: jest.fn() }));

jest.mock('@/hooks/use-app-active', () => ({
  useAppActive: jest.fn(() => true),
  useRefetchOnForeground: jest.fn(),
}));

const api = chatApi as jest.Mocked<typeof chatApi>;

const conversation = (side: ChatSide): ConversationSummary => ({
  id: 'c1',
  vehicleId: null,
  vehicleName: null,
  vehicleImageUrl: null,
  partyName: side === CHAT_SIDE.SHOP ? 'Khách An' : 'Gian hàng Đà Nẵng',
  partyAvatarUrl: null,
  side,
  lastMessageText: null,
  lastMessageAt: null,
  lastSenderType: null,
  unread: 0,
  status: 'active',
});

const message = (over: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'sentAt'>): ChatMessage => ({
  conversationId: 'c1',
  senderUserId: 'staff-1',
  senderName: 'Minh',
  senderType: 'shop_member',
  messageType: 'text',
  text: over.id,
  clientMessageId: null,
  attachments: [],
  ...over,
});

async function renderThread(side: ChatSide) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(
    withIntl(wrapper({ children: <ChatThreadScreen conversationId="c1" side={side} /> })),
  );
}

beforeEach(() => {
  mockPush.mockReset();
  api.detail.mockReset().mockResolvedValue(conversation(CHAT_SIDE.CUSTOMER));
  api.messages.mockReset().mockResolvedValue({ data: [], next: null });
  api.markRead.mockReset().mockResolvedValue({ conversationId: 'c1', unread: 0 });
  api.send.mockReset();
});

describe('ChatThreadScreen', () => {
  it('hỏi hội thoại theo ĐÚNG bề mặt đang đứng', async () => {
    api.detail.mockResolvedValue(conversation(CHAT_SIDE.SHOP));
    await renderThread(CHAT_SIDE.SHOP);

    await waitFor(() => expect(api.detail).toHaveBeenCalledWith('c1', 'shop'));
  });

  it('đầu trang chỉ mang tên ĐỐI PHƯƠNG', async () => {
    const view = await renderThread(CHAT_SIDE.CUSTOMER);

    expect(await view.findByText('Gian hàng Đà Nẵng')).toBeTruthy();
  });

  it('thread rỗng nói ra lời mời bắt đầu, không phải màn lỗi', async () => {
    const view = await renderThread(CHAT_SIDE.CUSTOMER);

    expect(await view.findByText('Hãy bắt đầu trò chuyện.')).toBeTruthy();
  });

  /**
   * Tên người gửi hiện ở tin ĐẦU của một nhóm và chỉ cho phía BÊN KIA — đúng như `MessageList`
   * của web (`showSenderNames && !group.mine`). Bong bóng của chính mình không cần tên: người
   * gửi biết mình là ai, và một cái tên trên mỗi bong bóng bên phải chỉ làm dòng chat dày lên.
   */
  it('inbox GIAN HÀNG hiện tên phía bên kia MỘT lần cho cả nhóm tin liên tiếp', async () => {
    api.detail.mockResolvedValue(conversation(CHAT_SIDE.SHOP));
    api.messages.mockResolvedValue({
      data: [
        message({
          id: 'A',
          sentAt: '2026-01-05T02:00:00.000Z',
          senderUserId: 'khach',
          senderName: 'Khách An',
          senderType: 'customer',
        }),
        message({
          id: 'B',
          sentAt: '2026-01-05T02:01:00.000Z',
          senderUserId: 'khach',
          senderName: 'Khách An',
          senderType: 'customer',
        }),
        message({ id: 'C', sentAt: '2026-01-05T02:02:00.000Z' }),
      ],
      next: null,
    });

    const view = await renderThread(CHAT_SIDE.SHOP);

    // Hai tin liên tiếp của khách ⇒ MỘT nhóm ⇒ tên hiện đúng một lần trong thân hội thoại
    // (lần còn lại là tiêu đề thanh trên).
    await waitFor(() => expect(view.getByText('C')).toBeTruthy());
    expect(view.getAllByText('Khách An')).toHaveLength(2);
    // Tin của chính nhân viên KHÔNG đội tên.
    expect(view.queryByText('Minh')).toBeNull();
  });

  /** Khách luôn nói chuyện với "gian hàng" — gắn tên nhân viên ở đó chỉ là nhiễu. */
  it('hộp thư KHÁCH KHÔNG hiện tên người gửi nào', async () => {
    api.messages.mockResolvedValue({
      data: [message({ id: 'A', sentAt: '2026-01-05T02:00:00.000Z' })],
      next: null,
    });

    const view = await renderThread(CHAT_SIDE.CUSTOMER);

    await waitFor(() => expect(view.getByText('A')).toBeTruthy());
    expect(view.queryByText('Minh')).toBeNull();
  });

  /**
   * Ngày cố định trong QUÁ KHỨ, không phải "hôm nay - 1": dải ngày đổi chữ theo ngày chạy test
   * ("Hôm nay"/"Hôm qua"), và một test neo vào ngày tương đối là một quả bom hẹn giờ.
   */
  it('vẽ dải ngày cho tin MỞ ĐẦU mỗi ngày, mỗi ngày đúng một dải', async () => {
    api.messages.mockResolvedValue({
      data: [
        // Hai tin đầu CÙNG ngày 05/01 theo giờ Việt Nam (UTC+7), tin thứ ba sang ngày 06/01.
        message({ id: 'A', sentAt: '2026-01-05T02:00:00.000Z' }),
        message({ id: 'B', sentAt: '2026-01-05T03:00:00.000Z' }),
        message({ id: 'C', sentAt: '2026-01-06T02:00:00.000Z' }),
      ],
      next: null,
    });

    const view = await renderThread(CHAT_SIDE.CUSTOMER);

    await waitFor(() => expect(view.getByText('C')).toBeTruthy());
    // Chỉ dải ngày mang năm; giờ trên bong bóng là `HH:mm`.
    expect(view.getAllByText(/2026/)).toHaveLength(2);
  });

  it('lỗi tải hội thoại hiện màn lỗi kèm nút thử lại', async () => {
    api.detail.mockRejectedValue(new Error('mạng rớt'));
    const view = await renderThread(CHAT_SIDE.CUSTOMER);

    expect(await view.findByText('Không tải được hội thoại')).toBeTruthy();
    expect(view.getByRole('button', { name: 'Thử lại' })).toBeTruthy();
  });

  /** Mở thread là đã đọc — badge chưa đọc phải tắt ngay, không đợi người dùng làm gì thêm. */
  it('mở thread thì đánh dấu đã đọc', async () => {
    api.messages.mockResolvedValue({
      data: [message({ id: 'A', sentAt: '2026-09-09T02:00:00.000Z' })],
      next: null,
    });
    await renderThread(CHAT_SIDE.CUSTOMER);

    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith('c1'));
  });
});
