import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Provider as ReduxProvider } from 'react-redux';
import { BOOKING_REQUEST_STATUS, PERMISSION, type Permission } from '@xeprime/types';
import viBookingRequests from '@xeprime/domain/messages/vi/booking-requests.json';
import * as authApi from '@/features/auth/api';
import { withIntl } from '@/i18n/test-utils';
import { ROUTES } from '@/navigation/routes';
import { store } from '@/store';
import { bookingRequestsApi, type BookingRequestItem } from '../api';
import { BookingRequestCard } from './BookingRequestCard';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  // Đồng hồ hạn phản hồi chỉ chạy khi màn đang được nhìn — ở test coi như luôn đang nhìn.
  useFocusEffect: (effect: () => void | (() => void)) => {
    jest.requireActual('react').useEffect(effect, [effect]);
  },
}));

const t = viBookingRequests;

function request(overrides: Partial<BookingRequestItem> = {}): BookingRequestItem {
  return {
    id: '01JQZX000000000000000000RQ',
    status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
    vehicleId: '01JQZX0000000000000000000V',
    vehicleName: 'Toyota Vios 2022',
    vehicleCode: 'XE01',
    vehiclePlate: '51A-123.45',
    vehicleType: 'car',
    vehicleImageUrl: null,
    serviceType: 'self_drive',
    customerName: 'Nguyễn Văn An',
    customerPhone: '0901234567',
    customerEmail: null,
    customerAvatarUrl: null,
    customerRiskLevel: null,
    tenantCustomerId: '01JQZX0000000000000000000C',
    canMessageOnPlatform: true,
    pickupAt: '2026-10-01T02:00:00.000Z',
    returnAt: '2026-10-03T02:00:00.000Z',
    longTermPackageMonths: null,
    routeType: null,
    pickupAddress: null,
    destination: null,
    deliveryRequested: false,
    deliveryAddress: null,
    note: null,
    rejectReason: null,
    respondBy: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    holdExpiresAt: null,
    bookingId: null,
    pricing: null,
    createdAt: '2026-09-25T02:00:00.000Z',
    decidedAt: null,
    ...overrides,
  } as unknown as BookingRequestItem;
}

function renderCard(
  item: BookingRequestItem,
  permissions: Permission[] = ALL,
  onOpenDetail: (request: BookingRequestItem) => void = jest.fn(),
) {
  jest.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({
    id: '01JQZX00000000000000000USR',
    displayName: 'Chủ shop',
    email: null,
    avatarUrl: null,
    phone: null,
    phoneVerified: true,
    hasPassword: true,
    tenant: null,
    openRenterTripCount: 0,
    platformRole: null,
    permissions,
  } as unknown as authApi.CurrentUser);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    withIntl(
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <BookingRequestCard
            request={item}
            onApprove={jest.fn()}
            onReject={jest.fn()}
            onCancel={jest.fn()}
            onOpenDetail={onOpenDetail}
          />
        </QueryClientProvider>
      </ReduxProvider>,
    ),
  );
}

const ALL: Permission[] = [
  PERMISSION.BOOKING_REQUEST_APPROVE,
  PERMISSION.VEHICLE_VIEW,
  PERMISSION.CUSTOMER_VIEW,
  PERMISSION.BOOKING_VIEW,
];

beforeEach(() => {
  jest.restoreAllMocks();
  mockPush.mockClear();
});

/*
 * Bản trước của app nối "Nhắn tin" vào `tel:` với ghi chú "chat realtime chưa dựng ở app" — trong
 * khi inbox chat của gian hàng đã có. Web mở hội thoại qua `POST /booking-requests/:id/conversation`
 * rồi sang đúng thread đó.
 */
describe('BookingRequestCard — Nhắn tin', () => {
  it('khách có tài khoản: mở hội thoại của YÊU CẦU rồi sang đúng thread ở inbox gian hàng', async () => {
    const spy = jest
      .spyOn(bookingRequestsApi, 'conversation')
      .mockResolvedValue({ id: '01JQZX0000000000000000CONV' } as never);
    const view = await renderCard(request());

    await fireEvent.press(await view.findByLabelText('Nhắn tin cho Nguyễn Văn An trên XePrime'));

    await waitFor(() => expect(spy).toHaveBeenCalledWith('01JQZX000000000000000000RQ'));
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith(ROUTES.manage.chatThread('01JQZX0000000000000000CONV')),
    );
  });

  it('khách chưa có tài khoản: nút VẪN có (mờ), chạm vào KHÔNG gọi API, nói lý do', async () => {
    const spy = jest.spyOn(bookingRequestsApi, 'conversation');
    const view = await renderCard(request({ canMessageOnPlatform: false }));

    const button = await view.findByLabelText('Nhắn tin cho Nguyễn Văn An trên XePrime');
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
    await fireEvent.press(button);

    expect(spy).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(await view.findByText(t.actions.messageUnavailable)).toBeTruthy();
  });

  it('nút gọi mang tên + số khách cho trình đọc màn hình', async () => {
    const view = await renderCard(request());

    expect(await view.findByLabelText('Gọi Nguyễn Văn An theo số 0901234567')).toBeTruthy();
  });
});

