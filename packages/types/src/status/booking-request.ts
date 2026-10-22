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
   * **@deprecated — CHẾT** (ADR 0047 xác minh 0 writer; ADR 0055 khoá ở DB bằng CHECK
   * `booking_requests_status_valid`). Luồng duyệt chuyển thẳng sang `converted_to_booking` (không
   * hold) hoặc `awaiting_hold` (có hold) trong CÙNG transaction, không dừng ở chặng nào khác.
   *
   * Chỉ còn ở đây để `apps/mobile` (phụ thuộc workspace) biên dịch được — xoá hẳn là việc của
   * đội mobile khi họ hết tham chiếu. Không dùng trong code mới; danh sách cho DTO/UI là
   * `BOOKING_REQUEST_STATUS_LIVE_VALUES`.
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
   * Luôn có `decided_at` — DB bắt buộc bằng CHECK `booking_requests_awaiting_hold_decided`
   * (ADR 0055). Trước ADR 0044 trạng thái này mang nghĩa NGƯỢC LẠI ("khách vừa bấm đặt, chưa ai
   * duyệt", ADR 0039); nghĩa đó đã bị gỡ hẳn cùng mọi nhánh xử lý của nó.
   *
   * Tiền ĐỦ ⇒ đi THẲNG sang `converted_to_booking` trong transaction đối soát.
   */
  AWAITING_HOLD: 'awaiting_hold',
  /**
   * **@deprecated — ĐÃ GỠ (ADR 0055).** Chặng "khách đã trả đủ, chờ gian hàng nhận" của luồng
   * thu-trước-duyệt ADR 0039, đã bị ADR 0044 thay. Không còn writer, không còn nhánh xử lý ở API
   * lẫn worker, và DB từ chối giá trị này (CHECK `booking_requests_status_valid`).
   *
   * Chỉ còn ở đây để `apps/mobile` biên dịch được — xoá hẳn là việc của đội mobile. Không dùng
   * trong code mới.
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
   * Chỉ dùng cho chặng CHƯA có đơn thuê (`awaiting_hold`).
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

/** Hai giá trị chỉ còn trong enum cho mobile biên dịch — DB từ chối cả hai (ADR 0055). */
const BOOKING_REQUEST_STATUS_RETIRED: readonly BookingRequestStatus[] = [
  BOOKING_REQUEST_STATUS.APPROVED_BY_HOST,
  BOOKING_REQUEST_STATUS.HOLD_PAID,
];

/**
 * Trạng thái THẬT của một yêu cầu — đúng tập CHECK `booking_requests_status_valid` cho phép.
 *
 * Dùng cho mọi chỗ liệt kê ra ngoài: `@IsIn` của DTO, enum OpenAPI, ô lọc trạng thái, đếm theo
 * trạng thái. `BOOKING_REQUEST_STATUS_VALUES` còn mang hai giá trị đã gỡ — cùng khuôn với
 * `BOOKING_STATUS_SELECTABLE_VALUES` loại `confirmed` (ADR 0047).
 */
export const BOOKING_REQUEST_STATUS_LIVE_VALUES = BOOKING_REQUEST_STATUS_VALUES.filter(
  (status) => !BOOKING_REQUEST_STATUS_RETIRED.includes(status),
);

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
  /*
   * Đã được nhận, đang chờ khách chuyển tiền (ADR 0044) — trạng thái DUY NHẤT của yêu cầu giữ
   * lịch (ADR 0055 gỡ `approved_by_host` và `hold_paid`). Nhả lịch ở đây nghĩa là khách vừa được
   * chủ xe đồng ý, quay sang app ngân hàng, rồi quay lại thấy chiếc xe đã bị người khác đặt.
   */
  BOOKING_REQUEST_STATUS.AWAITING_HOLD,
];

// ── Liên hệ giữa hai bên (ADR 0028 điều 9) ──────────────────────────────────

/**
 * Chuyến đã thành QUAN HỆ THẬT chưa — tức là đã có ĐƠN thuê.
 *
 * Đây là mốc nền tảng mở liên hệ trực tiếp giữa hai người: trước nó, một yêu cầu gửi rồi tự huỷ
 * (hoặc một lượt duyệt rồi không trả tiền giữ chỗ) sẽ thành cách lấy số của nhau để chốt ngoài sàn.
 * Đã DUYỆT mà chưa có đơn (`awaiting_hold` — chờ khách trả tiền giữ chỗ) vẫn CHƯA phải quan hệ thật.
 */
