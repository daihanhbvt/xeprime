import { newId, Prisma, releasePromoRedemption, type PrismaClient } from '@xeprime/prisma';
import {
  BOOKING_HOLD_STATUS,
  BOOKING_REQUEST_STATUS,
  HOLD_PAYMENT_REMINDER_REMAINING_MINUTES,
  HOLD_REFUND_REASON,
  type HoldRefundReason,
  HOLD_REFUND_STATUS,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  OCCUPANCY_SOURCE_TYPE,
  PROMO_RELEASE_REASON,
  REFUND_SETTLEMENT_MODE,
  WALLET_ENTRY_KIND,
  WALLET_ENTRY_SOURCE,
  WALLET_OWNER_TYPE,
} from '@xeprime/types';
import { notifyTenantMembers, notifyUser, recordSystemAudit } from '../lib/notify';
import { formatMoneyVndVi } from '@xeprime/domain';

const BATCH = 200;

/**
 * Trần số khách được mời đặt lại cho MỘT chỗ vừa trống.
 *
 * Mười là "nhiều hơn mọi tình huống thật, ít hơn một trận spam": một khung giờ có hơn mười
 * người cùng hỏi là dấu hiệu của một chiếc xe rất hot, và lúc đó mười lời mời đã quá đủ để
 * chỗ được lấp trong vài phút. Phần dư giữ nguyên cột claim NULL nên lượt trống sau vẫn mời
 * được họ.
 */
const REBOOK_INVITE_LIMIT = 10;

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
 * NHẮC KHÁCH CHUYỂN TIỀN GIỮ CHỖ — hai mốc trong cửa sổ (ADR 0044 điều 3).
 *
 * Thay cho lượt tự gia hạn của ADR 0039. Gia hạn tồn tại vì cửa sổ mười phút quá ngắn để một
 * ngân hàng chậm không làm khách mất chỗ; với cửa sổ hai giờ, việc cần làm ở giữa đường là GỌI
 * khách, không phải âm thầm nới hạn — nới hạn giữ xe lâu hơn lời hứa mà chủ xe đang nhìn thấy.
 *
 * Hai điểm đáng chú ý:
 *
 *   * Mốc tính theo **phần CÒN LẠI** (`HOLD_PAYMENT_REMINDER_REMAINING_MINUTES`), không theo
 *     thời gian đã trôi. Hạn trả tiền bị kẹp bởi giờ nhận xe, nên cửa sổ thật của một chuyến sát
 *     giờ ngắn hơn hai tiếng; một mốc "sau 60 phút" sẽ bắn sau khi hold đã chết.
 *   * Hold mà cửa sổ CHƯA BAO GIỜ dài tới ngưỡng thì bỏ qua mốc đó. Nếu không, một hold sinh ra
 *     với 40 phút sẽ nhận ngay lần nhắc "còn 60 phút" cùng lúc với thông báo "hãy chuyển tiền" —
 *     hai tin ngược nhau trong cùng một giây. So bằng `createdAt` thay vì một cột "cửa sổ gốc":
 *     `expires_at − created_at` CHÍNH LÀ độ dài thật của cửa sổ, và không có đường nào dời
 *     `expires_at` nữa nên phép trừ đó vẫn đúng về sau.
 *
 * Claim bằng chính câu `UPDATE` (`WHERE payment_reminded_at IS NULL`), nên hai worker chạy song
 * song hoặc chạy lại sau crash cũng chỉ ra đúng một tin mỗi mốc — cùng kỷ luật
 * `booking_requests.first_reminded_at`.
 */
type ReminderStage = 'first' | 'final';

