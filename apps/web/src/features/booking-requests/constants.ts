import { BOOKING_REQUEST_STATUS, type BookingRequestStatus } from '@xeprime/types';

/**
 * "Tất cả trạng thái" ở inbox.
 *
 * Nó phải là một giá trị ĐI VÀO URL (`?status=all`), không phải sự vắng mặt của tham số: mặc
 * định của inbox là `pending_host_approval`, nên xoá tham số đi là quay về tab "Cần xử lý" chứ
 * không phải mở tab "Tất cả". Đây chính là lỗi của bản trước.
 *
 * Không nằm ở `@xeprime/types` vì nó KHÔNG phải một trạng thái nghiệp vụ: backend không bao giờ
 * nhận `status=all` (ADR 0005 — mã đi trên dây là mã thật), lớp gọi API dịch nó thành "không
 * gửi `status`".
 */
export const BOOKING_REQUEST_STATUS_ALL = 'all';

/**
 * Tab GỘP "Cần xử lý" — KHÔNG phải một trạng thái thật của `BookingRequestStatus`, mà là HAI
 * trạng thái cùng cần gian hàng quyết định (`BookingRequestCard.needsDecision` đã đối xử với
 * chúng như nhau từ lâu — xem component đó): `pending_host_approval` (mới hỏi) và `hold_paid`
 * (**LEGACY ADR 0039** — khách đã trả đủ trước khi ai duyệt; ADR 0044 không sinh trạng thái này
 * nữa, nhưng những yêu cầu đã ở đó vẫn có tiền thật bên trong và vẫn cần một cú bấm).
 *
 * Trước đây hai cái này là HAI TAB riêng vì sợ `hold_paid` — việc khẩn nhất hộp thư — chìm mất.
 * Nhưng nó chỉ chìm khi lẫn vào tab "Tất cả" (gồm cả yêu cầu đã chết); gộp với đúng
 * `pending_host_approval` — trạng thái CẦN QUYẾT ĐỊNH còn lại — không làm mất tính khẩn cấp:
 * đồng hồ đếm hạn phản hồi (`RespondDeadline`) đã hiện trên MỌI thẻ cần quyết định, không phân
 * biệt theo tab. Phản hồi người dùng 19/09/2026.
 *
 * Không phải một mã nghiệp vụ đi trên dây (ADR 0005) — `filtersToParams` dịch nó thành
 * `status=pending_host_approval,hold_paid` (một chuỗi, ngăn cách dấu phẩy: `@xeprime/api-client`
 * cố ý không hỗ trợ query param dạng mảng).
 */
export const BOOKING_REQUEST_TAB_NEEDS_ACTION = 'needs_action';

/** Hai trạng thái gộp trong tab "Cần xử lý" — cùng thứ tự với chuỗi gửi lên server. */
export const BOOKING_REQUEST_NEEDS_ACTION_STATUSES = [
  BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
  BOOKING_REQUEST_STATUS.HOLD_PAID,
] as const;

/** Tab của inbox — `null` ở `status` nghĩa là tab "Tất cả". */
export interface BookingRequestTab {
  /** Giá trị đi vào `?status=`. */
  readonly value: string;
  /** Trạng thái để tra `statusCounts` (cộng dồn nếu nhiều); `null` = tab "Tất cả". */
  readonly status: readonly BookingRequestStatus[] | null;
  /** Khoá message trong namespace `BookingRequests.tabs`. */
  readonly labelKey: 'needsAction' | 'converted' | 'rejected' | 'cancelled' | 'expired' | 'all';
}

/**
 * Thứ tự tab theo VIỆC PHẢI LÀM, không theo thứ tự khai báo enum: việc cần xử lý đứng đầu,
 * rồi tới kết quả tích cực, rồi các nhánh kết thúc khác.
 *
 * `approved_by_host` cố ý KHÔNG có tab riêng: luồng duyệt chuyển thẳng sang
 * `converted_to_booking` trong cùng transaction, nên đó là một trạng thái chỉ tồn tại ở dữ
 * liệu cũ. Nó vẫn được đếm trong tab "Tất cả" (tab đó cộng mọi trạng thái, không liệt kê tay).
 */
export const BOOKING_REQUEST_TABS: readonly BookingRequestTab[] = [
  {
    value: BOOKING_REQUEST_TAB_NEEDS_ACTION,
    status: BOOKING_REQUEST_NEEDS_ACTION_STATUSES,
    labelKey: 'needsAction',
  },
  /*
   * `awaiting_hold` (ADR 0044 — đã nhận chuyến, đang chờ khách thanh toán) CỐ Ý không có tab
   * riêng (phản hồi người dùng 19/09/2026): gian hàng đã quyết định xong, và một tab riêng cho
   * một trạng thái không-hành-động-được chỉ thêm rối. Nó vẫn xem được qua tab "Tất cả", và thẻ
   * của nó tự nói tình trạng cùng hạn khách phải thanh toán (`awaitingHold.*` ở
   * `BookingRequestCard`) thay vì để trống khó hiểu.
   */
  {
    value: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
    status: [BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING],
    labelKey: 'converted',
  },
  {
    value: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
    status: [BOOKING_REQUEST_STATUS.REJECTED_BY_HOST],
    labelKey: 'rejected',
  },
  {
    value: BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER,
    status: [BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER],
    labelKey: 'cancelled',
  },
  {
    value: BOOKING_REQUEST_STATUS.EXPIRED,
    status: [BOOKING_REQUEST_STATUS.EXPIRED],
    labelKey: 'expired',
  },
  { value: BOOKING_REQUEST_STATUS_ALL, status: null, labelKey: 'all' },
];

/** Lý do từ chối bấm-là-điền. Chữ nằm ở message; đây chỉ là DANH SÁCH và thứ tự. */
export const REJECT_REASON_PRESETS = [
  'vehicleUnavailable',
  'scheduleUnavailable',
  'requirementsUnsuitable',
  'other',
] as const;

export type RejectReasonPreset = (typeof REJECT_REASON_PRESETS)[number];

/** Trần độ dài lý do từ chối — khớp `@MaxLength(1000)` của `RejectBookingRequestDto`. */
export const REJECT_REASON_MAX_LENGTH = 1000;
