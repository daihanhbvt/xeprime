import {
  BOOKING_STATUS,
  DRIVER_ASSIGNMENT_OUTCOME,
  DRIVER_ASSIGNMENT_STATUS,
  DRIVER_MISSING_ALERT_LEAD_MINUTES,
  DRIVER_REASSIGNABLE_BOOKING_STATUSES,
  SERVICE_TYPE,
  type DriverAssignmentOutcome,
} from '@xeprime/types';
import type { Prisma } from '../generated/client';

/**
 * Lượt GÁN tài xế trên một đơn (ADR 0063 · ADR 0066) — phần ghi dùng chung cho API và worker.
 *
 * ## Vì sao nằm ở `@xeprime/prisma` chứ không ở `apps/api`
 *
 * `DriversService` vẫn là writer duy nhất ở API (gán, nhận, từ chối, kết thúc liên kết), nhưng
 * từ ADR 0066 có một tiến trình THỨ HAI cũng phải trả một lượt gán về bên thuê: worker quét hạn
 * trả lời. Worker cố ý không kéo runtime Nest vào (cùng tiền lệ `promo-redemption.ts`), nên phép
 * "xoá cột tài xế trên đơn + khép dòng sổ" sống ở đây — một bản, để đơn và sổ
 * `booking_driver_assignments` không bao giờ lệch nhau tuỳ theo ai trả lượt.
 */

/**
 * Năm cột lượt gán + hạn trả lời về NULL cùng lúc — CHECK `bookings_driver_assignment_consistency_check`
 * (có tài xế ⇔ có tài khoản ⇔ có trạng thái ⇔ có mốc gán) và `bookings_driver_respond_by_check`
 * (có hạn ⇔ đang chờ). Chỉ cột của tài xế LIÊN KẾT — đơn mang tài xế ngoài hệ thống thì không có
 * `driver_id` (CHECK loại trừ) nên mọi đường gỡ lượt liên kết không bao giờ chạm tới nó; bỏ gán
 * hẳn một đơn thì kèm `CLEARED_EXTERNAL_DRIVER` (ADR 0067).
 */
export const CLEARED_DRIVER_ASSIGNMENT = {
  driverId: null,
  driverUserId: null,
  driverAssignmentStatus: null,
  driverAssignedAt: null,
  driverRespondedAt: null,
  driverRespondBy: null,
} satisfies Prisma.BookingUncheckedUpdateManyInput;

/** Đơn còn trả lượt về bên thuê được — chưa giao xe (cùng tập đổi/gỡ tài xế được). */
const REASSIGNABLE: string[] = [...DRIVER_REASSIGNABLE_BOOKING_STATUSES];

/**
 * Tiền công của lượt khép mà KHÔNG hoàn thành về 0 (ADR 0075): chuyến không chạy thì không phát
 * sinh tiền công — chủ xe tự ghi số đã thoả thuận nếu có. Lượt trước tính năng (NULL) giữ NULL.
 * Đây không phải một lần SỬA nên không ghi `booking_driver_wage_changes`.
 */
export function wageOnClose(
  outcome: DriverAssignmentOutcome,
): Prisma.BookingDriverAssignmentUncheckedUpdateManyInput {
  return outcome === DRIVER_ASSIGNMENT_OUTCOME.COMPLETED ? {} : { wageAmount: 0 };
}

/** Khép lượt gán đang mở của một đơn trong sổ — luôn trong transaction đang đổi cột tài xế. */
export async function closeOpenDriverAssignment(
  tx: Prisma.TransactionClient,
  bookingId: string,
  outcome: DriverAssignmentOutcome,
  endedBy: string | null,
  at: Date = new Date(),
  extra: Prisma.BookingDriverAssignmentUncheckedUpdateManyInput = {},
): Promise<void> {
  await tx.bookingDriverAssignment.updateMany({
    where: { bookingId, outcome: DRIVER_ASSIGNMENT_OUTCOME.OPEN, wageAmount: { not: null } },
    data: wageOnClose(outcome),
  });
  await tx.bookingDriverAssignment.updateMany({
    where: { bookingId, outcome: DRIVER_ASSIGNMENT_OUTCOME.OPEN },
    data: { ...extra, outcome, endedAt: at, endedBy },
  });
}

/**
 * Điều kiện một lượt gán ĐÃ quá hạn trả lời và còn trả về bên thuê được: đang `pending`, mốc
 * `driver_respond_by` đã qua, đơn chưa giao xe. Đơn đã `active` thì KHÔNG trả về — xe đã lăn
 * bánh, gỡ tài xế lúc đó là để chuyến đang chạy không người lái trên giấy, và khu quản lý cũng
 * không đổi tài xế được nữa (`DRIVER_ASSIGNMENT_LOCKED`).
 */
export function expiredDriverAssignmentWhere(now: Date): Prisma.BookingWhereInput {
  return {
    driverAssignmentStatus: DRIVER_ASSIGNMENT_STATUS.PENDING,
    driverRespondBy: { lte: now },
    status: { in: REASSIGNABLE },
    deletedAt: null,
  };
}

