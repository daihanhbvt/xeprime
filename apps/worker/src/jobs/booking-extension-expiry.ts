import { newId, Prisma, type PrismaClient } from '@xeprime/prisma';
import {
  BOOKING_EXTENSION_STATUS,
  HOLD_PAYMENT_REMINDER_REMAINING_MINUTES,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  OCCUPANCY_SOURCE_TYPE,
  WALLET_ENTRY_KIND,
  WALLET_ENTRY_SOURCE,
} from '@xeprime/types';
import { formatMoneyVndVi } from '@xeprime/domain';
import { notifyTenantMembers, notifyUser, recordSystemAudit } from '../lib/notify';
import { ensureUserWallet } from './booking-hold-expiry';

const BATCH = 200;

/**
 * PHỤ LỤC GIA HẠN quá hạn thanh toán — ADR 0077 điều 5, cùng nhịp với khoản giữ chỗ.
 *
 * Luật giống hệt `BookingExtensionsService.cancel` phía API (worker không import được service của
 * `apps/api` — cùng tiền lệ `booking-hold-expiry`): lật `expired`, thu lịch của đơn về giờ trả
 * hiện tại, hoàn phần đã chuyển vào ví TÀI KHOẢN KHÁCH, báo hai bên. Giờ trả của đơn KHÔNG đổi —
 * phụ lục chưa bao giờ có hiệu lực.
 *
 * Nhắc khách ở mốc còn 60′/15′ (`HOLD_PAYMENT_REMINDER_REMAINING_MINUTES`), claim bằng chính câu
 * `UPDATE` nên chạy lại / chạy song song chỉ ra một tin mỗi mốc.
 */
