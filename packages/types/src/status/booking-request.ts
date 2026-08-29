import { STATUS_COLOR, type StatusMeta } from './meta';

/**
 * Trạng thái yêu cầu đặt xe từ Marketplace (ADR 0005).
 *
 * Nguồn: `xeprime_database_design.md` §11.1. `xeprime_overall_user_flow_next_node.md` §15 ghi
 * `approved` / `customer_cancelled` — bản đó BỊ GHI ĐÈ.
 */
export const BOOKING_REQUEST_STATUS = {
  PENDING_HOST_APPROVAL: 'pending_host_approval',
  APPROVED_BY_HOST: 'approved_by_host',
  REJECTED_BY_HOST: 'rejected_by_host',
  CANCELLED_BY_CUSTOMER: 'cancelled_by_customer',
  EXPIRED: 'expired',
  CONVERTED_TO_BOOKING: 'converted_to_booking',
  /**
   * Tuyến hoa hồng: khách đã bấm đặt, đang chờ chuyển khoản giữ chỗ (ADR 0021).
   *
   * **CHIẾM LỊCH** — khác hẳn `pending_host_approval`. Không có bước chủ xe duyệt: đủ tiền là
   * đơn thuê được tạo ngay trong transaction của webhook.
   */
  AWAITING_HOLD: 'awaiting_hold',
  /** Quá cửa sổ chuyển khoản mà chưa đủ tiền — worker ghi, nhả lịch. Kết thúc. */
  HOLD_EXPIRED: 'hold_expired',
} as const;

export type BookingRequestStatus =
  (typeof BOOKING_REQUEST_STATUS)[keyof typeof BOOKING_REQUEST_STATUS];

export const BOOKING_REQUEST_STATUS_VALUES = Object.values(
  BOOKING_REQUEST_STATUS,
) as BookingRequestStatus[];

export function isBookingRequestStatus(value: unknown): value is BookingRequestStatus {
  return typeof value === 'string' && (BOOKING_REQUEST_STATUS_VALUES as string[]).includes(value);
}

/**
 * Trạng thái CHIẾM CHỖ trên lịch xe (ADR 0006).
 *
 * `pending_host_approval` cố ý KHÔNG chiếm lịch: nhiều khách được phép cùng hỏi một xe
 * cùng khung giờ, ai được duyệt trước thì được xe. Chỉ khi shop duyệt mới giữ chỗ.
 *
 * `awaiting_hold` thì NGƯỢC LẠI, và đó là chủ ý (ADR 0021 điều 6). Lập luận ở đoạn trên nói về
 * việc **hỏi**; trả tiền là chuyện khác. Nếu đợi tiền về mới chiếm lịch thì hai khách cùng
 * chuyển khoản cho một chỗ và nền tảng buộc phải hoàn một người — phá đúng cái đơn giản hoá
 * "không cần đường chuyển trả" mà cả mô hình dựa vào. Khoá mềm 15 phút
 * (`HOLD_PAYMENT_WINDOW_MINUTES`) là mặt rẻ của đánh đổi đó.
 *
 * ⚠️ Mảng này **không có kiểm tra vét cạn của compiler**: thêm một trạng thái chiếm lịch mà quên
 * khai ở đây là bán trùng xe, im lặng. `status.test.ts` khoá danh sách này — nếu bạn đang sửa
 * mảng và test đỏ, hãy chắc chắn bạn thật sự muốn đổi ngữ nghĩa chiếm lịch.
 */
export const BOOKING_REQUEST_STATUS_OCCUPYING: readonly BookingRequestStatus[] = [
  BOOKING_REQUEST_STATUS.APPROVED_BY_HOST,
  BOOKING_REQUEST_STATUS.AWAITING_HOLD,
];

/**
 * Lộ trình của yêu cầu thuê XE CÓ TÀI XẾ (mô hình 3 lộ trình — plan 17/08).
 *
 * Là NGỮ CẢNH để shop báo giá đúng khi duyệt (phụ phí 1 chiều/lưu đêm...), KHÔNG phải chiều
 * lọc marketplace — xe không khai "lộ trình phục vụ" nên lọc theo nó chỉ tạo kết quả rỗng giả.
 */
export const ROUTE_TYPE = {
  IN_CITY: 'in_city',
  INTER_CITY: 'inter_city',
  INTER_CITY_ONE_WAY: 'inter_city_one_way',
} as const;

export type RouteType = (typeof ROUTE_TYPE)[keyof typeof ROUTE_TYPE];
export const ROUTE_TYPE_VALUES = Object.values(ROUTE_TYPE) as RouteType[];

export const ROUTE_TYPE_LABEL: Readonly<Record<RouteType, string>> = {
  [ROUTE_TYPE.IN_CITY]: 'Nội thành',
  [ROUTE_TYPE.INTER_CITY]: 'Liên tỉnh',
  [ROUTE_TYPE.INTER_CITY_ONE_WAY]: 'Liên tỉnh (1 chiều)',
};

/** Mô tả ngắn dưới radio lộ trình — hero tìm kiếm và bước gửi yêu cầu dùng chung. */
export const ROUTE_TYPE_DESCRIPTION: Readonly<Record<RouteType, string>> = {
  [ROUTE_TYPE.IN_CITY]: 'Di chuyển trong nội thành hoặc lân cận, lộ trình tự do',
  [ROUTE_TYPE.INTER_CITY]: 'Đi tỉnh/thành khác và quay về điểm đón (khứ hồi)',
  [ROUTE_TYPE.INTER_CITY_ONE_WAY]:
    'Đi tỉnh/thành khác một chiều — gian hàng có thể báo thêm phụ phí',
};

