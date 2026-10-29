import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Provider as ReduxProvider } from 'react-redux';
import { BOOKING_HOLD_STATUS, CUSTOMER_TRIP_STAGE, TRIP_ROLE } from '@xeprime/types';
import viTrips from '@xeprime/domain/messages/vi/trips.json';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { tripsApi, type CustomerTripDetail } from './api';
import { TripDetailScreen } from './TripDetailScreen';
import { ROUTES } from '@/navigation/routes';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), setParams: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

/** Tin đăng của xe (điểm nhận, điều khoản) — các thẻ tự rơi về dữ liệu chuyến khi chưa có. */
jest.mock('@/features/marketplace/hooks/use-marketplace-data', () => ({
  useListing: () => ({ data: undefined, isLoading: false }),
}));

/** Thẻ người thuê đọc tài khoản — không thuộc phạm vi màn này. */
jest.mock('@/features/auth/hooks/use-auth', () => ({
  useCurrentUser: () => ({ data: null }),
}));

/** Đồng hồ có test riêng — ở đây chỉ cần nó không vẽ gì. */
jest.mock('@/components/ui/Countdown', () => ({ Countdown: () => null }));

const mockNavigate = jest.fn();
jest.mock('@/hooks/use-navigate-once', () => ({ useNavigateOnce: () => mockNavigate }));

/** Nút chat cần phiên + chat realtime — không thuộc phạm vi màn này. */
jest.mock('@/features/chat/components/ChatWithShopButton', () => ({
  ChatWithShopButton: () => null,
}));

const actions = viTrips.actions;

function trip(overrides: Partial<CustomerTripDetail> = {}): CustomerTripDetail {
  return {
    id: '01JQZX0000000000000000000R',
    role: TRIP_ROLE.RENTER,
    stage: CUSTOMER_TRIP_STAGE.READY,
    respondBy: null,
    canContact: true,
    totalIsEstimate: false,
    bookingId: '01JQZX0000000000000000000B',
    code: 'BK-0001',
    vehicle: {
      id: '01JQZX0000000000000000000V',
      name: 'Toyota Vios 2022',
      plateNumber: '51A-123.45',
      imageUrl: null,
    },
    shop: { name: 'Gara Bình Minh', slug: 'binh-minh', phone: '0901111111', logoUrl: null },
    pickupAt: '2026-10-01T02:00:00.000Z',
    returnAt: '2026-10-03T02:00:00.000Z',
    serviceType: 'self_drive',
    longTermPackageMonths: null,
    deliveryRequested: false,
    canReview: false,
    hasReview: false,
    createdAt: '2026-09-25T02:00:00.000Z',
    customerNote: null,
    rejectReason: null,
    actualPickupAt: null,
    actualReturnAt: null,
    finance: null,
    estimate: null,
    hold: null,
    depositCollectionMode: null,
    review: null,
    ...overrides,
  } as unknown as CustomerTripDetail;
}

async function renderTrip(data: CustomerTripDetail) {
  jest.spyOn(tripsApi, 'detail').mockResolvedValue(data);
  const evidenceSpy = jest.spyOn(tripsApi, 'handoverEvidence').mockResolvedValue([]);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = await render(
    withIntl(
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <TripDetailScreen tripId={data.id} />
        </QueryClientProvider>
      </ReduxProvider>,
    ),
  );
  return { ...view, evidenceSpy };
}

beforeEach(() => jest.restoreAllMocks());

/*
 * `GET /trips/:id` phục vụ CẢ HAI đầu của một chuyến. Cụm hỗ trợ (nhắn · gọi · đánh giá gian hàng)
 * và nút Huỷ là của KHÁCH — web dựng `isHost ? null : …` và `!isHost && canCustomerCancelTrip`.
 * Bản trước của app bày cả hai cho chủ xe: ba lối liên hệ với chính mình, và một nút Huỷ mà
 * `POST /trips/:id/cancel` (khoá theo `customerUserId`) luôn trả 404.
 */
