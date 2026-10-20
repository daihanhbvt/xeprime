import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react-native';
import { Provider as ReduxProvider } from 'react-redux';
import { API_ERROR_CODE, BOOKING_HOLD_STATUS } from '@xeprime/types';
import { ApiClientError } from '@xeprime/api-client';
import { withIntl } from '@/i18n/test-utils';
import { store } from '@/store';
import type { CustomerTripDetail } from './api';
import { TripPaymentScreen } from './TripPaymentScreen';

/**
 * MÀN THANH TOÁN tiền giữ chỗ — bản native của `TripPaymentView.test.tsx` (web, 13/10/2026).
 *
 * Khoá: màn nói đúng CHẶNG của khoản giữ chỗ — còn chờ thì mời trả (đúng mã, số CÒN THIẾU), đã đủ
 * tiền thì báo đặt xe thành công, đã khép thì nói kết cục — và không bao giờ báo thành công vì lý
 * do nào khác ngoài chính khoản giữ chỗ đã `paid` (ADR 0044 điều 2).
 */
const mockTrip: {
  data: unknown;
  isPending: boolean;
  isError: boolean;
  isRefetching: boolean;
  error: unknown;
  refetch: jest.Mock;
} = {
  data: undefined,
  isPending: false,
  isError: false,
  isRefetching: false,
  error: null,
  refetch: jest.fn(),
};

/** Đồng hồ cần điều hướng (`useFocusEffect`) — có test riêng, ở đây chỉ cần nó không vẽ gì. */
jest.mock('@/components/ui/Countdown', () => ({ Countdown: () => null }));

jest.mock('./hooks/use-trips', () => ({ useTrip: () => mockTrip }));

jest.mock('expo-router', () => ({
  useNavigation: () => ({ isFocused: () => true }),
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), setParams: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

/** Lối cổng có test riêng (`TripGatewayPay.test.tsx`) — ở đây chỉ cần nó không vẽ gì. */
jest.mock('@/features/payment-gateway/components/TripGatewayPay', () => ({
  useTripGateway: () => ({}),
  TripGatewayNotice: () => null,
  TripGatewayPay: () => null,
}));

const HOLD: NonNullable<CustomerTripDetail['hold']> = {
  id: '01HOLD',
  code: 'XPH23456789',
  status: BOOKING_HOLD_STATUS.PENDING,
  outcome: null,
  amount: '140800',
  paidAmount: '0',
  remainingAmount: '140800',
  expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  freeCancelUntil: new Date(Date.now() + 4 * 3600_000).toISOString(),
  paidAt: null,
  allocation: [],
  refund: null,
  paymentInfo: {
    configured: true,
    bankCode: 'VCB',
    accountNumber: '0123456789',
    accountName: 'XE PRIME',
  },
} as unknown as NonNullable<CustomerTripDetail['hold']>;

function makeTrip(over: Partial<CustomerTripDetail> = {}): CustomerTripDetail {
  return {
    id: '01TRIP',
    vehicle: { id: 'V1', name: 'Hyundai Accent 2021', imageUrl: null, plateNumber: '51H-123.45' },
    pickupAt: '2026-10-21T10:00:00.000Z',
    returnAt: '2026-10-22T03:00:00.000Z',
    serviceType: 'self_drive',
    estimate: null,
    hold: HOLD,
    ...over,
  } as unknown as CustomerTripDetail;
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <ReduxProvider store={store}>
        <QueryClientProvider client={client}>
          <TripPaymentScreen tripId="01TRIP" />
        </QueryClientProvider>
      </ReduxProvider>,
    ),
  );
}

beforeEach(() => {
  mockTrip.data = undefined;
  mockTrip.isPending = false;
  mockTrip.isError = false;
  mockTrip.error = null;
});
afterEach(cleanup);

describe('TripPaymentScreen', () => {
  it('khoản còn chờ ⇒ mời trả: đúng mã, đúng số, không có nút tự khai đã trả', async () => {
    mockTrip.data = makeTrip();
    await renderScreen();

    expect(screen.getByText('Thanh toán giữ chỗ')).toBeTruthy();
    expect(screen.getAllByText('XPH23456789').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Mã VietQR chuyển khoản')).toBeTruthy();
    expect(screen.queryByText(/đã chuyển khoản/i)).toBeNull();
  });

  it('đã chuyển thiếu ⇒ số lớn nói phần CÒN THIẾU', async () => {
    mockTrip.data = makeTrip({
      hold: {
        ...HOLD,
        status: BOOKING_HOLD_STATUS.UNDERPAID,
        paidAmount: '40800',
        remainingAmount: '100000',
      },
    });
    await renderScreen();

    expect(screen.getByText('Còn phải chuyển')).toBeTruthy();
    expect(screen.getByText(/Đã nhận/)).toBeTruthy();
  });

  it('khoản đã trả đủ ⇒ ĐẶT XE THÀNH CÔNG, không còn kênh trả nào', async () => {
    mockTrip.data = makeTrip({
      hold: {
        ...HOLD,
        status: BOOKING_HOLD_STATUS.PAID,
        paidAmount: '140800',
        remainingAmount: '0',
      },
    });
    await renderScreen();

    expect(screen.getByText('Đặt xe thành công')).toBeTruthy();
    expect(screen.queryByLabelText('Mã VietQR chuyển khoản')).toBeNull();
    expect(screen.queryByText(/chuyển khoản nhanh/i)).toBeNull();
    expect(screen.getByText('Xem chi tiết chuyến')).toBeTruthy();
  });

  it('khoản đã hết hạn ⇒ nói kết cục, không mời trả', async () => {
    mockTrip.data = makeTrip({ hold: { ...HOLD, status: BOOKING_HOLD_STATUS.EXPIRED } });
    await renderScreen();

    expect(screen.queryByText('Đặt xe thành công')).toBeNull();
    expect(screen.queryByText(/chuyển khoản nhanh/i)).toBeNull();
  });

  it('chuyến chưa có khoản giữ chỗ ⇒ chưa cần thanh toán', async () => {
    mockTrip.data = makeTrip({ hold: null });
    await renderScreen();

    expect(screen.getByText('Chuyến này chưa cần thanh toán')).toBeTruthy();
  });

  it('chuyến không thuộc tài khoản này ⇒ không tìm thấy, không thử lại', async () => {
    mockTrip.isError = true;
    mockTrip.error = new ApiClientError({
      code: API_ERROR_CODE.NOT_FOUND,
      message: 'x',
      status: 404,
    });
    await renderScreen();

    expect(screen.getByText('Không tìm thấy chuyến')).toBeTruthy();
    expect(screen.queryByText(/thử lại/i)).toBeNull();
  });
});
