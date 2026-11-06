import { toAppTz } from '@xeprime/domain';
import { Prisma, type PrismaClient } from '@xeprime/prisma';
import {
  BOOKING_STATUS,
  customerCanConfirmHandoverFor,
  NOTIFICATION_TARGET_TYPE,
  NOTIFICATION_TYPE,
  SERVICE_TYPE,
  TRIP_REMINDER_MINUTES,
  TRIP_REMINDER_OVERDUE_LOOKBACK_HOURS,
} from '@xeprime/types';
import { notifyTenantMembers, notifyUser } from '../lib/notify';

/** Trần số đơn xử lý mỗi mốc mỗi lượt — một nhịp worker không được biến thành một job hàng giờ. */
const BATCH = 200;

const MS_PER_MINUTE = 60_000;

const timeOf = (at: Date) => toAppTz(at).format('HH:mm');
const pointOf = (at: Date) => toAppTz(at).format('HH:mm DD/MM');

export interface TripReminderSweepResult {
  pickupReminders: number;
  returnReminders: number;
  overdueAlerts: number;
}

/**
 * Nhắc chuyến theo đồng hồ — ADR 0081. Ba mốc, mỗi mốc MỘT lần, gửi cho gian hàng + khách:
 *
 *   - còn `PICKUP_LEAD` phút tới giờ NHẬN (đơn `reserved`);
 *   - còn `RETURN_LEAD` phút tới giờ TRẢ (đơn `active`);
 *   - quá giờ trả `RETURN_OVERDUE` phút mà đơn vẫn `active`.
 *
 * Không đổi trạng thái, không động tới tiền — chỉ là lời nhắc, nên đi chung vòng lặp phút với các
 * việc "chuyến theo đồng hồ" khác. Loại thông báo là `booking_status_changed` (đích = ĐƠN ở cả hai
 * phía): thêm một loại mới làm vỡ bảng loại thông báo của app mobile, và tiêu đề tin đã tự nói rõ
 * đang nhắc việc gì.
 *
 * Mỗi mốc claim bằng chính câu `UPDATE … WHERE <cột> IS NULL AND status = …` trong CÙNG transaction
 * với thông báo: hai instance chạy chồng, hay một lượt chạy lại sau crash, chỉ một bên khớp. Đơn
 * đổi trạng thái giữa lượt chọn và lượt claim (vừa giao xe, vừa huỷ) thì claim trượt — không nhắc
 * một việc đã xong.
 */
