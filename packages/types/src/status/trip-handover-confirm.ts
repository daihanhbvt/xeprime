/**
 * Chuyến không treo ở mốc giao/trả xe — ADR 0081 (05/11/2026).
 *
 * Hai mảnh, một mục đích: một chuyến không được kẹt ở "Chờ giao xe" hay "Đang thuê" chỉ vì không ai
 * bấm nút.
 *
 *  1. **Nhắc theo đồng hồ** (worker `booking-trip-reminders`) — không động tới tiền, không đổi trạng
 *     thái: trước giờ nhận 60′ (gian hàng + khách), trước giờ trả 60′ (gian hàng + khách), quá giờ
 *     trả 30′ (gian hàng + khách). Mỗi mốc MỘT lần.
 *  2. **Lời của khách** ở trang chuyến: "Đã nhận xe" ⇒ đơn sang `active` ngay (khách không có lý do
 *     khai sai — khai sai chỉ làm chuyến của chính họ bắt đầu sớm); "Đã trả xe" ⇒ chủ xe có
 *     `CUSTOMER_RETURN_CONFIRM_WINDOW_HOURS` để xác nhận biên bản hoặc báo "khách chưa trả xe", im lặng
 *     thì API tự lập biên bản trả xe và đơn hoàn thành (quyết toán chạy như mọi lượt hoàn thành).
 *
 * Chỉ thuê TỰ LÁI và DÀI HẠN: chuyến có tài xế không có lượt khách cầm chìa khoá, người giao/nhận xe
 * là tài xế và gian hàng.
 */

import { BOOKING_STATUS, type BookingStatus } from './booking';
import { SERVICE_TYPE, type ServiceType } from './vehicle';

const MS_PER_MINUTE = 60_000;

/** Ai xác nhận một biên bản bàn giao — cột `vehicle_handovers.confirm_source` (CHECK ở migration). */
export const HANDOVER_CONFIRM_SOURCE = {
  /** Nhân sự gian hàng — mọi biên bản trước ADR 0081. */
  HOST: 'host',
  /** Khách bấm "Đã nhận xe" ở trang chuyến. `confirmed_by` = tài khoản khách. */
  CUSTOMER: 'customer',
  /**
   * Biên bản trả xe TỰ LẬP: khách đã báo "Đã trả xe" và chủ xe im lặng quá hạn. `confirmed_by` =
   * tài khoản khách (người duy nhất đã lên tiếng), không có KM/hiện trạng.
   */
  AUTO: 'auto',
  /**
   * Nhân sự NỀN TẢNG kết luận chuyến sau khi gọi xác minh một case `handover_unconfirmed` /
   * `return_unconfirmed` (ADR 0094). `confirmed_by` = tài khoản nhân sự đó, không có KM/hiện trạng.
   */
  PLATFORM: 'platform',
} as const;

export type HandoverConfirmSource =
  (typeof HANDOVER_CONFIRM_SOURCE)[keyof typeof HANDOVER_CONFIRM_SOURCE];

export const HANDOVER_CONFIRM_SOURCE_VALUES = Object.values(
  HANDOVER_CONFIRM_SOURCE,
) as HandoverConfirmSource[];

export function isHandoverConfirmSource(value: unknown): value is HandoverConfirmSource {
  return typeof value === 'string' && (HANDOVER_CONFIRM_SOURCE_VALUES as string[]).includes(value);
}

/** Ba mốc nhắc của worker, theo phút so với giờ hẹn trên đơn. */
export const TRIP_REMINDER_MINUTES = {
  /** Trước giờ nhận — gian hàng chuẩn bị xe, khách nhớ mang GPLX + giấy tờ. */
  PICKUP_LEAD: 60,
  /** Trước giờ trả — khách sắp xếp đưa xe về, gian hàng chuẩn bị nhận. */
  RETURN_LEAD: 60,
  /** SAU giờ trả mà đơn vẫn `active` — báo cả hai bên. */
  RETURN_OVERDUE: 30,
} as const;

