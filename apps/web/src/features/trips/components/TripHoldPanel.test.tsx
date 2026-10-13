import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BOOKING_HOLD_STATUS, HOLD_REFUND_STATUS } from '@xeprime/types';
import { describe, expect, it } from 'vitest';
import viMessages from '../../../../messages/vi';
import { TripHoldPanel } from './TripHoldPanel';
import type { CustomerTripDetail } from '../types';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/**
 * Khoản giữ chỗ nhìn từ phía KHÁCH — R3, ADR 0028 điều 6–7.
 *
 * Hai điều được khoá, và cả hai đều hỏng thành TIỀN nếu sai:
 *
 *  1. **Số hiện lên là số CÒN THIẾU, không phải tổng.** Khách đã chuyển một phần mà màn hình vẫn
 *     đòi cả tổng thì họ chuyển thừa, và phần thừa phải đi qua đường hoàn thủ công.
 *  2. **Lối trả dẫn tới trang thanh toán của ĐÚNG chuyến.** QR, mã đối soát và ví điện tử nằm ở
 *     đó — xem `CheckoutPanel.test.tsx`.
 */
const BASE: Hold = {
  id: '01HOLD',
  code: 'XPH23456789',
  status: BOOKING_HOLD_STATUS.PENDING,
  outcome: null,
  amount: '100000',
  paidAmount: '0',
  remainingAmount: '100000',
  expiresAt: '2026-09-08T03:00:00.000Z',
  freeCancelUntil: '2026-09-16T03:00:00.000Z',
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

function renderPanel(hold: Hold) {
  return render(
    <NextIntlClientProvider locale="vi" messages={viMessages} timeZone="Asia/Ho_Chi_Minh">
      <TripHoldPanel hold={hold} tripId="01TRIPTEST" />
    </NextIntlClientProvider>,
  );
}

describe('TripHoldPanel — đang chờ tiền', () => {
  /**
   * Từ 13/10/2026 việc TRẢ nằm ở trang thanh toán riêng (`/payment/:id`). Khối này ở trang chuyến
   * chỉ nói bao nhiêu, trước khi nào, và MỘT lối sang đó — không mã QR thứ hai (hai chỗ trả là hai
   * chỗ để số tiền hoặc nội dung chuyển khoản trôi khỏi nhau).
   */
  it('hiện số tiền và một nút sang TRANG THANH TOÁN của đúng chuyến — không QR', () => {
    const { container } = renderPanel(BASE);

    expect(screen.getByText(/100.000/)).toBeTruthy();
    const pay = screen.getByRole('link', { name: /thanh toán ngay/i });
    expect(pay.getAttribute('href')).toBe('/payment/01TRIPTEST');
    expect(container.querySelector('img')).toBeNull();
  });

  it('đã chuyển THIẾU ⇒ hiện số CÒN LẠI, không phải tổng', () => {
    renderPanel({
      ...BASE,
      status: BOOKING_HOLD_STATUS.UNDERPAID,
      paidAmount: '40000',
      remainingAmount: '60000',
    });

    expect(screen.getByText(/60.000/)).toBeTruthy();
    // Và nói rõ đã nhận bao nhiêu, để khách không tưởng tiền đã mất.
    expect(screen.getByText(/Đã nhận/)).toBeTruthy();
  });

  it('nói rõ phần còn lại trả TRỰC TIẾP chủ xe (ADR 0028 điều 7A)', () => {
    renderPanel(BASE);
    expect(screen.getByText(/trả trực tiếp chủ xe/i)).toBeTruthy();
  });

  /** Đồng hồ đọc mốc của SERVER — không có đường nào để client tự tính lại một hạn tiền. */
  it('đồng hồ đếm ngược tới đúng mốc server trả về', () => {
    renderPanel({ ...BASE, expiresAt: new Date(Date.now() + 90 * 60_000).toISOString() });
    expect(screen.getByText(/còn lại để thanh toán/i)).toBeTruthy();
  });
});

describe('TripHoldPanel — đã chốt', () => {
  it('đã trả đủ ⇒ báo CHUYẾN ĐÃ XÁC NHẬN, không còn ô chuyển khoản', () => {
    const { container } = renderPanel({
      ...BASE,
      status: BOOKING_HOLD_STATUS.PAID,
      paidAmount: '100000',
      remainingAmount: '0',
    });
    expect(container.querySelector('img')).toBeNull();
    /*
     * Chữ ở chặng này ĐỔI cùng thứ tự luồng (ADR 0044): tiền chỉ được thu sau khi chuyến đã
     * được nhận, nên trả đủ nghĩa là ĐƠN THUÊ đã ra đời — không còn chặng 'đã giữ chỗ, chờ chủ
     * xe xác nhận' nào nữa.
     */
    expect(screen.getByText(/đã được xác nhận/i)).toBeTruthy();
  });

  it('hết hạn ⇒ nói chỗ đã mở lại, gợi ý đặt chuyến khác', () => {
    renderPanel({ ...BASE, status: BOOKING_HOLD_STATUS.EXPIRED });
    expect(screen.getByText(/mở lại/)).toBeTruthy();
  });

  it('có khoản hoàn ĐANG CHỜ tài khoản ⇒ mời khai NGAY tại chỗ, không đẩy đi hỗ trợ', () => {
    renderPanel({
      ...BASE,
      status: BOOKING_HOLD_STATUS.RELEASED,
      paidAmount: '100000',
      refund: {
        id: '01REF',
        status: HOLD_REFUND_STATUS.PENDING,
        reason: 'early_cancel',
        amount: '100000',
        hasAccount: false,
        accountHint: null,
        paidAt: null,
        bankReference: null,
      },
    });
    expect(screen.getByText(/chờ hoàn/)).toBeTruthy();
    // Trước ADR 0033 chỗ này chỉ nói "liên hệ hỗ trợ" và luồng hoàn tiền tắc ở đúng đây.
    expect(screen.getByRole('button', { name: /tài khoản nhận/i })).toBeTruthy();
  });

  it('hoàn ĐÃ CHUYỂN ⇒ báo đã hoàn kèm số tiền', () => {
    renderPanel({
      ...BASE,
      status: BOOKING_HOLD_STATUS.RELEASED,
      refund: {
        id: '01REF',
        status: HOLD_REFUND_STATUS.PAID,
        reason: 'early_cancel',
        amount: '100000',
        hasAccount: true,
        accountHint: '••••6789',
        paidAt: '2026-09-08T03:00:00.000Z',
        bankReference: 'FT-OUT-1',
      },
    });
    expect(screen.getByText(/đã hoàn/i)).toBeTruthy();
  });
});
