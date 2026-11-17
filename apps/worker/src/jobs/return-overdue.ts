import {
  createSupportCaseWithinTx,
  openSupportCaseWhere,
  type Prisma,
  type PrismaClient,
} from '@xeprime/prisma';
import {
  AUDIT_TARGET_TYPE,
  BOOKING_STATUS,
  HANDOVER_STATUS,
  HANDOVER_TYPE,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  RETURN_CONFIRMATION_GRACE_MINUTES,
  SUPPORT_CASE_AUDIT_ACTION,
  SUPPORT_CASE_CATEGORY,
  SUPPORT_CASE_OPEN_REASON,
  SUPPORT_CASE_PRIORITY,
  SUPPORT_PARTY,
} from '@xeprime/types';
import { notifyTenantMembers, notifyUser, recordSystemAudit } from '../lib/notify';

/** Trần số đơn xử lý mỗi lượt — một nhịp worker không được biến thành một job hàng giờ. */
const BATCH = 100;

const MS_PER_MINUTE = 60_000;

/**
 * Chỉ nhìn lại bấy nhiêu ngày tính từ mốc quá hạn. Cột claim `return_unconfirmed_at` mới có từ
 * ADR 0094 — mọi đơn cũ đều NULL; không giới hạn thì lượt chạy đầu sau deploy mở case khẩn cho mọi
 * chuyến lịch sử bị bỏ quên ở `active`.
 */
export const RETURN_OVERDUE_LOOKBACK_DAYS = 7;

/**
 * Đơn đã có tranh chấp mở (của bất kỳ bên nào): chủ xe đã báo "khách chưa trả xe", hay khách đã
 * khiếu nại — CSKH đã có case cho đúng chuyến này, mở thêm một case "cả hai im lặng" là sai sự thật.
 */
const OPEN_DISPUTE = openSupportCaseWhere([
  SUPPORT_CASE_CATEGORY.DISPUTE,
]) satisfies Prisma.SupportCaseWhereInput;

export interface ReturnOverdueSweepResult {
  flagged: number;
}

/**
 * Lưới chống treo đơn ở mốc TRẢ XE — ADR 0094, đối xứng với `handover-overdue` (ADR 0066 lớp 3).
 *
 * Quá `returnAt + RETURN_CONFIRMATION_GRACE_MINUTES` mà đơn chợ vẫn `active`, chưa biên bản trả xe
 * nào được xác nhận, khách chưa báo "Đã trả xe" (lời báo đó đã có đường tự hoàn thành riêng — ADR
 * 0081) và không ai đang tranh chấp ⇒ mở MỘT case `return_unconfirmed` mức khẩn để vận hành gọi
 * xác minh, rồi báo gian hàng và khách.
 *
 * KHÔNG đổi trạng thái đơn và KHÔNG động tới tiền. Nhân sự kết luận "xe đã trả" ở case (biên bản trả
 * xe nguồn `platform` ⇒ đơn hoàn thành, quyết toán như thường); bất kỳ ai xác nhận trả xe trước đó
 * thì case tự kết luận.
 *
 * Idempotent nhờ cột CLAIM `return_unconfirmed_at`, lật trong cùng transaction với việc mở case.
 * Chỉ đơn CHỢ (có yêu cầu thuê) — đơn gian hàng tự lập không có khách nào trên nền tảng để gọi.
 */
