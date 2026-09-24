import { STATUS_COLOR, type StatusMeta } from './meta';

/**
 * Trạng thái đơn thuê thật (ADR 0005, mô hình 5 trạng thái chốt lại ở ADR 0047).
 *
 * Nguồn: `xeprime_database_design.md` §11.2, được `xeprime_screen_spec_by_role_before_db.md`
 * §11.4 xác nhận. `xeprime_overall_user_flow_next_node.md` §15 ghi `in_progress` và thêm
 * `draft` — bản đó BỊ GHI ĐÈ, không dùng.
 *
 * `CONFIRMED` là **@deprecated** kể từ ADR 0047: không còn writer nào ở web/API tạo ra giá trị
 * này (DB đã migrate hết dữ liệu cũ sang `reserved`/`active`, có CHECK constraint chặn ghi
 * mới). Nó CHỈ còn nằm ở đây để `apps/mobile` — package phụ thuộc workspace, không phải bản
 * build tách riêng — còn biên dịch được; không dùng nó trong code mới. Xoá hẳn khỏi enum này
 * là việc của đội mobile, sau khi họ không còn tham chiếu tới nó ở đâu nữa.
 */
export const BOOKING_STATUS = {
  RESERVED: 'reserved',
  /** @deprecated Xem docblock của `BOOKING_STATUS` — không còn writer, chỉ giữ cho mobile. */
  CONFIRMED: 'confirmed',
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
} as const;

export type BookingStatus = (typeof BOOKING_STATUS)[keyof typeof BOOKING_STATUS];

export const BOOKING_STATUS_VALUES = Object.values(BOOKING_STATUS) as BookingStatus[];

/**
 * Năm trạng thái nghiệp vụ THẬT (ADR 0047) — dùng cho mọi ô lọc/chọn trạng thái ở UI.
 *
 * Khác `BOOKING_STATUS_VALUES` đúng một chỗ: loại `CONFIRMED` deprecated. Tồn tại để không nơi
 * nào phải tự viết `.filter(v => v !== BOOKING_STATUS.CONFIRMED)` — một bản duy nhất, sửa một
 * chỗ nếu sau này còn trạng thái nào khác cần loại khỏi lựa chọn của người dùng.
 */
export const BOOKING_STATUS_SELECTABLE_VALUES = BOOKING_STATUS_VALUES.filter(
  (status) => status !== BOOKING_STATUS.CONFIRMED,
);

/**
 * Trường thời gian mà bộ lọc "khoảng ngày" của danh sách đơn áp lên.
 *
 * Ở đây chứ không ở DTO/constants riêng vì đây là giá trị đi trong query string, web và api
 * PHẢI hiểu giống nhau — lệch một chữ là filter im lặng không có tác dụng.
 */
export const BOOKING_DATE_FIELD = {
  CREATED_AT: 'createdAt',
  PICKUP_AT: 'pickupAt',
} as const;

export type BookingDateField = (typeof BOOKING_DATE_FIELD)[keyof typeof BOOKING_DATE_FIELD];
export const BOOKING_DATE_FIELD_VALUES = Object.values(BOOKING_DATE_FIELD) as BookingDateField[];

export const BOOKING_DATE_FIELD_LABEL: Readonly<Record<BookingDateField, string>> = {
  [BOOKING_DATE_FIELD.CREATED_AT]: 'Theo ngày tạo',
  [BOOKING_DATE_FIELD.PICKUP_AT]: 'Theo ngày nhận xe',
};

export function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === 'string' && (BOOKING_STATUS_VALUES as string[]).includes(value);
}

/**
 * Các trạng thái CHIẾM CHỖ trên lịch xe (ADR 0006).
 *
 * `OccupancyService` dùng đúng danh sách này để quyết định ghi hay xoá bản ghi
 * `vehicle_occupancies`. Thêm một trạng thái mới vào `BOOKING_STATUS` mà quên cập nhật
 * đây là cách tạo ra lỗ trùng lịch — nên hai thứ nằm cạnh nhau.
 */
