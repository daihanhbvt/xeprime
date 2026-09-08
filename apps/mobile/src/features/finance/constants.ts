import type { PeriodKey } from '@xeprime/domain';

/**
 * Hằng của tuyến TIỀN trên app — gương của `apps/web/src/features/finance/constants.ts`.
 *
 * NHÃN không nằm ở đây: nó là chữ trên màn hình nên phải dịch được, và một hằng ở tầng module
 * không đọc được ngôn ngữ đang dùng. Màn tra qua `t('periods.<mã>')` (ADR 0012).
 */

/**
 * Kỳ xem nhanh của SỔ THU-CHI — bốn kỳ ngắn.
 *
 * Sổ là nơi tra một phiếu cụ thể; "quý này lãi bao nhiêu" là câu hỏi của màn Tổng quan, và nó có
 * tập kỳ rộng hơn ngay bên dưới.
 */
export const RECEIPT_PERIOD_VALUES = [
  'today',
  'this_week',
  'this_month',
  'last_month',
] as const satisfies readonly PeriodKey[];

/**
 * Kỳ xem nhanh của màn TỔNG QUAN DOANH THU và của mọi khối tiền nhúng trong hồ sơ xe / hồ sơ
 * khách — rộng hơn sổ Thu-Chi, thêm quý và năm.
 *
 * Cùng một hàm `buildPeriodRange`, khác tập lựa chọn — không đẻ ra bảng ngày thứ hai.
 */
export const FINANCE_OVERVIEW_PERIOD_VALUES = [
  'today',
  'this_week',
  'this_month',
  'last_month',
  'this_quarter',
  'this_year',
] as const satisfies readonly PeriodKey[];

/**
 * Kỳ mặc định khi màn vừa mở — cùng `FINANCE_OVERVIEW_DEFAULT_PERIOD` của web.
 *
 * Một biểu đồ KHÔNG CÓ BIÊN là một biểu đồ không vẽ được (`generate_series` cần hai đầu), và
 * "toàn bộ lịch sử" cũng không phải câu hỏi ai hỏi khi mở màn tài chính buổi sáng.
 */
export const FINANCE_OVERVIEW_DEFAULT_PERIOD: PeriodKey = 'this_month';

/** Số dòng mỗi trang của hai bảng xếp hạng — cùng con số web dùng. */
export const VEHICLE_PROFIT_PAGE_SIZE = 10;

/** Vài phiếu gần nhất là đủ để trả lời "thực thể này đã thu/chi bao nhiêu"; xem đủ thì sang sổ. */
export const ENTITY_RECEIPTS_PREVIEW_LIMIT = 10;

/**
 * Phiếu tay gắn vào CÁI GÌ — lựa chọn đầu tiên của form, vì nó quyết định các ô còn lại.
 *
 * Ba phương án là ba loại khoản có thật trong sổ, không phải ba cách bấm:
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

/** Trần diễn giải của form phiếu tay — khớp `.max(500)` ở schema. */
export const RECEIPT_DESCRIPTION_MAX = 500;

/** Trần số tệp đính kèm — khớp `ArrayMaxSize(10)` của `CreateReceiptDto`. */
export const RECEIPT_ATTACHMENTS_MAX = 10;

/** Sentinel "mọi giá trị" của giao diện — không endpoint nào nhận `status=all`. */
export const FILTER_ALL = 'all';