describe('TripDetailScreen — cụm của khách chỉ dành cho khách', () => {
  it('KHÁCH, chuyến đang thuê (bố cục chung): có khối hỗ trợ', async () => {
    const view = await renderTrip(trip({ stage: CUSTOMER_TRIP_STAGE.ACTIVE }));

    expect(await view.findByText(actions.title)).toBeTruthy();
  });

  it('CHỦ XE, cùng chuyến đó: KHÔNG có khối hỗ trợ, KHÔNG có nút Huỷ', async () => {
    const view = await renderTrip(trip({ role: TRIP_ROLE.HOST }));

    expect(await view.findByText('Toyota Vios 2022')).toBeTruthy();
    expect(view.queryByText(actions.title)).toBeNull();
    expect(view.queryByText(actions.cancel)).toBeNull();
    expect(view.queryByText(actions.call)).toBeNull();
  });
});

/*
 * Điều kiện gọi bằng chứng bàn giao = web: chuyến ĐÃ có mốc bàn giao thật
 * (`actualPickupAt || actualReturnAt`), không phải "chặng đang chạy hoặc đã đóng" — chuyến bị huỷ
 * hay từ chối là "đã đóng" mà chắc chắn không có biên bản nào.
 */
describe('TripDetailScreen — bằng chứng bàn giao', () => {
  /*
    Kiểu lấy từ CHÍNH trường sẽ nhận giá trị, không phải `CustomerTripStage`: union kia còn mang
    `pending_approval_paid` đã gỡ (ADR 0055) và chỉ giữ để mobile biên dịch, nên nó RỘNG hơn thứ
    một chuyến thật có thể mang.
  */
  it.each<CustomerTripDetail['stage']>([
    CUSTOMER_TRIP_STAGE.CANCELLED,
    CUSTOMER_TRIP_STAGE.REJECTED,
  ])('chặng %s, chưa có mốc bàn giao: KHÔNG gọi API bằng chứng', async (stage) => {
    const view = await renderTrip(trip({ stage }));

    expect(await view.findByText('Toyota Vios 2022')).toBeTruthy();
    expect(view.evidenceSpy).not.toHaveBeenCalled();
  });

  it('đã có mốc nhận xe thật: gọi API bằng chứng', async () => {
    const view = await renderTrip(
      trip({ stage: CUSTOMER_TRIP_STAGE.ACTIVE, actualPickupAt: '2026-10-01T02:05:00.000Z' }),
    );

    await waitFor(() => expect(view.evidenceSpy).toHaveBeenCalledWith(trip().id));
  });
});

const HOLD = {
  id: '01HOLD',
  code: 'XPH23456789',
  status: BOOKING_HOLD_STATUS.PENDING,
  outcome: null,
  amount: '140800',
  paidAmount: '0',
  remainingAmount: '140800',
  expiresAt: '2099-01-01T00:00:00.000Z',
  freeCancelUntil: '2099-01-01T00:00:00.000Z',
  paidAt: null,
  refund: null,
} as unknown as NonNullable<CustomerTripDetail['hold']>;

const PAY_LABEL = /Thanh toán giữ chỗ ·/;

/*
 * Ba màn design v2 của KHÁCH (web PR #207, `TripDetailView` ~L193): chọn theo CHẶNG; chủ xe luôn ở
 * bố cục chung, nơi có cụm Duyệt/Từ chối.
 */