export const BOOKING_STATUS_OCCUPYING: readonly BookingStatus[] = [
  BOOKING_STATUS.RESERVED,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.ACTIVE,
];

export function occupiesSchedule(status: BookingStatus): boolean {
  return BOOKING_STATUS_OCCUPYING.includes(status);
}

/**
 * Chuyển trạng thái hợp lệ. Backend validate bằng bảng này, không tin client.
 *
 * `RESERVED → ACTIVE` là cạnh TRỰC TIẾP (ADR 0047) — trước đây cố ý không có, chỉ có đường vòng
 * qua `CONFIRMED`, để chặn endpoint chuyển trạng thái công khai nhảy thẳng sang `active` mà bỏ
 * qua biên bản bàn giao thật. Giờ an toàn thêm cạnh thẳng vì `TransitionBookingDto` (API) đã
 * khoá endpoint công khai chỉ còn nhận `cancelled`/`no_show` — `active` chỉ còn tới được từ
 * đúng một chỗ nội bộ: `HandoversService` xác nhận biên bản giao xe.
 *
 * `CONFIRMED` giữ nguyên cạnh đi ra (không dùng tới trong luồng mới) để một hàng dữ liệu cũ
 * lỡ còn ở đó không rơi vào ngõ cụt — xem docblock `BOOKING_STATUS.CONFIRMED`.
 */
export const BOOKING_STATUS_TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> =
  {
    [BOOKING_STATUS.RESERVED]: [
      BOOKING_STATUS.ACTIVE,
      BOOKING_STATUS.CANCELLED,
      BOOKING_STATUS.NO_SHOW,
    ],
    [BOOKING_STATUS.CONFIRMED]: [
      BOOKING_STATUS.ACTIVE,
      BOOKING_STATUS.CANCELLED,
      BOOKING_STATUS.NO_SHOW,
    ],
    [BOOKING_STATUS.ACTIVE]: [BOOKING_STATUS.COMPLETED],
    [BOOKING_STATUS.COMPLETED]: [],
    [BOOKING_STATUS.CANCELLED]: [],
    [BOOKING_STATUS.NO_SHOW]: [],
  };

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Đơn đã đi tới điểm cuối — `completed`, `cancelled`, `no_show`.
 *
 * SUY từ chính bảng chuyển trạng thái (không còn cạnh đi ra) thay vì liệt kê một danh sách thứ
 * hai: thêm một trạng thái kết thúc sau này sẽ tự động được tính vào đây thay vì âm thầm rơi ra
 * ngoài.
 *
 * Dùng để khoá GHI, không phải để khoá đọc: một chuyến đã khép lại là bằng chứng — đổi giờ, đổi
 * tiền hay đổi thông tin khách trên đó là viết lại lịch sử sau khi hai bên đã quyết toán. Sai số
 * cần sửa thì đi qua đường có lý do tường minh (điều chỉnh KM, phát sinh, điều chỉnh hoàn cọc).
 */
export function isBookingFinal(status: BookingStatus): boolean {
  return BOOKING_STATUS_TRANSITIONS[status].length === 0;
}

export const BOOKING_STATUS_META: Readonly<Record<BookingStatus, StatusMeta>> = {
  // "Chờ giao xe" (đổi từ "Đã giữ xe" — ADR 0047), không phải "Đã đặt trước": đơn `reserved`
  // sinh ra ở đúng một chỗ — gian hàng bấm `Duyệt & giữ xe` — và tác dụng thật của nó là CHIẾM
  // chỗ trên lịch chiếc xe đó (ADR 0006). Nhãn cũ trả lời "khoảnh khắc nào chiếm lịch"; nhãn
  // mới trả lời câu người vận hành thật sự cần: "việc tiếp theo là gì" — xe còn nằm ở đây, chờ
  // bàn giao. "Đặt trước" vẫn không dùng vì nghe như một nguyện vọng chưa ai xác nhận, mà
  // nguyện vọng thì đã có tên riêng rồi: `booking_requests.pending_host_approval`.
  [BOOKING_STATUS.RESERVED]: { label: 'Chờ giao xe', color: STATUS_COLOR.WAITING },
  [BOOKING_STATUS.CONFIRMED]: { label: 'Đã xác nhận', color: STATUS_COLOR.INFO },
  [BOOKING_STATUS.ACTIVE]: { label: 'Đang thuê', color: STATUS_COLOR.PROCESSING },
  [BOOKING_STATUS.COMPLETED]: { label: 'Hoàn thành', color: STATUS_COLOR.SUCCESS },
  [BOOKING_STATUS.CANCELLED]: { label: 'Đã hủy', color: STATUS_COLOR.NEUTRAL },
  [BOOKING_STATUS.NO_SHOW]: { label: 'Khách không đến', color: STATUS_COLOR.DANGER },
};

