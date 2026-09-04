import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUBSCRIPTION_INVOICE_STATUS } from '@xeprime/types';

import type { PaymentInfo, SubscriptionInvoice } from '../types';
import { InvoicePaymentPanel } from './InvoicePaymentPanel';

/**
 * Bảng hướng dẫn chuyển khoản của một hoá đơn gói (R2).
 *
 * Ba điều được khoá — cả ba đều là chỗ mà sai thì TIỀN đi lạc:
 *
 *  1. **QR mang đúng số tiền và đúng mã** (ADR 0016 điều 5: không bao giờ để người dùng tự gõ
 *     nội dung). Với hoá đơn trả một phần, số trên QR là SỐ CÒN THIẾU — không phải tổng.
 *  2. **Chưa cấu hình tài khoản nhận thì KHÔNG có QR** — một QR trỏ vào tài khoản rỗng tệ hơn
 *     không có QR; mã + số tiền vẫn hiện để chuyển tay.
 *  3. Mã đối soát luôn hiện kèm nút sao chép — nó là khoá đối soát duy nhất.
 */
const paymentInfo = vi.hoisted(() => ({
  data: undefined as PaymentInfo | undefined,
  isLoading: false,
  isError: false,
}));

vi.mock('../hooks/use-subscription', () => ({
  usePaymentInfo: () => paymentInfo,
}));

function makeInvoice(over: Partial<SubscriptionInvoice> = {}): SubscriptionInvoice {
  return {
    id: '01HINVOICE00000000000000',
    code: 'XPG2K9ADFG',
    status: SUBSCRIPTION_INVOICE_STATUS.ISSUED,
    totalAmount: '3000000',
    paidAmount: '0',
    subtotal: '3000000',
    discountAmount: '0',
    periodFrom: '2026-09-03T00:00:00.000Z',
    periodTo: '2026-12-03T00:00:00.000Z',
    expiresAt: '2026-09-06T00:00:00.000Z',
    createdAt: '2026-09-03T00:00:00.000Z',
    ...over,
  } as SubscriptionInvoice;
}

const CONFIGURED: PaymentInfo = {
  configured: true,
  bankCode: 'MB',
  accountNumber: '0123456789',
  accountName: 'CONG TY XEPRIME',
};

beforeEach(() => {
  paymentInfo.data = CONFIGURED;
});

afterEach(cleanup);

describe('InvoicePaymentPanel', () => {
  it('đã cấu hình: QR mang ĐÚNG số tiền + mã đối soát, kèm thông tin tài khoản', () => {
    render(<InvoicePaymentPanel invoice={makeInvoice()} />);

    const qr = screen.getByRole('img', { name: 'Mã VietQR chuyển khoản thanh toán gói' });
    const src = qr.getAttribute('src')!;
    expect(src).toContain('img.vietqr.io/image/MB-0123456789');
    expect(src).toContain('amount=3000000');
    expect(src).toContain('addInfo=XPG2K9ADFG');

    expect(screen.getByText('0123456789')).toBeTruthy();
    expect(screen.getByText('CONG TY XEPRIME')).toBeTruthy();
    expect(screen.getByText('XPG2K9ADFG')).toBeTruthy();
  });

  it('trả MỘT PHẦN: QR và số tiền hiện SỐ CÒN THIẾU, không phải tổng', () => {
    render(
      <InvoicePaymentPanel
        invoice={makeInvoice({
          status: SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID,
          paidAmount: '1000000',
        })}
      />,
    );

    const qr = screen.getByRole('img', { name: 'Mã VietQR chuyển khoản thanh toán gói' });
    expect(qr.getAttribute('src')).toContain('amount=2000000');
    expect(screen.getByText('2.000.000 ₫')).toBeTruthy();
    // Câu dẫn nói rõ đã nhận bao nhiêu — người chuyển thiếu phải biết mình đang bù, không mua mới.
    expect(screen.getByText(/Đã nhận 1\.000\.000 ₫/)).toBeTruthy();
  });

  it('CHƯA cấu hình tài khoản nhận: không QR, không số tài khoản — mã và số tiền vẫn còn', () => {
    paymentInfo.data = {
      configured: false,
      bankCode: null,
      accountNumber: null,
      accountName: null,
    };
    render(<InvoicePaymentPanel invoice={makeInvoice()} />);

    expect(screen.queryByRole('img', { name: 'Mã VietQR chuyển khoản thanh toán gói' })).toBeNull();
    expect(screen.queryByText('Số tài khoản')).toBeNull();
    expect(screen.getByText('XPG2K9ADFG')).toBeTruthy();
    expect(screen.getByText('3.000.000 ₫')).toBeTruthy();
  });

  it('nói rõ gói TỰ kích hoạt khi tiền về — không ai phải giữ tab mở', () => {
    render(<InvoicePaymentPanel invoice={makeInvoice()} />);
    expect(screen.getByText(/Gói tự kích hoạt khi tiền về/)).toBeTruthy();
  });
});
