import { RECEIPT_SOURCE, RECEIPT_TYPE, isAutoReceipt } from '@xeprime/types';
import type { PeriodKey } from '@/lib/datetime';
import { DEFAULT_PAGE_SIZE } from '@/constants/filters';

export const RECEIPTS_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

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

/**
 * Phiếu tay gắn vào CÁI GÌ — lựa chọn đầu tiên của form, vì nó quyết định các ô còn lại.
 *
 * Ba phương án là ba loại khoản chi/thu có thật trong sổ, không phải ba cách bấm:
 *  - `BOOKING` — tiền của một chuyến (thu nốt, phụ phí). Xe suy từ đơn.
 *  - `VEHICLE` — tiền của một chiếc xe ngoài chuyến nào (rửa xe, vá lốp, gửi bãi).
 *  - `NONE` — tiền của gian hàng (marketing, văn phòng, lương) — đúng phần
 *    `unassignedCost`/`unassignedRevenue` mà báo cáo phải giải thích được.
 *
 * Đây là trạng thái CỦA FORM, không phải giá trị nghiệp vụ đi trên dây: API vẫn chỉ nhận
 * `bookingId`/`vehicleId`, nên hằng này sống ở feature chứ không ở `@xeprime/types`.
 */
export const RECEIPT_LINK_MODE = {
  NONE: 'none',
  BOOKING: 'booking',
  VEHICLE: 'vehicle',
} as const;

export type ReceiptLinkMode = (typeof RECEIPT_LINK_MODE)[keyof typeof RECEIPT_LINK_MODE];

/** Thứ tự hiện trên nhóm chọn — mặc định trước, rồi tới hai lựa chọn có liên kết. */
export const RECEIPT_LINK_MODE_VALUES = [
  RECEIPT_LINK_MODE.NONE,
  RECEIPT_LINK_MODE.BOOKING,
  RECEIPT_LINK_MODE.VEHICLE,
] as const satisfies readonly ReceiptLinkMode[];

/**
 * Kỳ xem nhanh của màn TỔNG QUAN DOANH THU — rộng hơn sổ Thu-Chi.
 *
 * Sổ là nơi tra một phiếu cụ thể nên bốn kỳ ngắn là đủ; tổng quan là nơi hỏi "quý này lãi
 * bao nhiêu", nên có thêm quý và năm. Cùng một hàm `buildPeriodRange`, khác tập lựa chọn —
 * không đẻ ra bảng ngày thứ hai.
 */
export const FINANCE_OVERVIEW_PERIOD_VALUES = [
  RECEIPT_PERIOD.TODAY,
  RECEIPT_PERIOD.THIS_WEEK,
  RECEIPT_PERIOD.THIS_MONTH,
  RECEIPT_PERIOD.LAST_MONTH,
  'this_quarter',
  'this_year',
] as const satisfies readonly PeriodKey[];

/**
 * Kỳ mặc định khi URL chưa có `from`/`to`.
 *
 * Một biểu đồ KHÔNG CÓ BIÊN là một biểu đồ không vẽ được (`generate_series` cần hai đầu), và
 * "toàn bộ lịch sử" cũng không phải câu hỏi ai hỏi khi mở màn tài chính buổi sáng.
 */
export const FINANCE_OVERVIEW_DEFAULT_PERIOD: PeriodKey = RECEIPT_PERIOD.THIS_MONTH;

/** Số dòng mỗi trang của bảng hiệu quả theo xe — một đội xe vài chục chiếc vừa đúng một trang. */
export const VEHICLE_PROFIT_PAGE_SIZE = 10;
