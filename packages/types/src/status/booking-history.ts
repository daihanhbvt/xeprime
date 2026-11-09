/**
 * Màn "Đơn đã kết thúc" của site partner (05/11/2026) — MỘT danh sách gộp hai thực thể đã đóng:
 * ĐƠN thuê đã hoàn thành / huỷ / khách không đến, và YÊU CẦU không bao giờ thành đơn (bị từ chối,
 * quá hạn phản hồi, khách rút, hết hạn thanh toán, xe đã có người nhận, gian hàng huỷ khi chờ khách
 * trả). Endpoint `GET /booking-history`; quyết định sản phẩm: `docs/design/09_PARTNER_REDESIGN.md` §3.2.
 *
 * Đây là mã TRÊN DÂY (ADR 0005) — nhãn do client dịch (namespace `Domain`).
 */

/** Dòng lịch sử là một đơn thuê hay một yêu cầu chưa từng thành đơn. */
export const BOOKING_HISTORY_KIND = {
  BOOKING: 'booking',
  REQUEST: 'request',
} as const;

export type BookingHistoryKind = (typeof BOOKING_HISTORY_KIND)[keyof typeof BOOKING_HISTORY_KIND];
export const BOOKING_HISTORY_KIND_VALUES = Object.values(
  BOOKING_HISTORY_KIND,
) as BookingHistoryKind[];

/** Bốn ngăn của màn — "Tất cả" gộp ba ngăn còn lại, không ngăn nào chồng ngăn nào. */
export const BOOKING_HISTORY_TAB = {
  ALL: 'all',
  /** Đơn đã trả xe xong. */
  COMPLETED: 'completed',
  /** Đơn bị huỷ hoặc khách không đến — chuyến đã có đơn nhưng không diễn ra trọn. */
  CANCELLED: 'cancelled',
  /** Yêu cầu không bao giờ thành đơn. */
  NOT_CONVERTED: 'not_converted',
} as const;

export type BookingHistoryTab = (typeof BOOKING_HISTORY_TAB)[keyof typeof BOOKING_HISTORY_TAB];
export const BOOKING_HISTORY_TAB_VALUES = Object.values(BOOKING_HISTORY_TAB) as BookingHistoryTab[];

/**
 * Kết cục của một dòng lịch sử — SERVER suy (phía huỷ đọc từ `booking_cancellations`, ADR 0045),
 * client chỉ dịch nhãn. Ba nhóm tương ứng ba ngăn (xem `BOOKING_HISTORY_TAB_OUTCOMES`).
 */
export const BOOKING_HISTORY_OUTCOME = {
  COMPLETED: 'completed',
  CANCELLED_BY_CUSTOMER: 'cancelled_by_customer',
  /** Gian hàng huỷ — kể cả nhân viên được uỷ quyền (ADR 0045 điều 2). */
  CANCELLED_BY_HOST: 'cancelled_by_host',
  /** XePrime huỷ, bất khả kháng đã xác minh, hoặc đơn cũ không có dòng trách nhiệm. */
  CANCELLED_OTHER: 'cancelled_other',
  NO_SHOW: 'no_show',
  REQUEST_REJECTED: 'request_rejected',
  /** Gian hàng không phản hồi trong hạn. */
  REQUEST_EXPIRED: 'request_expired',
  /** Khách rút yêu cầu. */
  REQUEST_WITHDRAWN: 'request_withdrawn',
  /** Đã nhận nhưng khách không thanh toán kịp. */
  REQUEST_HOLD_EXPIRED: 'request_hold_expired',
  /** Khung giờ đã thuộc về khách khác (ADR 0044 điều 6). */
  REQUEST_SLOT_TAKEN: 'request_slot_taken',
  /** Gian hàng huỷ khi chờ khách thanh toán (ADR 0045 điều 1). */
  REQUEST_CANCELLED_BY_HOST: 'request_cancelled_by_host',
} as const;

export type BookingHistoryOutcome =
  (typeof BOOKING_HISTORY_OUTCOME)[keyof typeof BOOKING_HISTORY_OUTCOME];
export const BOOKING_HISTORY_OUTCOME_VALUES = Object.values(
  BOOKING_HISTORY_OUTCOME,
) as BookingHistoryOutcome[];

/** Kết cục thuộc ngăn nào — ô lọc "Trạng thái" của màn chỉ mời những kết cục của ngăn đang mở. */
export const BOOKING_HISTORY_TAB_OUTCOMES: Readonly<
  Record<BookingHistoryTab, readonly BookingHistoryOutcome[]>
> = {
  [BOOKING_HISTORY_TAB.COMPLETED]: [BOOKING_HISTORY_OUTCOME.COMPLETED],
  [BOOKING_HISTORY_TAB.CANCELLED]: [
    BOOKING_HISTORY_OUTCOME.CANCELLED_BY_CUSTOMER,
    BOOKING_HISTORY_OUTCOME.CANCELLED_BY_HOST,
    BOOKING_HISTORY_OUTCOME.NO_SHOW,
    BOOKING_HISTORY_OUTCOME.CANCELLED_OTHER,
  ],
  [BOOKING_HISTORY_TAB.NOT_CONVERTED]: [
    BOOKING_HISTORY_OUTCOME.REQUEST_REJECTED,
    BOOKING_HISTORY_OUTCOME.REQUEST_EXPIRED,
    BOOKING_HISTORY_OUTCOME.REQUEST_WITHDRAWN,
    BOOKING_HISTORY_OUTCOME.REQUEST_HOLD_EXPIRED,
    BOOKING_HISTORY_OUTCOME.REQUEST_SLOT_TAKEN,
    BOOKING_HISTORY_OUTCOME.REQUEST_CANCELLED_BY_HOST,
  ],
  [BOOKING_HISTORY_TAB.ALL]: BOOKING_HISTORY_OUTCOME_VALUES,
};
