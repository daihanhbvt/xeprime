import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
// Tin đăng của xe — chỉ hộp "Thanh toán thành công" đọc (thẻ chuyến); tin đã ẩn thì thẻ đọc từ chuyến.
vi.mock('@/features/marketplace/hooks/use-listing-detail', () => ({
  useListingDetail: () => ({ data: undefined, isLoading: false }),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
// Hộp "Thanh toán thành công" có nút nhắn chủ xe — nút đó tự mời đăng nhập khi phiên mất.
vi.mock('@/features/auth/components/AuthModalProvider', () => ({
  useAuthModal: () => ({ open: vi.fn() }),
  useNextFromCurrentPath: () => '/payment/01TRIP',
}));
const gatewayMethods = vi.hoisted(() => ({ methods: [] as unknown[] }));
vi.mock('@/features/payment-gateway/api', () => ({
  fetchGatewayMethods: vi.fn(async () => ({
    target: 'booking_hold',
    sandbox: false,
    methods: gatewayMethods.methods,
  })),
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
  freeCancelAvailable: true,
  freeCancelStarted: false,
  freeCancelMinutes: 120,
  lateCancelRefundAmount: '0',
  paidAt: null,
  paidVia: null,
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
    shop: { name: 'Anh Kiên', slug: 'anh-kien', ratingAvg: 0, ratingCount: 0, phone: null },
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
  gatewayMethods.methods = [];
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
    // Quay lại (mũi tên + breadcrumb) và "Xem chi tiết" của thẻ thanh toán đều về CHUYẾN này.
    const back = screen.getAllByRole('link', { name: /chi tiết chuyến/i });
    expect(back.length).toBeGreaterThan(0);
    for (const link of back) expect(link.getAttribute('href')).toBe('/trips/01TRIP');
    expect(screen.getByRole('link', { name: 'Xem chi tiết' }).getAttribute('href')).toBe(
      '/trips/01TRIP',
    );
  });

  it('đã chuyển thiếu ⇒ QR và số lớn nói phần CÒN THIẾU', () => {
    trip.data = makeTrip({
      hold: {
        ...HOLD,
        status: BOOKING_HOLD_STATUS.UNDERPAID,
        paidAmount: '40800',
        remainingAmount: '100000',
      },
    });
    const { container } = renderPage();

    expect(container.querySelector('img')!.getAttribute('src')).toContain('amount=100000');
    expect(screen.getByText('Tiền giữ chỗ còn thiếu')).toBeTruthy();
    expect(screen.getByText(/Đã nhận/)).toBeTruthy();
  });

  it('khoản đã trả đủ ⇒ ĐẶT XE THÀNH CÔNG, không còn kênh trả nào', () => {
    trip.data = makeTrip({
      hold: {
        ...HOLD,
        status: BOOKING_HOLD_STATUS.PAID,
        paidAmount: '140800',
        remainingAmount: '0',
        // Vừa trả xong (realtime vừa lật trang) ⇒ hộp chúc mừng mở.
        paidAt: new Date().toISOString(),
      },
    });
    const { container } = renderPage();

    expect(screen.getByText('Đặt xe thành công')).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByText(/chuyển khoản nhanh/i)).toBeNull();

    // Hộp "Thanh toán thành công" (Figma `19759:38196`) mở sẵn đè lên trang.
    const dialog = screen.getByRole('dialog', { name: 'Thanh toán thành công' });
    // Không biết kênh (dữ liệu cũ / nhiều kênh) ⇒ không gọi tên kênh nào.
    expect(within(dialog).getByText(/Hệ thống đã ghi nhận 140.800.*!/)).toBeTruthy();
    expect(within(dialog).queryByText(/ qua /)).toBeNull();
    expect(within(dialog).getByText('01TRIP')).toBeTruthy();
    // Figma: Quay lại · Nhắn tin cho chủ xe · Chuyến đi của tôi (nút chính).
    expect(within(dialog).getByRole('button', { name: /Quay lại/ })).toBeTruthy();
    expect(
      within(dialog).getByRole('link', { name: 'Chuyến đi của tôi' }).getAttribute('href'),
    ).toBe('/trips');
  });

  it('đã trả đủ qua một cổng ⇒ hộp thành công gọi đúng tên kênh, kèm phần trả chủ xe', () => {
    trip.data = makeTrip({
      hold: {
        ...HOLD,
        status: BOOKING_HOLD_STATUS.PAID,
        paidAmount: '140800',
        remainingAmount: '0',
        // Vừa trả xong (realtime vừa lật trang) ⇒ hộp chúc mừng mở.
        paidAt: new Date().toISOString(),
        paidVia: 'vnpay',
      },
      finance: { payAtPickupAmount: '1000000' },
    } as Partial<CustomerTripDetail>);
    renderPage();

    const dialog = screen.getByRole('dialog', { name: 'Thanh toán thành công' });
    expect(within(dialog).getByText(/Hệ thống đã ghi nhận 140.800.* qua VNPAY!/)).toBeTruthy();
    expect(within(dialog).getByText('Cần thanh toán cho chủ xe')).toBeTruthy();
    expect(within(dialog).getByText(/1.000.000/)).toBeTruthy();
  });

  it('có cổng ví đang mở ⇒ thẻ "Ví điện tử"; chọn ví thì nút trả đổi theo ví', async () => {
    gatewayMethods.methods = [{ provider: 'momo', minAmount: '1000', maxAmount: '50000000' }];
    trip.data = makeTrip();
    renderPage();

    // VietQR mở sẵn; ví gập lại cho tới khi khách mở.
    const walletToggle = await screen.findByRole('button', { name: /Ví điện tử/ });
    expect(walletToggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(walletToggle);
    expect(walletToggle.getAttribute('aria-expanded')).toBe('true');
    // Chỉ một thẻ mở một lúc.
    expect(
      screen.getByRole('button', { name: /Chuyển khoản nhanh/ }).getAttribute('aria-expanded'),
    ).toBe('false');

    expect(screen.getByText('Thanh toán nhanh, tiện lợi')).toBeTruthy();
    fireEvent.click(screen.getByRole('radio'));
    expect(screen.getByRole('button', { name: 'Thanh toán qua Ví MoMo' })).toBeTruthy();
  });

  it('không có cổng ví nào ⇒ không có thẻ "Ví điện tử" (ẩn hẳn, không phải nút xám)', () => {
    trip.data = makeTrip();
    renderPage();
    expect(screen.queryByRole('button', { name: /Ví điện tử/ })).toBeNull();
    expect(screen.getByText('Thông tin thanh toán')).toBeTruthy();
  });

  it('mở lại trang của một khoản đã trả từ lâu ⇒ chỉ còn kết cục, KHÔNG chúc mừng lần hai', () => {
    trip.data = makeTrip({
      hold: {
        ...HOLD,
        status: BOOKING_HOLD_STATUS.PAID,
        paidAmount: '140800',
        remainingAmount: '0',
        paidAt: new Date(Date.now() - 3 * 86400_000).toISOString(),
      },
    });
    renderPage();

    expect(screen.getByText('Đặt xe thành công')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Thanh toán thành công' })).toBeNull();
  });

  it('chuyển THỪA ⇒ khoản hoàn + lối khai tài khoản nhận, cả trên trang lẫn trong hộp', () => {
    trip.data = makeTrip({
      hold: {
        ...HOLD,
        status: BOOKING_HOLD_STATUS.PAID,
        paidAmount: '281600',
        remainingAmount: '0',
        paidAt: new Date().toISOString(),
        refund: {
          id: '01REFUND',
          status: 'pending',
          reason: 'overpaid',
          amount: '140800',
          hasAccount: false,
          accountHint: null,
          paidAt: null,
          bankReference: null,
        },
      },
    });
    renderPage();

    // Một lời trên trang + một lời trong hộp thành công.
    expect(screen.getAllByText(/Có 140.800.* chờ hoàn/).length).toBe(2);
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
