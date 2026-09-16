import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BOOKING_HOLD_STATUS } from '@xeprime/types';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import viMessages from '../../../../messages/vi';
import type { CustomerTripDetail } from '@/features/trips/types';

/**
 * MÃ QR NGAY SAU KHI GỬI YÊU CẦU — ADR 0039 điều 1.
 *
 * Lỗi thật mà ca này chặn: khách bấm đặt xong nhìn thấy một lời cảm ơn và một nút "Chuyến của
 * tôi", rồi rời đi. Chỗ xe đã bị giữ và đồng hồ mười phút đang chạy, nhưng không ai nói cho họ
 * biết phải trả tiền — nên chuyến chết vì hết hạn chứ không vì họ đổi ý.
 *
 * Kiểm ở mức KHỐI (`HoldStep`) chứ không dựng cả luồng nhiều bước: thứ đang được khoá là "bước
 * cuối có nạp và hiện đúng khoản giữ chỗ của chuyến vừa tạo hay không". Các bước nhập liệu phía
 * trước đã có spec riêng.
 */
const { useTripMock } = vi.hoisted(() => ({ useTripMock: vi.fn() }));

vi.mock('@/features/trips/hooks', () => ({ useTrip: useTripMock }));

const HOLD: NonNullable<CustomerTripDetail['hold']> = {
  id: '01HOLDSTEP',
  code: 'XPH23456789',
  status: BOOKING_HOLD_STATUS.PENDING,
  outcome: null,
  amount: '308000',
  paidAmount: '0',
  remainingAmount: '308000',
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  freeCancelUntil: new Date(Date.now() + 4 * 3600_000).toISOString(),
  paidAt: null,
  allocation: [],
  refund: null,
  paymentInfo: {
    configured: true,
    bankCode: 'VCB',
    accountNumber: '0123456789',
    accountName: 'CONG TY XEPRIME',
  },
};

/**
 * `HoldStep` không được export (nó là chi tiết của bước cuối), nên ca này nhập chính
 * `TripHoldPanel` mà nó dựng lại — cùng một cây DOM, không có bản sao thứ hai để trôi khỏi nhau.
 */
async function renderHoldStep(trip: Partial<CustomerTripDetail> | null, pending = false) {
  useTripMock.mockReturnValue({ data: trip, isPending: pending });
  const { TripHoldPanel } = await import('@/features/trips/components/TripHoldPanel');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="vi" messages={viMessages} timeZone="Asia/Ho_Chi_Minh">
        {trip?.hold ? <TripHoldPanel hold={trip.hold} tripId="01TRIPSTEP" /> : null}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('Bước cuối luồng đặt xe — khối giữ chỗ', () => {
  beforeEach(() => useTripMock.mockReset());

  it('hiện MÃ đối soát và số tiền còn thiếu ngay tại bước cuối', async () => {
    await renderHoldStep({ hold: HOLD });

    // Mã là khoá khớp tiền — thiếu nó thì khoản chuyển đi nằm chờ admin xử lý tay.
    expect(screen.getByText('XPH23456789')).toBeTruthy();
    await waitFor(() => expect(screen.getByAltText(/mã qr/i)).toBeTruthy());
  });

  /**
   * QR phải mang SẴN số tiền và nội dung: khách không bao giờ gõ tay mã đối soát, vì một ký tự
   * sai là một khoản tiền không khớp được (ADR 0016 điều 5).
   */
  it('QR mang sẵn số tiền và nội dung chuyển khoản', async () => {
    await renderHoldStep({ hold: HOLD });

    const qr = screen.getByAltText(/mã qr/i) as HTMLImageElement;
    expect(qr.src).toContain('VCB-0123456789');
    expect(qr.src).toContain('amount=308000');
    expect(qr.src).toContain('addInfo=XPH23456789');
  });

  it('đã chuyển một phần ⇒ hiện số CÒN LẠI, không phải tổng', async () => {
    await renderHoldStep({
      hold: {
        ...HOLD,
        status: BOOKING_HOLD_STATUS.UNDERPAID,
        paidAmount: '100000',
        remainingAmount: '208000',
      },
    });

    const qr = screen.getByAltText(/mã qr/i) as HTMLImageElement;
    expect(qr.src).toContain('amount=208000');
    expect(qr.src).not.toContain('amount=308000');
  });
});
