import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { NOTIFICATION_TARGET_TYPE, NOTIFICATION_TYPE } from '@xeprime/types';
import type { ReactNode } from 'react';
import { useBadges } from '@/features/badges/hooks/use-badges';
import { notificationsApi, type NotificationItem } from '@/features/notifications/api';
import { withIntl } from '@/i18n/test-utils';
import { NotificationBell } from './NotificationBell';
import { NOTIFICATION_CONTEXT, type NotificationContext } from '../notification-display';

/**
 * Chuông thông báo in-app (COM-04).
 *
 * COM-04 CHỈ là thông báo trong ứng dụng: không có chỗ nào ở đây đăng ký device token — việc đó
 * là của COM-07 (`use-push-notifications.ts`). Bốn bất biến: badge đếm chưa đọc, danh sách chỉ
 * tải khi MỞ, chạm một dòng vừa đánh dấu đã đọc vừa đi tới đúng đích, và "đánh dấu tất cả" khoá
 * khi không còn gì.
 */
const mockPush = jest.fn();

const BOOKING_ID = '01JB9ZK2QW3E4R5T6Y7U8I9O0P';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  usePathname: () => '/explore',
}));

jest.mock('@/features/notifications/api', () => {
  const actual = jest.requireActual('@/features/notifications/api');
  return {
    ...actual,
    notificationsApi: {
      list: jest.fn(),
      markRead: jest.fn(),
      markAllRead: jest.fn(),
    },
  };
});

/*
 * Số chưa đọc nay đến từ `useBadges` — một query DUY NHẤT do `BadgeRealtimeProvider` sở hữu,
 * KHÔNG còn `GET /notifications/unread-count`. Mock ở tầng hook: chuông không còn biết gì về
 * endpoint đó.
 */
