import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { API_ERROR_CODE, BOOKING_HOLD_STATUS } from '@xeprime/types';
import { ApiClientError } from '@xeprime/api-client';
import type { CustomerTripDetail } from '../types';
import { TripPaymentView } from './TripPaymentView';

/**
 * TRANG THANH TOÁN tiền giữ chỗ — \`/payment/:tripId\` (13/10/2026).
 *
 * Điều được khoá: trang nói đúng CHẶNG của khoản giữ chỗ — còn chờ thì mời trả (với đúng mã và số
 * CÒN THIẾU), đã đủ tiền thì báo đặt xe thành công, đã khép thì nói kết cục — và không bao giờ báo
 * thành công vì một lý do nào khác ngoài chính khoản giữ chỗ đã \`paid\` (ADR 0044 điều 2).
 */
const trip = vi.hoisted(() => ({
  data: undefined as unknown,
  isPending: false,
  isError: false,
  error: null as unknown,
  refetch: vi.fn(),
}));

vi.mock('../hooks', () => ({ useTrip: () => trip }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('@/features/payment-gateway/api', () => ({
  fetchGatewayMethods: vi.fn().mockResolvedValue({ target: 'booking_hold', sandbox: false, methods: [] }),
  fetchGatewayOrder: vi.fn(),
  startGatewayCheckout: vi.fn(),
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
};

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

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<TripPaymentView tripId="01TRIP" />, { wrapper });
}

beforeEach(() => {
  trip.data = undefined;
  trip.isPending = false;
  trip.isError = false;
  trip.error = null;
});

describe('TripPaymentView', () => {
  it('khoản còn chờ ⇒ mời trả: đúng mã, đúng số, QR mang sẵn cả hai', () => {
    trip.data = makeTrip();
    const { container } = renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Thanh toán giữ chỗ' })).toBeTruthy();
    expect(screen.getAllByText('XPH23456789').length).toBeGreaterThan(0);
    const src = container.querySelector('img')!.getAttribute('src')!;
    expect(src).toContain('amount=140800');
    expect(src).toContain('des=XPH23456789');
    // Không có nút tự khai đã trả — tiền về thì realtime tự lật trang.
    expect(screen.queryByRole('button', { name: /đã chuyển khoản/i })).toBeNull();
    // Quay lại là về CHUYẾN này.
    expect(screen.getByRole('link', { name: /chi tiết chuyến/i }).getAttribute('href')).toBe(
      '/trips/01TRIP',
    );
  });

  it('đã chuyển thiếu ⇒ QR và số lớn nói phần CÒN THIẾU', () => {
    trip.data = makeTrip({
      hold: { ...HOLD, status: BOOKING_HOLD_STATUS.UNDERPAID, paidAmount: '40800', remainingAmount: '100000' },
    });
    const { container } = renderPage();

    expect(container.querySelector('img')!.getAttribute('src')).toContain('amount=100000');
    expect(screen.getByText('Còn phải chuyển')).toBeTruthy();
    expect(screen.getByText(/Đã nhận/)).toBeTruthy();
  });

  it('khoản đã trả đủ ⇒ ĐẶT XE THÀNH CÔNG, không còn kênh trả nào', () => {
    trip.data = makeTrip({
      hold: { ...HOLD, status: BOOKING_HOLD_STATUS.PAID, paidAmount: '140800', remainingAmount: '0' },
    });
    const { container } = renderPage();

    expect(screen.getByText('Đặt xe thành công')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByText(/chuyển khoản nhanh/i)).toBeNull();
    expect(screen.getByRole('link', { name: /xem chi tiết chuyến/i }).getAttribute('href')).toBe(
      '/trips/01TRIP',
    );
  });

  it('khoản đã hết hạn ⇒ nói kết cục, không mời trả', () => {
    trip.data = makeTrip({ hold: { ...HOLD, status: BOOKING_HOLD_STATUS.EXPIRED } });
    renderPage();

    expect(screen.getByText(/mở lại/)).toBeTruthy();
    expect(screen.queryByText('Đặt xe thành công')).toBeNull();
    expect(screen.queryByText(/chuyển khoản nhanh/i)).toBeNull();
  });

  it('chuyến chưa có khoản giữ chỗ (chờ chủ xe duyệt) ⇒ chưa cần thanh toán', () => {
    trip.data = makeTrip({ hold: null });
    renderPage();

    expect(screen.getByText('Chuyến này chưa cần thanh toán')).toBeTruthy();
  });

  it('chuyến không thuộc tài khoản này ⇒ không tìm thấy, không thử lại', () => {
    trip.isError = true;
    trip.error = new ApiClientError({ code: API_ERROR_CODE.NOT_FOUND, message: 'x', status: 404 });
    renderPage();

    expect(screen.getByText('Không tìm thấy chuyến')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /thử lại/i })).toBeNull();
  });
});
