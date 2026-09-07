import type { PrismaClient } from '@xeprime/prisma';
import {
  BOOKING_HOLD_STATUS,
  BOOKING_REQUEST_STATUS,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  OCCUPANCY_SOURCE_TYPE,
} from '@xeprime/types';
import { notifyTenantMembers, notifyUser, recordSystemAudit } from '../lib/notify';

const BATCH = 200;

/**
 * Hold quá hạn chuyển khoản ⇒ `expired`, yêu cầu ⇒ `hold_expired`, NHẢ LỊCH (R3, ADR 0028).
 *
 * Cùng luật với `isHoldPastDue` ở @xeprime/types: so MỐC `expires_at`, không so cột status. Đường
 * webhook đã tự từ chối tiền về cho hold quá mốc (`hold_closed`), nên worker chậm một nhịp không
 * mở được lỗ nào — nó chỉ dọn và báo.
 *
 * Claim bằng `updateMany` có điều kiện trạng thái, từng hold một trong transaction riêng: một
 * hold hỏng (vd occupancy đã bị xoá tay) không kéo cả lô theo. Chạy lại ra 0 dòng — idempotent.
 */
export async function sweepBookingHoldExpiry(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<{ expired: number }> {
  const candidates = await prisma.bookingHold.findMany({
    where: {
      status: { in: [BOOKING_HOLD_STATUS.PENDING, BOOKING_HOLD_STATUS.UNDERPAID] },
      expiresAt: { lte: now },
    },
    orderBy: { expiresAt: 'asc' },
    take: BATCH,
    select: {
      id: true,
      code: true,
      tenantId: true,
      bookingRequestId: true,
      customerUserId: true,
      paidAmount: true,
      vehicle: { select: { name: true } },
      bookingRequest: { select: { customerName: true } },
    },
  });

  let expired = 0;
  for (const hold of candidates) {
    const done = await prisma.$transaction(async (tx) => {
      const claimed = await tx.bookingHold.updateMany({
        where: {
          id: hold.id,
          status: { in: [BOOKING_HOLD_STATUS.PENDING, BOOKING_HOLD_STATUS.UNDERPAID] },
        },
        data: { status: BOOKING_HOLD_STATUS.EXPIRED, releasedAt: now },
      });
      if (claimed.count === 0) return false;

      await tx.bookingRequest.updateMany({
        where: { id: hold.bookingRequestId, status: BOOKING_REQUEST_STATUS.AWAITING_HOLD },
        data: { status: BOOKING_REQUEST_STATUS.HOLD_EXPIRED },
      });
      // Nhả lịch — `deleteMany` để hold không có occupancy (dữ liệu tay) vẫn dọn được.
      await tx.vehicleOccupancy.deleteMany({
        where: { sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST, sourceId: hold.bookingRequestId },
      });

      await recordSystemAudit(tx, {
        tenantId: hold.tenantId,
        action: 'booking_hold.expire',
        targetType: 'booking_hold',
        targetId: hold.id,
        after: { code: hold.code, paidAmount: hold.paidAmount.toString() },
      });

      await notifyTenantMembers(tx, hold.tenantId, {
        type: NOTIFICATION_TYPE.HOLD_EXPIRED,
        title: 'Khách không chuyển giữ chỗ — chỗ đã nhả',
        body: `${hold.vehicle.name} · ${hold.bookingRequest.customerName}`,
        tenantId: hold.tenantId,
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
        targetId: hold.bookingRequestId,
      });
      if (hold.customerUserId) {
        await notifyUser(tx, hold.customerUserId, {
          type: NOTIFICATION_TYPE.HOLD_EXPIRED,
          title: 'Hết hạn chuyển giữ chỗ',
          body: `${hold.vehicle.name} · chỗ đã được mở lại cho khách khác. Bạn có thể đặt lại.`,
          tenantId: hold.tenantId,
          targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
          targetId: hold.bookingRequestId,
        });
      }
      return true;
    });
    if (done) expired += 1;
  }
  return { expired };
}
