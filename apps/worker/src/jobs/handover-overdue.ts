import {
  createSupportCaseWithinTx,
  openSupportCaseWhere,
  type Prisma,
  type PrismaClient,
} from '@xeprime/prisma';
import {
  AUDIT_TARGET_TYPE,
  BOOKING_STATUS,
  HANDOVER_CONFIRMATION_GRACE_MINUTES,
  HANDOVER_STATUS,
  HANDOVER_TYPE,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
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
 * Chỉ nhìn lại bấy nhiêu ngày tính từ giờ nhận xe.
 *
 * Cột claim `handover_overdue_at` mới có từ ADR 0066 — mọi đơn cũ đều NULL. Không có giới hạn này,
 * lượt chạy đầu sau deploy sẽ mở một case khẩn cho mỗi đơn lịch sử bị bỏ quên ở `reserved`, và
 * hàng đợi hỗ trợ ngập trong những chuyến đã nguội từ lâu. Bảy ngày rộng hơn mọi lần worker
 * ngừng chạy có thể xảy ra, nên không chuyến THẬT nào lọt qua.
 */
export const HANDOVER_OVERDUE_LOOKBACK_DAYS = 7;

/**
 * Khách ĐÃ LÊN TIẾNG trên chuyến: một tranh chấp còn mở do chính khách mở — gồm báo cáo "chưa nhận
 * được xe" của lớp 1 (ADR 0066). Chuyến đó không "cả hai cùng im lặng": tiền đã bị giữ và CSKH đã
 * có case của khách trong hàng đợi. Mở thêm `handover_unconfirmed` ở mốc +120′ là case thứ hai cho
 * cùng một việc, với lời "khách không báo" sai sự thật.
 *
 * Cố ý lọc bằng điều kiện SQL (mọi tranh chấp mở của khách) chứ không bằng dấu `reason` ở audit:
 * lọc được ngay trong truy vấn lô, nên những chuyến bị bỏ qua không chiếm chỗ trong `BATCH` mỗi
 * nhịp và đẩy chuyến thật ra ngoài. Tranh chấp do GIAN HÀNG mở không tính — đó không phải lời của
 * khách, và chuyến vẫn cần CSKH xác minh có diễn ra hay không.
 */
const CUSTOMER_OPEN_DISPUTE = {
  openedByScope: SUPPORT_PARTY.CUSTOMER,
  ...openSupportCaseWhere([SUPPORT_CASE_CATEGORY.DISPUTE]),
} satisfies Prisma.SupportCaseWhereInput;

export interface HandoverOverdueSweepResult {
  flagged: number;
}

/**
 * LỚP 3 chống treo đơn — "cả hai bên cùng im lặng" (ADR 0066, đặc tả 02 §3.2).
 *
 * Quá `pickupAt + HANDOVER_CONFIRMATION_GRACE_MINUTES` mà đơn chợ vẫn `reserved` và chưa có biên
 * bản giao xe nào được xác nhận ⇒ mở MỘT case `handover_unconfirmed` mức khẩn cho vận hành gọi xác
 * minh chuyến có diễn ra không, rồi báo gian hàng và khách.
 *
 * KHÔNG đổi trạng thái đơn và KHÔNG giải ngân: case `handover_unconfirmed` mở nằm trong
 * `SUPPORT_CASE_SETTLEMENT_FREEZING_CATEGORIES`, nên `HoldSettlementService` giữ kết cục khoản giữ
 * chỗ cho tới khi người trực đóng case — kể cả khi chủ xe bấm "khách không đến" sau đó.
 *
 * Idempotent nhờ cột CLAIM: `UPDATE … WHERE handover_overdue_at IS NULL AND status = reserved`
 * chạy TRƯỚC, trong cùng transaction với việc mở case. Hai instance chạy chồng, hay một lượt chạy
 * lại sau crash, chỉ một bên khớp — một đơn có tối đa một case loại này.
 *
 * Chỉ đơn CHỢ (có yêu cầu thuê): đơn gian hàng tự lập ngoài luồng chợ không có đồng nào đi qua
 * XePrime và không có khách nào trên nền tảng để gọi.
 */
export async function sweepHandoverOverdue(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<HandoverOverdueSweepResult> {
  const dueBefore = new Date(now.getTime() - HANDOVER_CONFIRMATION_GRACE_MINUTES * MS_PER_MINUTE);
  const lookbackFrom = new Date(
    dueBefore.getTime() - HANDOVER_OVERDUE_LOOKBACK_DAYS * 24 * 60 * MS_PER_MINUTE,
  );

  const due = await prisma.booking.findMany({
    where: {
      status: BOOKING_STATUS.RESERVED,
      handoverOverdueAt: null,
      deletedAt: null,
      pickupAt: { lte: dueBefore, gte: lookbackFrom },
      bookingRequest: { isNot: null },
      handovers: {
        none: { type: HANDOVER_TYPE.PICKUP, status: HANDOVER_STATUS.CONFIRMED },
      },
      supportCases: { none: CUSTOMER_OPEN_DISPUTE },
    },
    orderBy: { pickupAt: 'asc' },
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
      // Một đơn hỏng không được chặn cả lô — cột claim chưa ghi (transaction rollback), nhịp sau
      // thử lại.
      console.error(`quá hạn bàn giao: đơn ${booking.id} lỗi`, err);
    }
  }
  return { flagged };
}

/** Một đơn: khoá → kiểm lại lời báo của khách → claim → mở case + audit + thông báo. */
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
    // Khoá dòng đơn TRƯỚC khi đọc lời báo của khách: lượt báo cũng khoá dòng này, nên lời báo vừa
    // ghi xong luôn được thấy ở đây thay vì lọt qua khe giữa lượt lọc phía trên và claim.
    await tx.$queryRaw`SELECT 1 FROM "public"."bookings" WHERE "id" = ${booking.id} FOR UPDATE`;
    const spokeUp = await tx.supportCase.findFirst({
      where: { bookingId: booking.id, ...CUSTOMER_OPEN_DISPUTE },
      select: { id: true },
    });
    if (spokeUp) return false;

    const claimed = await tx.booking.updateMany({
      where: {
        id: booking.id,
        status: BOOKING_STATUS.RESERVED,
        handoverOverdueAt: null,
      },
      data: { handoverOverdueAt: now },
    });
    // Gian hàng vừa xác nhận giao xe, huỷ đơn, hay instance khác vừa claim — không còn việc.
    if (claimed.count === 0) return false;

    const graceHours = HANDOVER_CONFIRMATION_GRACE_MINUTES / 60;
    const created = await createSupportCaseWithinTx(tx, {
      tenantId: booking.tenantId,
      bookingId: booking.id,
      bookingRequestId: booking.bookingRequest?.id ?? null,
      openedByUserId: null,
      openedByScope: SUPPORT_PARTY.PLATFORM,
      category: SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED,
      priority: SUPPORT_CASE_PRIORITY.URGENT,
      subject: `Chưa xác nhận bàn giao — chuyến ${booking.code}`,
      description:
        `Quá giờ nhận xe ${graceHours} tiếng mà chưa có biên bản giao xe nào được xác nhận và ` +
        'khách không báo "chưa nhận được xe". Liên hệ cả hai bên để xác minh chuyến có diễn ra ' +
        'không. Tiền của chuyến được tạm giữ, KHÔNG tự giải ngân cho tới khi case đóng. Chủ xe ' +
        'xác nhận biên bản giao xe thì case tự kết luận.',
    });
    await recordSystemAudit(tx, {
      tenantId: booking.tenantId,
      action: SUPPORT_CASE_AUDIT_ACTION.OPEN,
      targetType: AUDIT_TARGET_TYPE.SUPPORT_CASE,
      targetId: created.id,
      after: {
        code: created.code,
        category: SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED,
        bookingId: booking.id,
        reason: SUPPORT_CASE_OPEN_REASON.HANDOVER_OVERDUE,
      },
    });
    // Đích là ĐƠN ở cả hai phía: gian hàng mở được chuyến để xác nhận biên bản ngay, khách mở
    // trang chuyến của mình. Case do hệ thống mở không hiện trong hộp thư hỗ trợ của khách.
    // Lời "xác nhận biên bản" là THẬT: lượt xác nhận giao xe tự kết luận case này
    // (`HandoversService.confirm`) và tiền của chuyến không còn bị giữ vì nó.
    await notifyTenantMembers(tx, booking.tenantId, {
      type: NOTIFICATION_TYPE.SUPPORT_CASE_UPDATED,
      title: `Chuyến ${booking.code} quá giờ nhận ${graceHours} tiếng chưa xác nhận bàn giao`,
      body:
        'XePrime sẽ liên hệ xác minh. Nếu đã giao xe, hãy xác nhận biên bản giao xe ngay — hồ sơ ' +
        'tự đóng và tiền của chuyến không còn bị tạm giữ vì lý do này.',
      targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
      targetId: booking.id,
    });
    const customerUserId = booking.bookingRequest?.customerUserId;
    if (customerUserId) {
      await notifyUser(tx, customerUserId, {
        type: NOTIFICATION_TYPE.SUPPORT_CASE_UPDATED,
        title: `Chuyến ${booking.code} chưa được xác nhận giao xe`,
        body: 'XePrime sẽ liên hệ để xác minh chuyến đi. Tiền của chuyến được tạm giữ cho tới khi xác minh xong.',
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
        targetId: booking.id,
      });
    }
    return true;
  });
}