export function isBookingRequestEngaged(status: string, hasBooking: boolean): boolean {
  return hasBooking || status === BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING;
}

/**
 * Phía CHỦ XE được thấy liên hệ (SĐT, email) của KHÁCH chưa — MỘT luật cho mọi bề mặt: hộp thư
 * yêu cầu, hộp thoại chi tiết, danh sách chuyến cho thuê.
 *
 *  - Gian hàng TUYẾN GÓI: luôn thấy — quyền liên hệ và chốt trực tiếp là thứ họ đã mua
 *    (ADR 0028 điều 1, 9).
 *  - Chủ xe TUYẾN HOA HỒNG: chỉ khi chuyến đã có đơn (`isBookingRequestEngaged`) — chủ sản phẩm chốt
 *    07/10/2026. Trước đó hộp thư lộ SĐT ngay khi khách gửi, trong khi trang chuyến đã giấu.
 *
 * `packageTrack` là TUYẾN HIỆU LỰC (`tenantUsesManagePortal` trên `resolveEffectiveBilling`), không
 * phải "có dòng thuê bao" — gian hàng đang trong ân hạn vẫn là tuyến gói.
 */
export function hostSeesCustomerContact(input: {
  engaged: boolean;
  packageTrack: boolean;
}): boolean {
  return input.engaged || input.packageTrack;
}

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
  /* @deprecated — đã gỡ (ADR 0055); nhãn còn vì `Record` phải phủ đủ enum mobile đang đọc. */
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
 * Hạn phản hồi ĐỘNG của gian hàng — ADR 0066 (thay cửa sổ cố định 60 phút).
 *
 * Gọi `ΔT = pickupAt − createdAt`. Gian hàng có `clamp(round(ΔT × 20%), 15′, 240′)` để trả lời —
 * chuyến xa (ΔT ≥ 20 giờ, và mọi ΔT ≥ 24 giờ) được trọn 4 giờ; yêu cầu DÀI HẠN chưa có giờ nhận
 * (`pickupAt = null`, gian hàng chốt lịch lúc duyệt) cũng được 4 giờ.
 *
 * Vì sao có hạn: yêu cầu chờ duyệt KHÔNG chiếm lịch xe (`BOOKING_REQUEST_STATUS_OCCUPYING`),
 * nên một yêu cầu nằm im vô thời hạn không khoá gì cả — nó chỉ khoá KHÁCH, người đang chờ một
 * câu trả lời để còn đi tìm xe khác. Hạn phản hồi là lời hứa với khách, không phải một cơ chế
 * dọn dữ liệu. Vì sao tỉ lệ với ΔT: 60 phút cố định là quá gắt với chuyến tuần sau (chủ xe đang
 * ngủ / đang giao xe khác) mà lại quá dài với chuyến nhận sau 90 phút.
 *
 * ⚠️ Hạn KHÔNG bị kẹp bởi `pickupAt`: với ΔT rất nhỏ, sàn 15′ có thể vượt giờ nhận xe. Đó là chủ
 * đích (ADR 0066) — dưới 15′ không ai mở máy kịp để duyệt; lượt duyệt khi đó tự vấp
 * `HOLD_WINDOW_TOO_SHORT` hoặc lịch đã qua, và yêu cầu hết hạn như thường.
 *
 * Số này sống ở `packages/types` vì cả ba phía phải nói cùng một con số: API tính `respondBy`
 * lúc nhận yêu cầu, worker expire theo đúng mốc đó, và web đếm ngược tới đúng nó.
 */
export const BOOKING_REQUEST_RESPOND_WINDOW = {
  /** Phần của ΔT dành cho gian hàng trả lời. */
  SHARE: 0.2,
  /** Sàn (phút) — dưới mức này không ai kịp mở máy để duyệt. */
  MIN_MINUTES: 15,
  /** Trần (phút) — cũng là cửa sổ của yêu cầu dài hạn chưa có giờ nhận. */
  MAX_MINUTES: 240,
} as const;

/**
 * **@deprecated (ADR 0066)** — hạn phản hồi không còn là một con số cố định; dùng
 * `bookingRequestRespondWindowMinutes` (hoặc đọc `respondBy` đã lưu). Giờ mang giá trị TRẦN của
 * cửa sổ động. Chỉ còn để `apps/mobile` biên dịch — không dùng trong code mới.
 */