describe('BookingRequestCard — lối vào hồ sơ khách / xe', () => {
  it('có hồ sơ trong sổ khách + quyền xem khách: tên khách mở hồ sơ khách', async () => {
    const view = await renderCard(request());

    // Quyền đọc từ `/auth/me` (bất đồng bộ) — đợi tên thành LIÊN KẾT rồi mới chạm.
    await fireEvent.press(await view.findByRole('link', { name: 'Nguyễn Văn An' }));
    expect(mockPush).toHaveBeenCalledWith(
      ROUTES.manage.customerDetail('01JQZX0000000000000000000C'),
    );
  });

  it('thiếu quyền xem khách: tên khách chỉ là chữ', async () => {
    const view = await renderCard(request(), [PERMISSION.VEHICLE_VIEW]);

    // Đợi quyền về (tên xe thành liên kết) để chắc cổng khách đã được xét với quyền THẬT.
    await view.findByRole('link', { name: 'Toyota Vios 2022' });
    expect(view.queryByRole('link', { name: 'Nguyễn Văn An' })).toBeNull();
    await fireEvent.press(view.getByText('Nguyễn Văn An'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('tên xe mở hồ sơ xe khi có quyền xem xe', async () => {
    const view = await renderCard(request());

    await fireEvent.press(await view.findByRole('link', { name: 'Toyota Vios 2022' }));
    expect(mockPush).toHaveBeenCalledWith(
      ROUTES.manage.vehicleDetail('01JQZX0000000000000000000V'),
    );
  });
});

describe('BookingRequestCard — ghi chú của khách', () => {
  it('có nút Xem đầy đủ / Thu gọn như web', async () => {
    const view = await renderCard(request({ note: 'Giao xe trước 7 giờ sáng giúp mình nhé.' }));

    await fireEvent.press(await view.findByText(t.note.expand));
    expect(await view.findByText(t.note.collapse)).toBeTruthy();
  });
});

/*
 * Web: `openableDetail = true` — mọi yêu cầu đều mở chi tiết, và nhãn gợi ý của khối lịch trình
 * LUÔN là `trace.viewBooking`, kể cả khi yêu cầu chưa thành đơn. Yêu cầu đã thành đơn (và người
 * xem có quyền xem đơn) có thêm lối cùng nhãn ở chân thẻ (`hasBookingLink`).
 */
describe('BookingRequestCard — lối mở chi tiết', () => {
  it('yêu cầu CHƯA thành đơn: khối lịch trình vẫn nói "Xem chi tiết đơn thuê" và mở chi tiết', async () => {
    const onOpenDetail = jest.fn();
    const view = await renderCard(request(), ALL, onOpenDetail);

    expect(await view.findByText(t.trace.viewBooking)).toBeTruthy();
    expect(view.queryByText(t.detail.title)).toBeNull();
    await fireEvent.press(
      view.getByLabelText(t.trace.viewBookingFor.replace('{vehicle}', 'Toyota Vios 2022')),
    );
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
  });

  it('yêu cầu ĐÃ thành đơn + có quyền xem đơn: thêm lối ở chân thẻ', async () => {
    const onOpenDetail = jest.fn();
    const view = await renderCard(
      request({
        status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        bookingId: '01JQZX0000000000000000000B',
      }),
      ALL,
      onOpenDetail,
    );

    await waitFor(() => expect(view.getAllByText(t.trace.viewBooking)).toHaveLength(2));
    await fireEvent.press(view.getByRole('button', { name: t.trace.viewBooking }));
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
  });

  it('đã thành đơn nhưng KHÔNG có quyền xem đơn: không có lối ở chân thẻ', async () => {
    const view = await renderCard(
      request({
        status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        bookingId: '01JQZX0000000000000000000B',
      }),
      [PERMISSION.VEHICLE_VIEW],
    );

    await view.findByRole('link', { name: 'Toyota Vios 2022' });
    expect(view.getAllByText(t.trace.viewBooking)).toHaveLength(1);
  });
});
