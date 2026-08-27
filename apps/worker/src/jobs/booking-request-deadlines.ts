import type { PrismaClient } from '@xeprime/prisma';
import {
  BOOKING_REQUEST_FINAL_REMINDER_REMAINING_MINUTES,
  BOOKING_REQUEST_REMINDER_MINUTES,
  BOOKING_REQUEST_RESPOND_WINDOW_MINUTES,
  BOOKING_REQUEST_STATUS,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
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
  };
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
