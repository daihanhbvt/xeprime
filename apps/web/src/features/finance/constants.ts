import {
  PAYMENT_METHOD_META,
  PAYMENT_METHOD_VALUES,
  RECEIPT_SOURCE,
  RECEIPT_SOURCE_META,
  RECEIPT_SOURCE_VALUES,
  RECEIPT_STATUS_META,
  RECEIPT_STATUS_VALUES,
  RECEIPT_TYPE,
  RECEIPT_TYPE_META,
  RECEIPT_TYPE_VALUES,
  isAutoReceipt,
} from '@xeprime/types';

export const RECEIPTS_DEFAULT_LIMIT = 20;

export const RECEIPT_TYPE_OPTIONS = RECEIPT_TYPE_VALUES.map((v) => ({
  value: v,
  label: RECEIPT_TYPE_META[v].label,
}));

export const RECEIPT_STATUS_OPTIONS = RECEIPT_STATUS_VALUES.map((v) => ({
  value: v,
  label: RECEIPT_STATUS_META[v].label,
}));

export const RECEIPT_SOURCE_OPTIONS = RECEIPT_SOURCE_VALUES.map((v) => ({
  value: v,
  label: RECEIPT_SOURCE_META[v].label,
}));

export const PAYMENT_METHOD_OPTIONS = PAYMENT_METHOD_VALUES.map((v) => ({
  value: v,
  label: PAYMENT_METHOD_META[v].label,
}));

/**
 * Khoảng ngày dựng sẵn cho thanh lọc.
 *
 * Chủ xe hỏi "tháng này thu bao nhiêu" nhiều hơn hẳn một khoảng ngày tuỳ ý, và bắt họ mở lịch
 * chọn hai đầu cho một câu hỏi hằng ngày là bắt trả giá cho việc thường xuyên nhất.
 * Giá trị tính lúc bấm (`buildPeriodRange`), không phải hằng số — nếu không thì tab mở qua nửa
 * đêm sẽ ghi ngày của hôm qua vào URL.
 */
export const RECEIPT_PERIOD = {
  TODAY: 'today',
  THIS_WEEK: 'this_week',
  THIS_MONTH: 'this_month',
  LAST_MONTH: 'last_month',
} as const;

export type ReceiptPeriod = (typeof RECEIPT_PERIOD)[keyof typeof RECEIPT_PERIOD];

export const RECEIPT_PERIOD_LABEL: Readonly<Record<ReceiptPeriod, string>> = {
  [RECEIPT_PERIOD.TODAY]: 'Hôm nay',
  [RECEIPT_PERIOD.THIS_WEEK]: 'Tuần này',
  [RECEIPT_PERIOD.THIS_MONTH]: 'Tháng này',
  [RECEIPT_PERIOD.LAST_MONTH]: 'Tháng trước',
};

export { RECEIPT_TYPE, RECEIPT_SOURCE, isAutoReceipt };
