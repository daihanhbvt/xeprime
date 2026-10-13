import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SUBSCRIPTION_INVOICE_STATUS } from '@xeprime/types';

import type { SubscriptionInvoice } from '../types';
import { InvoicePaymentPanel, invoiceRemainingAmount } from './InvoicePaymentPanel';

/**
 * THẺ HOÁ ĐƠN CHỜ TIỀN của một hoá đơn gói.
 *
 * Từ 13/10/2026 việc TRẢ nằm ở trang thanh toán riêng (`/payment/:invoiceId` — QR, mã và ví điện tử
 * được khoá ở `CheckoutPanel.test.tsx`). Thẻ này khoá ba điều:
 *
 *  1. **Đang mua gì** — đọc từ CHÍNH hoá đơn, sống qua F5.
 *  2. **Số phải trả là số CÒN THIẾU** khi hoá đơn đã nhận một phần — không phải tổng.
 *  3. **Lối trả dẫn tới trang thanh toán của ĐÚNG hoá đơn**, và thẻ không vẽ QR thứ hai.
 */
const plans = vi.hoisted(() => ({
  data: [{ id: 'plan-basic', name: 'Gói cơ bản' }] as unknown[],
  isLoading: false,
  isError: false,
}));

vi.mock('../hooks/use-subscription', () => ({
  /* Danh mục gói chỉ để tra TÊN bậc từ `invoice.planId` — rỗng ⇒ rơi về mã bậc. */
  useTenantPlans: () => plans,
}));

function makeInvoice(over: Partial<SubscriptionInvoice> = {}): SubscriptionInvoice {
  return {
    id: '01HINVOICE00000000000000',
    code: 'XPG2K9ADFG',
    planId: 'plan-basic',
    planCode: 'shop-basic',
    termMonths: 3,
    quota: { maxVehicles: 3, maxBranches: 1, maxMembers: null },
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

afterEach(cleanup);

describe('InvoicePaymentPanel', () => {
  it('nói đang mua gì, bao nhiêu, và MỘT nút sang trang thanh toán của đúng hoá đơn', () => {
    const { container } = render(<InvoicePaymentPanel invoice={makeInvoice()} />);

    expect(screen.getByText('Gói cơ bản')).toBeTruthy();
    expect(screen.getByText(/3\.000\.000/)).toBeTruthy();
    const pay = screen.getByRole('link', { name: /thanh toán/i });
    expect(pay.getAttribute('href')).toBe('/manage/payment/01HINVOICE00000000000000');
    // Không QR thứ hai — hai chỗ trả là hai chỗ để số tiền hoặc nội dung trôi khỏi nhau.
    expect(container.querySelector('img')).toBeNull();
  });

  it('trả MỘT PHẦN: hiện SỐ CÒN THIẾU và nói đã nhận bao nhiêu', () => {
    render(
      <InvoicePaymentPanel
        invoice={makeInvoice({
          status: SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID,
          paidAmount: '1000000',
        })}
      />,
    );

    expect(screen.getByText(/2\.000\.000/)).toBeTruthy();
    expect(screen.getByText('Còn phải chuyển')).toBeTruthy();
    expect(screen.getByText(/1\.000\.000/)).toBeTruthy();
  });

  it('danh mục gói chưa về ⇒ rơi về MÃ bậc, không để trống', () => {
    plans.data = [];
    render(<InvoicePaymentPanel invoice={makeInvoice()} />);
    expect(screen.getByText('shop-basic')).toBeTruthy();
    plans.data = [{ id: 'plan-basic', name: 'Gói cơ bản' }];
  });
});

describe('invoiceRemainingAmount', () => {
  it('hoá đơn chưa nhận đồng nào ⇒ cả tổng', () => {
    expect(invoiceRemainingAmount(makeInvoice())).toBe('3000000');
  });

  it('đã nhận một phần ⇒ phần còn thiếu', () => {
    expect(
      invoiceRemainingAmount(
        makeInvoice({ status: SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID, paidAmount: '1250000' }),
      ),
    ).toBe('1750000');
  });
});
