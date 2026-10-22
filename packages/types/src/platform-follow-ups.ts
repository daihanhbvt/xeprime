/**
 * CHĂM SÓC KHÁCH MẤT ĐƠN — tab "Cần chăm sóc" của Đơn thuê toàn hệ thống (admin nền tảng, ADR 0070).
 *
 * Một mục là MỘT yêu cầu thuê từ chợ đã kết thúc mà không thành chuyến: khách huỷ, khách không
 * chuyển tiền giữ chỗ, chủ xe từ chối / không trả lời / huỷ, khung giờ bị khách khác lấy, hoặc đơn
 * đã có rồi bị huỷ. Sale gọi lại khách và ghi kết quả vào `sales_follow_ups` (một dòng cho một yêu
 * cầu, writer duy nhất `PlatformFollowUpsService`).
 *
 * Mã đi trên dây, nhãn dịch ở namespace `AdminFollowUps`.
 */

/** Vì sao chuyến không thành — SERVER suy từ trạng thái yêu cầu + dòng `booking_cancellations`. */
export const FOLLOW_UP_LOST_REASON = {
  /** Khách tự huỷ yêu cầu, hoặc huỷ đơn đã có. */
  CUSTOMER_CANCELLED: 'customer_cancelled',
  /** Chủ xe đã nhận nhưng khách không chuyển tiền giữ chỗ kịp (`hold_expired`). */
  UNPAID: 'unpaid',
  /** Chủ xe từ chối, rút lại sau khi nhận, hoặc huỷ đơn đã có. */
  HOST_DECLINED: 'host_declined',
  /** Chủ xe không trả lời trước hạn (`expired`). */
  NO_RESPONSE: 'no_response',
  /** Khung giờ đã thuộc về khách khác (`slot_taken`). */
  SLOT_TAKEN: 'slot_taken',
  /** Đơn bị nền tảng huỷ hoặc bất khả kháng. */
  OTHER_CANCELLED: 'other_cancelled',
} as const;

export type FollowUpLostReason = (typeof FOLLOW_UP_LOST_REASON)[keyof typeof FOLLOW_UP_LOST_REASON];
export const FOLLOW_UP_LOST_REASON_VALUES = Object.values(
  FOLLOW_UP_LOST_REASON,
) as FollowUpLostReason[];

/** Trạng thái chăm sóc. `new` = chưa ai đụng tới (chưa có dòng `sales_follow_ups`, hoặc đặt lại). */
export const FOLLOW_UP_STATUS = {
  NEW: 'new',
  CONTACTED: 'contacted',
  /** Khách đã đặt lại (bất kỳ xe nào). */
  REBOOKED: 'rebooked',
  NOT_INTERESTED: 'not_interested',
} as const;

export type FollowUpStatus = (typeof FOLLOW_UP_STATUS)[keyof typeof FOLLOW_UP_STATUS];
export const FOLLOW_UP_STATUS_VALUES = Object.values(FOLLOW_UP_STATUS) as FollowUpStatus[];

/** Trần ghi chú chăm sóc — đủ cho vài lần gọi, không phải nơi chép hội thoại. */
export const FOLLOW_UP_NOTE_MAX_LENGTH = 2000;

/** Hành động audit của tab "Cần chăm sóc" — một nguồn cho API ghi và màn nhật ký đọc. */
export const FOLLOW_UP_AUDIT_ACTION = {
  UPDATE: 'booking_request.follow_up',
  CONTACT_REVEAL: 'booking_request.contact_reveal',
} as const;