async function remindDueHolds(
  prisma: PrismaClient,
  now: Date,
  stage: ReminderStage,
): Promise<number> {
  const remainingMinutes =
    stage === 'first'
      ? HOLD_PAYMENT_REMINDER_REMAINING_MINUTES.FIRST
      : HOLD_PAYMENT_REMINDER_REMAINING_MINUTES.FINAL;
  const thresholdMs = remainingMinutes * 60_000;

  const candidates = await prisma.bookingHold.findMany({
    where: {
      status: { in: [BOOKING_HOLD_STATUS.PENDING, BOOKING_HOLD_STATUS.UNDERPAID] },
      // Đã vào vùng nhắc nhưng CHƯA hết hạn — hold đã chết thì lượt quét hết hạn lo, không nhắc.
      expiresAt: { lte: new Date(now.getTime() + thresholdMs), gt: now },
      ...(stage === 'first' ? { paymentRemindedAt: null } : { finalPaymentRemindedAt: null }),
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
      createdAt: true,
      vehicle: { select: { name: true } },
    },
  });

  let sent = 0;
  for (const hold of candidates) {
    // Cửa sổ của hold này chưa bao giờ dài tới ngưỡng ⇒ mốc đó không tồn tại với nó.
    if (hold.expiresAt.getTime() - hold.createdAt.getTime() <= thresholdMs) continue;

    const done = await prisma.$transaction(async (tx) => {
      const claimed = await tx.bookingHold.updateMany({
        where: {
          id: hold.id,
          status: { in: [BOOKING_HOLD_STATUS.PENDING, BOOKING_HOLD_STATUS.UNDERPAID] },
          ...(stage === 'first' ? { paymentRemindedAt: null } : { finalPaymentRemindedAt: null }),
        },
        data: stage === 'first' ? { paymentRemindedAt: now } : { finalPaymentRemindedAt: now },
      });
      if (claimed.count === 0) return false;

      // Khách vãng lai không có kho nào để gửi vào — vẫn claim để lượt sau không thử lại mãi.
      if (!hold.customerUserId) return true;

      const remaining = hold.amount.sub(hold.paidAmount);
      await notifyUser(tx, hold.customerUserId, {
        type: NOTIFICATION_TYPE.HOLD_EXPIRING,
        title: `Còn ${remainingMinutes} phút để thanh toán giữ chỗ`,
        body:
          `${hold.vehicle.name} · còn ${formatMoneyVndVi(remaining.toString())} · ` +
          `nội dung ${hold.code}`,
        tenantId: hold.tenantId,
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
        targetId: hold.bookingRequestId,
        /*
         * Tin này có ĐỒNG HỒ ĐẾM NGƯỢC, nên nó cũng có hạn dùng: máy tắt nguồn cả buổi rồi bật
         * lên mà nhận "còn 15 phút để thanh toán" cho một chỗ đã nhả từ lâu là một thông báo
         * SAI — cùng kỷ luật với lượt nhắc hạn phản hồi của gian hàng.
         */
        pushExpiresAt: hold.expiresAt,
      });
      return true;
    });
    if (done) sent += 1;
  }
  return sent;
}

/**
 * MỜI ĐẶT LẠI những khách từng bị đóng yêu cầu vì khung giờ đã có người — ADR 0045 điều 4.
 *
 * Người thắng không trả tiền đúng hạn, chỗ vừa được nhả, và nhóm duy nhất ta biết chắc là còn
 * quan tâm chính là những người đã hỏi trước đó. Không nói gì với họ là để một chiếc xe trống
 * nằm im trong khi có người thật đang muốn thuê nó.
 *
 * ## Yêu cầu cũ KHÔNG tự sống lại
 *
 * Và đây là phần quan trọng nhất. Hồi sinh một bản ghi đã đóng nghĩa là:
 *
 *   · hai yêu cầu cùng sống cho một khung giờ nếu có hai người từng bị đóng — rồi một lượt
 *     duyệt sinh ra chỗ thứ hai mà constraint chỉ chặn được ở lượt thứ ba;
 *   · giá và điều khoản đã đóng băng từ lúc gửi có thể đã cũ hàng giờ (ADR 0024);
 *   · khách nhận một chuyến họ không còn nhớ mình từng hỏi.
 *
 * Nên tin này chỉ MỞ ĐƯỜNG: khách bấm vào, thấy chiếc xe còn trống, và gửi một yêu cầu MỚI.
 *
 * ## Chống trùng
 *
 * Cột claim `slot_reopened_notified_at` trong chính câu `UPDATE` — một chiếc xe có thể hết hạn
 * nhiều lượt giữ chỗ trong một ngày, và một khách không được nhận cùng một lời mời bốn lần.
 *
 * ## Phạm vi
 *
 * Chỉ yêu cầu `slot_taken` của CHÍNH chiếc xe vừa nhả, có khung giờ CHỒNG LẤN với khung giờ vừa
 * trống, và vẫn còn nằm trong tương lai. Không lọc theo thời điểm đóng: một yêu cầu bị đóng ba
 * ngày trước cho một chuyến tháng sau vẫn là một khách đang chờ.
 */
