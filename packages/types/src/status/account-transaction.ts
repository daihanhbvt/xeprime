/**
 * "Lịch sử giao dịch" của TÀI KHOẢN KHÁCH — MỘT danh sách hợp nhất mọi lần tiền của khách dịch
 * chuyển (`GET /account/transactions`). Mỗi loại dòng đọc từ đúng sổ của nó; đây chỉ là NHÃN đọc,
 * không có bảng nào lưu các mã này.
 *
 *  · `hold_payment`    — khách chuyển tiền giữ chỗ (SePay `bank_transactions` đã khớp, hoặc lượt
 *                        cổng MoMo/VNPAY `payment_gateway_orders`). Tiền RA khỏi khách ⇒ số âm.
 *  · `withdrawal`      — rút ví điểm về tài khoản ngân hàng liên kết. Tiền VỀ khách ⇒ số dương.
 *  · `wallet_credit`   — dòng sổ ví ghi CÓ/NỢ cho khách (hoàn giữ chỗ, hoàn chuyển thừa, điều
 *                        chỉnh). Các dòng của lệnh rút KHÔNG nằm ở đây — lệnh rút đã là một dòng.
 *  · `hold_refund`     — hoàn giữ chỗ chuyển THẲNG về ngân hàng (không qua ví).
 *  · `rental_payment`  — khoản tiền thuê / tiền cọc gian hàng ghi nhận (`payments`).
 */
export const ACCOUNT_TRANSACTION_KIND = {
  HOLD_PAYMENT: 'hold_payment',
  WITHDRAWAL: 'withdrawal',
  WALLET_CREDIT: 'wallet_credit',
  HOLD_REFUND: 'hold_refund',
  RENTAL_PAYMENT: 'rental_payment',
} as const;

export type AccountTransactionKind =
  (typeof ACCOUNT_TRANSACTION_KIND)[keyof typeof ACCOUNT_TRANSACTION_KIND];
export const ACCOUNT_TRANSACTION_KIND_VALUES = Object.values(
  ACCOUNT_TRANSACTION_KIND,
) as AccountTransactionKind[];

/** Ba trạng thái HIỂN THỊ của bản vẽ (Thành công / Đang chờ / Thất bại) — suy ở server từ sổ gốc. */
export const ACCOUNT_TRANSACTION_STATUS = {
  SUCCEEDED: 'succeeded',
  PENDING: 'pending',
  FAILED: 'failed',
} as const;

export type AccountTransactionStatus =
  (typeof ACCOUNT_TRANSACTION_STATUS)[keyof typeof ACCOUNT_TRANSACTION_STATUS];
export const ACCOUNT_TRANSACTION_STATUS_VALUES = Object.values(
  ACCOUNT_TRANSACTION_STATUS,
) as AccountTransactionStatus[];

export function isAccountTransactionStatus(value: unknown): value is AccountTransactionStatus {
  return (
    typeof value === 'string' && (ACCOUNT_TRANSACTION_STATUS_VALUES as string[]).includes(value)
  );
}

/**
 * Khoá tiêu đề của một dòng (namespace `AccountPayments.history.titles`). Server chọn — client chỉ
 * dịch, không suy lại từ `kind` + nguồn.
 */
export const ACCOUNT_TRANSACTION_TITLE = {
  HOLD_PAYMENT: 'hold_payment',
  WITHDRAWAL: 'withdrawal',
  HOLD_REFUND: 'hold_refund',
  HOLD_OVERPAY: 'hold_overpay',
  HOLD_RELEASE: 'hold_release',
  HOLD_FORFEIT: 'hold_forfeit',
  ADJUSTMENT: 'adjustment',
  RENTAL: 'rental',
  DEPOSIT: 'deposit',
} as const;

export type AccountTransactionTitle =
  (typeof ACCOUNT_TRANSACTION_TITLE)[keyof typeof ACCOUNT_TRANSACTION_TITLE];
export const ACCOUNT_TRANSACTION_TITLE_VALUES = Object.values(
  ACCOUNT_TRANSACTION_TITLE,
) as AccountTransactionTitle[];
