import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render } from '@testing-library/react-native';
import { Provider as ReduxProvider } from 'react-redux';
import { BOOKING_REQUEST_STATUS, RENTAL_MODE, type PublicListingDetail } from '@xeprime/types';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import type { BookingRequestFormValues } from '../booking-schema';
import type { BookingRequestReceipt, PublicQuote } from '../api';
import { RequestResultStep } from './RequestResultStep';

/** Đồng hồ cần điều hướng (`useFocusEffect`) — có test riêng, ở đây chỉ cần nó không vẽ gì. */
jest.mock('@/components/ui/Countdown', () => ({ Countdown: () => null }));

const mockRouter = { push: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => mockRouter,
}));

/* Vỏ đầu trang + nút chat cần phiên/chat realtime — không thuộc phạm vi con số ở màn này. */
jest.mock('@/components/layout/HeaderActions', () => ({ HeaderActions: () => null }));
jest.mock('@/features/chat/components/ChatWithShopButton', () => ({
  ChatWithShopButton: () => null,
}));
jest.mock('@/features/locations/hooks/use-address-preview', () => ({
  useAddressPreview: () => null,
}));

const values = {
  serviceType: 'self_drive',
  pickupAt: '2026-10-01T02:00:00.000Z',
  returnAt: '2026-10-03T02:00:00.000Z',
  deliveryRequested: false,
} as unknown as BookingRequestFormValues;

const listing = {
  id: 'v1',
  name: 'Mazda3 2020',
  shopName: 'Xe Sài Gòn',
  pickupPoint: { branchName: 'Chi nhánh Q1', address: '12 Lê Lợi, Quận 1' },
} as unknown as PublicListingDetail;

const receipt = {
  id: '01JQZX000000000000000000RQ',
  status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
  autoAccepted: false,
} as unknown as BookingRequestReceipt;

/**
 * Báo giá ĐÃ ÁP MÃ — thứ `RequestBookingScreen` truyền xuống (`quoteWithPromo`).
 *
 * `totalAmount` (B, tiền thuê) = 1.000.000; khách phải chuẩn bị `customerTotalAmount` = 950.000 sau
 * khi trừ mã 100.000 và cộng phí dịch vụ. Màn kết quả phải nói con số THỨ HAI — đúng web.
 */
const quoteWithPromo = {
  breakdown: {
    totalAmount: '1000000',
    estimateNote: null,
    fees: { customerTotalAmount: '950000' },
  },
} as unknown as PublicQuote;

async function renderResult(quote: PublicQuote | null) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <ReduxProvider store={store}>
        <QueryClientProvider client={queryClient}>
          <RequestResultStep
            duplicate={false}
            receipt={receipt}
            values={values}
            rentalMode={RENTAL_MODE.DAILY}
            listing={listing}
            quote={quote}
            onClose={jest.fn()}
          />
        </QueryClientProvider>
      </ReduxProvider>,
    ),
  );
}

/*
 * Bản trước tự gọi lại BÁO GIÁ CÔNG KHAI ở màn này — báo giá đó không nhận mã khuyến mãi, nên tổng
 * ở màn "đã gửi" là nguyên giá trong khi bảng giá khách vừa bấm qua đã trừ mã.
 */
describe('RequestResultStep — tổng dự kiến đọc báo giá ĐÃ ÁP MÃ', () => {
  it('hiện customerTotalAmount của bảng phí đã áp mã, không phải tiền thuê B', async () => {
    const view = await renderResult(quoteWithPromo);

    expect(await view.findByText('950.000 ₫')).toBeTruthy();
    expect(view.queryByText('1.000.000 ₫')).toBeNull();
  });

  it('không có báo giá thì không dựng dòng tổng', async () => {
    const view = await renderResult(null);

    expect(await view.findByText('Mazda3 2020')).toBeTruthy();
    expect(view.queryByText(/₫/)).toBeNull();
  });

  it('thẻ chuyến đầy đủ như web: điểm nhận xe thật, chủ xe, tóm tắt dịch vụ · thời lượng', async () => {
    const view = await renderResult(null);

    expect(await view.findByText('Chi nhánh Q1 · 12 Lê Lợi, Quận 1')).toBeTruthy();
    expect(view.getByText('Xe Sài Gòn')).toBeTruthy();
    expect(view.getByText(/^Thuê theo ngày · /)).toBeTruthy();
  });
});

describe('RequestResultStep — chạm trần giữ chỗ (HOLD_LIMIT_REACHED)', () => {
  function renderLimit(
    unpaid?: Parameters<typeof RequestResultStep>[0]['unpaidHolds'],
    onLeave?: () => void,
  ) {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      withIntl(
        <ReduxProvider store={store}>
          <QueryClientProvider client={queryClient}>
            <RequestResultStep
              holdLimit
              unpaidHolds={unpaid}
              duplicate={false}
              receipt={null}
              values={values}
              rentalMode={RENTAL_MODE.DAILY}
              listing={listing}
              quote={null}
              onClose={jest.fn()}
              onLeave={onLeave}
            />
          </QueryClientProvider>
        </ReduxProvider>,
      ),
    );
  }

  it('"Thanh toán" THAY luồng đặt xe bị chặn (replace) — nút lui không quay về form', async () => {
    mockRouter.push.mockClear();
    mockRouter.replace.mockClear();
    const onLeave = jest.fn();
    const view = await renderLimit(
      {
        limit: 1,
        limitReached: true,
        items: [
          {
            tripId: 'T1',
            code: 'XPH00000001',
            vehicleName: 'Xe số 1',
            vehicleImageUrl: null,
            pickupAt: null,
            returnAt: null,
            remainingAmount: '176000',
            expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
          },
        ],
      },
      onLeave,
    );
    fireEvent.press(view.getByLabelText('Thanh toán chuyến Xe số 1'));
    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it('có lời nhắc ⇒ nói trần và liệt kê từng chuyến chờ trả', async () => {
    const view = await renderLimit({
      limit: 3,
      limitReached: true,
      items: [
        {
          tripId: 'T1',
          code: 'XPH00000001',
          vehicleName: 'Xe số 1',
          vehicleImageUrl: null,
          pickupAt: null,
          returnAt: null,
          remainingAmount: '176000',
          expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        },
      ],
    });
    expect(view.getByText('Bạn đã giữ tối đa 3 chuyến chưa thanh toán')).toBeTruthy();
    expect(view.getByText('Xe số 1')).toBeTruthy();
  });

  it('không đọc được lời nhắc (chưa có phiên) ⇒ câu dự phòng', async () => {
    const view = await renderLimit(undefined);
    expect(view.getByText(/quá nhiều chuyến chờ thanh toán/i)).toBeTruthy();
  });
});
