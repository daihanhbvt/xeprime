import { RECEIPT_SOURCE, RECEIPT_TYPE, isAutoReceipt } from '@xeprime/types';

export const RECEIPTS_DEFAULT_LIMIT = 20;

/**
 * Khoảng ngày dựng sẵn cho thanh lọc.
 *
 * Chủ xe hỏi "tháng này thu bao nhiêu" nhiều hơn hẳn một khoảng ngày tuỳ ý, và bắt họ mở lịch
 * chọn hai đầu cho một câu hỏi hằng ngày là bắt trả giá cho việc thường xuyên nhất.
 * Giá trị tính lúc bấm (`buildPeriodRange`), không phải hằng số — nếu không thì tab mở qua nửa
 * đêm sẽ ghi ngày của hôm qua vào URL.
 *
 * NHÃN không nằm ở đây: nó là chữ trên màn hình nên phải dịch được, và một hằng ở tầng module
 * không đọc được ngôn ngữ đang dùng. Trang tra qua `t('periods.<mã>')` (ADR 0012).
 */
export const RECEIPT_PERIOD = {
  TODAY: 'today',
  THIS_WEEK: 'this_week',
  THIS_MONTH: 'this_month',
  LAST_MONTH: 'last_month',
} as const;

export type ReceiptPeriod = (typeof RECEIPT_PERIOD)[keyof typeof RECEIPT_PERIOD];

/** Thứ tự hiện trên thanh kỳ xem nhanh — gần nhất trước. */
export const RECEIPT_PERIOD_VALUES = [
  RECEIPT_PERIOD.TODAY,
  RECEIPT_PERIOD.THIS_WEEK,
  RECEIPT_PERIOD.THIS_MONTH,
  RECEIPT_PERIOD.LAST_MONTH,
] as const satisfies readonly ReceiptPeriod[];

export { RECEIPT_TYPE, RECEIPT_SOURCE, isAutoReceipt };
