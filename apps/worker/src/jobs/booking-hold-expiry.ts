import { newId, Prisma, type PrismaClient } from '@xeprime/prisma';
import {
  BOOKING_HOLD_STATUS,
  BOOKING_REQUEST_STATUS,
  HOLD_COUNTDOWN_SEGMENT_MINUTES,
  HOLD_REFUND_REASON,
  HOLD_REFUND_STATUS,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  OCCUPANCY_SOURCE_TYPE,
  REFUND_SETTLEMENT_MODE,
  WALLET_ENTRY_KIND,
  WALLET_ENTRY_SOURCE,
  WALLET_OWNER_TYPE,
} from '@xeprime/types';
import { notifyTenantMembers, notifyUser, recordSystemAudit } from '../lib/notify';

const BATCH = 200;

/**
 * Hoàn phần khách đã chuyển cho một hold hết hạn khi chưa đủ tiền.
 *
 * Hai đường ra giống hệt luồng hoàn thường (ADR 0033 điều 5): khách CÓ tài khoản thì ghi có ví
 * điểm ngay, khách vãng lai thì để lại cho admin chuyển tay.
 *
 * Worker không import được service của `apps/api` (cùng tiền lệ `lib/notify.ts`), nên phép ghi
 * ví viết thẳng ở đây — nhưng vẫn đi qua đúng RÀNG BUỘC chống cộng đôi: unique bốn cột trên
 * `wallet_entries`. Worker chạy lại không cộng tiền lần hai, và đó là điều duy nhất phải đúng.
 */
async function upsertExpiredHoldRefund(
  tx: Prisma.TransactionClient,
  hold: {
    id: string;
    tenantId: string;
    customerUserId: string | null;
    paidAmount: Prisma.Decimal;
  },
): Promise<void> {
  const existing = await tx.holdRefund.findUnique({
    where: { holdId: hold.id },
    select: { id: true },
  });
  if (existing) return;

  let walletEntryId: string | null = null;

  if (hold.customerUserId) {
    const wallet = await ensureUserWallet(tx, hold.customerUserId);
    const updated = await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: hold.paidAmount } },
      select: { balance: true },
    });

    const entryId = newId();
    const created = await tx.walletEntry.createMany({
      data: [
        {
          id: entryId,
          walletId: wallet.id,
          kind: WALLET_ENTRY_KIND.HOLD_REFUND,
          sourceType: WALLET_ENTRY_SOURCE.BOOKING_HOLD,
          sourceRefId: hold.id,
          amount: hold.paidAmount,
          balanceAfter: updated.balance,
          holdId: hold.id,
          note: 'Hết hạn giữ chỗ khi chưa đủ tiền',
        },
      ],
      skipDuplicates: true,
    });

    if (created.count === 0) {
      // Đã ghi ở lượt trước — trả lại phép cộng, đừng để worker chạy lại thành cộng đôi.
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: hold.paidAmount } },
      });
    } else {
      walletEntryId = entryId;
    }
  }

  await tx.holdRefund.create({
    data: {
      id: newId(),
      holdId: hold.id,
      tenantId: hold.tenantId,
      customerUserId: hold.customerUserId,
      amount: hold.paidAmount,
      status: walletEntryId ? HOLD_REFUND_STATUS.CREDITED : HOLD_REFUND_STATUS.PENDING,
      settlementMode: walletEntryId
        ? REFUND_SETTLEMENT_MODE.BALANCE
        : REFUND_SETTLEMENT_MODE.BANK_TRANSFER,
      walletEntryId,
      reason: HOLD_REFUND_REASON.HOLD_EXPIRED,
      note: 'Hết hạn giữ chỗ khi chưa đủ tiền',
    },
  });
}

