import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  BOOKING_REQUEST_REMINDER_MINUTES,
  BOOKING_REQUEST_RESPOND_WINDOW_MINUTES,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  MEMBERSHIP_STATUS,
  NOTIFICATION_TYPE,
  OCCUPANCY_SOURCE_TYPE,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { sweepBookingRequestDeadlines } from '../../worker/src/jobs/booking-request-deadlines';
import { AuditService } from '../src/modules/audit/audit.service';
import type { AuthService } from '../src/modules/auth/auth.service';
import { BookingRequestsService } from '../src/modules/booking-requests/booking-requests.service';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { CustomersService } from '../src/modules/customers/customers.service';
import { DriversService } from '../src/modules/drivers/drivers.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { NotificationService } from '../src/modules/notification/notification.service';
import type { PhoneVerificationService } from '../src/modules/phone-verification/phone-verification.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * HẠN PHẢN HỒI 60 PHÚT của yêu cầu thuê — trên PostgreSQL THẬT.
 *
 * Luật nghiệp vụ đang được khoá ở đây:
 *
 *  1. Gửi yêu cầu → `respond_by = now + 60'`, do SERVER đặt, và **không chiếm lịch xe**
 *     (ADR 0006 — nhiều khách được phép cùng hỏi một chiếc xe; ai được duyệt trước thì được xe).
 *  2. `Duyệt & giữ xe` là hành động DUY NHẤT tạo đơn `reserved` và là lúc chỗ trên lịch bị giữ.
 *  3. Quá hạn thì không duyệt và không từ chối được nữa — kể cả khi worker chưa kịp chạy, tức
 *     là cột `status` vẫn còn `pending_host_approval`.
 *  4. Worker nhắc đúng MỘT lần mỗi mốc, và expire ghi audit `system` + báo cả hai phía.
 *  5. Đua giữa `Duyệt & giữ xe` và worker: đúng một bên thắng, không có kết cục lai.
 *
 * Job của worker được import THẲNG (`apps/worker/src/jobs/...`) chứ không dựng lại một bản sao
 * ở đây: thứ cần chứng minh là chính đoạn mã sẽ chạy trên production, không phải một mô hình
 * gần giống nó.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const notifications = new NotificationService(asService);
const occupancy = new OccupancyService(asService);
const customers = new CustomersService(asService, audit);
const bookings = new BookingsService(
  asService,
  occupancy,
  audit,
  notifications,
  new DriversService(asService, audit),
  customers,
);

const phoneVerification = {
  assertPhoneVerifiedForBooking: async () => {},
} as unknown as PhoneVerificationService;

let guestUserId: string;
const auth = {
  resolveOrCreateUserByPhone: async () => ({ userId: guestUserId }),
} as unknown as AuthService;

const requests = new BookingRequestsService(
  asService,
  bookings,
  audit,
  notifications,
  phoneVerification,
  auth,
  occupancy,
  new PricingService(asService, audit, new ListingsService(asService)),
  customers,
);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

let phoneSeq = 0;
/** SĐT khác nhau cho từng ca — index chống trùng một phần chặn cùng (xe, SĐT, khung giờ). */
const nextPhone = () => `0908${String(700_000 + (phoneSeq += 1)).slice(-6)}`;

let vehicleSeq = 0;
/**
 * Một chiếc xe công khai mới cho mỗi ca.
 *
 * Xe riêng chứ không dùng chung: ca duyệt thật sự GIỮ CHỖ trên lịch, nên hai ca dùng chung một
 * chiếc xe sẽ đụng `EXCLUDE USING gist` và test đỏ vì lý do không liên quan tới thứ đang kiểm.
 */
async function seedVehicle(): Promise<string> {
  const id = newId();
  vehicleSeq += 1;
  await prisma.vehicle.create({
    data: {
      id,
      tenantId,
      code: `V-DL-${vehicleSeq}`,
      name: `Mazda 3 (${vehicleSeq})`,
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
      weekdayPrice: new Prisma.Decimal('500000'),
      weekendPrice: new Prisma.Decimal('600000'),
    },
  });
  return id;
}

let dayOffset = 0;
/** Khung thuê tương lai, mỗi ca một khoảng riêng. */
function nextWindow(): { pickupAt: string; returnAt: string } {
  dayOffset += 3;
  const pickup = new Date(Date.now() + dayOffset * DAY);
  return {
    pickupAt: pickup.toISOString(),
    returnAt: new Date(pickup.getTime() + 2 * DAY).toISOString(),
  };
}