describe('TripDetailScreen — chặng → màn design v2', () => {
  it('chờ phản hồi ⇒ màn "Đã gửi yêu cầu" + tiến trình + nút huỷ ở thẻ thay đổi kế hoạch', async () => {
    const view = await renderTrip(
      trip({ stage: CUSTOMER_TRIP_STAGE.PENDING_APPROVAL, canContact: false, bookingId: null }),
    );

    expect(await view.findByText(viTrips.pending.page.title)).toBeTruthy();
    expect(view.getByText(viTrips.pending.status.title)).toBeTruthy();
    expect(view.getByText(viTrips.requestProgress.title)).toBeTruthy();
    expect(view.getByText(viTrips.requestView.policy.cancel)).toBeTruthy();
    expect(view.queryByText(actions.title)).toBeNull();
  });

  it('chờ giữ chỗ ⇒ nút thanh toán KHOÁ tới khi tích ô xác nhận chính sách', async () => {
    mockNavigate.mockClear();
    const view = await renderTrip(
      trip({ stage: CUSTOMER_TRIP_STAGE.AWAITING_HOLD, hold: HOLD, bookingId: null }),
    );

    expect(await view.findByText(viTrips.awaitingHold.page.title)).toBeTruthy();
    expect(view.getByRole('button', { name: PAY_LABEL })).toBeDisabled();

    fireEvent.press(view.getByRole('checkbox'));
    await waitFor(() => expect(view.getByRole('button', { name: PAY_LABEL })).toBeEnabled());
    fireEvent.press(view.getByRole('button', { name: PAY_LABEL }));
    // Đích lấy từ CHÍNH bản đồ route của app đang chạy: Partner không có `/payment/[id]` (ra `/not-available`).
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.booking.payment(trip().id));
  });

  it('đã xác nhận ⇒ "Hẹn bạn vào ngày nhận xe" với checklist nhận xe', async () => {
    const view = await renderTrip(trip({ stage: CUSTOMER_TRIP_STAGE.READY }));

    expect(await view.findByText(viTrips.confirmed.status.title)).toBeTruthy();
    expect(view.getByText(viTrips.confirmed.checklist.title)).toBeTruthy();
    // Tự lái ⇒ có mục bằng lái.
    expect(view.getByText(viTrips.confirmed.checklist.licence.title)).toBeTruthy();
    expect(view.getByText(viTrips.requestView.policy.cancel)).toBeTruthy();
  });

  it('CHỦ XE ở chặng chờ phản hồi ⇒ bố cục chung, không có màn design v2', async () => {
    const view = await renderTrip(
      trip({ role: TRIP_ROLE.HOST, stage: CUSTOMER_TRIP_STAGE.PENDING_APPROVAL }),
    );

    expect(await view.findByText('Toyota Vios 2022')).toBeTruthy();
    expect(view.queryByText(viTrips.pending.page.title)).toBeNull();
  });
});

/*
 * Chuyến ĐANG THUÊ phía khách — cùng khuôn với web `TripActiveView`: thẻ trạng thái kèm giờ trả xe,
 * thông tin người thuê, khối "Cần hỗ trợ?" và KHÔNG có nút huỷ (ADR 0045 điều 1).
 */
describe('TripDetailScreen — chuyến đang thuê', () => {
  it('KHÁCH: thẻ trạng thái + giờ trả xe, người thuê, cần hỗ trợ, không huỷ', async () => {
    const view = await renderTrip(trip({ stage: CUSTOMER_TRIP_STAGE.ACTIVE }));

    expect(await view.findByText(viTrips.detail.activeTitle)).toBeTruthy();
    expect(view.getByText(viTrips.detail.activeReturn)).toBeTruthy();
    expect(view.getByText(viTrips.closed.support.title)).toBeTruthy();
    expect(view.getByText(viTrips.requestView.noteLabel)).toBeTruthy();
    expect(view.queryByText(actions.cancel)).toBeNull();
  });

  it('CHỦ XE: giữ khối cũ, không có "Cần hỗ trợ?"', async () => {
    const view = await renderTrip(
      trip({ role: TRIP_ROLE.HOST, stage: CUSTOMER_TRIP_STAGE.ACTIVE }),
    );

    expect(await view.findByText(viTrips.detail.activeTitle)).toBeTruthy();
    expect(view.queryByText(viTrips.closed.support.title)).toBeNull();
  });
});
