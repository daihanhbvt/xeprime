import { HOLD_PAYMENT_REMINDER_REMAINING_MINUTES } from './holds';
import { BOOKING_REQUEST_FINAL_REMINDER_REMAINING_MINUTES } from './status/booking-request';
import { DRIVER_MISSING_ALERT_LEAD_MINUTES } from './status/driver';

/**
 * VẬN HÀNH CHUYẾN nhìn từ khu Platform Admin (`/platform/trips`) — các hàng đợi theo đúng thứ tự
 * một chuyến đi qua nền tảng (ADR 0044): khách hỏi → chủ xe nhận → khách giữ chỗ → giao xe →
 * trả xe. Người trực nền tảng không chuyển trạng thái gì (đó là việc của gian hàng — ADR 0006);
 * họ nhìn để biết chỗ nào đang kẹt và nhắc đúng người.
 *
 * Mã đi trên dây (`?queue=`, khoá của `counts`), không phải nhãn — nhãn ở namespace `AdminTrips`.
 */
export const PLATFORM_TRIP_QUEUE = {
  /** Yêu cầu thuê chờ CHỦ XE trả lời — có hạn (15′–4 giờ, ADR 0066), quá hạn là mất khách. */
  PENDING_APPROVAL: 'pending_approval',
  /** Chủ xe đã nhận, chờ KHÁCH chuyển tiền giữ chỗ trong cửa sổ 120′ — xe đang bị giữ. */
  AWAITING_HOLD: 'awaiting_hold',
  /** Đơn đã có (đã giữ chỗ), sắp tới giờ giao xe — hoặc đã quá giờ mà xe chưa rời bãi. */
  PICKUP_SOON: 'pickup_soon',
  /** Xe đang ở với khách — và những chuyến đã quá giờ trả. */
  ACTIVE: 'active',
  /**
   * Đơn CÓ TÀI XẾ đang kẹt khâu tài xế (ADR 0066 · 0067 · 0074): sắp nhận xe mà chưa có tài xế nhận,
   * lượt gán quá hạn trả lời, hoặc tài xế đã rút mà bên thuê chưa điều phối lại. Nền tảng chỉ nhìn
   * và gọi bên thuê - không gán tài xế thay họ.
   */
  DRIVER: 'driver',
} as const;

export type PlatformTripQueue = (typeof PLATFORM_TRIP_QUEUE)[keyof typeof PLATFORM_TRIP_QUEUE];

export const PLATFORM_TRIP_QUEUE_VALUES = Object.values(
  PLATFORM_TRIP_QUEUE,
) as PlatformTripQueue[];

export function isPlatformTripQueue(value: unknown): value is PlatformTripQueue {
  return (PLATFORM_TRIP_QUEUE_VALUES as unknown[]).includes(value);
}

/** Hai hàng đợi đọc từ `booking_requests` (chưa có đơn)… */
export const PLATFORM_TRIP_REQUEST_QUEUES = [
  PLATFORM_TRIP_QUEUE.PENDING_APPROVAL,
  PLATFORM_TRIP_QUEUE.AWAITING_HOLD,
] as const;

export type PlatformTripRequestQueue = (typeof PLATFORM_TRIP_REQUEST_QUEUES)[number];

/** …và hai hàng đợi đọc từ `bookings` (đơn đã ra đời). */
export const PLATFORM_TRIP_BOOKING_QUEUES = [
  PLATFORM_TRIP_QUEUE.PICKUP_SOON,
  PLATFORM_TRIP_QUEUE.ACTIVE,
] as const;

export type PlatformTripBookingQueue = (typeof PLATFORM_TRIP_BOOKING_QUEUES)[number];

export function isPlatformTripRequestQueue(value: unknown): value is PlatformTripRequestQueue {
  return (PLATFORM_TRIP_REQUEST_QUEUES as readonly unknown[]).includes(value);
}

/**
 * Vấn đề tài xế của MỘT đơn trong hàng đợi `driver` — ba nhóm loại trừ nhau, ưu tiên từ trên xuống:
 *
 *  - `dropped`: tài xế ĐÃ NHẬN rồi rút (ADR 0074), chưa ai nhận lại — vào hàng đợi khi đã quá hạn
 *    điều phối `driver_reassign_by` hoặc giờ nhận đã vào cửa sổ `TRIP_PICKUP_WINDOW_HOURS`;
 *  - `response_overdue`: lượt gán `pending` đã quá `driver_respond_by` mà worker chưa kịp trả về;
 *  - `unassigned`: giờ nhận trong `TRIP_PICKUP_WINDOW_HOURS` tới mà chưa có tài xế NHẬN (chưa gán,
 *    hoặc đang chờ tài xế trả lời trong hạn).
 */
