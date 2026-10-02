import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { Provider as ReduxProvider } from 'react-redux';
import { CUSTOMER_TRIP_STAGE, TRIP_ROLE, type CustomerTripStage } from '@xeprime/types';
import viTrips from '@xeprime/domain/messages/vi/trips.json';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import { tripsApi, type CustomerTripDetail } from './api';
import { TripDetailScreen } from './TripDetailScreen';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

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
  it('KHÁCH, chuyến chưa giao: có khối hỗ trợ và nút Huỷ', async () => {
    const view = await renderTrip(trip());

    expect(await view.findByText(actions.title)).toBeTruthy();
    expect(view.getByText(actions.cancel)).toBeTruthy();
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
  it.each<CustomerTripStage>([CUSTOMER_TRIP_STAGE.CANCELLED, CUSTOMER_TRIP_STAGE.REJECTED])(
    'chặng %s, chưa có mốc bàn giao: KHÔNG gọi API bằng chứng',
    async (stage) => {
      const view = await renderTrip(trip({ stage }));

      expect(await view.findByText('Toyota Vios 2022')).toBeTruthy();
      expect(view.evidenceSpy).not.toHaveBeenCalled();
    },
  );

  it('đã có mốc nhận xe thật: gọi API bằng chứng', async () => {
    const view = await renderTrip(
      trip({ stage: CUSTOMER_TRIP_STAGE.ACTIVE, actualPickupAt: '2026-10-01T02:05:00.000Z' }),
    );

    await waitFor(() => expect(view.evidenceSpy).toHaveBeenCalledWith(trip().id));
  });
});
