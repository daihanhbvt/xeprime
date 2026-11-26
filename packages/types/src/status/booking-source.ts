/**
 * NGUỒN ĐƠN (ADR 0110) — đơn đến từ đâu. Cột `bookings.source`, CHECK `bookings_source_check`.
 *
 * Một cột trả lời HAI câu hỏi:
 *  - Đơn có đi qua sàn không? `xeprime` = có (khách đặt ở site khách, có tiền giữ chỗ, phí sàn, hoa
 *    hồng, thuế, bảo hiểm). Mọi giá trị khác = đơn chủ xe TỰ LẬP ở site partner, nằm ngoài sàn: không
 *    phí, không thuế, không bảo hiểm, không vào số liệu giao dịch của sàn (ADR 0028 điều 9).
 *  - Với đơn ngoài sàn: khách tới từ kênh nào — nhãn để chủ xe lọc và thống kê.
 *
 * `xeprime` do SERVER gắn, client không bao giờ gửi được: DB giữ luật `source = 'xeprime'` ⇔ đơn sinh
 * ra từ một yêu cầu đặt xe (trigger `bookings_source_matches_request`).
 */
export const BOOKING_SOURCE = {
  /** Đơn qua sàn — chỉ server gắn. */
  XEPRIME: 'xeprime',
  /** Khách vãng lai, tới trực tiếp. */
  WALK_IN: 'walk_in',
  /** Khách quen, đã thuê trước đó. */
  REPEAT_CUSTOMER: 'repeat_customer',
  /** Người quen giới thiệu. */
  REFERRAL: 'referral',
  /** Mạng xã hội (Facebook, Zalo, TikTok…). */
  SOCIAL: 'social',
  /** Một nền tảng cho thuê khác — `source_label` ghi tên nền tảng. */
  OTHER_PLATFORM: 'other_platform',
  /** Nguồn khác — `source_label` do chủ xe tự gõ. */
  OTHER: 'other',
} as const;

export type BookingSource = (typeof BOOKING_SOURCE)[keyof typeof BOOKING_SOURCE];
export const BOOKING_SOURCE_VALUES = Object.values(BOOKING_SOURCE) as BookingSource[];

/** Nguồn chủ xe CHỌN được khi tự lập đơn — mọi giá trị trừ `xeprime`. */
export const BOOKING_DIRECT_SOURCE_VALUES = BOOKING_SOURCE_VALUES.filter(
  (v) => v !== BOOKING_SOURCE.XEPRIME,
) as Exclude<BookingSource, 'xeprime'>[];
export type BookingDirectSource = (typeof BOOKING_DIRECT_SOURCE_VALUES)[number];

/**
 * Giá trị CHỈ của bộ lọc: "mọi đơn ngoài sàn" (mọi nguồn trừ `xeprime`). Không bao giờ nằm trong cột.
 */
export const BOOKING_SOURCE_FILTER_DIRECT = 'direct';
export const BOOKING_SOURCE_FILTER_VALUES = [
  ...BOOKING_SOURCE_VALUES,
  BOOKING_SOURCE_FILTER_DIRECT,
] as const;
export type BookingSourceFilter = (typeof BOOKING_SOURCE_FILTER_VALUES)[number];

/** Nguồn gán cho đơn tự lập khi client không gửi (app cũ) và cho đơn tự lập trước ADR 0110. */
export const BOOKING_SOURCE_DEFAULT_DIRECT = BOOKING_SOURCE.OTHER;

/** Trần nhãn tự nhập — khớp `bookings.source_label VARCHAR(50)`. */
export const BOOKING_SOURCE_LABEL_MAX = 50;
/** Số nhãn đã dùng trả về cho ô gợi ý của một gian hàng. */
export const BOOKING_SOURCE_LABEL_SUGGESTION_LIMIT = 30;

/**
 * ĐƠN QUA SÀN? — MỘT phép dùng chung cho API, web và app. Tiền của nền tảng, đánh giá công khai, chỉ
 * số uy tín và số liệu giao dịch của sàn chỉ tính đơn này.
 */
export function isMarketplaceBooking(source: string | null | undefined): boolean {
  return source === BOOKING_SOURCE.XEPRIME;
}

/** Nguồn nhận nhãn tự nhập (tên nền tảng / tên nguồn). Nguồn khác không mang nhãn. */
export function bookingSourceTakesLabel(source: string): boolean {
  return source === BOOKING_SOURCE.OTHER_PLATFORM || source === BOOKING_SOURCE.OTHER;
}

/** Audit khi chủ xe đổi nguồn của một đơn tự lập. */
export const BOOKING_SOURCE_AUDIT_ACTION = 'booking.source_update';

/**
 * Phần trăm ĐÃ THU của một đơn, để vẽ biểu tượng thanh toán trên lịch: 100 = thu đủ, 0 = chưa thu.
 * Làm tròn XUỐNG để "99,6%" không hiện thành thu đủ. Server tính trên cùng phép công nợ của đơn
 * (`common/booking-money.ts`); hàm này chỉ là phép chia cuối.
 */
export function bookingPaidPercent(amountDue: number, outstanding: number): number {
  if (!(amountDue > 0)) return 100;
  const paid = Math.max(0, amountDue - Math.max(0, outstanding));
  return Math.min(100, Math.floor((paid / amountDue) * 100));
}