export async function sweepReturnOverdue(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<ReturnOverdueSweepResult> {
  const dueBefore = new Date(now.getTime() - RETURN_CONFIRMATION_GRACE_MINUTES * MS_PER_MINUTE);
  const lookbackFrom = new Date(
    dueBefore.getTime() - RETURN_OVERDUE_LOOKBACK_DAYS * 24 * 60 * MS_PER_MINUTE,
  );

  const due = await prisma.booking.findMany({
    where: {
      status: BOOKING_STATUS.ACTIVE,
      returnUnconfirmedAt: null,
      customerReturnedAt: null,
      deletedAt: null,
      returnAt: { lte: dueBefore, gte: lookbackFrom },
      bookingRequest: { isNot: null },
      handovers: {
        none: { type: HANDOVER_TYPE.RETURN, status: HANDOVER_STATUS.CONFIRMED },
      },
      supportCases: { none: OPEN_DISPUTE },
    },
    orderBy: { returnAt: 'asc' },
    take: BATCH,
    select: {
      id: true,
      tenantId: true,
      code: true,
      bookingRequest: { select: { id: true, customerUserId: true } },
    },
  });

  let flagged = 0;
  for (const booking of due) {
    try {
      if (await flagOne(prisma, booking, now)) flagged += 1;
    } catch (err) {
      // Một đơn hỏng không chặn cả lô — transaction rollback, cột claim chưa ghi, nhịp sau thử lại.
      console.error(`quá hạn trả xe: đơn ${booking.id} lỗi`, err);
    }
  }
  return { flagged };
}

/** Một đơn: khoá → kiểm lại → claim → mở case + audit + thông báo. */
async function flagOne(
  prisma: PrismaClient,
  booking: {
    id: string;
    tenantId: string;
    code: string;
    bookingRequest: { id: string; customerUserId: string | null } | null;
  },
  now: Date,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    // Khoá dòng đơn trước khi đọc lại: lượt báo trả xe của khách và lượt mở tranh chấp cũng khoá
    // dòng này, nên lời vừa ghi xong luôn được thấy ở đây.
    await tx.$queryRaw`SELECT 1 FROM "public"."bookings" WHERE "id" = ${booking.id} FOR UPDATE`;
    const disputed = await tx.supportCase.findFirst({
      where: { bookingId: booking.id, ...OPEN_DISPUTE },
      select: { id: true },
    });
    if (disputed) return false;

    const claimed = await tx.booking.updateMany({
      where: {
        id: booking.id,
        status: BOOKING_STATUS.ACTIVE,
        returnUnconfirmedAt: null,
        customerReturnedAt: null,
      },
      data: { returnUnconfirmedAt: now },
    });
    // Ai đó vừa xác nhận trả xe, khách vừa báo trả, hay instance khác vừa claim — không còn việc.
    if (claimed.count === 0) return false;

    const graceHours = RETURN_CONFIRMATION_GRACE_MINUTES / 60;
    const created = await createSupportCaseWithinTx(tx, {
      tenantId: booking.tenantId,
      bookingId: booking.id,
      bookingRequestId: booking.bookingRequest?.id ?? null,
      openedByUserId: null,
      openedByScope: SUPPORT_PARTY.PLATFORM,
      category: SUPPORT_CASE_CATEGORY.RETURN_UNCONFIRMED,
      priority: SUPPORT_CASE_PRIORITY.URGENT,
      subject: `Chưa xác nhận trả xe - chuyến ${booking.code}`,
      description:
        `Quá giờ trả xe ${graceHours} tiếng mà chưa có biên bản trả xe nào được xác nhận và ` +
        'khách chưa báo "Đã trả xe". Liên hệ cả hai bên để biết xe đã về chưa. Xe đã về thì kết ' +
        'luận "Xe đã trả" để chuyến hoàn thành và quyết toán; chủ xe xác nhận biên bản trả xe ' +
        'thì case tự kết luận.',
    });
    await recordSystemAudit(tx, {
      tenantId: booking.tenantId,
      action: SUPPORT_CASE_AUDIT_ACTION.OPEN,
      targetType: AUDIT_TARGET_TYPE.SUPPORT_CASE,
      targetId: created.id,
      after: {
        code: created.code,
        category: SUPPORT_CASE_CATEGORY.RETURN_UNCONFIRMED,
        bookingId: booking.id,
        reason: SUPPORT_CASE_OPEN_REASON.RETURN_OVERDUE,
      },
    });
    await notifyTenantMembers(tx, booking.tenantId, {
      type: NOTIFICATION_TYPE.SUPPORT_CASE_UPDATED,
      title: `Chuyến ${booking.code} quá giờ trả ${graceHours} tiếng chưa xác nhận trả xe`,
      body:
        'XePrime sẽ liên hệ xác minh. Nếu xe đã về, hãy xác nhận biên bản trả xe ngay để chuyến ' +
        'hoàn thành và tiền được quyết toán.',
      targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
      targetId: booking.id,
    });
    const customerUserId = booking.bookingRequest?.customerUserId;
    if (customerUserId) {
      await notifyUser(tx, customerUserId, {
        type: NOTIFICATION_TYPE.SUPPORT_CASE_UPDATED,
        title: `Chuyến ${booking.code} chưa được xác nhận trả xe`,
        body: 'XePrime sẽ liên hệ để xác minh việc trả xe của chuyến này.',
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
        targetId: booking.id,
      });
    }
    return true;
  });
}
