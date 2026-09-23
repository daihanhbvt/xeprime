import { STATUS_COLOR, type StatusMeta } from './meta';

/**
 * Trạng thái yêu cầu đặt xe từ Marketplace (ADR 0005).
 *
 * Nguồn: `xeprime_database_design.md` §11.1. `xeprime_overall_user_flow_next_node.md` §15 ghi
 * `approved` / `customer_cancelled` — bản đó BỊ GHI ĐÈ.
 */
export const BOOKING_REQUEST_STATUS = {
  PENDING_HOST_APPROVAL: 'pending_host_approval',
  /**
   * **@deprecated — CHẾT, không còn writer nào** (rà toàn bộ `apps/api`/`apps/web`/`apps/worker`
   * 23/09/2026, ADR 0047: không có điểm ghi nào; DB dev lẫn test đều 0 hàng). Luồng duyệt hiện
   * hành chuyển thẳng sang `converted_to_booking` (không hold) hoặc `awaiting_hold` (có hold)
   * trong CÙNG transaction, không bao giờ dừng ở một chặng "đã duyệt, chưa gì khác" riêng.
   *
   * Vẫn giữ trong enum vì `apps/mobile` còn tham chiếu (test) — không xoá khỏi shared type nếu
   * chưa phối hợp với đội mobile. Không dùng trong code mới.
   */
  APPROVED_BY_HOST: 'approved_by_host',
  REJECTED_BY_HOST: 'rejected_by_host',
  CANCELLED_BY_CUSTOMER: 'cancelled_by_customer',
  EXPIRED: 'expired',
  CONVERTED_TO_BOOKING: 'converted_to_booking',
  /**
   * **ĐÃ ĐƯỢC NHẬN · CHỜ THANH TOÁN TIỀN GIỮ CHỖ** — chặng giữa của luồng chuẩn (ADR 0044).
   *
   * Chủ xe đã duyệt (hoặc xe bật "Đặt ngay" và hệ thống tự nhận), nên lịch đã chốt, giá đã đóng
   * băng, mã `XPH…` đã phát và khách có `HOLD_PAYMENT_WINDOW_MINUTES` để chuyển tiền. Đơn thuê
   * chỉ ra đời khi backend đối soát xác nhận đã nhận ĐỦ tiền.
   *
   * **CHIẾM LỊCH** — khác hẳn `pending_host_approval`: ở kia nhiều khách được phép cùng hỏi một
   * chiếc xe, ở đây chỗ đã thuộc về đúng một người vì chủ xe đã đồng ý.
   *
   * ⚠️ Trước ADR 0044 trạng thái này mang nghĩa NGƯỢC LẠI — "khách vừa bấm đặt, chưa ai duyệt"
   * (ADR 0039). Dữ liệu cũ phân biệt được bằng `decided_at`: bản ghi theo luồng cũ cố ý để
   * trống cột đó.
   */
  AWAITING_HOLD: 'awaiting_hold',
  /**
   * **LEGACY (ADR 0039, đã bị ADR 0044 ghi đè)** — khách đã chuyển đủ tiền TRƯỚC khi có ai duyệt.
   *
   * Luồng hiện hành không bao giờ tạo trạng thái này nữa: tiền chỉ được thu sau khi chuyến đã
   * được nhận, nên "đã trả đủ" đồng nghĩa với "có đơn thuê". Nó ở lại vì những yêu cầu sinh ra
   * trong thời gian ADR 0039 còn hiệu lực phải đi hết đường của chúng — chủ xe vẫn nhận/từ chối
   * được, và worker vẫn hoàn tiền khi hết hạn phản hồi.
   *
   * **CHIẾM LỊCH.** Chủ xe từ chối hoặc hết hạn phản hồi ⇒ hoàn đủ cho khách và nhả chỗ.
   */
  HOLD_PAID: 'hold_paid',
  /** Quá cửa sổ chuyển tiền mà chưa đủ — worker ghi, nhả lịch. Kết thúc. */
  HOLD_EXPIRED: 'hold_expired',
  /**
   * Khung giờ đã thuộc về một khách khác — hệ thống đóng yêu cầu này (ADR 0044 điều 6).
   *
   * Nhiều khách được phép cùng hỏi một chiếc xe cho cùng khung giờ (ADR 0006), nhưng chỉ MỘT
   * lượt duyệt/tự nhận giữ được chỗ — `vehicle_occupancies` với `EXCLUDE USING gist` không cho
   * hai khoảng chồng nhau. Những yêu cầu còn lại vì thế không còn duyệt được, và để chúng nằm
   * im tới khi hết hạn phản hồi là đổ cho gian hàng một lỗi họ không gây ra, đồng thời bắt khách
   * chờ vô ích một câu trả lời đã có sẵn.
   *
   * Cố ý KHÔNG dùng `rejected_by_host` (không ai từ chối khách) và KHÔNG dùng `expired` (gian
   * hàng đã trả lời, chỉ là trả lời cho người khác). Vì vậy nó nằm ngoài CẢ HAI danh sách tính
   * tỉ lệ phản hồi.
   */
  SLOT_TAKEN: 'slot_taken',
  /**
   * **GIAN HÀNG RÚT LẠI một chuyến ĐÃ NHẬN** — khác hẳn `rejected_by_host`.
   *
   * `rejected_by_host` là "tôi không nhận chuyến này", nói ra trước khi có bất kỳ cam kết nào;
   * ở đây gian hàng ĐÃ nhận, xe đã bị giữ, khách đã được báo là chuyến của họ được chấp nhận và
   * có thể đang trên đường đi chuyển khoản. Với khách đó là hai trải nghiệm khác nhau, và với
   * chỉ số "nhận và giữ chuyến" chúng là hai con số khác nhau — nên chúng phải là hai trạng thái.
   *
   * Chỉ dùng cho chặng CHƯA có đơn thuê (`awaiting_hold`, và `hold_paid` của dữ liệu LEGACY).
   * Sau khi đơn đã tồn tại, việc huỷ thuộc về vòng đời ĐƠN (`bookings.status = cancelled`) và
   * yêu cầu giữ nguyên `converted_to_booking` — nó là lịch sử có thật.
   */
  CANCELLED_BY_HOST: 'cancelled_by_host',
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
 * `awaiting_hold` thì NGƯỢC LẠI, và đó là chủ ý: chuyến đã được NHẬN (ADR 0044), nên chỗ thuộc
 * về đúng một người và phải được giữ trong lúc họ chuyển tiền. Nếu đợi tiền về mới chiếm lịch
 * thì hai khách cùng chuyển khoản cho một chỗ và nền tảng buộc phải hoàn một người — phá đúng
 * cái đơn giản hoá "không cần đường chuyển trả" mà cả mô hình dựa vào. Khoá mềm
 * `HOLD_PAYMENT_WINDOW_MINUTES` là mặt rẻ của đánh đổi đó.
 *
 * ⚠️ Mảng này **không có kiểm tra vét cạn của compiler**: thêm một trạng thái chiếm lịch mà quên
 * khai ở đây là bán trùng xe, im lặng. `status.test.ts` khoá danh sách này — nếu bạn đang sửa
 * mảng và test đỏ, hãy chắc chắn bạn thật sự muốn đổi ngữ nghĩa chiếm lịch.
 */
export const BOOKING_REQUEST_STATUS_OCCUPYING: readonly BookingRequestStatus[] = [
  BOOKING_REQUEST_STATUS.APPROVED_BY_HOST,
  /*
   * Đã được nhận, đang chờ khách chuyển tiền (ADR 0044) — ô quan trọng nhất trong mảng này.
   * Nhả lịch ở đây nghĩa là khách vừa được chủ xe đồng ý, quay sang app ngân hàng, rồi quay lại
   * thấy chiếc xe của mình đã bị người khác đặt.
   */
  BOOKING_REQUEST_STATUS.AWAITING_HOLD,
  /* LEGACY ADR 0039: đã trả đủ mà chưa ai duyệt — tiền thật đang nằm ở XePrime cho chỗ này. */
  BOOKING_REQUEST_STATUS.HOLD_PAID,
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
  /*
   * Nhãn của GIAN HÀNG: họ đã nhận chuyến, xe đang bị giữ, và việc còn lại thuộc về KHÁCH. Màu
   * `PROCESSING` chứ không `SUCCESS` — chuyến chỉ chắc chắn khi tiền về.
   */
  [BOOKING_REQUEST_STATUS.AWAITING_HOLD]: {
    label: 'Đã nhận · chờ khách thanh toán',
    color: STATUS_COLOR.PROCESSING,
  },
  /* LEGACY ADR 0039 — tiền của khách đã nằm ở XePrime và chỗ xe bị khoá chờ một cú bấm. */
  [BOOKING_REQUEST_STATUS.HOLD_PAID]: {
    label: 'Đã thanh toán · chờ bạn duyệt',
    color: STATUS_COLOR.PROCESSING,
  },
  [BOOKING_REQUEST_STATUS.HOLD_EXPIRED]: {
    label: 'Khách không thanh toán',
    color: STATUS_COLOR.NEUTRAL,
  },
  [BOOKING_REQUEST_STATUS.SLOT_TAKEN]: {
    label: 'Khung giờ đã có khách khác',
    color: STATUS_COLOR.NEUTRAL,
  },
  [BOOKING_REQUEST_STATUS.CANCELLED_BY_HOST]: {
    label: 'Gian hàng đã huỷ',
    color: STATUS_COLOR.DANGER,
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
