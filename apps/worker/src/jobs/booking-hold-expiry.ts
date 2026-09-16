import { newId, Prisma, type PrismaClient } from '@xeprime/prisma';
import {
  BOOKING_HOLD_STATUS,
  BOOKING_REQUEST_STATUS,
  HOLD_MAX_EXTENSIONS,
  HOLD_REFUND_REASON,
  type HoldRefundReason,
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
import { formatMoneyVndVi } from '@xeprime/domain';

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
export async function upsertWorkerHoldRefund(
  tx: Prisma.TransactionClient,
  hold: {
    id: string;
    tenantId: string;
    customerUserId: string | null;
    paidAmount: Prisma.Decimal;
  },
  /**
   * Vì sao khoản này phải quay về khách. Hai job dùng chung thân hàm nhưng KHÔNG dùng chung lý
   * do: hết hạn giữ chỗ là "khách chưa trả đủ", còn quá hạn phản hồi sau khi đã trả là "gian
   * hàng không nhận chuyến" — hai thứ khác nhau ở màn đối soát và ở câu giải thích cho khách.
   */
  cause: { reason: HoldRefundReason; note: string },
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
          note: cause.note,
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
      reason: cause.reason,
      note: cause.note,
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
 * GIA HẠN TỰ ĐỘNG cửa sổ trả tiền — ADR 0039 điều 3.
 *
 * Thay cho lượt "nhắc sắp hết hạn" của ADR 0032. Lượt nhắc đó sinh ra cho một cửa sổ 2 giờ chia
 * hai chặng 60 phút; với cửa sổ 10 phút nó sẽ bắn ngay khi hold vừa tạo (mọi hold đều nằm trong
 * một chặng tính từ lúc sinh), tức là một thông báo "sắp hết hạn" gửi cùng lúc với thông báo
 * "hãy chuyển khoản". Việc cần làm ở mốc đó nay là CỘNG THÊM THỜI GIAN, không phải hối thúc.
 *
 * Hai điểm đáng chú ý:
 *
 *   * Hạn mới tính từ **`now`**, không phải từ `expires_at` cũ. Khách phải thấy đúng mười phút
 *     như lần đầu; cộng vào mốc cũ thì một nhịp worker chạy trễ sẽ trả về một đồng hồ bảy phút
 *     mà không ai giải thích được.
 *   * `extension_count < HOLD_MAX_EXTENSIONS` nằm TRONG `WHERE` của chính lượt `UPDATE`. Đó là
 *     thứ khiến hai worker chạy song song không thể cùng gia hạn một hold: người thua thấy
 *     `count = 0`. CHECK ở DB là lớp gác cuối.
 */
async function extendDueHolds(prisma: PrismaClient, now: Date): Promise<number> {
  const candidates = await prisma.bookingHold.findMany({
    where: {
      status: { in: [BOOKING_HOLD_STATUS.PENDING, BOOKING_HOLD_STATUS.UNDERPAID] },
      expiresAt: { lte: now },
      extensionCount: { lt: HOLD_MAX_EXTENSIONS },
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
      extensionCount: true,
      vehicle: { select: { name: true } },
      feePolicy: { select: { holdPaymentWindowMinutes: true } },
    },
  });

  let extended = 0;
  for (const hold of candidates) {
    /*
     * Cửa sổ đọc từ CHÍNH SÁCH ĐÃ GẮN VỚI HOLD, không từ hằng số. Chính sách phí là bất biến
     * theo phiên bản (ADR 0028 điều 2), nên một hold sinh dưới chính sách cũ phải được gia hạn
     * bằng đúng cửa sổ của nó — không bị rút ngắn vì sàn vừa đổi số.
     */
    const windowMs = hold.feePolicy.holdPaymentWindowMinutes * 60_000;
    const nextExpiry = new Date(now.getTime() + windowMs);

    const done = await prisma.$transaction(async (tx) => {
      const claimed = await tx.bookingHold.updateMany({
        where: {
          id: hold.id,
          status: { in: [BOOKING_HOLD_STATUS.PENDING, BOOKING_HOLD_STATUS.UNDERPAID] },
          extensionCount: { lt: HOLD_MAX_EXTENSIONS },
        },
        data: { expiresAt: nextExpiry, extensionCount: { increment: 1 } },
      });
      if (claimed.count === 0) return false;

      await recordSystemAudit(tx, {
        tenantId: hold.tenantId,
        action: 'booking_hold.extend',
        targetType: 'booking_hold',
        targetId: hold.id,
        after: {
          code: hold.code,
          extension: hold.extensionCount + 1,
          expiresAt: nextExpiry.toISOString(),
        },
      });

      // Khách vãng lai không có ai để báo trong app — vẫn gia hạn, chỉ không gửi gì.
      if (!hold.customerUserId) return true;

      const remaining = hold.amount.sub(hold.paidAmount);
      const isLast = hold.extensionCount + 1 >= HOLD_MAX_EXTENSIONS;
      await notifyUser(tx, hold.customerUserId, {
        type: NOTIFICATION_TYPE.HOLD_EXPIRING,
        /*
         * Nói rõ đây là lần gia hạn thứ mấy và còn lần nào nữa không. Một đồng hồ tự nhảy về
         * 10:00 mà không giải thích trông như lỗi giao diện, và khách sẽ không biết rằng lần
         * sau thì chỗ mất thật.
         */
        title: isLast ? 'Gia hạn lần cuối — còn 10 phút' : 'Đã gia hạn thêm 10 phút',
        body:
          `${hold.vehicle.name} · còn ${formatMoneyVndVi(remaining.toString())} · ` +
          `nội dung ${hold.code}`,
        tenantId: hold.tenantId,
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
        targetId: hold.bookingRequestId,
      });
      return true;
    });
    if (done) extended += 1;
  }
  return extended;
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
export async function sweepBookingHoldExpiry(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<{ expired: number; extended: number }> {
  // Gia hạn TRƯỚC: hold vừa được cộng thêm thời gian sẽ không lọt vào lượt quét hết hạn bên dưới.
  const extended = await extendDueHolds(prisma, now);

  const candidates = await prisma.bookingHold.findMany({
    where: {
      status: { in: [BOOKING_HOLD_STATUS.PENDING, BOOKING_HOLD_STATUS.UNDERPAID] },
      expiresAt: { lte: now },
      // Còn lượt gia hạn thì  vừa dời hạn rồi — chỉ hold đã hết lượt mới chết.
      extensionCount: { gte: HOLD_MAX_EXTENSIONS },
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
        await upsertWorkerHoldRefund(tx, hold, {
          reason: HOLD_REFUND_REASON.HOLD_EXPIRED,
          note: 'Hết hạn giữ chỗ khi chưa đủ tiền',
        });
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
  return { expired, extended };
}
