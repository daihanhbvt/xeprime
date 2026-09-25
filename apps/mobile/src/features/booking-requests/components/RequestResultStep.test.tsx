import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { Provider as ReduxProvider } from 'react-redux';
import { BOOKING_REQUEST_STATUS, type PublicListingDetail } from '@xeprime/types';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import type { BookingRequestFormValues } from '../booking-schema';
import type { BookingRequestReceipt, PublicQuote } from '../api';
import { RequestResultStep } from './RequestResultStep';

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
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

const listing = { id: 'v1', name: 'Mazda3 2020' } as unknown as PublicListingDetail;

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
});