async function inviteRebook(
  tx: Prisma.TransactionClient,
  slot: { requestId: string; vehicleId: string; vehicleName: string; tenantId: string },
): Promise<void> {
  const freed = await tx.bookingRequest.findUnique({
    where: { id: slot.requestId },
    select: { pickupAt: true, returnAt: true },
  });
  if (!freed?.pickupAt || !freed.returnAt) return;
  // Chuyến đã qua thì không còn gì để mời — chỗ trống trong quá khứ không phải một cơ hội.
  if (freed.returnAt.getTime() <= Date.now()) return;

  const waiting = await tx.bookingRequest.findMany({
    where: {
      vehicleId: slot.vehicleId,
      status: BOOKING_REQUEST_STATUS.SLOT_TAKEN,
      slotReopenedNotifiedAt: null,
      customerUserId: { not: null },
      pickupAt: { lt: freed.returnAt },
      returnAt: { gt: freed.pickupAt },
    },
    orderBy: { createdAt: "asc" },
    take: REBOOK_INVITE_LIMIT,
    select: { id: true, customerUserId: true },
  });
  if (waiting.length === 0) return;

  /*
   * Claim TRƯỚC khi gửi, và bằng chính câu `UPDATE`: nếu tin đi trước mà transaction hỏng thì
   * mốc claim mất và lượt sau mời lại — khách nhận hai lời mời y hệt cho cùng một chiếc xe.
   */
  const claimed = await tx.bookingRequest.updateMany({
    where: { id: { in: waiting.map((w) => w.id) }, slotReopenedNotifiedAt: null },
    data: { slotReopenedNotifiedAt: new Date() },
  });
  if (claimed.count === 0) return;

  for (const row of waiting) {
    if (!row.customerUserId) continue;
    await notifyUser(tx, row.customerUserId, {
      type: NOTIFICATION_TYPE.BOOKING_REQUEST_SLOT_REOPENED,
      title: "Xe bạn quan tâm đã trống lại",
      body: `${slot.vehicleName} · khung giờ bạn hỏi vừa trống. Đặt lại để giữ chỗ.`,
      tenantId: slot.tenantId,
      targetType: NOTIFICATION_TARGET_TYPE.VEHICLE,
      targetId: slot.vehicleId,
    });
  }
}
/**
 * Hold quá hạn thanh toán ⇒ `expired`, yêu cầu ⇒ `hold_expired`, NHẢ LỊCH (R3, ADR 0028).
 *
 * Cùng luật với `isHoldPastDue` ở @xeprime/types: so MỐC `expires_at`, không so cột status. Đường
 * webhook đã tự từ chối tiền về cho hold quá mốc (`hold_closed`), nên worker chậm một nhịp không
 * mở được lỗ nào — nó chỉ dọn và báo.
 *
 * Từ ADR 0044 **không có nhánh gia hạn**: hết hạn là hết, và lượt quét này chỉ có hai việc —
 * nhắc trước khi hết giờ, rồi dọn khi đã hết. Nhắc TRƯỚC trong cùng một nhịp để một hold vừa
 * bước vào vùng nhắc không phải chờ tới nhịp sau.
 *
 * Claim bằng `updateMany` có điều kiện trạng thái, từng hold một trong transaction riêng: một
 * hold hỏng (vd occupancy đã bị xoá tay) không kéo cả lô theo. Chạy lại ra 0 dòng — idempotent.
 */
export async function sweepBookingHoldExpiry(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<{ expired: number; firstReminders: number; finalReminders: number }> {
  const firstReminders = await remindDueHolds(prisma, now, 'first');
  const finalReminders = await remindDueHolds(prisma, now, 'final');

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
      // `vehicleId` để mời đặt lại đúng chiếc xe vừa trống (ADR 0045 điều 4).
      vehicleId: true,
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
       * NHẢ lượt mã khuyến mãi (ADR 0046 điều 6) — chuyến được nhận nhưng khách không chuyển
       * tiền, nên không có ĐƠN nào hình thành và lượt chưa bao giờ được tiêu.
       *
       * Cùng hàm dùng chung với API: bản sao thứ hai của phép trừ bộ đếm sẽ trôi khỏi bản gốc,
       * và khi đó chiến dịch "hết lượt" vĩnh viễn vì những chỗ đã nhả không bao giờ quay về kho.
       */
      await releasePromoRedemption(tx, {
        bookingRequestId: hold.bookingRequestId,
        reason: PROMO_RELEASE_REASON.HOLD_EXPIRED,
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
        title: 'Khách không thanh toán giữ chỗ — chỗ đã nhả',
        body: `${hold.vehicle.name} · ${hold.bookingRequest.customerName}`,
        tenantId: hold.tenantId,
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
        targetId: hold.bookingRequestId,
      });
      if (hold.customerUserId) {
        await notifyUser(tx, hold.customerUserId, {
          type: NOTIFICATION_TYPE.HOLD_EXPIRED,
          title: 'Hết hạn thanh toán giữ chỗ',
          body: `${hold.vehicle.name} · chỗ đã được mở lại cho khách khác. Bạn có thể đặt lại.`,
          tenantId: hold.tenantId,
          targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
          targetId: hold.bookingRequestId,
        });
      }

      /*
       * Chỗ vừa trống ⇒ mời những khách từng bị đóng bằng `slot_taken` đặt lại (ADR 0045 điều
       * 4). Trong CÙNG transaction với lượt nhả lịch: mời người ta đặt một chiếc xe mà lịch của
       * nó chưa chắc đã được nhả là mời họ vào một lỗi 409.
       */
      await inviteRebook(tx, {
        requestId: hold.bookingRequestId,
        vehicleId: hold.vehicleId,
        vehicleName: hold.vehicle.name,
        tenantId: hold.tenantId,
      });

      return true;
    });
    if (done) expired += 1;
  }
  return { expired, firstReminders, finalReminders };
}