export async function sweepBookingExtensionExpiry(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<{ expired: number; reminders: number }> {
  const reminders =
    (await remindDueExtensions(prisma, now, 'first')) +
    (await remindDueExtensions(prisma, now, 'final'));

  const candidates = await prisma.bookingExtension.findMany({
    where: { status: BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT, expiresAt: { lte: now } },
    orderBy: { expiresAt: 'asc' },
    take: BATCH,
    select: {
      id: true,
      code: true,
      tenantId: true,
      bookingId: true,
      customerUserId: true,
      toAt: true,
      paidAmount: true,
      booking: { select: { code: true, returnAt: true, vehicle: { select: { name: true } } } },
    },
  });

  let expired = 0;
  for (const ext of candidates) {
    const done = await prisma.$transaction(async (tx) => {
      const claimed = await tx.bookingExtension.updateMany({
        where: { id: ext.id, status: BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT },
        data: { status: BOOKING_EXTENSION_STATUS.EXPIRED, closedAt: now },
      });
      if (claimed.count === 0) return false;

      /*
       * Thu lại ĐÚNG phần phụ lục đã kéo — `end_at` khác `to_at` nghĩa là lịch đã do lượt khác quyết
       * (đơn đã kết thúc và nhả lịch, hoặc người trực sửa tay). Rút ngắn một khoảng không bao giờ
       * đụng EXCLUDE.
       */
      await tx.vehicleOccupancy.updateMany({
        where: {
          sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING,
          sourceId: ext.bookingId,
          endAt: ext.toAt,
        },
        data: { endAt: ext.booking.returnAt },
      });

      const refunded =
        ext.paidAmount.gt(0) && ext.customerUserId
          ? await creditUserWallet(tx, ext.customerUserId, {
              sourceRefId: ext.id,
              bookingId: ext.bookingId,
              amount: ext.paidAmount,
              note: 'Hoàn tiền phụ lục gia hạn quá hạn thanh toán',
            })
          : false;

      await recordSystemAudit(tx, {
        tenantId: ext.tenantId,
        action: 'booking_extension.expire',
        targetType: 'booking',
        targetId: ext.bookingId,
        after: {
          extensionId: ext.id,
          code: ext.code,
          paidAmount: ext.paidAmount.toString(),
          refundedToWallet: refunded,
        },
      });

      await notifyTenantMembers(tx, ext.tenantId, {
        type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
        title: `Đơn ${ext.booking.code}: khách chưa thanh toán gia hạn — phụ lục đã huỷ`,
        body: `${ext.booking.vehicle.name} · giờ trả xe giữ nguyên`,
        tenantId: ext.tenantId,
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
        targetId: ext.bookingId,
      });
      if (ext.customerUserId) {
        await notifyUser(tx, ext.customerUserId, {
          type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
          title: `Gia hạn ${ext.booking.vehicle.name} đã huỷ vì quá hạn thanh toán`,
          body: refunded
            ? `${formatMoneyVndVi(ext.paidAmount.toString())} đã hoàn vào Ví điểm. Giờ trả xe giữ nguyên.`
            : 'Giờ trả xe giữ nguyên. Liên hệ chủ xe nếu bạn vẫn muốn thuê thêm.',
          tenantId: ext.tenantId,
          targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
          targetId: ext.bookingId,
        });
      }
      return true;
    });
    if (done) expired += 1;
  }
  return { expired, reminders };
}

async function remindDueExtensions(
  prisma: PrismaClient,
  now: Date,
  stage: 'first' | 'final',
): Promise<number> {
  const remainingMinutes =
    stage === 'first'
      ? HOLD_PAYMENT_REMINDER_REMAINING_MINUTES.FIRST
      : HOLD_PAYMENT_REMINDER_REMAINING_MINUTES.FINAL;
  const dueBefore = new Date(now.getTime() + remainingMinutes * 60_000);
  const unclaimed =
    stage === 'first'
      ? Prisma.sql`payment_reminded_at IS NULL`
      : Prisma.sql`final_payment_reminded_at IS NULL`;
  // Cửa sổ chưa bao giờ dài tới ngưỡng ⇒ mốc đó không tồn tại (cùng lý do `remindDueHolds`).
  const due = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id
      FROM booking_extensions
     WHERE status = ${BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT}
       AND expires_at > ${now}
       AND expires_at <= ${dueBefore}
       AND ${unclaimed}
       AND expires_at - created_at > make_interval(mins => ${remainingMinutes}::int)
     ORDER BY expires_at ASC
     LIMIT ${BATCH}
  `;
  if (due.length === 0) return 0;

  const rows = await prisma.bookingExtension.findMany({
    where: { id: { in: due.map((r) => r.id) } },
    select: {
      id: true,
      code: true,
      tenantId: true,
      bookingId: true,
      customerUserId: true,
      onlineAmount: true,
      paidAmount: true,
      expiresAt: true,
      vehicle: { select: { name: true } },
    },
  });

  let sent = 0;
  for (const ext of rows) {
    const done = await prisma.$transaction(async (tx) => {
      const claimed = await tx.bookingExtension.updateMany({
        where: {
          id: ext.id,
          status: BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT,
          ...(stage === 'first' ? { paymentRemindedAt: null } : { finalPaymentRemindedAt: null }),
        },
        data: stage === 'first' ? { paymentRemindedAt: now } : { finalPaymentRemindedAt: now },
      });
      if (claimed.count === 0) return false;
      if (!ext.customerUserId) return true;
      await notifyUser(tx, ext.customerUserId, {
        type: NOTIFICATION_TYPE.HOLD_EXPIRING,
        title: `Còn ${remainingMinutes} phút để thanh toán gia hạn ${ext.vehicle.name}`,
        body:
          `Thanh toán ${formatMoneyVndVi(ext.onlineAmount.sub(ext.paidAmount).toString())} ` +
          `(nội dung ${ext.code}). Quá hạn, giờ trả xe giữ nguyên.`,
        tenantId: ext.tenantId,
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
        targetId: ext.bookingId,
        pushExpiresAt: ext.expiresAt,
      });
      return true;
    });
    if (done) sent += 1;
  }
  return sent;
}

/**
 * Ghi có ví khách MỘT lần cho một phụ lục — unique bốn cột của `wallet_entries` chống cộng đôi khi
 * worker chạy lại (cùng kỷ luật `upsertWorkerHoldRefund`).
 */
async function creditUserWallet(
  tx: Prisma.TransactionClient,
  userId: string,
  entry: { sourceRefId: string; bookingId: string; amount: Prisma.Decimal; note: string },
): Promise<boolean> {
  const wallet = await ensureUserWallet(tx, userId);
  const updated = await tx.wallet.update({
    where: { id: wallet.id },
    data: { balance: { increment: entry.amount } },
    select: { balance: true },
  });
  const created = await tx.walletEntry.createMany({
    data: [
      {
        id: newId(),
        walletId: wallet.id,
        kind: WALLET_ENTRY_KIND.EXTENSION_REFUND,
        sourceType: WALLET_ENTRY_SOURCE.BOOKING_EXTENSION,
        sourceRefId: entry.sourceRefId,
        amount: entry.amount,
        balanceAfter: updated.balance,
        bookingId: entry.bookingId,
        note: entry.note,
      },
    ],
    skipDuplicates: true,
  });
  if (created.count === 0) {
    // Đã ghi ở lượt trước — trả lại phép cộng, đừng để worker chạy lại thành cộng đôi.
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: entry.amount } },
    });
    return false;
  }
  return true;
}