jest.mock('@/features/badges/hooks/use-badges', () => ({
  useBadges: jest.fn(() => ({ chatCustomer: 0, chatShop: 0, notificationsUnread: 0 })),
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

const api = notificationsApi as jest.Mocked<typeof notificationsApi>;
const badges = useBadges as jest.MockedFunction<typeof useBadges>;

const unread = (notificationsUnread: number) => ({
  chatCustomer: 0,
  chatShop: 0,
  notificationsUnread,
});

const notification = (
  over: Partial<NotificationItem> & { id: string },
): NotificationItem => ({
  type: NOTIFICATION_TYPE.BOOKING_REQUEST_APPROVED,
  title: 'Yêu cầu của bạn đã được duyệt',
  body: 'Gian hàng Đà Nẵng vừa duyệt yêu cầu thuê xe.',
  targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
  targetId: BOOKING_ID,
  readAt: null,
  createdAt: '2026-09-09T02:00:00.000Z',
  ...over,
});

const page = (items: NotificationItem[], hasNext = false, pageNumber = 1) => ({
  items,
  meta: { page: pageNumber, limit: 15, total: items.length, hasNext },
});

async function renderBell(
  context: NotificationContext = NOTIFICATION_CONTEXT.CUSTOMER,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(
    withIntl(wrapper({ children: <NotificationBell context={context} /> })),
  );
}

beforeEach(() => {
  mockPush.mockReset();
  badges.mockReset().mockReturnValue(unread(0));
  api.list.mockReset().mockResolvedValue(page([notification({ id: 'n1' })]) as never);
  api.markRead.mockReset().mockResolvedValue({ id: 'n1', readAt: '2026-09-09T03:00:00.000Z' });
  api.markAllRead.mockReset().mockResolvedValue({ updated: 3 });
});

describe('NotificationBell', () => {
  /** Cùng một thông báo phải dẫn tới HAI nơi khác nhau theo ngữ cảnh người xem. */
  it('ở khu quản lý thì cùng thông báo đó dẫn về hộp thư yêu cầu của gian hàng', async () => {
    const view = await renderBell(NOTIFICATION_CONTEXT.MANAGE);
    fireEvent.press(view.getByLabelText('Thông báo'));

    fireEvent.press(await view.findByLabelText('Yêu cầu của bạn đã được duyệt, Chưa đọc'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/manage/requests'));
  });

  it('badge hiện số chưa đọc', async () => {
    badges.mockReturnValue(unread(3));
    const view = await renderBell();

    expect(await view.findByLabelText('Thông báo, 3 chưa đọc')).toBeTruthy();
  });

  it('không có gì chưa đọc thì nhãn chỉ là "Thông báo"', async () => {
    const view = await renderBell();

    expect(view.getByLabelText('Thông báo')).toBeTruthy();
  });

  /** Chuông ĐÓNG không có lý do gì để kéo 15 bản ghi về mỗi lần người dùng đổi màn. */
  it('danh sách chỉ tải khi MỞ tấm trượt', async () => {
    const view = await renderBell();
    expect(api.list).not.toHaveBeenCalled();

    fireEvent.press(view.getByLabelText('Thông báo'));

    await waitFor(() => expect(api.list).toHaveBeenCalled());
  });

  it('chạm một thông báo CHƯA ĐỌC thì đánh dấu đã đọc rồi đi tới đúng đích', async () => {
    const view = await renderBell();
    fireEvent.press(view.getByLabelText('Thông báo'));

    const row = await view.findByLabelText('Yêu cầu của bạn đã được duyệt, Chưa đọc');
    fireEvent.press(row);

    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith('n1'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/trips/[id]',
      params: { id: BOOKING_ID },
    });
  });

  it('thông báo ĐÃ ĐỌC thì không gọi lại mark-read', async () => {
    api.list.mockResolvedValue(
      page([notification({ id: 'n1', readAt: '2026-09-09T01:00:00.000Z' })]) as never,
    );
    const view = await renderBell();
    fireEvent.press(view.getByLabelText('Thông báo'));

    fireEvent.press(await view.findByLabelText('Yêu cầu của bạn đã được duyệt'));

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(api.markRead).not.toHaveBeenCalled();
  });

  it('thông báo KHÔNG có đích thì chỉ đánh dấu đã đọc, không điều hướng', async () => {
    api.list.mockResolvedValue(
      page([
        notification({
          id: 'n2',
          title: 'Gói sắp hết hạn',
          targetType: null,
          targetId: null,
        }),
      ]) as never,
    );
    const view = await renderBell();
    fireEvent.press(view.getByLabelText('Thông báo'));

    fireEvent.press(await view.findByLabelText('Gói sắp hết hạn, Chưa đọc'));

    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith('n2'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('"Đánh dấu tất cả đã đọc" gọi API khi còn tin chưa đọc', async () => {
    badges.mockReturnValue(unread(2));
    const view = await renderBell();
    fireEvent.press(await view.findByLabelText('Thông báo, 2 chưa đọc'));

    fireEvent.press(await view.findByLabelText('Đánh dấu tất cả đã đọc'));

    await waitFor(() => expect(api.markAllRead).toHaveBeenCalledTimes(1));
  });

  it('không còn gì chưa đọc thì "Đánh dấu tất cả" bị KHOÁ', async () => {
    const view = await renderBell();
    fireEvent.press(view.getByLabelText('Thông báo'));

    const button = await view.findByLabelText('Đánh dấu tất cả đã đọc');
    expect(button.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(button);
    expect(api.markAllRead).not.toHaveBeenCalled();
  });

  it('danh sách rỗng hiện trạng thái rỗng', async () => {
    api.list.mockResolvedValue(page([]) as never);
    const view = await renderBell();
    fireEvent.press(view.getByLabelText('Thông báo'));

    expect(await view.findByText('Chưa có thông báo')).toBeTruthy();
  });

  it('còn trang sau thì KHÔNG hiện dấu chấm hết', async () => {
    api.list.mockResolvedValue(page([notification({ id: 'n1' })], true, 1) as never);
    const view = await renderBell();
    fireEvent.press(view.getByLabelText('Thông báo'));

    await view.findByLabelText('Yêu cầu của bạn đã được duyệt, Chưa đọc');
    expect(view.queryByText('Đã hết danh sách')).toBeNull();
  });

  it('hết trang thì hiện dấu chấm hết', async () => {
    const view = await renderBell();
    fireEvent.press(view.getByLabelText('Thông báo'));

    expect(await view.findByText('Đã hết danh sách')).toBeTruthy();
  });
});