/** Gửi một yêu cầu thuê qua ĐÚNG đường công khai mà khách đi. */
async function submit(vehicleId: string): Promise<string> {
  const { receipt } = await requests.submitPublic(
    {
      vehicleId,
      customerName: 'Nguyễn Văn A',
      customerPhone: nextPhone(),
      ...nextWindow(),
    },
    null,
  );
  return receipt.id;
}

/** Đẩy hạn phản hồi của một yêu cầu về quá khứ — mô phỏng thời gian trôi mà không phải chờ. */
const setRespondBy = (id: string, at: Date) =>
  prisma.bookingRequest.update({ where: { id }, data: { respondBy: at } });

const countOccupancyFor = (vehicleId: string) =>
  prisma.vehicleOccupancy.count({ where: { vehicleId } });

const notificationsOfType = (type: string, targetId: string) =>
  prisma.notification.count({ where: { type, targetId } });

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }

  ownerId = newId();
  guestUserId = newId();
  tenantId = newId();

  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ shop', email: `owner-${ownerId}@xeprime.test` },
      { id: guestUserId, displayName: 'Khách vãng lai', email: `g-${guestUserId}@xeprime.test` },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `TEST-${tenantId.slice(-8)}`,
      slug: `test-${tenantId.toLowerCase().slice(-8)}`,
      name: 'Shop hạn phản hồi',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.notification.deleteMany({ where: { userId: { in: [ownerId, guestUserId] } } });
    await prisma.bookingRequest.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.vehicleOccupancy.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.notification.deleteMany({ where: { tenantId } });
    await prisma.tenantCustomer.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, guestUserId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Gửi yêu cầu: hạn 60 phút, KHÔNG giữ lịch', () => {
  maybe('respondBy = createdAt + 60 phút, do server đặt', async () => {
    const vehicleId = await seedVehicle();
    const id = await submit(vehicleId);

    const row = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id },
      select: { createdAt: true, respondBy: true, status: true },
    });

    expect(row.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    // So theo PHÚT: `created_at` do DB đặt còn `respond_by` do Node tính, hai đồng hồ lệch nhau
    // vài mili-giây là chuyện bình thường và không phải thứ test này nói về.
    const gapMinutes = (row.respondBy.getTime() - row.createdAt.getTime()) / MINUTE;
    expect(Math.round(gapMinutes)).toBe(BOOKING_REQUEST_RESPOND_WINDOW_MINUTES);
  });

  /**
   * Luật quan trọng nhất của cả luồng: "chờ shop trả lời" KHÔNG phải "đã giữ xe". Nếu bước này
   * chiếm lịch, hai khách hỏi cùng một xe sẽ chặn nhau ngay từ lúc gửi — và người thứ hai bị từ
   * chối bởi một chỗ mà chưa ai được nhận.
   */
  maybe('yêu cầu chờ duyệt không tạo occupancy nào', async () => {
    const vehicleId = await seedVehicle();
    await submit(vehicleId);

    expect(await countOccupancyFor(vehicleId)).toBe(0);
  });

  maybe('hai khách cùng hỏi một xe cùng khung giờ đều gửi được', async () => {
    const vehicleId = await seedVehicle();
    const window = nextWindow();
    const send = (phone: string) =>
      requests.submitPublic(
        { vehicleId, customerName: 'Khách', customerPhone: phone, ...window },
        null,
      );

    await expect(send(nextPhone())).resolves.toBeTruthy();
    await expect(send(nextPhone())).resolves.toBeTruthy();
    expect(await countOccupancyFor(vehicleId)).toBe(0);
  });
});

