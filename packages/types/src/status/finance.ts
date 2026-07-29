import type { StatusMeta } from './meta';

/**
 * Enum tài chính (Phase 6) — ADR 0005: DB lưu String, union ở đây là lớp chặn duy nhất.
 * `RECEIPT_STATUS` (draft/pending_approval/approved/cancelled) nằm ở `misc.ts`.
 */

/** Loại danh mục / phiếu: thu (income) hay chi (expense). */
export const FINANCE_CATEGORY_TYPE = {
  INCOME: 'income',
  EXPENSE: 'expense',
} as const;
export type FinanceCategoryType =
  (typeof FINANCE_CATEGORY_TYPE)[keyof typeof FINANCE_CATEGORY_TYPE];
export const FINANCE_CATEGORY_TYPE_VALUES = Object.values(
  FINANCE_CATEGORY_TYPE,
) as FinanceCategoryType[];

export const FINANCE_CATEGORY_TYPE_META: Readonly<Record<FinanceCategoryType, StatusMeta>> = {
  [FINANCE_CATEGORY_TYPE.INCOME]: { label: 'Thu', color: 'green' },
  [FINANCE_CATEGORY_TYPE.EXPENSE]: { label: 'Chi', color: 'red' },
};

/** Loại phiếu thu-chi — trùng giá trị với category type (thu/chi). */
export const RECEIPT_TYPE = {
  INCOME: 'income',
  EXPENSE: 'expense',
} as const;
export type ReceiptType = (typeof RECEIPT_TYPE)[keyof typeof RECEIPT_TYPE];
export const RECEIPT_TYPE_VALUES = Object.values(RECEIPT_TYPE) as ReceiptType[];

export const RECEIPT_TYPE_META: Readonly<Record<ReceiptType, StatusMeta>> = {
  [RECEIPT_TYPE.INCOME]: { label: 'Phiếu thu', color: 'green' },
  [RECEIPT_TYPE.EXPENSE]: { label: 'Phiếu chi', color: 'red' },
};

/** Hình thức thanh toán. */
export const PAYMENT_METHOD = {
  CASH: 'cash',
  BANK_TRANSFER: 'bank_transfer',
  QR: 'qr',
  CARD: 'card',
  OTHER: 'other',
} as const;
export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];
export const PAYMENT_METHOD_VALUES = Object.values(PAYMENT_METHOD) as PaymentMethod[];

export const PAYMENT_METHOD_META: Readonly<Record<PaymentMethod, StatusMeta>> = {
  [PAYMENT_METHOD.CASH]: { label: 'Tiền mặt', color: 'green' },
  [PAYMENT_METHOD.BANK_TRANSFER]: { label: 'Chuyển khoản', color: 'blue' },
  [PAYMENT_METHOD.QR]: { label: 'QR', color: 'cyan' },
  [PAYMENT_METHOD.CARD]: { label: 'Thẻ', color: 'purple' },
  [PAYMENT_METHOD.OTHER]: { label: 'Khác', color: 'default' },
};

/** Trạng thái giao dịch thanh toán. */
export const PAYMENT_STATUS = {
  PENDING: 'pending',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const;
export type PaymentStatus = (typeof PAYMENT_STATUS)[keyof typeof PAYMENT_STATUS];
export const PAYMENT_STATUS_VALUES = Object.values(PAYMENT_STATUS) as PaymentStatus[];

export const PAYMENT_STATUS_META: Readonly<Record<PaymentStatus, StatusMeta>> = {
  [PAYMENT_STATUS.PENDING]: { label: 'Đang xử lý', color: 'gold' },
  [PAYMENT_STATUS.SUCCEEDED]: { label: 'Thành công', color: 'green' },
  [PAYMENT_STATUS.FAILED]: { label: 'Thất bại', color: 'red' },
  [PAYMENT_STATUS.REFUNDED]: { label: 'Đã hoàn', color: 'default' },
};

/** Trạng thái hợp đồng thuê. */
export const CONTRACT_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  SIGNED: 'signed',
  VOID: 'void',
} as const;
export type ContractStatus = (typeof CONTRACT_STATUS)[keyof typeof CONTRACT_STATUS];
export const CONTRACT_STATUS_VALUES = Object.values(CONTRACT_STATUS) as ContractStatus[];

export const CONTRACT_STATUS_META: Readonly<Record<ContractStatus, StatusMeta>> = {
  [CONTRACT_STATUS.DRAFT]: { label: 'Nháp', color: 'default' },
  [CONTRACT_STATUS.ACTIVE]: { label: 'Hiệu lực', color: 'green' },
  [CONTRACT_STATUS.SIGNED]: { label: 'Đã ký', color: 'blue' },
  [CONTRACT_STATUS.VOID]: { label: 'Vô hiệu', color: 'default' },
};