// ── Ghi nhận khách không đến ────────────────────────────────────────────────

/**
 * Ân hạn trước khi được ghi nhận `no_show`, tính từ giờ NHẬN XE theo đơn.
 *
 * Vì sao phải có: `no_show` là một kết thúc tiêu cực đi vào lịch sử của khách và nhả lịch xe
 * ngay (ADR 0006). Cho phép bấm nó lúc 09:59 cho một chuyến hẹn 10:00 biến một cú tắc đường
 * thành một vết đen vĩnh viễn. Ba mươi phút là khoảng người ta thật sự gọi điện hỏi nhau.
 *
 * Sống ở đây vì hai phía phải nói cùng một con số: server từ chối trước mốc, và web không được
 * bày ra một nút chắc chắn nhận 409.
 */
export const BOOKING_NO_SHOW_GRACE_MINUTES = 30;

/** Thời điểm sớm nhất được ghi nhận khách không đến cho một chuyến hẹn nhận lúc `pickupAt`. */
export function noShowAllowedFrom(pickupAt: Date | string): Date {
  const at = pickupAt instanceof Date ? pickupAt : new Date(pickupAt);
  return new Date(at.getTime() + BOOKING_NO_SHOW_GRACE_MINUTES * 60_000);
}

/**
 * Đã qua ân hạn chưa. KHÔNG xét trạng thái đơn hay biên bản bàn giao — hai điều kiện đó là
 * việc của nơi gọi (`canTransitionBooking` và bản ghi giao xe), gộp vào đây sẽ giấu mất chúng.
 */
export function isNoShowGracePassed(pickupAt: Date | string, now: Date = new Date()): boolean {
  return now.getTime() >= noShowAllowedFrom(pickupAt).getTime();
}

// ── Nhóm việc dựng sẵn cho danh sách đơn ─────────────────────────────────────

/**
 * Lối tắt tới một NHÓM VIỆC trên danh sách đơn — KHÔNG phải một trạng thái đơn mới.
 *
 * Vì sao là một từ vựng riêng chứ không phải vài tham số lọc rời (`status=reserved,confirmed`
 * + `actualPickupAt=null` + …): điều kiện của một nhóm việc là một CÂU nghiệp vụ, và câu đó
 * phải được phát biểu đúng một lần ở server. Cho client tự ghép ba tham số nghĩa là mỗi client
 * giữ một bản của câu đó, và bản nào lạc hậu thì nó âm thầm đếm sai — không đỏ ở đâu cả.
 *
 * `awaiting_pickup` = đơn đã hình thành nhưng XE CHƯA RỜI BÃI. Nó cắt ngang `reserved` và
 * `confirmed`, nên không có một `status` nào diễn đạt được nó.
 */
export const BOOKING_LIST_PRESET = {
  AWAITING_PICKUP: 'awaiting_pickup',
} as const;

export type BookingListPreset = (typeof BOOKING_LIST_PRESET)[keyof typeof BOOKING_LIST_PRESET];
export const BOOKING_LIST_PRESET_VALUES = Object.values(
  BOOKING_LIST_PRESET,
) as BookingListPreset[];