describe('Duyệt & giữ xe', () => {
  maybe('trong hạn → đơn reserved + occupancy, yêu cầu thành converted_to_booking', async () => {
    const vehicleId = await seedVehicle();
    const id = await submit(vehicleId);

    const approved = await requests.approve(tenantId, ownerId, id);

    expect(approved.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
    expect(approved.bookingId).toBeTruthy();

    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: approved.bookingId! },
      select: { status: true },
    });
    // `reserved` = "Đã giữ xe" (ADR 0005) — và chỗ trên lịch chỉ xuất hiện Ở ĐÂY.
    expect(booking.status).toBe(BOOKING_STATUS.RESERVED);
    expect(await countOccupancyFor(vehicleId)).toBe(1);

    const occ = await prisma.vehicleOccupancy.findFirstOrThrow({
      where: { vehicleId },
      select: { sourceType: true, sourceId: true },
    });
    expect(occ.sourceType).toBe(OCCUPANCY_SOURCE_TYPE.BOOKING);
    expect(occ.sourceId).toBe(approved.bookingId);
  });

  /**
   * Cửa quá hạn phải đóng NGAY cả khi worker chưa chạy — đây chính là cửa sổ mà một endpoint
   * chỉ nhìn cột `status` sẽ để lọt.
   */
  maybe('quá hạn → 409 BOOKING_REQUEST_EXPIRED, không tạo đơn, không giữ lịch', async () => {
    const vehicleId = await seedVehicle();
    const id = await submit(vehicleId);
    await setRespondBy(id, new Date(Date.now() - MINUTE));

    await expect(requests.approve(tenantId, ownerId, id)).rejects.toMatchObject({
      status: 409,
      response: { code: API_ERROR_CODE.BOOKING_REQUEST_EXPIRED },
    });

    const after = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id },
      select: { status: true, bookingId: true },
    });
    // Vẫn `pending` vì worker chưa chạy — nhưng đã không duyệt được. Đó là điều đang khoá.
    expect(after.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    expect(after.bookingId).toBeNull();
    expect(await countOccupancyFor(vehicleId)).toBe(0);
    expect(await prisma.booking.count({ where: { vehicleId } })).toBe(0);
  });

  maybe('quá hạn → cũng không TỪ CHỐI được nữa', async () => {
    const vehicleId = await seedVehicle();
    const id = await submit(vehicleId);
    await setRespondBy(id, new Date(Date.now() - MINUTE));

    await expect(requests.reject(tenantId, ownerId, id, 'Hết xe')).rejects.toMatchObject({
      status: 409,
      response: { code: API_ERROR_CODE.BOOKING_REQUEST_EXPIRED },
    });
  });
});

describe('Worker — nhắc và hết hạn', () => {
  maybe('nhắc lần 1 chỉ gửi MỘT lần dù quét bao nhiêu lượt', async () => {
    const vehicleId = await seedVehicle();
    const id = await submit(vehicleId);
    // Còn đúng 40 phút = đã qua mốc nhắc lần 1 (phút 20), chưa tới mốc lần 2 (phút 45).
    await setRespondBy(id, new Date(Date.now() + 40 * MINUTE));

    await sweepBookingRequestDeadlines(prisma);
    await sweepBookingRequestDeadlines(prisma);

    /*
     * Khẳng định trên CHÍNH yêu cầu này, không trên bộ đếm tổng của lượt quét: database dev
     * dùng chung với các spec khác và với seed, nên `result.firstReminders` là một con số của
     * cả hệ — bám vào nó là viết một test đỏ theo thứ tự chạy.
     */
    expect(await notificationsOfType(NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRING, id)).toBe(1);
    const reminded = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
    expect(reminded.firstRemindedAt).not.toBeNull();
    expect(reminded.finalRemindedAt).toBeNull();
  });

  maybe('nhắc lần 2 ở mốc còn 15 phút, và cũng chỉ một lần', async () => {
    const vehicleId = await seedVehicle();
    const id = await submit(vehicleId);
    const remaining =
      BOOKING_REQUEST_RESPOND_WINDOW_MINUTES - BOOKING_REQUEST_REMINDER_MINUTES.FINAL;
    await setRespondBy(id, new Date(Date.now() + (remaining - 1) * MINUTE));

    await sweepBookingRequestDeadlines(prisma);
    await sweepBookingRequestDeadlines(prisma);

    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
    // Một lượt bắt CẢ HAI mốc (yêu cầu đã trôi qua cả hai), nhưng mỗi mốc đúng một tin.
    expect(row.firstRemindedAt).not.toBeNull();
    expect(row.finalRemindedAt).not.toBeNull();
    expect(await notificationsOfType(NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRING, id)).toBe(2);
  });

  maybe('hết hạn → expired + audit system + báo cả gian hàng lẫn khách', async () => {
    const vehicleId = await seedVehicle();
    const id = await submit(vehicleId);
    await setRespondBy(id, new Date(Date.now() - MINUTE));

    await sweepBookingRequestDeadlines(prisma);

    const row = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id },
      select: { status: true, customerUserId: true },
    });
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.EXPIRED);
    // Không có gì để nhả: yêu cầu chờ duyệt chưa bao giờ chiếm lịch.
    expect(await countOccupancyFor(vehicleId)).toBe(0);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { targetType: 'booking_request', targetId: id, action: 'booking_request.expire' },
    });
    expect(log.actorScope).toBe(AUDIT_ACTOR_SCOPE.SYSTEM);
    expect(log.actorUserId).toBeNull();
    expect(log.afterJson).toMatchObject({ status: BOOKING_REQUEST_STATUS.EXPIRED });

    // Hai người nhận: chủ gian hàng (thành viên) và khách (tài khoản gắn với yêu cầu).
    expect(await notificationsOfType(NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRED, id)).toBe(2);
  });

  maybe('chạy lại không expire lần hai và không gửi thêm thông báo', async () => {
    const vehicleId = await seedVehicle();
    const id = await submit(vehicleId);
    await setRespondBy(id, new Date(Date.now() - MINUTE));

    await sweepBookingRequestDeadlines(prisma);
    await sweepBookingRequestDeadlines(prisma);

    // Vẫn đúng hai tin (một cho gian hàng, một cho khách) — lượt hai không sinh thêm gì.
    expect(await notificationsOfType(NOTIFICATION_TYPE.BOOKING_REQUEST_EXPIRED, id)).toBe(2);
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.EXPIRED);
  });

  maybe('yêu cầu còn hạn không bị đụng tới', async () => {
    const vehicleId = await seedVehicle();
    const id = await submit(vehicleId);

    await sweepBookingRequestDeadlines(prisma);

    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    expect(row.firstRemindedAt).toBeNull();
  });
});