export const BOOKING_REQUEST_RESPOND_WINDOW_MINUTES = BOOKING_REQUEST_RESPOND_WINDOW.MAX_MINUTES;

/**
 * Hai mốc nhắc gian hàng, tính bằng **số phút CÒN LẠI** tới hạn — cùng khuôn với
 * `HOLD_PAYMENT_REMINDER_REMAINING_MINUTES`.
 *
 * Vì sao theo phần còn lại: cửa sổ mỗi yêu cầu dài khác nhau (15′–240′, ADR 0066), nên một mốc
 * "sau 20 phút" có thể bắn sau khi yêu cầu đã chết. Mốc "còn N phút" tự nằm đúng chỗ; worker bỏ
 * qua mốc nào ≥ chính cửa sổ của yêu cầu đó (nhắc "còn 60 phút" cho một yêu cầu có 30 phút là
 * nhắc ngay lúc khách vừa gửi — vô nghĩa).
 *
 * Nhắc TRƯỚC khi hết hạn chứ không phải sau: mục đích là để yêu cầu được trả lời, không phải
 * để báo cáo rằng nó đã chết. `FINAL` cách hạn 15 phút — đủ để mở máy và bấm, không đủ để quên.
 */
export const BOOKING_REQUEST_REMINDER_REMAINING_MINUTES = {
  FIRST: 60,
  FINAL: 15,
} as const;

/** Phút còn lại tại mốc nhắc cuối — dùng cho câu "còn {n} phút" của thông báo. */
export const BOOKING_REQUEST_FINAL_REMINDER_REMAINING_MINUTES =
  BOOKING_REQUEST_REMINDER_REMAINING_MINUTES.FINAL;

const MS_PER_MINUTE = 60_000;

/**
 * Độ dài hạn phản hồi (phút) của một yêu cầu gửi lúc `createdAt` cho giờ nhận `pickupAt` —
 * `clamp(round(ΔT × 20%), 15′, 240′)`; không có giờ nhận (dài hạn) ⇒ 240′. Hàm thuần.
 */
export function bookingRequestRespondWindowMinutes(
  createdAt: Date,
  pickupAt?: Date | null,
): number {
  const { SHARE, MIN_MINUTES, MAX_MINUTES } = BOOKING_REQUEST_RESPOND_WINDOW;
  if (!pickupAt) return MAX_MINUTES;
  const leadMinutes = Math.max(0, (pickupAt.getTime() - createdAt.getTime()) / MS_PER_MINUTE);
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(leadMinutes * SHARE)));
}

/**
 * Hạn phản hồi của một yêu cầu gửi lúc `createdAt`. SERVER tính — client không gửi giá trị này.
 * Bỏ `pickupAt` (yêu cầu dài hạn chưa chốt giờ nhận) ⇒ trọn 240′.
 */
export function bookingRequestRespondBy(createdAt: Date, pickupAt?: Date | null): Date {
  return new Date(
    createdAt.getTime() + bookingRequestRespondWindowMinutes(createdAt, pickupAt) * MS_PER_MINUTE,
  );
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

/**
 * Bản nháp đặt xe (khách chưa đăng nhập ở bước Chuyến đi — ADR 0060) sống bấy lâu; quá hạn là bỏ,
 * vì giá và lịch trống đã có thể khác. Web (`sessionStorage`) và app dùng chung con số.
 */
export const BOOKING_DRAFT_TTL_MS = 30 * 60 * 1000;

/**
 * Trần độ dài lời nhắn khách gửi chủ xe kèm yêu cầu thuê (`booking_requests.note`). DTO bên API và
 * form của web/app đọc CÙNG con số — lệch nhau là khách gõ xong mới bị server từ chối.
 */
export const BOOKING_REQUEST_NOTE_MAX_LENGTH = 2000;

/**
 * Hai số giữ cho một lần gõ địa chỉ giao xe tốn ĐÚNG một lượt tra bản đồ có tính tiền (ADR 0061):
 * chưa đủ dài thì không hỏi, và chờ khách gõ xong mới hỏi. Web và app dùng chung.
 */
export const MIN_DELIVERY_ADDRESS_LENGTH = 12;
export const DELIVERY_ADDRESS_DEBOUNCE_MS = 900;