/**
 * Trả một lượt gán QUÁ HẠN về bên thuê: chiếm bằng `updateMany` (điều kiện trong WHERE nên đua
 * với lượt Nhận / đổi người thì chỉ một bên thắng), xoá năm cột + hạn, khép dòng sổ bằng
 * `expired`. `true` = lượt này vừa được trả; `false` = đã có ai xử lý trước (nhận kịp, bị đổi
 * người, đã trả ở nhịp trước) — bên gọi KHÔNG báo tin gì.
 *
 * Báo tin + audit là việc của bên gọi (API dùng `NotificationService`, worker dùng `lib/notify`).
 */
export async function expirePendingDriverAssignment(
  tx: Prisma.TransactionClient,
  input: { bookingId: string; driverUserId: string; now: Date; endedBy?: string | null },
): Promise<boolean> {
  const claimed = await tx.booking.updateMany({
    where: {
      id: input.bookingId,
      driverUserId: input.driverUserId,
      ...expiredDriverAssignmentWhere(input.now),
    },
    data: CLEARED_DRIVER_ASSIGNMENT,
  });
  if (claimed.count === 0) return false;
  await closeOpenDriverAssignment(
    tx,
    input.bookingId,
    DRIVER_ASSIGNMENT_OUTCOME.EXPIRED,
    input.endedBy ?? null,
    input.now,
  );
  // Tin hết hạn (khẩn, "gán tài xế khác") đã là lời nhắc của chuyến này — ADR 0067 điều 2.
  await markDriverMissingAlertCovered(tx, input.bookingId, input.now);
  return true;
}

/**
 * Hai cột tài xế NGOÀI HỆ THỐNG về NULL (ADR 0067). Đi kèm `CLEARED_DRIVER_ASSIGNMENT` khi bỏ gán
 * hẳn (CHECK `bookings_driver_assignment_consistency_check`: còn tên ngoài hệ thống thì mốc gán
 * không được NULL), hay khi thay bằng tài xế liên kết (CHECK loại trừ).
 */
export const CLEARED_EXTERNAL_DRIVER = {
  externalDriverName: null,
  externalDriverPhone: null,
} satisfies Prisma.BookingUncheckedUpdateManyInput;

/**
 * Đơn cần báo khẩn "chuyến sắp nhận chưa có tài xế" (ADR 0067 điều 2): `with_driver`, đang
 * `reserved`, KHÔNG có ai phủ — không lượt gán liên kết nào (kể cả đang chờ: lượt chờ quá hạn đã
 * có tin hết hạn của ADR 0066 đòi gán lại) và không tài xế ngoài hệ thống — chưa từng báo, giờ nhận
 * trong `(now, now + leadMinutes]`.
 *
 * Giờ nhận đã QUA thì không báo: không quét lùi (deploy lần đầu không xả một trận tin cho các đơn
 * cũ), và sau giờ nhận lưới của ADR 0066 điều 5 đã lo. Khớp index một phần
 * `bookings_driver_missing_sweep_idx`.
 */
export function driverMissingAlertWhere(now: Date, leadMinutes: number): Prisma.BookingWhereInput {
  return {
    serviceType: SERVICE_TYPE.WITH_DRIVER,
    status: BOOKING_STATUS.RESERVED,
    driverId: null,
    externalDriverName: null,
    driverMissingAlertedAt: null,
    deletedAt: null,
    pickupAt: { gt: now, lte: new Date(now.getTime() + leadMinutes * 60_000) },
  };
}

/**
 * Chiếm lượt báo khẩn của MỘT đơn — `updateMany` với cả điều kiện quét trong WHERE: bên thuê vừa
 * gán người (hay nhập tài xế ngoài) chen vào giữa lượt đọc và lượt ghi thì ra 0 dòng và bên gọi
 * KHÔNG báo gì. `true` = đơn này vừa được chiếm, bên gọi phát tin + audit trong cùng transaction.
 */
export async function claimDriverMissingAlert(
  tx: Prisma.TransactionClient,
  input: { bookingId: string; now: Date; leadMinutes: number },
): Promise<boolean> {
  const claimed = await tx.booking.updateMany({
    where: { id: input.bookingId, ...driverMissingAlertWhere(input.now, input.leadMinutes) },
    data: { driverMissingAlertedAt: input.now },
  });
  return claimed.count > 0;
}

/**
 * Đánh dấu đơn "đã được nhắc" mà KHÔNG phát tin nhắc thiếu tài xế — gọi khi một lượt gán liên kết
 * vừa RƠI về bên thuê kèm tin khẩn "gán tài xế khác" (tài xế từ chối, hoặc quá hạn trả lời — ADR
 * 0066) trong lúc giờ nhận đã nằm trong cửa sổ `DRIVER_MISSING_ALERT_LEAD_MINUTES`. Tin đó đã đòi gán
 * lại; báo thêm "chưa có tài xế" ở nhịp quét sau là tin trùng (ADR 0067 điều 2). Giờ nhận còn xa
 * hơn cửa sổ thì không đánh dấu: còn trống tới mốc 2 giờ thì vẫn được nhắc như mọi đơn.
 */
export async function markDriverMissingAlertCovered(
  tx: Prisma.TransactionClient,
  bookingId: string,
  now: Date,
): Promise<void> {
  await tx.booking.updateMany({
    where: {
      id: bookingId,
      driverMissingAlertedAt: null,
      pickupAt: { lte: new Date(now.getTime() + DRIVER_MISSING_ALERT_LEAD_MINUTES * 60_000) },
    },
    data: { driverMissingAlertedAt: now },
  });
}
