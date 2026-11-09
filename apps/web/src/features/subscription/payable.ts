import { subtractMoney } from '@xeprime/domain';
import { SUBSCRIPTION_INVOICE_STATUS } from '@xeprime/types';

import type { SubscriptionCheckout, SubscriptionInvoice } from './types';

/**
 * KHOẢN CẦN TRẢ của gói - MỘT hoá đơn lẻ (`XPG…`) hoặc MỘT phiếu gộp nhiều hoá đơn (`XPC…`,
 * ADR 0083). Thẻ hoá đơn chờ và trang thanh toán đọc cùng hình dạng này, nên mã chuyển khoản, số
 * tiền và hạn luôn là của ĐÚNG thứ ngân hàng sẽ nhận.
 *
 * Hoá đơn nằm trong phiếu KHÔNG phải một khoản cần trả riêng: tiền gửi bằng mã của nó cũng được
 * server chuyển sang phiếu (`BillingService.applyBankPaymentWithinTx`), và lúc phiếu mới nhận một
 * phần thì hoá đơn con chỉ đổi trạng thái - `paidAmount` của nó vẫn là 0 tới khi phiếu đủ tiền. Đọc
 * mã, tổng hay số đã nhận từ hoá đơn con là hiện sai cả ba.
 */
export interface Payable {
  code: string;
  status: string;
  totalAmount: string;
  paidAmount: string;
  expiresAt: string | null;
  invoices: readonly SubscriptionInvoice[];
  /** Phiên cổng ví chỉ có cho hoá đơn lẻ (ADR 0083 điều 6). */
  gatewayInvoiceId: string | null;
}

/** Hoá đơn LẺ - không dùng cho hoá đơn có `checkoutId` (xem `Payable`). */
export function payableOfInvoice(invoice: SubscriptionInvoice): Payable {
  return {
    code: invoice.code,
    status: invoice.status,
    totalAmount: invoice.totalAmount,
    paidAmount: invoice.paidAmount,
    expiresAt: invoice.expiresAt ?? null,
    invoices: [invoice],
    gatewayInvoiceId: invoice.id,
  };
}

export function payableOfCheckout(checkout: SubscriptionCheckout): Payable {
  return {
    code: checkout.code,
    status: checkout.status,
    totalAmount: checkout.totalAmount,
    paidAmount: checkout.paidAmount,
    expiresAt: checkout.expiresAt ?? null,
    invoices: checkout.invoices,
    gatewayInvoiceId: null,
  };
}

/** Số còn phải chuyển - khoản đã nhận một phần thì là phần CÒN THIẾU, không phải tổng. */
export function payableRemainingAmount(
  payable: Pick<Payable, 'status' | 'totalAmount' | 'paidAmount'>,
): string {
  return payable.status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID
    ? (subtractMoney(payable.totalAmount, payable.paidAmount) ?? payable.totalAmount)
    : payable.totalAmount;
}

/**
 * MỘT mục cho mỗi khoản cần trả trong danh sách hoá đơn chờ: hoá đơn lẻ giữ nguyên, các hoá đơn
 * cùng một phiếu gộp chỉ giữ hoá đơn đầu tiên làm đại diện (thẻ của nó dựng theo phiếu). Thiếu bước
 * này, mua ô tô + xe máy một lần hiện thành hai thẻ, hai nút trả dẫn về cùng một phiếu.
 */
export function onePerPaymentTarget(
  invoices: readonly SubscriptionInvoice[],
): SubscriptionInvoice[] {
  const seen = new Set<string>();
  return invoices.filter((invoice) => {
    if (!invoice.checkoutId) return true;
    if (seen.has(invoice.checkoutId)) return false;
    seen.add(invoice.checkoutId);
    return true;
  });
}