export const PLATFORM_TRIP_DRIVER_ISSUE = {
  DROPPED: 'dropped',
  RESPONSE_OVERDUE: 'response_overdue',
  UNASSIGNED: 'unassigned',
} as const;

export type PlatformTripDriverIssue =
  (typeof PLATFORM_TRIP_DRIVER_ISSUE)[keyof typeof PLATFORM_TRIP_DRIVER_ISSUE];

export const PLATFORM_TRIP_DRIVER_ISSUE_VALUES = Object.values(
  PLATFORM_TRIP_DRIVER_ISSUE,
) as PlatformTripDriverIssue[];

/**
 * Đơn có tài xế còn dưới ngần này phút tới giờ nhận mà chưa có tài xế nhận là KHẨN — đúng mốc worker
 * báo khẩn bên thuê (ADR 0067 điều 2), để thông báo tự động và màn người trực nói cùng một mốc.
 */
export const TRIP_DRIVER_URGENT_MINUTES = DRIVER_MISSING_ALERT_LEAD_MINUTES;

export function isPlatformTripBookingQueue(value: unknown): value is PlatformTripBookingQueue {
  return (PLATFORM_TRIP_BOOKING_QUEUES as readonly unknown[]).includes(value);
}

/**
 * Hàng đợi "sắp giao xe" nhìn bao xa về phía trước. 24 giờ: đủ để một ca trực nhìn thấy cả
 * chuyến sáng mai, không xa đến mức hàng đợi thành bản sao của danh sách đơn.
 */
export const TRIP_PICKUP_WINDOW_HOURS = 24;

/**
 * Ngưỡng "SẮP tới giờ" của giao xe / trả xe — tô cam, chưa phải việc hỏng. Quá giờ mới là đỏ.
 */
export const TRIP_HANDOVER_SOON_HOURS = 2;

/**
 * Yêu cầu chờ duyệt còn ít hơn ngần này phút là KHẨN: worker đã nhắc gian hàng lần cuối ở đúng mốc
 * này (`BOOKING_REQUEST_REMINDER_REMAINING_MINUTES.FINAL` — còn 15′, ADR 0066) mà vẫn chưa có câu
 * trả lời — tới lượt người
 * trực nhấc máy. Hai kênh (thông báo tự động, màn người trực) vì thế nói cùng một mốc.
 */
export const TRIP_REQUEST_URGENT_MINUTES = BOOKING_REQUEST_FINAL_REMINDER_REMAINING_MINUTES;

/** Cùng luật cho tiền giữ chỗ: khẩn từ mốc nhắc cuối của khách (ADR 0044 điều 3). */
export const TRIP_HOLD_URGENT_MINUTES = HOLD_PAYMENT_REMINDER_REMAINING_MINUTES.FINAL;

/**
 * Hai lượt nhắc tay của nền tảng cho CÙNG một yêu cầu phải cách nhau ít nhất ngần này phút —
 * gian hàng nhận bốn tin "XePrime nhắc" trong năm phút là học được rằng tin của XePrime chỉ là nhiễu.
 */
export const TRIP_PLATFORM_REMIND_COOLDOWN_MINUTES = 10;

/**
 * Mức cần để mắt của MỘT dòng, suy từ thời gian còn lại tới mốc của nó — một phép tính cho cả API
 * (đếm `urgentCount`) lẫn web (tô màu dòng), để con số trên thẻ và số dòng đỏ trong bảng là một.
 *
 *  - `overdue`: mốc đã qua (quá giờ giao/trả xe; hạn phản hồi/giữ chỗ đã hết nhưng worker chưa quét);
 *  - `urgent`: còn dưới `urgentMs`;
 *  - `soon`: còn dưới `soonMs` (chỉ khi truyền);
 *  - `normal`: còn xa.
 */
export type TripUrgency = 'overdue' | 'urgent' | 'soon' | 'normal';

export function tripUrgency(
  remainingMs: number,
  thresholds: { urgentMs: number; soonMs?: number },
): TripUrgency {
  if (remainingMs <= 0) return 'overdue';
  if (remainingMs <= thresholds.urgentMs) return 'urgent';
  if (thresholds.soonMs !== undefined && remainingMs <= thresholds.soonMs) return 'soon';
  return 'normal';
}
