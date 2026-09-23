import { fireEvent, render, screen } from '@testing-library/react';
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
 * Ba điều được khoá, và cả ba đều hỏng thành TIỀN nếu sai:
 *
 *  1. **Số hiện lên là số CÒN THIẾU, không phải tổng.** Khách đã chuyển một phần mà màn hình vẫn
 *     đòi cả tổng thì họ chuyển thừa, và phần thừa phải đi qua đường hoàn thủ công.
 *  2. **Mã đối soát luôn hiện và copy được.** Nội dung chuyển khoản là khoá khớp tiền; gõ sai một
 *     ký tự là một khoản nằm chờ admin xử lý tay.
 *  3. **Chưa cấu hình tài khoản nhận ⇒ KHÔNG dựng QR**, nhưng vẫn hiện mã và số tiền — có gì hiện
 *     nấy, không bao giờ một QR trỏ vào hư không.
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
  it('hiện mã đối soát, số tiền và QR mang sẵn số + nội dung', () => {
    const { container } = renderPanel(BASE);

    expect(screen.getByText('XPH23456789')).toBeTruthy();
    const qr = container.querySelector('img');
    expect(qr).not.toBeNull();
    const src = qr!.getAttribute('src')!;
    // QR phải mang SẴN số tiền và nội dung — khách không gõ gì (ADR 0016 điều 5).
    expect(src).toContain('VCB-0123456789');
    expect(src).toContain('amount=100000');
    expect(src).toContain('addInfo=XPH23456789');
  });

  it('đã chuyển THIẾU ⇒ hiện số CÒN LẠI, không phải tổng', () => {
    const { container } = renderPanel({
      ...BASE,
      status: BOOKING_HOLD_STATUS.UNDERPAID,
      paidAmount: '40000',
      remainingAmount: '60000',
    });

    expect(container.querySelector('img')!.getAttribute('src')).toContain('amount=60000');
    // Và nói rõ đã nhận bao nhiêu, để khách không tưởng tiền đã mất.
    expect(screen.getByText(/Đã nhận/)).toBeTruthy();
  });

  it('chưa cấu hình tài khoản nhận ⇒ KHÔNG có QR nhưng vẫn có mã + số tiền', () => {
    const { container } = renderPanel({
      ...BASE,
      paymentInfo: { configured: false, bankCode: null, accountNumber: null, accountName: null },
    });

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('XPH23456789')).toBeTruthy();
  });

  it('nói rõ phần còn lại trả TRỰC TIẾP chủ xe (ADR 0028 điều 7A)', () => {
    renderPanel(BASE);
    expect(screen.getByText(/trả trực tiếp chủ xe/i)).toBeTruthy();
  });

  /**
   * "Tôi đã chuyển khoản" KHÔNG được nói chuyến đã xong (ADR 0044 điều 2).
   *
   * Xác nhận thành công vì một cú bấm là cách nhanh nhất để khách rời đi trong lúc tiền chưa về
   * — rồi chỗ tự nhả và không ai hiểu vì sao. Màn hình chỉ được đổi sang "đang đối soát".
   */
  it('bấm "Tôi đã chuyển khoản" ⇒ ĐANG ĐỐI SOÁT, không phải đã thanh toán', () => {
    renderPanel(BASE);

    fireEvent.click(screen.getByRole('button', { name: /đã chuyển khoản/i }));

    expect(screen.getByText(/đang đối soát/i)).toBeTruthy();
    // Không có câu nào nói chuyến đã xác nhận — tiền vẫn chưa về.
    expect(screen.queryByText(/đã được xác nhận/i)).toBeNull();
    // Mã và số tiền VẪN còn: khách có thể cần chuyển bù, và đây không phải trạng thái kết thúc.
    expect(screen.getByText('XPH23456789')).toBeTruthy();
  });

  /**
   * QR hỏng không được biến khối này thành một khung trắng: mọi thứ cần để chuyển tay vẫn nằm
   * ngay cạnh, và khách phải được nói rằng dùng chúng.
   */
  it('ảnh QR lỗi ⇒ nói thẳng và chỉ sang thông tin chuyển tay', () => {
    const { container } = renderPanel(BASE);

    fireEvent.error(container.querySelector('img')!);

    expect(screen.getByText(/không tải được mã qr/i)).toBeTruthy();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('XPH23456789')).toBeTruthy();
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