export function isRouteType(value: unknown): value is RouteType {
  return typeof value === 'string' && (ROUTE_TYPE_VALUES as string[]).includes(value);
}

/** Nhãn một lộ trình, chịu được giá trị lạ trong dữ liệu cũ — không bao giờ in mã thô. */
export function routeTypeLabel(value: string): string {
  return (ROUTE_TYPE_LABEL as Readonly<Record<string, string>>)[value] ?? value;
}

export const BOOKING_REQUEST_STATUS_META: Readonly<Record<BookingRequestStatus, StatusMeta>> = {
  [BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL]: {
    label: 'Chờ chủ shop duyệt',
    color: STATUS_COLOR.WAITING,
  },
  [BOOKING_REQUEST_STATUS.APPROVED_BY_HOST]: {
    label: 'Chủ shop đã duyệt',
    color: STATUS_COLOR.SUCCESS,
  },
  [BOOKING_REQUEST_STATUS.REJECTED_BY_HOST]: {
    label: 'Chủ shop từ chối',
    color: STATUS_COLOR.DANGER,
  },
  [BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER]: {
    label: 'Khách đã hủy',
    color: STATUS_COLOR.NEUTRAL,
  },
  [BOOKING_REQUEST_STATUS.EXPIRED]: {
    label: 'Quá hạn phản hồi',
    color: STATUS_COLOR.NEUTRAL,
  },
  [BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING]: {
    label: 'Đã tạo đơn thuê',
    color: STATUS_COLOR.SUCCESS,
  },
  [BOOKING_REQUEST_STATUS.AWAITING_HOLD]: {
    label: 'Chờ chuyển giữ chỗ',
    color: STATUS_COLOR.WAITING,
  },
  [BOOKING_REQUEST_STATUS.HOLD_EXPIRED]: {
    label: 'Hết hạn chuyển giữ chỗ',
    color: STATUS_COLOR.NEUTRAL,
  },
};

// ── Hạn phản hồi của gian hàng ──────────────────────────────────────────────

/**
 * Gian hàng có **60 phút** để trả lời một yêu cầu thuê.
 *
 * Vì sao có hạn: yêu cầu chờ duyệt KHÔNG chiếm lịch xe (`BOOKING_REQUEST_STATUS_OCCUPYING`),
 * nên một yêu cầu nằm im vô thời hạn không khoá gì cả — nó chỉ khoá KHÁCH, người đang chờ một
 * câu trả lời để còn đi tìm xe khác. Hạn phản hồi là lời hứa với khách, không phải một cơ chế
 * dọn dữ liệu.
 *
 * Số này sống ở `packages/types` vì cả ba phía phải nói cùng một con số: API tính `respondBy`
 * lúc nhận yêu cầu, worker expire theo đúng mốc đó, và web đếm ngược tới đúng nó.
 */
export const BOOKING_REQUEST_RESPOND_WINDOW_MINUTES = 60;

/**
 * Hai mốc nhắc gian hàng, tính từ lúc khách gửi.
 *
 * Nhắc TRƯỚC khi hết hạn chứ không phải sau: mục đích là để yêu cầu được trả lời, không phải
 * để báo cáo rằng nó đã chết. `FINAL` cách hạn 15 phút — đủ để mở máy và bấm, không đủ để quên.
 */
export const BOOKING_REQUEST_REMINDER_MINUTES = {
  FIRST: 20,
  FINAL: 45,
} as const;

/** Phút còn lại tại mốc nhắc cuối — dùng cho câu "còn {n} phút" của thông báo. */
export const BOOKING_REQUEST_FINAL_REMINDER_REMAINING_MINUTES =
  BOOKING_REQUEST_RESPOND_WINDOW_MINUTES - BOOKING_REQUEST_REMINDER_MINUTES.FINAL;

const MS_PER_MINUTE = 60_000;

/** Hạn phản hồi của một yêu cầu gửi lúc `from`. SERVER tính — client không gửi giá trị này. */
export function bookingRequestRespondBy(from: Date): Date {
  return new Date(from.getTime() + BOOKING_REQUEST_RESPOND_WINDOW_MINUTES * MS_PER_MINUTE);
}

/**
 * Yêu cầu đã quá hạn phản hồi chưa — so mốc, không so trạng thái.
 *
 * Trạng thái `expired` do worker ghi, nên luôn có một cửa sổ (tới một nhịp worker) mà yêu cầu
 * đã quá hạn nhưng vẫn còn `pending_host_approval` trong DB. Endpoint duyệt/từ chối phải hỏi
 * hàm này chứ không phải hỏi cột `status`, nếu không cửa sổ đó là một lỗ để duyệt yêu cầu đã
 * chết.
 */
export function isBookingRequestPastDue(
  respondBy: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!respondBy) return false;
  const due = respondBy instanceof Date ? respondBy : new Date(respondBy);
  return due.getTime() <= now.getTime();
}

/** Mili-giây còn lại tới hạn (0 khi đã quá hạn hoặc không có hạn) — nuôi đồng hồ đếm ngược. */
export function bookingRequestRemainingMs(
  respondBy: Date | string | null | undefined,
  now: Date = new Date(),
): number {
  if (!respondBy) return 0;
  const due = respondBy instanceof Date ? respondBy : new Date(respondBy);
  return Math.max(0, due.getTime() - now.getTime());
}