describe('Đua giữa Duyệt & giữ xe và worker', () => {
  /**
   * Hai bên cùng nhắm một yêu cầu đã quá hạn trong gang tấc. Cả hai đều ghi bằng `UPDATE` có
   * điều kiện `status = pending`, nên Postgres tuần tự hoá chúng và đúng MỘT bên khớp.
   *
   * Kết cục lai bị cấm: một yêu cầu `expired` mà vẫn có `booking_id`, hoặc một đơn `reserved`
   * đang giữ chỗ trong khi khách đã được báo là gian hàng không phản hồi.
   */
  maybe('chỉ một bên thắng, không có kết cục lai', async () => {
    const vehicleId = await seedVehicle();
    const id = await submit(vehicleId);
    // Còn đúng một khoảnh khắc — đủ để `approve` đọc thấy "còn hạn" rồi mới ghi.
    await setRespondBy(id, new Date(Date.now() + 40));

    const [approveResult] = await Promise.allSettled([
      requests.approve(tenantId, ownerId, id),
      (async () => {
        // Nhường một nhịp event loop rồi quét bằng mốc "sau hạn" — hai lệnh ghi thật sự đua nhau.
        await new Promise((resolve) => setTimeout(resolve, 20));
        return sweepBookingRequestDeadlines(prisma, new Date(Date.now() + 5 * MINUTE));
      })(),
    ]);

    const row = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id },
      select: { status: true, bookingId: true },
    });

    const approved = approveResult.status === 'fulfilled';

    /*
     * Kết cục đọc từ chính BẢN GHI, không từ bộ đếm của lượt quét (bộ đếm đó tính cả yêu cầu
     * của spec khác trên cùng database dev). Hai vế dưới đây loại trừ nhau tuyệt đối, nên chỉ
     * cần chúng khớp nhau là đủ để nói "đúng một bên thắng".
     */
    expect(row.status).toBe(
      approved ? BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING : BOOKING_REQUEST_STATUS.EXPIRED,
    );

    if (approved) {
      expect(row.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
      expect(row.bookingId).toBeTruthy();
      expect(await countOccupancyFor(vehicleId)).toBe(1);
    } else {
      expect(row.status).toBe(BOOKING_REQUEST_STATUS.EXPIRED);
      expect(row.bookingId).toBeNull();
      // Đơn và chỗ giữ lịch của lần duyệt hỏng phải cùng biến mất (transaction quay đầu).
      expect(await countOccupancyFor(vehicleId)).toBe(0);
      expect(await prisma.booking.count({ where: { vehicleId } })).toBe(0);
    }
  });

  maybe('worker thắng rồi thì duyệt sau đó luôn bị từ chối', async () => {
    const vehicleId = await seedVehicle();
    const id = await submit(vehicleId);
    await setRespondBy(id, new Date(Date.now() - MINUTE));
    await sweepBookingRequestDeadlines(prisma);

    await expect(requests.approve(tenantId, ownerId, id)).rejects.toMatchObject({ status: 409 });
    expect(await countOccupancyFor(vehicleId)).toBe(0);
  });
});
