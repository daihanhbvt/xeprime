import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';
import { CHAT_SIDE, type ChatSide } from '@xeprime/types';
import type { ReactNode } from 'react';
import { useBadges } from '@/features/badges/hooks/use-badges';
import { withIntl } from '@/i18n/test-utils';
// Đích so qua builder của app đang chạy (customer: /manage/chat là handoff /partner; partner:
// /chat là /not-available) — test khoá "mở đúng hộp thư", không khoá một literal.
import { ROUTES } from '@/navigation/routes';
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
  return render(withIntl(wrapper({ children: <ChatBadgeButton surface={surface} /> })));
}

beforeEach(() => {
  mockPush.mockReset();
  badges.mockReset().mockReturnValue(counts(0, 0));
});

/** MỘT tài khoản, MỘT hộp thư (ADR 0053): huy hiệu đếm và mở đúng hộp thư của bề mặt. */
describe('ChatBadgeButton', () => {
  it('khu khách: hiện số chưa đọc của hộp thư KHÁCH, không cộng hộp thư gian hàng', async () => {
    badges.mockReturnValue(counts(2, 5));
    const view = await renderButton(CHAT_SIDE.CUSTOMER);

    expect(await view.findByText('2')).toBeTruthy();
    expect(view.queryByText('7')).toBeNull();
  });

  it('không có tin nào thì KHÔNG vẽ huy hiệu', async () => {
    const view = await renderButton(CHAT_SIDE.CUSTOMER);

    expect(view.queryByText('0')).toBeNull();
  });

  it('khu khách: bấm mở hộp thư khách', async () => {
    badges.mockReturnValue(counts(2, 5));
    const view = await renderButton(CHAT_SIDE.CUSTOMER);
    await view.findByText('2');

    fireEvent.press(view.getByLabelText('Tin nhắn'));
    expect(mockPush).toHaveBeenCalledWith(ROUTES.chat.list());
  });

  it('khu quản lý: đếm và mở hộp thư gian hàng, kể cả khi chỉ bên khách có tin', async () => {
    badges.mockReturnValue(counts(4, 1));
    const view = await renderButton(CHAT_SIDE.SHOP);
    await view.findByText('1');

    fireEvent.press(view.getByLabelText('Trò chuyện'));
    expect(mockPush).toHaveBeenCalledWith(ROUTES.manage.chat());
  });
});
