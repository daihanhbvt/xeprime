import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';
import { CHAT_SIDE, type ChatSide } from '@xeprime/types';
import type { ReactNode } from 'react';
import { useBadges } from '@/features/badges/hooks/use-badges';
import { withIntl } from '@/i18n/test-utils';
import { ChatBadgeButton } from './ChatBadgeButton';

/**
 * Biểu tượng tin nhắn trên thanh trên — MỘT component cho cả hai thanh, đúng như web đặt cùng
 * khối ở `MarketHeader` và `Topbar`.
 *
 * Bất biến: con số là TỔNG cả hai vai, còn đích đến đi theo nơi THẬT SỰ có tin. Thiếu vế thứ hai
 * thì badge báo 3 và màn mở ra trống trơn — nên hai chuyện đó test cùng nhau, không tách.
 */
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/explore',
}));

/*
 * Badge đọc từ `useBadges` — một query DUY NHẤT do `BadgeRealtimeProvider` sở hữu. Mock ở
 * tầng hook thay vì tầng HTTP: component không còn biết gì về endpoint, và dựng cả provider chỉ
 * để kiểm một con số là kéo theo Firestore lẫn phiên đăng nhập vào một bài test về điều hướng.
 */
jest.mock('@/features/badges/hooks/use-badges', () => ({
  useBadges: jest.fn(),
}));

const badges = useBadges as jest.MockedFunction<typeof useBadges>;

const counts = (chatCustomer: number, chatShop: number) => ({
  chatCustomer,
  chatShop,
  notificationsUnread: 0,
});

async function renderButton(surface: ChatSide) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(
    withIntl(wrapper({ children: <ChatBadgeButton surface={surface} /> })),
  );
}

beforeEach(() => {
  mockPush.mockReset();
  badges.mockReset().mockReturnValue(counts(0, 0));
});

describe('ChatBadgeButton', () => {
  it('hiện TỔNG chưa đọc của cả hai vai', async () => {
    badges.mockReturnValue(counts(2, 5));
    const view = await renderButton(CHAT_SIDE.CUSTOMER);

    expect(await view.findByText('7')).toBeTruthy();
  });

  it('không có tin nào thì KHÔNG vẽ huy hiệu', async () => {
    const view = await renderButton(CHAT_SIDE.CUSTOMER);

    expect(view.queryByText('0')).toBeNull();
  });

  it('ở khu khách, còn tin bên khách thì mở hộp thư khách', async () => {
    badges.mockReturnValue(counts(2, 5));
    const view = await renderButton(CHAT_SIDE.CUSTOMER);
    await view.findByText('7');

    fireEvent.press(view.getByLabelText('Tin nhắn'));
    expect(mockPush).toHaveBeenCalledWith('/chat');
  });

  /** Chính là lỗ mà `useChatBadge` sinh ra để bịt — badge sáng mà mở ra không có gì. */
  it('ở khu khách, chỉ gian hàng có tin thì mở thẳng inbox gian hàng', async () => {
    badges.mockReturnValue(counts(0, 3));
    const view = await renderButton(CHAT_SIDE.CUSTOMER);
    await view.findByText('3');

    fireEvent.press(view.getByLabelText('Tin nhắn'));
    expect(mockPush).toHaveBeenCalledWith('/manage/chat');
  });

  it('ở khu quản lý, chỉ khách có tin thì mở thẳng hộp thư khách', async () => {
    badges.mockReturnValue(counts(4, 0));
    const view = await renderButton(CHAT_SIDE.SHOP);
    await view.findByText('4');

    fireEvent.press(view.getByLabelText('Trò chuyện'));
    expect(mockPush).toHaveBeenCalledWith('/chat');
  });
});
