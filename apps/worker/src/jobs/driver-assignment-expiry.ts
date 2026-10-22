import {
  claimDriverMissingAlert,
  driverMissingAlertWhere,
  expiredDriverAssignmentWhere,
  expirePendingDriverAssignment,
  type PrismaClient,
} from '@xeprime/prisma';
import {
  driverDisplayName,
  driverMissingEmployerCopy,
  driverReassignPushExpiresAt,
  driverResponseExpiredDriverCopy,
  driverResponseExpiredEmployerCopy,
} from '@xeprime/domain';
import {
  AUDIT_TARGET_TYPE,
  DRIVER_ASSIGNMENT_AUDIT_ACTION,
  DRIVER_ASSIGNMENT_STATUS,
  DRIVER_MISSING_ALERT_LEAD_MINUTES,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
} from '@xeprime/types';
import { notifyTenantMembers, notifyUser, recordSystemAudit } from '../lib/notify';

const BATCH = 200;
const MINUTE_MS = 60_000;
/** Tin "lượt của bạn đã hết hạn" cho tài xế — quá một giờ thì đẩy muộn chỉ còn là nhiễu. */
const DRIVER_NOTICE_PUSH_TTL_MINUTES = 60;

export interface DriverAssignmentExpirySweepResult {
  expired: number;
}

/**
 * Hạn tài xế trả lời lượt gán — ADR 0066 (ghi đè "lượt chờ KHÔNG hết hạn" của ADR 0063).
 *
 * Lượt gán `pending` quá `bookings.driver_respond_by` trên đơn CHƯA giao xe ⇒ trả về bên thuê:
 * xoá cột tài xế + hạn, khép dòng sổ bằng `expired` (CHÍNH hàm API dùng khi tài xế bấm Từ chối
 * muộn — `@xeprime/prisma`), ghi audit hệ thống, báo KHẨN bên thuê gán người khác và báo tài xế
 * lượt của họ đã hết. Đơn của khách KHÔNG bị huỷ — chỉ còn chưa có tài xế.
 *
 * Mỗi đơn một transaction; điều kiện "còn pending + đã quá hạn" nằm ngay trong câu `UPDATE` nên
 * đua với tài xế bấm Nhận sát giờ, hay bên thuê đổi người, thì đúng một bên thắng — `false` là
 * bên kia đã thắng: bỏ qua, không báo gì. Chạy lại ra 0 dòng.
 *
 * KHÔNG tự huỷ chuyến khi sát giờ nhận mà vẫn chưa có tài xế (ADR 0067) — xem
 * `sweepDriverMissingAlerts` bên dưới: chỉ nhắc khẩn bên thuê.
 */