/** Ví của khách, tạo nếu chưa có. Unique `owner_user_id` phân xử khi hai lượt cùng tạo. */
async function ensureUserWallet(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<{ id: string }> {
  const existing = await tx.wallet.findFirst({
    where: { ownerUserId: userId },
    select: { id: true },
  });
  if (existing) return existing;
  return tx.wallet.create({
    data: { id: newId(), ownerType: WALLET_OWNER_TYPE.USER, ownerUserId: userId },
    select: { id: true },
  });
}

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
/**
 * Nhắc khách khi cửa sổ trả cọc còn một chặng cuối — ADR 0032 điều 2.
 *
 * Vì sao bắt buộc phải có: cửa sổ rút từ 24 giờ xuống 2 giờ. Người nhận thông báo "chủ xe đã
 * duyệt" rồi đặt điện thoại xuống sẽ mất chỗ trong im lặng nếu không có gì gọi họ lại. Cửa sổ
 * ngắn mà không nhắc chỉ giỏi huỷ đơn của khách thật.
 *
 * `payment_reminded_at` là cột CLAIM, không phải nhật ký: `updateMany` có điều kiện `IS NULL`
 * nên hai worker chạy song song, hay một worker chạy lại sau khi chết giữa chừng, vẫn chỉ bắn
 * đúng một lần. Cùng kỷ luật với mọi thứ khác trong file này — điều kiện nằm trong `where`,
 * không nằm trong một phép kiểm ở tầng ứng dụng.
 */
async function remindExpiringHolds(prisma: PrismaClient, now: Date): Promise<number> {
  const dueBefore = new Date(now.getTime() + HOLD_COUNTDOWN_SEGMENT_MINUTES * 60_000);
  const candidates = await prisma.bookingHold.findMany({
    where: {
      status: { in: [BOOKING_HOLD_STATUS.PENDING, BOOKING_HOLD_STATUS.UNDERPAID] },
      paymentRemindedAt: null,
      expiresAt: { gt: now, lte: dueBefore },
    },
    orderBy: { expiresAt: 'asc' },
    take: BATCH,
    select: {
      id: true,
      code: true,
      tenantId: true,
      bookingRequestId: true,
      customerUserId: true,
      amount: true,
      paidAmount: true,
      expiresAt: true,
      vehicle: { select: { name: true } },
    },
  });

  let reminded = 0;
  for (const hold of candidates) {
    // Không có tài khoản khách (đặt xe không cần đăng ký) thì không có ai để báo trong app —
    // vẫn claim cột để lần quét sau không cân nhắc lại hold này nữa.
    const done = await prisma.$transaction(async (tx) => {
      const claimed = await tx.bookingHold.updateMany({
        where: { id: hold.id, paymentRemindedAt: null },
        data: { paymentRemindedAt: now },
      });
      if (claimed.count === 0) return false;
      if (!hold.customerUserId) return true;

      const remaining = Number(hold.amount) - Number(hold.paidAmount);
      await notifyUser(tx, hold.customerUserId, {
        type: NOTIFICATION_TYPE.HOLD_EXPIRING,
        title: 'Sắp hết hạn giữ chỗ',
        body:
          `${hold.vehicle.name} · còn ${Number(remaining).toLocaleString('vi-VN')}đ · ` +
          `nội dung ${hold.code}`,
        tenantId: hold.tenantId,
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
        targetId: hold.bookingRequestId,
      });
      return true;
    });
    if (done) reminded += 1;
  }
  return reminded;
}

export async function sweepBookingHoldExpiry(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<{ expired: number; reminded: number }> {
  const reminded = await remindExpiringHolds(prisma, now);

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
      /*
       * TIỀN ĐÃ CHUYỂN MỘT PHẦN PHẢI QUAY VỀ KHÁCH.
       *
       * Hold `underpaid` là khách đã chuyển thật nhưng chưa đủ. Trước đợt này worker chỉ lật
       * `expired` rồi nhả lịch — khoản đã chuyển nằm lại trong tài khoản nền tảng, không sổ nào
       * ghi nợ và không ai biết để hoàn. Đó là tiền của người thật bị kẹt vì một cửa sổ thời
       * gian trôi qua.
       *
       * Ghi trong CÙNG transaction với lượt lật trạng thái: hai thứ đó tách nhau là có lúc hold
       * đã chết mà khoản hoàn chưa tồn tại.
       */
      if (hold.paidAmount.gt(0)) {
        await upsertExpiredHoldRefund(tx, hold);
      }

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
  return { expired, reminded };
}
