import { Prisma, releasePromoRedemption, type PrismaClient } from '@xeprime/prisma';
import {
  BOOKING_REQUEST_FINAL_REMINDER_REMAINING_MINUTES,
  BOOKING_REQUEST_REMINDER_MINUTES,
  BOOKING_REQUEST_RESPOND_WINDOW_MINUTES,
  BOOKING_HOLD_OUTCOME,
  BOOKING_HOLD_STATUS,
  BOOKING_REQUEST_STATUS,
  NOTIFICATION_TARGET_TYPE,
  HOLD_REFUND_REASON,
  NOTIFICATION_TYPE,
  OCCUPANCY_SOURCE_TYPE,
  PROMO_RELEASE_REASON,
} from '@xeprime/types';
import { notifyTenantMembers, notifyUser, recordSystemAudit } from '../lib/notify';
import { upsertWorkerHoldRefund } from './booking-hold-expiry';

/** Trần số bản ghi xử lý mỗi lượt — một nhịp worker không được biến thành một job hàng giờ. */
const BATCH = 200;

const MS_PER_MINUTE = 60_000;

/** Kết quả một lượt chạy — để log và để test khẳng định "lần hai không làm gì nữa". */
export interface DeadlineSweepResult {
  firstReminders: number;
  finalReminders: number;
  expired: number;
  /**
   * **LEGACY ADR 0039** — yêu cầu khách ĐÃ TRẢ ĐỦ mà gian hàng không phản hồi trong hạn: đã hoàn
   * tiền và nhả chỗ.
   *
   * Luồng hiện hành (ADR 0044) không sinh `hold_paid` nữa, nên ở dữ liệu mới con số này luôn 0.
   * Đếm riêng vì đây là con số có TIỀN đi kèm: nó tăng nghĩa là còn yêu cầu của thời kỳ cũ đang
   * bị bỏ quên với tiền thật bên trong, và đó là việc vận hành phải biết ngay.
   */
  expiredPaid: number;
}

/**
 * Hạn phản hồi 60 phút của yêu cầu thuê: nhắc ở phút 20 và 45, hết hạn ở phút 60.
 *
 * Vì sao ở worker chứ không ở API: không có request nào của người dùng trùng với thời điểm một
 * yêu cầu hết hạn — đó là một sự kiện của ĐỒNG HỒ. Nhét nó vào `setInterval` trong tiến trình
 * API nghĩa là mỗi instance API lại chạy một bản sao của cùng một vòng lặp, và không có gì
 * ngăn hai instance cùng gửi hai lần nhắc cho cùng một yêu cầu.
 *
 * Ba thao tác dưới đây đều **claim bằng chính câu `UPDATE`**, không phải "đọc rồi ghi":
 *
 *   - nhắc lần 1: `WHERE first_reminded_at IS NULL`
 *   - nhắc lần 2: `WHERE final_reminded_at IS NULL`
 *   - hết hạn:    `WHERE status = 'pending_host_approval' AND respond_by <= now`
 *
 * Nhờ vậy chạy hai instance song song, hoặc chạy lại sau khi crash giữa chừng, cũng không sinh
 * ra tin nhắc thứ hai — và cuộc đua với nhân viên đang bấm `Duyệt & giữ xe` kết thúc ở đúng
 * một bên: `UPDATE` của họ và của worker không thể cùng khớp điều kiện `status = pending`.
 *
 * KHÔNG có occupancy nào phải nhả khi hết hạn: yêu cầu chờ duyệt chưa bao giờ chiếm lịch xe
 * (ADR 0006 — nhiều khách được phép cùng hỏi một chiếc xe).
 */