export async function sweepDriverAssignmentExpiry(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<DriverAssignmentExpirySweepResult> {
  const due = await prisma.booking.findMany({
    // Index một phần `bookings_driver_respond_by_pending_idx`.
    where: expiredDriverAssignmentWhere(now),
    orderBy: { driverRespondBy: 'asc' },
    take: BATCH,
    select: {
      id: true,
      code: true,
      tenantId: true,
      driverId: true,
      driverUserId: true,
      driverRespondBy: true,
      driver: { select: { name: true } },
    },
  });

  let expired = 0;
  for (const b of due) {
    const driverUserId = b.driverUserId;
    if (!driverUserId) continue;
    try {
      const done = await prisma.$transaction(async (tx) => {
        const released = await expirePendingDriverAssignment(tx, {
          bookingId: b.id,
          driverUserId,
          now,
        });
        if (!released) return false;

        await recordSystemAudit(tx, {
          tenantId: b.tenantId,
          action: DRIVER_ASSIGNMENT_AUDIT_ACTION.RESPONSE_EXPIRED,
          targetType: AUDIT_TARGET_TYPE.BOOKING,
          targetId: b.id,
          before: {
            driverId: b.driverId,
            driverAssignmentStatus: DRIVER_ASSIGNMENT_STATUS.PENDING,
            respondBy: b.driverRespondBy?.toISOString() ?? null,
          },
          after: { driverId: null },
        });

        await notifyTenantMembers(tx, b.tenantId, {
          type: NOTIFICATION_TYPE.DRIVER_TRIP_RESPONSE_EXPIRED,
          ...driverResponseExpiredEmployerCopy({
            driverName: driverDisplayName(b.driver?.name),
            bookingCode: b.code,
          }),
          targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
          targetId: b.id,
          pushExpiresAt: driverReassignPushExpiresAt(now),
        });

        await notifyUser(tx, driverUserId, {
          type: NOTIFICATION_TYPE.DRIVER_TRIP_RESPONSE_EXPIRED,
          ...driverResponseExpiredDriverCopy({ bookingCode: b.code }),
          tenantId: b.tenantId,
          targetType: NOTIFICATION_TARGET_TYPE.DRIVER_TRIP,
          targetId: b.id,
          pushExpiresAt: new Date(now.getTime() + DRIVER_NOTICE_PUSH_TTL_MINUTES * MINUTE_MS),
        });

        return true;
      });
      if (done) expired += 1;
    } catch (err) {
      // Một đơn hỏng không được chặn cả lô — nó ở lại `pending` và được thử lại nhịp sau.
      console.error(`hạn trả lời tài xế: đơn ${b.id} lỗi`, err);
    }
  }
  return { expired };
}

export interface DriverMissingAlertSweepResult {
  alerted: number;
}

/**
 * Nhắc KHẨN "chuyến sắp nhận chưa có tài xế" — ADR 0067 điều 2 (thay gạch "tự huỷ khi sát giờ" của
 * đặc tả 02 §2.4: không đơn nào bị huỷ, không đồng tiền nào đổi chiều vì thiếu tài xế).
 *
 * Đơn `with_driver` đang `reserved` mà KHÔNG có ai phủ — không lượt gán liên kết nào, kể cả đang
 * chờ (lượt chờ quá hạn đã có tin hết hạn ở trên đòi gán lại), và không tài xế ngoài hệ thống — khi
 * giờ nhận còn ≤ `DRIVER_MISSING_ALERT_LEAD_MINUTES` ⇒ báo bên thuê MỘT lần. Đơn tạo khi đã ở trong
 * cửa sổ được báo ở nhịp quét kế tiếp. Giờ nhận đã qua thì không báo (không quét lùi).
 *
 * Mỗi đơn một transaction: chiếm cột `driver_missing_alerted_at` bằng `updateMany` mang lại đủ điều
 * kiện quét (`claimDriverMissingAlert`) — bên thuê vừa gán người thì ra 0 dòng và không báo gì.
 * Một đơn lỗi không chặn cả lô; nó còn NULL và được thử lại nhịp sau. Chạy lại ra 0 dòng.
 */
export async function sweepDriverMissingAlerts(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<DriverMissingAlertSweepResult> {
  const leadMinutes = DRIVER_MISSING_ALERT_LEAD_MINUTES;
  const due = await prisma.booking.findMany({
    // Index một phần `bookings_driver_missing_sweep_idx`.
    where: driverMissingAlertWhere(now, leadMinutes),
    orderBy: { pickupAt: 'asc' },
    take: BATCH,
    select: { id: true, code: true, tenantId: true, pickupAt: true },
  });

  let alerted = 0;
  for (const b of due) {
    try {
      const done = await prisma.$transaction(async (tx) => {
        const claimed = await claimDriverMissingAlert(tx, { bookingId: b.id, now, leadMinutes });
        if (!claimed) return false;

        await recordSystemAudit(tx, {
          tenantId: b.tenantId,
          action: DRIVER_ASSIGNMENT_AUDIT_ACTION.MISSING_ALERTED,
          targetType: AUDIT_TARGET_TYPE.BOOKING,
          targetId: b.id,
          after: { pickupAt: b.pickupAt.toISOString(), leadMinutes },
        });

        await notifyTenantMembers(tx, b.tenantId, {
          type: NOTIFICATION_TYPE.BOOKING_DRIVER_MISSING,
          ...driverMissingEmployerCopy({ bookingCode: b.code }),
          targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
          targetId: b.id,
          // Rung máy sau giờ nhận là nhắc một việc đã quá giờ — hộp thư vẫn giữ tin.
          pushExpiresAt: b.pickupAt,
        });
        return true;
      });
      if (done) alerted += 1;
    } catch (err) {
      console.error(`nhắc thiếu tài xế: đơn ${b.id} lỗi`, err);
    }
  }
  return { alerted };
}