export async function sweepTripReminders(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<TripReminderSweepResult> {
  return {
    pickupReminders: await remindPickups(prisma, now),
    returnReminders: await remindReturns(prisma, now),
    overdueAlerts: await alertOverdueReturns(prisma, now),
  };
}

/** Những gì một tin nhắc cần đọc về đơn. */
const TRIP_SELECT = {
  id: true,
  tenantId: true,
  code: true,
  serviceType: true,
  customerName: true,
  pickupAt: true,
  returnAt: true,
  vehicle: { select: { name: true } },
  bookingRequest: { select: { customerUserId: true } },
} satisfies Prisma.BookingSelect;

type TripRow = Prisma.BookingGetPayload<{ select: typeof TRIP_SELECT }>;

/**
 * Còn `PICKUP_LEAD` phút tới giờ nhận.
 *
 * Đơn tạo SÁT giờ (`pickup_at − created_at ≤ PICKUP_LEAD`) không có mốc này — một tin "sắp giao xe"
 * ngay sau tin "đơn mới" là nhiễu. Phép loại nằm TRONG SQL: dòng bị bỏ qua mà không claim vẫn đứng
 * đầu `ORDER BY … LIMIT` ở mọi nhịp sau và chiếm chỗ của lời nhắc thật (cùng lý do với
 * `booking-request-deadlines`). Prisma không tả được `cột − cột > khoảng`, nên câu chọn id viết tay.
 */
async function remindPickups(prisma: PrismaClient, now: Date): Promise<number> {
  const lead = TRIP_REMINDER_MINUTES.PICKUP_LEAD;
  const dueBefore = new Date(now.getTime() + lead * MS_PER_MINUTE);
  const pickupStatuses = [BOOKING_STATUS.RESERVED, BOOKING_STATUS.CONFIRMED];
  const due = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id
      FROM bookings
     WHERE status IN (${Prisma.join(pickupStatuses)})
       AND deleted_at IS NULL
       AND pickup_reminded_at IS NULL
       AND pickup_at > ${now}
       AND pickup_at <= ${dueBefore}
       AND pickup_at - created_at > make_interval(mins => ${lead}::int)
     ORDER BY pickup_at ASC
     LIMIT ${BATCH}
  `;

  return sendEach(prisma, due, async (tx, trip) => {
    const claimed = await tx.booking.updateMany({
      where: { id: trip.id, status: { in: pickupStatuses }, pickupRemindedAt: null },
      data: { pickupRemindedAt: now },
    });
    if (claimed.count === 0) return false;

    const time = timeOf(trip.pickupAt);
    await notifyTenantMembers(tx, trip.tenantId, {
      type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
      title: `Sắp giao xe: chuyến ${trip.code} lúc ${time}`,
      body: `${trip.vehicle.name} · ${trip.customerName}`,
      targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
      targetId: trip.id,
      pushExpiresAt: trip.pickupAt,
    });
    const customerUserId = trip.bookingRequest?.customerUserId;
    if (customerUserId) {
      await notifyUser(tx, customerUserId, {
        type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
        title: `Chuyến ${trip.vehicle.name} bắt đầu lúc ${time}`,
        body:
          trip.serviceType === SERVICE_TYPE.WITH_DRIVER
            ? 'Tài xế sẽ đón bạn theo lịch hẹn của chuyến.'
            : 'Nhớ mang GPLX và giấy tờ tuỳ thân khi nhận xe.',
        tenantId: trip.tenantId,
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
        targetId: trip.id,
        pushExpiresAt: trip.pickupAt,
      });
    }
    return true;
  });
}

/**
 * Còn `RETURN_LEAD` phút tới giờ trả. Chuyến ngắn hơn mốc đó (`return_at − pickup_at ≤ RETURN_LEAD`)
 * không có lời nhắc; khách ĐÃ báo trả xe thì không nhắc họ trả nữa.
 */
async function remindReturns(prisma: PrismaClient, now: Date): Promise<number> {
  const lead = TRIP_REMINDER_MINUTES.RETURN_LEAD;
  const dueBefore = new Date(now.getTime() + lead * MS_PER_MINUTE);
  const due = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id
      FROM bookings
     WHERE status = ${BOOKING_STATUS.ACTIVE}
       AND deleted_at IS NULL
       AND return_reminded_at IS NULL
       AND customer_returned_at IS NULL
       AND return_at > ${now}
       AND return_at <= ${dueBefore}
       AND return_at - pickup_at > make_interval(mins => ${lead}::int)
     ORDER BY return_at ASC
     LIMIT ${BATCH}
  `;

  return sendEach(prisma, due, async (tx, trip) => {
    const claimed = await tx.booking.updateMany({
      where: {
        id: trip.id,
        status: BOOKING_STATUS.ACTIVE,
        returnRemindedAt: null,
        customerReturnedAt: null,
      },
      data: { returnRemindedAt: now },
    });
    if (claimed.count === 0) return false;

    const time = timeOf(trip.returnAt);
    await notifyTenantMembers(tx, trip.tenantId, {
      type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
      title: `Sắp nhận xe về: chuyến ${trip.code} lúc ${time}`,
      body: `${trip.vehicle.name} · ${trip.customerName}`,
      targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
      targetId: trip.id,
      pushExpiresAt: trip.returnAt,
    });
    const customerUserId = trip.bookingRequest?.customerUserId;
    if (customerUserId) {
      const selfReturn = customerCanConfirmHandoverFor(trip.serviceType);
      await notifyUser(tx, customerUserId, {
        type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
        title: selfReturn
          ? `Sắp đến giờ trả xe ${trip.vehicle.name} (${time})`
          : `Chuyến ${trip.vehicle.name} kết thúc lúc ${time}`,
        body: selfReturn ? 'Cần thêm thời gian thì liên hệ chủ xe trước giờ trả để gia hạn.' : null,
        tenantId: trip.tenantId,
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
        targetId: trip.id,
        pushExpiresAt: trip.returnAt,
      });
    }
    return true;
  });
}

/**
 * Quá giờ trả `RETURN_OVERDUE` phút mà đơn vẫn `active`. Chỉ nhìn lại
 * `TRIP_REMINDER_OVERDUE_LOOKBACK_HOURS` — cột claim mới có, đơn lịch sử không nhận tin muộn. Khách đã
 * báo "Đã trả xe" thì gian hàng đã có tin riêng (lời báo + hạn tự hoàn thành), không báo thêm.
 */
async function alertOverdueReturns(prisma: PrismaClient, now: Date): Promise<number> {
  const dueBefore = new Date(now.getTime() - TRIP_REMINDER_MINUTES.RETURN_OVERDUE * MS_PER_MINUTE);
  const lookbackFrom = new Date(
    dueBefore.getTime() - TRIP_REMINDER_OVERDUE_LOOKBACK_HOURS * 60 * MS_PER_MINUTE,
  );
  const due = await prisma.booking.findMany({
    where: {
      status: BOOKING_STATUS.ACTIVE,
      deletedAt: null,
      returnOverdueNotifiedAt: null,
      customerReturnedAt: null,
      returnAt: { lte: dueBefore, gt: lookbackFrom },
    },
    orderBy: { returnAt: 'asc' },
    take: BATCH,
    select: { id: true },
  });

  return sendEach(prisma, due, async (tx, trip) => {
    const claimed = await tx.booking.updateMany({
      where: {
        id: trip.id,
        status: BOOKING_STATUS.ACTIVE,
        returnOverdueNotifiedAt: null,
        customerReturnedAt: null,
      },
      data: { returnOverdueNotifiedAt: now },
    });
    if (claimed.count === 0) return false;

    const point = pointOf(trip.returnAt);
    await notifyTenantMembers(tx, trip.tenantId, {
      type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
      title: `Quá giờ trả xe: chuyến ${trip.code}`,
      body:
        `${trip.vehicle.name} · hẹn trả ${point}. Đã nhận xe về thì xác nhận biên bản nhận xe ` +
        'để đóng chuyến; xe chưa về thì liên hệ khách.',
      targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
      targetId: trip.id,
    });
    const customerUserId = trip.bookingRequest?.customerUserId;
    // Chuyến có tài xế: khách không giữ xe — việc trễ là của gian hàng và tài xế.
    if (customerUserId && customerCanConfirmHandoverFor(trip.serviceType)) {
      await notifyUser(tx, customerUserId, {
        type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED,
        title: `Chuyến ${trip.vehicle.name} đã quá giờ trả xe`,
        body:
          `Giờ trả theo đơn là ${point}. Hãy liên hệ chủ xe; nếu đã trả xe, bấm "Đã trả xe" ở ` +
          'trang chuyến.',
        tenantId: trip.tenantId,
        targetType: NOTIFICATION_TARGET_TYPE.BOOKING,
        targetId: trip.id,
      });
    }
    return true;
  });
}

/**
 * Đọc chi tiết các đơn đã chọn rồi gửi TỪNG đơn trong transaction của riêng nó. Một đơn hỏng không
 * chặn cả lô — transaction rollback nên cột claim chưa ghi, nhịp sau thử lại.
 */
async function sendEach(
  prisma: PrismaClient,
  due: readonly { id: string }[],
  send: (tx: Prisma.TransactionClient, trip: TripRow) => Promise<boolean>,
): Promise<number> {
  if (due.length === 0) return 0;
  const trips = await prisma.booking.findMany({
    where: { id: { in: due.map((r) => r.id) } },
    select: TRIP_SELECT,
  });
  let sent = 0;
  for (const trip of trips) {
    try {
      if (await prisma.$transaction((tx) => send(tx, trip))) sent += 1;
    } catch (err) {
      console.error(`nhắc chuyến: đơn ${trip.id} lỗi`, err);
    }
  }
  return sent;
}