/**
 * Worker chỉ nhìn lại bấy nhiêu giờ cho mốc QUÁ GIỜ TRẢ. Cột claim mới có từ ADR 0081 — mọi đơn cũ
 * đều NULL; không giới hạn thì lượt chạy đầu sau deploy báo "quá giờ trả" cho mọi chuyến lịch sử bị
 * bỏ quên ở `active`.
 */
export const TRIP_REMINDER_OVERDUE_LOOKBACK_HOURS = 24;

/** Khách bấm "Đã nhận xe" được từ bấy nhiêu phút TRƯỚC giờ nhận trên đơn (nhận sớm là chuyện thường). */
export const CUSTOMER_PICKUP_CONFIRM_LEAD_MINUTES = 60;

/** Chủ xe có bấy nhiêu giờ sau lời báo "Đã trả xe" để xác nhận hoặc phản đối, trước khi đơn tự hoàn thành. */
export const CUSTOMER_RETURN_CONFIRM_WINDOW_HOURS = 24;

/** Loại dịch vụ có lượt khách tự xác nhận nhận/trả xe. */
export const CUSTOMER_HANDOVER_CONFIRM_SERVICE_TYPES: readonly ServiceType[] = [
  SERVICE_TYPE.SELF_DRIVE,
  SERVICE_TYPE.LONG_TERM,
];

export function customerCanConfirmHandoverFor(serviceType: string | null | undefined): boolean {
  return (CUSTOMER_HANDOVER_CONFIRM_SERVICE_TYPES as readonly string[]).includes(serviceType ?? '');
}

/** Hạn chủ xe xác nhận sau lời báo trả xe — server tính MỘT lần lúc khách bấm rồi lưu. */
export function customerReturnAutoCompleteAt(reportedAt: Date): Date {
  return new Date(reportedAt.getTime() + CUSTOMER_RETURN_CONFIRM_WINDOW_HOURS * 60 * MS_PER_MINUTE);
}

/** Mốc sớm nhất khách bấm "Đã nhận xe" được. */
export function customerPickupConfirmOpensAt(pickupAt: Date): Date {
  return new Date(pickupAt.getTime() - CUSTOMER_PICKUP_CONFIRM_LEAD_MINUTES * MS_PER_MINUTE);
}

export interface CustomerPickupConfirmInput {
  status: BookingStatus | string;
  serviceType: string;
  pickupAt: Date;
  /** Đã có biên bản giao xe ĐÃ XÁC NHẬN (ai xác nhận cũng vậy). */
  pickupConfirmed: boolean;
  now: Date;
}

/**
 * Khách bấm "Đã nhận xe" được không — cùng một câu cho API (cổng thật) và trang chuyến (ẩn/hiện nút).
 * `opensAt` khác `null` khi chỉ còn thiếu THỜI ĐIỂM (để trang nói "mở lúc…" thay vì giấu nút).
 */
export function customerPickupConfirmState(input: CustomerPickupConfirmInput): {
  allowed: boolean;
  opensAt: Date | null;
} {
  const eligible =
    customerCanConfirmHandoverFor(input.serviceType) &&
    input.status === BOOKING_STATUS.RESERVED &&
    !input.pickupConfirmed;
  if (!eligible) return { allowed: false, opensAt: null };
  const opensAt = customerPickupConfirmOpensAt(input.pickupAt);
  return input.now.getTime() >= opensAt.getTime()
    ? { allowed: true, opensAt: null }
    : { allowed: false, opensAt };
}

export interface CustomerReturnConfirmInput {
  status: BookingStatus | string;
  serviceType: string;
  /** Đã có biên bản trả xe ĐÃ XÁC NHẬN. */
  returnConfirmed: boolean;
  /** Khách đã báo trả xe (và chủ xe chưa phản đối). */
  customerReturnedAt: Date | null;
}

/** Khách bấm "Đã trả xe" được không — đơn đang thuê, chưa có biên bản trả, chưa báo lần nào. */
export function customerCanReportReturn(input: CustomerReturnConfirmInput): boolean {
  return (
    customerCanConfirmHandoverFor(input.serviceType) &&
    input.status === BOOKING_STATUS.ACTIVE &&
    !input.returnConfirmed &&
    input.customerReturnedAt === null
  );
}
