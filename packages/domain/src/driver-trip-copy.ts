import { DRIVER_MISSING_ALERT_LEAD_MINUTES, DRIVER_REASSIGN_TARGET_MINUTES } from '@xeprime/types';

/**
 * Câu chữ thông báo khi một lượt gán tài xế RƠI về bên thuê — tài xế từ chối, hoặc không trả lời
 * trong hạn (ADR 0063 · ADR 0066).
 *
 * Ở `@xeprime/domain` vì HAI tiến trình phát cùng một tin: API (tài xế bấm Từ chối — kể cả bấm
 * muộn sau hạn) và worker (quét hạn trả lời). Hai bản chép tay sẽ lệch nhau ngay lần sửa chữ đầu
 * tiên. Câu thông báo dựng bằng tiếng Việt ở nơi phát, như mọi thông báo khác của hệ thống.
 */

/** Tên gọi tài xế trong thông báo khi liên kết thiếu tên — API và worker dùng chung. */
const DRIVER_NAME_FALLBACK = 'Tài xế';

/** Tên hiển thị của tài xế trong câu thông báo — rơi về "Tài xế" khi liên kết không còn tên. */
export function driverDisplayName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : DRIVER_NAME_FALLBACK;
}

/**
 * Hạn đẩy (push) của tin "gán tài xế khác" — đẩy muộn hơn mục tiêu gán lại
 * (`DRIVER_REASSIGN_TARGET_MINUTES`) là báo một việc đã quá giờ; hộp thư vẫn giữ tin.
 */
export function driverReassignPushExpiresAt(now: Date): Date {
  return new Date(now.getTime() + DRIVER_REASSIGN_TARGET_MINUTES * 60_000);
}

export interface DriverTripReleasedCopyInput {
  /** Tên bên thuê đặt cho tài xế (trên liên kết). */
  driverName: string;
  bookingCode: string;
}

/** Tin KHẨN cho bên thuê: tài xế không phản hồi trong hạn, đơn đã về chưa có tài xế. */
export function driverResponseExpiredEmployerCopy(input: DriverTripReleasedCopyInput): {
  title: string;
  body: string;
} {
  return {
    title: `Tài xế ${input.driverName} không phản hồi chuyến ${input.bookingCode} — gán tài xế khác trong ${DRIVER_REASSIGN_TARGET_MINUTES} phút`,
    body: 'Đơn hiện chưa có tài xế. Chuyến của khách vẫn giữ nguyên — hãy gán người khác sớm.',
  };
}

/** Tin cho bên thuê khi tài xế chủ động từ chối chuyến. */
export function driverTripDeclinedEmployerCopy(input: DriverTripReleasedCopyInput): {
  title: string;
  body: string;
} {
  return {
    title: `${input.driverName} từ chối chuyến ${input.bookingCode}`,
    body: `Đơn chưa có tài xế — hãy gán tài xế khác trong ${DRIVER_REASSIGN_TARGET_MINUTES} phút.`,
  };
}

/** Tin cho TÀI XẾ: lượt của họ đã hết hạn trả lời và được trả lại cho bên thuê. */
export function driverResponseExpiredDriverCopy(input: { bookingCode: string }): {
  title: string;
  body: string;
} {
  return {
    title: `Chuyến ${input.bookingCode} đã quá hạn xác nhận`,
    body: 'Bạn chưa trả lời trong hạn nên chuyến đã được trả lại cho bên thuê.',
  };
}

/**
 * Tin KHẨN cho bên thuê: chuyến có tài xế còn dưới `DRIVER_MISSING_ALERT_LEAD_MINUTES` tới giờ nhận
 * mà chưa có ai phủ (ADR 0067 điều 2). Chỉ worker phát, một lần mỗi đơn; đơn KHÔNG bị huỷ.
 */
export function driverMissingEmployerCopy(input: { bookingCode: string }): {
  title: string;
  body: string;
} {
  return {
    title: `Chuyến ${input.bookingCode} còn dưới ${DRIVER_MISSING_ALERT_LEAD_MINUTES / 60} giờ chưa có tài xế`,
    body: 'Gán tài xế liên kết hoặc nhập tài xế ngoài hệ thống cho đơn. Chuyến của khách vẫn giữ nguyên.',
  };
}