export async function sweepBookingRequestDeadlines(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<DeadlineSweepResult> {
  return {
    firstReminders: await remind(prisma, now, 'first'),
    finalReminders: await remind(prisma, now, 'final'),
    expired: await expire(prisma, now),
    expiredPaid: await expirePaidAwaitingAccept(prisma, now),
  };
}


/**
 * **LEGACY ADR 0039** — quá hạn phản hồi SAU KHI khách đã trả đủ ⇒ hoàn đủ, nhả chỗ.
 *
 * Luồng hiện hành (ADR 0044) thu tiền SAU khi chuyến đã được nhận, nên không còn chặng "đã trả
 * mà chưa ai duyệt" để quá hạn. Nhánh này ở lại cho những yêu cầu sinh trong thời gian ADR 0039
 * còn hiệu lực: bỏ nó đi là để tiền thật của khách nằm lại vô thời hạn.
 *
 * Tách khỏi `expire` ở trên vì hai tình huống chỉ giống nhau ở cái tên. Ở kia không ai mất gì:
 * yêu cầu chưa chiếm lịch và chưa có đồng nào của khách. Ở đây XePrime đang GIỮ TIỀN THẬT và
 * chiếc xe đang bị khoá — bỏ sót nhánh này nghĩa là tiền của khách nằm lại vô thời hạn vì gian
 * hàng không bấm nút, và đó là kiểu lỗi không ai phát hiện ra cho tới lúc khách gọi hỗ trợ.
 *
 * Trạng thái đích là `rejected_by_host`, không phải `expired`: từ phía khách, một chuyến đã trả
 * tiền mà gian hàng không nhận thì đúng là bị từ chối — và `customerTripStage` chiếu cả hai về
 * `REJECTED` nên màn hình nói đúng một câu.
 *
 * Hoàn 100%, không chia đôi: khách không làm gì sai. Dùng CHUNG `upsertWorkerHoldRefund` với job
 * hết hạn giữ chỗ — một đường ghi tiền, không phải hai bản chép tay.
 */
async function expirePaidAwaitingAccept(prisma: PrismaClient, now: Date): Promise<number> {
  const overdue = await prisma.bookingRequest.findMany({
    where: {
      status: BOOKING_REQUEST_STATUS.HOLD_PAID,
      respondBy: { lte: now },
    },
    orderBy: { respondBy: 'asc' },
    take: BATCH,
    select: {
      id: true,
      tenantId: true,
      customerName: true,
      customerUserId: true,
      vehicle: { select: { name: true } },
      hold: {
        select: {
          id: true,
          amount: true,
          paidAmount: true,
          customerUserId: true,
          outcome: true,
          status: true,
        },
      },
    },
  });

  let count = 0;
  for (const req of overdue) {
    const hold = req.hold;
    const done = await prisma.$transaction(async (tx) => {
      const claimed = await tx.bookingRequest.updateMany({
        where: {
          id: req.id,
          status: BOOKING_REQUEST_STATUS.HOLD_PAID,
          respondBy: { lte: now },
        },
        data: {
          status: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
          rejectReason: 'Gian hàng không phản hồi trong hạn',
        },
      });
      // 0 dòng = gian hàng vừa bấm duyệt/từ chối. Họ thắng cuộc đua, không ghi đè.
      if (claimed.count === 0) return false;

      /*
       * Nhả lịch trước: chỗ đã mất lý do tồn tại kể từ khi yêu cầu đóng, và việc này phải xảy ra
       * kể cả khi hold vì lý do nào đó đã được chốt kết cục ở đường khác.
       */
      await tx.vehicleOccupancy.deleteMany({
        where: { sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST, sourceId: req.id },
      });

      /*
       * NHẢ lượt mã khuyến mãi (ADR 0046 điều 6) — dữ liệu LEGACY ADR 0039: khách đã trả đủ nhưng
       * gian hàng không phản hồi, nên KHÔNG có đơn nào hình thành và lượt chưa bao giờ được tiêu.
       *
       * Yêu cầu của thời kỳ đó không thể mang mã (mã ra đời ở ADR 0046, sau ADR 0044), nên nhánh
       * này thực tế là no-op. Vẫn gọi: một nhánh đóng yêu cầu mà KHÔNG nhả lượt là đúng loại lỗ
       * hổng sẽ lộ ra khi luồng `hold_paid` được dùng lại vì một lý do nào đó.
       */
      await releasePromoRedemption(tx, {
        bookingRequestId: req.id,
        reason: PROMO_RELEASE_REASON.REQUEST_EXPIRED,
      });

      if (hold && hold.status === BOOKING_HOLD_STATUS.PAID && hold.outcome === null) {
        const chotted = await tx.bookingHold.updateMany({
          where: { id: hold.id, status: BOOKING_HOLD_STATUS.PAID, outcome: null },
          data: {
            status: BOOKING_HOLD_STATUS.RELEASED,
            outcome: BOOKING_HOLD_OUTCOME.REFUNDED,
            releasedAt: now,
            /*
             * Phân bổ ba vế phải khớp bốn dòng tiền — `booking_holds_settled_allocation_check`
             * canh ở DB. Hoàn 100% nghĩa là toàn bộ về phía KHÁCH.
             */
            settledCustomerAmount: hold.amount,
            settledOwnerAmount: new Prisma.Decimal(0),
            settledPlatformAmount: new Prisma.Decimal(0),
            settledInsurerAmount: new Prisma.Decimal(0),
            settledTaxAmount: new Prisma.Decimal(0),
          },
        });
        if (chotted.count > 0 && hold.paidAmount.gt(0)) {
          await upsertWorkerHoldRefund(
            tx,
            {
              id: hold.id,
              tenantId: req.tenantId,
              customerUserId: hold.customerUserId,
              paidAmount: hold.paidAmount,
            },
            {
              reason: HOLD_REFUND_REASON.OWNER_CANCEL,
              note: 'Gian hàng không phản hồi trong hạn sau khi khách đã giữ chỗ',
            },
          );
        }
      }

      await recordSystemAudit(tx, {
        tenantId: req.tenantId,
        action: 'booking_request.expire_paid',
        targetType: 'booking_request',
        targetId: req.id,
        before: { status: BOOKING_REQUEST_STATUS.HOLD_PAID },
        after: {
          status: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
          refunded: hold?.paidAmount.toString() ?? '0',
        },
      });

      await notifyTenantMembers(tx, req.tenantId, {
        type: NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRED,
        title: `Quá hạn phản hồi — đã hoàn tiền khách: ${req.customerName}`,
        body: `${req.vehicle.name} · khách đã cọc và chuyến bị huỷ vì không có phản hồi`,
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
        targetId: req.id,
      });

      if (req.customerUserId) {
        await notifyUser(tx, req.customerUserId, {
          type: NOTIFICATION_TYPE.HOLD_REFUNDED,
          title: 'Chuyến không thành — đã hoàn tiền giữ chỗ',
          body: `${req.vehicle.name} · gian hàng không phản hồi, toàn bộ số tiền đã được hoàn`,
          tenantId: req.tenantId,
          targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
          targetId: req.id,
        });
      }

      return true;
    });

    if (done) count += 1;
  }
  return count;
}

type ReminderStage = 'first' | 'final';

/**
 * Một mốc nhắc. `stage` quyết định cột claim và câu chữ; phần còn lại giống hệt nhau nên không
 * tách thành hai hàm gần-như-trùng.
 */
async function remind(prisma: PrismaClient, now: Date, stage: ReminderStage): Promise<number> {
  const elapsedMinutes =
    stage === 'first'
      ? BOOKING_REQUEST_REMINDER_MINUTES.FIRST
      : BOOKING_REQUEST_REMINDER_MINUTES.FINAL;
  /*
   * Mốc suy NGƯỢC từ `respond_by`, không xuôi từ `created_at`: `respond_by` là cột có index và
   * là mốc duy nhất mà cả API lẫn web đều nhìn. Hai cách cho cùng một kết quả với dữ liệu bình
   * thường, nhưng chỉ cách này còn đúng nếu sau này có yêu cầu được gia hạn.
   */
  const remainingMs = (BOOKING_REQUEST_RESPOND_WINDOW_MINUTES - elapsedMinutes) * MS_PER_MINUTE;
  const dueBefore = new Date(now.getTime() + remainingMs);

  const candidates = await prisma.bookingRequest.findMany({
    where: {
      status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
      respondBy: { lte: dueBefore, gt: now },
      ...(stage === 'first' ? { firstRemindedAt: null } : { finalRemindedAt: null }),
    },
    orderBy: { respondBy: 'asc' },
    take: BATCH,
    select: {
      id: true,
      tenantId: true,
      customerName: true,
      respondBy: true,
      vehicle: { select: { name: true } },
    },
  });

  let sent = 0;
  for (const req of candidates) {
    /*
     * Claim rồi mới gửi, trong một transaction. Nếu tin nhắn ghi trước mà transaction hỏng thì
     * mốc claim mất và lượt sau nhắc lại — người trực nhận hai tin y hệt cho cùng một yêu cầu,
     * và học được rằng thông báo của XePrime không đáng tin.
     */
    const claimed = await prisma.bookingRequest.updateMany({
      where: {
        id: req.id,
        status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
        ...(stage === 'first' ? { firstRemindedAt: null } : { finalRemindedAt: null }),
      },
      data: stage === 'first' ? { firstRemindedAt: now } : { finalRemindedAt: now },
    });
    if (claimed.count === 0) continue;

    await notifyTenantMembers(prisma, req.tenantId, {
      type: NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRING,
      title:
        stage === 'first'
          ? `Yêu cầu thuê chờ phản hồi: ${req.customerName}`
          : `Còn ${BOOKING_REQUEST_FINAL_REMINDER_REMAINING_MINUTES} phút để trả lời ${req.customerName}`,
      body: req.vehicle.name,
      targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
      targetId: req.id,
      /*
       * Tin này có ĐỒNG HỒ ĐẾM NGƯỢC, nên nó cũng có hạn dùng. Máy tắt nguồn cả buổi rồi bật
       * lên mà nhận "còn 15 phút để trả lời" cho một yêu cầu đã đóng từ lâu là một thông báo
       * SAI — người trực mở ra và không hiểu mình phải làm gì.
       */
      pushExpiresAt: req.respondBy,
    });
    sent += 1;
  }
  return sent;
}

/**
 * Hết hạn: `pending_host_approval → expired`, kèm audit `system` và thông báo cho cả hai phía.
 *
 * Khách là người cần tin này nhất — họ đang chờ, và "gian hàng không phản hồi" là tín hiệu để
 * đi tìm xe khác. Khách vãng lai chưa có tài khoản thì chưa có kho nào để gửi vào (email/SMS ở
 * giai đoạn sau), nên chỉ gian hàng nhận.
 */
async function expire(prisma: PrismaClient, now: Date): Promise<number> {
  const overdue = await prisma.bookingRequest.findMany({
    where: {
      status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
      respondBy: { lte: now },
    },
    orderBy: { respondBy: 'asc' },
    take: BATCH,
    select: {
      id: true,
      tenantId: true,
      customerName: true,
      customerUserId: true,
      respondBy: true,
      vehicle: { select: { name: true } },
    },
  });

  let count = 0;
  for (const req of overdue) {
    /*
     * Cả bước đổi trạng thái, audit và hai thông báo nằm trong MỘT transaction: một yêu cầu
     * `expired` mà không có dòng audit nào là một quyết định không ai giải thích được, còn một
     * thông báo "đã quá hạn" cho một yêu cầu vẫn đang chờ thì tệ hơn nữa.
     *
     * Điều kiện `status` + `respond_by` nằm ngay trong câu `UPDATE` — đây là chỗ cuộc đua với
     * `Duyệt & giữ xe` kết thúc, và `count = 0` nghĩa là gian hàng đã thắng: bỏ qua, không log.
     */
    const done = await prisma.$transaction(async (tx) => {
      const claimed = await tx.bookingRequest.updateMany({
        where: {
          id: req.id,
          status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
          respondBy: { lte: now },
        },
        data: { status: BOOKING_REQUEST_STATUS.EXPIRED },
      });
      if (claimed.count === 0) return false;

      /*
       * NHẢ lượt mã khuyến mãi (ADR 0046 điều 6) — yêu cầu chết trước khi thành đơn.
       *
       * Dùng CHÍNH hàm mà API dùng (`@xeprime/prisma`), không viết lại phép trừ bộ đếm ở đây:
       * một bản sao thứ hai sẽ trôi khỏi bản gốc, và khi đó một chiến dịch sẽ "hết lượt" vĩnh
       * viễn vì những yêu cầu đã chết không bao giờ trả lượt về kho.
       */
      await releasePromoRedemption(tx, {
        bookingRequestId: req.id,
        reason: PROMO_RELEASE_REASON.REQUEST_EXPIRED,
      });

      await recordSystemAudit(tx, {
        tenantId: req.tenantId,
        action: 'booking_request.expire',
        targetType: 'booking_request',
        targetId: req.id,
        before: { status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL },
        after: {
          status: BOOKING_REQUEST_STATUS.EXPIRED,
          respondBy: req.respondBy.toISOString(),
          windowMinutes: BOOKING_REQUEST_RESPOND_WINDOW_MINUTES,
        },
      });

      await notifyTenantMembers(tx, req.tenantId, {
        type: NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRED,
        title: `Đã quá hạn phản hồi: ${req.customerName}`,
        body: `${req.vehicle.name} · yêu cầu đã tự đóng sau ${BOOKING_REQUEST_RESPOND_WINDOW_MINUTES} phút`,
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
        targetId: req.id,
      });

      if (req.customerUserId) {
        await notifyUser(tx, req.customerUserId, {
          type: NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRED,
          title: 'Gian hàng chưa phản hồi yêu cầu của bạn',
          body: `${req.vehicle.name} · bạn có thể chọn một xe khác`,
          tenantId: req.tenantId,
          targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
          targetId: req.id,
        });
      }

      return true;
    });

    if (done) count += 1;
  }
  return count;
}
