import { BOOKING_REQUEST_STATUS, type BookingRequestStatus } from '@xeprime/types';

/**
 * Tab GỘP "Cần xử lý" — KHÔNG phải một trạng thái thật của `BookingRequestStatus`, mà là HAI
 * trạng thái cùng cần gian hàng quyết định (`BookingRequestCard.needsDecision` đã đối xử với
 * chúng như nhau từ lâu — xem component đó): `pending_host_approval` (mới hỏi) và `hold_paid`
 * (**LEGACY ADR 0039** — khách đã trả đủ trước khi ai duyệt; ADR 0044 không sinh trạng thái này
 * nữa, nhưng những yêu cầu đã ở đó vẫn có tiền thật bên trong và vẫn cần một cú bấm).
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

/**
 * Tab GỘP "Đã đóng" — SÁU kết cục thất bại/kết thúc của một yêu cầu, gộp thành một ngăn duy
 * nhất (ADR 0047) thay vì bốn tab riêng như trước (Đã tạo đơn/Đã từ chối/Khách đã huỷ/Quá hạn)
 * cộng hai trạng thái trước đây KHÔNG có tab nào (`hold_expired`, `slot_taken`,
 * `cancelled_by_host` — chỉ thấy được qua tab "Tất cả" đã bị xoá).
 *
 * Gộp tab KHÔNG đồng nghĩa gộp nhãn: mỗi thẻ trong danh sách vẫn tự hiện đúng kết cục của nó
 * qua `StatusTag`/`BOOKING_REQUEST_STATUS_META` — xem `BookingRequestCard`, không đổi gì ở đó.
 * Tab chỉ là MỘT NGĂN LỌC, không phải một trạng thái mới.
 *
 * `converted_to_booking` KHÔNG nằm trong nhóm này — nó là kết cục THÀNH CÔNG (đơn đã ra đời),
 * không phải "đã đóng" theo nghĩa hỏng việc. Không còn tab riêng cho nó nữa; xem lại yêu cầu đã
 * chuyển đơn qua "Tất cả đơn thuê" (tìm theo tên khách/SĐT) — bấm vào một hàng ở đây mà đã có
 * `bookingId` vẫn mở thẳng chi tiết ĐƠN, không đổi.
 */
export const BOOKING_REQUEST_TAB_CLOSED = 'closed';

/** Sáu trạng thái gộp trong tab "Đã đóng" — cùng thứ tự với chuỗi gửi lên server. */
export const BOOKING_REQUEST_CLOSED_STATUSES = [
  BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
  BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER,
  BOOKING_REQUEST_STATUS.EXPIRED,
  BOOKING_REQUEST_STATUS.HOLD_EXPIRED,
  BOOKING_REQUEST_STATUS.SLOT_TAKEN,
  BOOKING_REQUEST_STATUS.CANCELLED_BY_HOST,
] as const;

/** Tab của inbox. */
export interface BookingRequestTab {
  /** Giá trị đi vào `?status=`. */
  readonly value: string;
  /** Trạng thái để tra `statusCounts` (cộng dồn nếu nhiều). */
  readonly status: readonly BookingRequestStatus[];
  /** Khoá message trong namespace `BookingRequests.tabs`. */
  readonly labelKey: 'needsAction' | 'awaitingPayment' | 'closed';
}

/**
 * ĐÚNG BA TAB (ADR 0047, đảo ngược quyết định 19/09/2026 dưới đây) — mỗi tab trả lời đúng MỘT
 * câu hỏi vận hành, không câu nào chồng lấn câu nào:
 *
 *   1. Cần xử lý          — gian hàng phải bấm một quyết định.
 *   2. Chờ khách thanh toán — quả bóng đã sang chân khách, gian hàng chỉ còn theo dõi/liên hệ.
 *   3. Đã đóng             — mọi kết cục không-thành-đơn, gộp một chỗ nhưng giữ nhãn riêng từng
 *      dòng.
 *
 * `converted_to_booking` không có tab riêng: nó là lịch sử của một ĐƠN THUÊ đang sống, và "Tất
 * cả đơn thuê" mới là nơi đúng để tra cứu nó — giữ một tab ở đây chỉ lặp lại đúng thứ menu khác
 * đã có. Tab "Tất cả" cũng bị bỏ cùng lý do: ba tab trên đã phủ hết 11 trạng thái, một tab tổng
 * hợp không còn việc gì để làm ngoài đếm lại đúng ba con số đã hiện.
 *
 * ⚠️ Tab "Chờ khách thanh toán" từng KHÔNG tồn tại theo phản hồi người dùng 19/09/2026 (lý do
 * lúc đó: "một tab riêng cho một trạng thái không-hành-động-được chỉ thêm rối"). Đảo ngược ngày
 * 23/09/2026: chính người dùng đó xác nhận cần phân biệt RÕ bốn việc — cần xử lý / chờ khách
 * thanh toán / chờ giao xe / tất cả đơn — và `awaiting_hold` trước đó chỉ ẩn trong tab "Tất cả"
 * (đã xoá), nghĩa là nó thực chất KHÔNG có chỗ nào để xem riêng. `awaitingHold.*` ở
 * `BookingRequestCard` (số tiền, hạn thanh toán, nút liên hệ/huỷ) vẫn giữ nguyên, không đổi.
 *
 * ⚠️ `packages/domain/messages/{vi,en}/booking-requests.json` vẫn còn các khoá CŨ
 * (`tabs.converted/rejected/cancelled/expired/all`, cả khối `stats.*`) không được web dùng
 * nữa — `apps/mobile` (tự có `REQUEST_INBOX_TABS`/`RequestStats` riêng, ADR 0031) vẫn đọc
 * đúng những khoá đó. Xoá chúng làm mobile VỠ BIÊN DỊCH ngay lập tức dù không sửa file mobile
 * nào — không xoá cho tới khi đội mobile chuyển sang cấu trúc 3 tab và tự dọn phần của họ.
 */
export const BOOKING_REQUEST_TABS: readonly BookingRequestTab[] = [
  {
    value: BOOKING_REQUEST_TAB_NEEDS_ACTION,
    status: BOOKING_REQUEST_NEEDS_ACTION_STATUSES,
    labelKey: 'needsAction',
  },
  {
    value: BOOKING_REQUEST_STATUS.AWAITING_HOLD,
    status: [BOOKING_REQUEST_STATUS.AWAITING_HOLD],
    labelKey: 'awaitingPayment',
  },
  {
    value: BOOKING_REQUEST_TAB_CLOSED,
    status: BOOKING_REQUEST_CLOSED_STATUSES,
    labelKey: 'closed',
  },
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
