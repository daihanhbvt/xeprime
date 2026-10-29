import { Prisma, releasePromoRedemption, type PrismaClient } from '@xeprime/prisma';
import {
  BOOKING_REQUEST_REMINDER_REMAINING_MINUTES,
  BOOKING_REQUEST_STATUS,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  PROMO_RELEASE_REASON,
} from '@xeprime/types';
import { notifyTenantMembers, notifyUser, recordSystemAudit } from '../lib/notify';

/** Trần số bản ghi xử lý mỗi lượt — một nhịp worker không được biến thành một job hàng giờ. */
const BATCH = 200;

const MS_PER_MINUTE = 60_000;

/** Kết quả một lượt chạy — để log và để test khẳng định "lần hai không làm gì nữa". */
export interface DeadlineSweepResult {
  firstReminders: number;
  finalReminders: number;
  expired: number;
}

/**
 * Hạn phản hồi của yêu cầu thuê — cửa sổ ĐỘNG 15′–240′ theo khoảng cách tới giờ nhận (ADR 0066):
 * nhắc khi còn 60′ và còn 15′ tới hạn (`BOOKING_REQUEST_REMINDER_REMAINING_MINUTES`), hết hạn ở
 * đúng `respond_by`.
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
  };
}


type ReminderStage = 'first' | 'final';

/**
 * Một mốc nhắc. `stage` quyết định cột claim và câu chữ; phần còn lại giống hệt nhau nên không
 * tách thành hai hàm gần-như-trùng.
 *
 * Mốc tính theo **phần CÒN LẠI** tới `respond_by` — cùng khuôn `remindDueHolds`. Cửa sổ mỗi yêu
 * cầu dài khác nhau (ADR 0066), nên một mốc "sau 20 phút" có thể bắn sau khi yêu cầu đã chết;
 * "còn 60 phút" thì tự nằm đúng chỗ.
 */
async function remind(prisma: PrismaClient, now: Date, stage: ReminderStage): Promise<number> {
  const remainingMinutes =
    stage === 'first'
      ? BOOKING_REQUEST_REMINDER_REMAINING_MINUTES.FIRST
      : BOOKING_REQUEST_REMINDER_REMAINING_MINUTES.FINAL;
  const dueBefore = new Date(now.getTime() + remainingMinutes * MS_PER_MINUTE);
  const unclaimed =
    stage === 'first'
      ? Prisma.sql`first_reminded_at IS NULL`
      : Prisma.sql`final_reminded_at IS NULL`;

  /*
   * Cửa sổ của yêu cầu chưa bao giờ dài hơn ngưỡng ⇒ mốc đó không tồn tại với nó: nhắc "còn 60
   * phút" cho một yêu cầu chỉ có 30 phút là bắn ngay lúc khách vừa gửi. Những dòng đó KHÔNG được
   * claim — cột `*_reminded_at` là "đã nhắc thật", người trực đọc nó ở hàng đợi vận hành.
   * `respond_by − created_at` CHÍNH LÀ độ dài cửa sổ (API ghi hai cột cùng một mốc).
   *
   * Phép loại nằm TRONG SQL chứ không ở vòng lặp: dòng bị bỏ qua mà không claim thì vẫn đứng
   * đầu `ORDER BY respond_by LIMIT` ở mọi nhịp sau, và đủ nhiều dòng như vậy sẽ chiếm hết lô —
   * lời nhắc thật xếp sau không bao giờ được đọc tới. Prisma không tả được `cột − cột > khoảng`,
   * nên câu chọn id viết tay; phần đọc chi tiết vẫn qua Prisma.
   */
  const due = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id
      FROM booking_requests
     WHERE status = ${BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL}
       AND respond_by > ${now}
       AND respond_by <= ${dueBefore}
       AND ${unclaimed}
       AND respond_by - created_at > make_interval(mins => ${remainingMinutes}::int)
     ORDER BY respond_by ASC
     LIMIT ${BATCH}
  `;
  if (due.length === 0) return 0;

  const candidates = await prisma.bookingRequest.findMany({
    where: { id: { in: due.map((r) => r.id) } },
    orderBy: { respondBy: 'asc' },
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
          : `Còn ${remainingMinutes} phút để trả lời ${req.customerName}`,
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
      createdAt: true,
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
          // Cửa sổ THẬT của yêu cầu này (động từ ADR 0066) — `respond_by − created_at`.
          windowMinutes: Math.round(
            (req.respondBy.getTime() - req.createdAt.getTime()) / MS_PER_MINUTE,
          ),
        },
      });

      await notifyTenantMembers(tx, req.tenantId, {
        type: NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRED,
        title: `Đã quá hạn phản hồi: ${req.customerName}`,
        body: `${req.vehicle.name} · yêu cầu đã tự đóng vì quá hạn phản hồi`,
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING_REQUEST,
        targetId: req.id,
      });

      if (req.customerUserId) {
        await notifyUser(tx, req.customerUserId, {
          type: NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRED,
          title: `Yêu cầu thuê ${req.vehicle.name} đã hết hạn`,
          body: 'Chủ xe chưa phản hồi kịp. Bạn chưa bị trừ tiền — hãy chọn xe khác hoặc gửi lại yêu cầu.',
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
