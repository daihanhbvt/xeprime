import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BOOKING_STATUS,
  DRIVER_ASSIGNMENT_OUTCOME,
  DRIVER_ASSIGNMENT_STATUS,
  DRIVER_TRIP_TAB,
  MEMBERSHIP_STATUS,
  NOTIFICATION_TYPE,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
  driverRespondByFor,
} from '@xeprime/types';
import { sweepDriverAssignmentExpiry } from '../../worker/src/jobs/driver-assignment-expiry';
import { AuditService } from '../src/modules/audit/audit.service';
import { DriverSelfService } from '../src/modules/drivers/driver-self.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { cleanupDriverAccounts, seedDriverLink } from './helpers/driver-link';
import {
  makeBookingsService,
  makeCustomersService,
  makeDriversService,
} from './helpers/service-factory';

/**
 * HẠN TÀI XẾ TRẢ LỜI lượt gán — ADR 0066 — trên PostgreSQL THẬT.
 *
 *  1. Gán ⇒ server ghi `driver_respond_by = driverRespondByFor(gán, nhận)` (10% ΔT, kẹp 15–60′);
 *     DTO khu quản lý + "Chuyến tôi lái" đều trả mốc đó.
 *  2. Nhận trước hạn được, mốc về NULL. Nhận sau hạn ⇒ `DRIVER_ASSIGNMENT_EXPIRED`, kể cả khi
 *     worker chưa quét (điều kiện hạn nằm trong WHERE).
 *  3. Worker quét: gỡ lượt (đơn về chưa có tài xế, KHÔNG huỷ), sổ khép `expired`, audit hệ
 *     thống, báo khẩn bên thuê + báo tài xế. Chạy lại ra 0.
 *  4. Từ chối sau hạn = quá hạn (kết cục `expired`), thành công và idempotent.
 *  5. Đơn đã giao xe (`active`) KHÔNG bị trả về.
 *
 * Job của worker import THẲNG từ `apps/worker` — chứng minh chính đoạn mã chạy trên production.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const drivers = makeDriversService(asService, { audit });
const driverSelf = new DriverSelfService(asService);
const bookings = makeBookingsService(asService, {
  audit,
  customers: makeCustomersService(asService, audit),
});

const MIN = 60_000;
let dbAvailable = false;
let owner: string;
let tenant: string;
let vehicle: string;

let seq = 0;
async function seedBooking(pickupAt: Date, status: string = BOOKING_STATUS.RESERVED) {
  seq += 1;
  const id = newId();
  await prisma.booking.create({
    data: {
      id,
      tenantId: tenant,
      vehicleId: vehicle,
      code: `DH-EXP-${Date.now().toString(36)}-${seq}`,
      customerName: 'Khách hạn tài xế',
      customerPhone: `0966${String(100000 + seq).slice(-6)}`,
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      routeType: 'in_city',
      pickupAddress: '1 Lê Lợi',
      status,
      pickupAt,
      returnAt: new Date(pickupAt.getTime() + 8 * 60 * MIN),
      baseAmount: new Prisma.Decimal('1000000'),
      totalAmount: new Prisma.Decimal('1000000'),
    },
  });
  return id;
}

/** Mỗi ca một ngày riêng trong tương lai xa — tài xế mới mỗi ca nên lịch không đụng nhau. */
let day = 0;
function farPickup(): Date {
  day += 1;
  return new Date(Date.UTC(2028, 0, 1 + day, 2));
}

/** Kéo hạn trả lời của một đơn về quá khứ — mô phỏng "đã qua hạn" mà không đợi đồng hồ. */
async function lapse(bookingId: string): Promise<void> {
  await prisma.booking.update({
    where: { id: bookingId },
    data: { driverRespondBy: new Date(Date.now() - MIN) },
  });
}

async function assignFresh(pickupAt = farPickup()) {
  const link = await seedDriverLink(asService, { tenantId: tenant, name: 'Tài xế Hạn' });
  const bookingId = await seedBooking(pickupAt);
  await bookings.assignDriver(tenant, bookingId, owner, link.driverId);
  return { ...link, bookingId };
}

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }
  owner = newId();
  tenant = newId();
  vehicle = newId();
  await prisma.user.create({
    data: {
      realm: ACCOUNT_REALM.PARTNER,
      id: owner,
      displayName: 'Chủ hạn tài xế',
      email: `drv-exp-${owner}@xeprime.test`,
    },
  });
  await prisma.tenant.create({
    data: {
      id: tenant,
      code: `T-${tenant.slice(-8)}`,
      slug: `t-${tenant.toLowerCase().slice(-10)}`,
      name: 'Shop hạn tài xế',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: owner,
    },
  });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId: tenant,
      userId: owner,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: vehicle,
      tenantId: tenant,
      code: `V-EXP-${vehicle.slice(-6)}`,
      name: 'Innova hạn tài xế',
      vehicleType: VEHICLE_TYPE.CAR,
      serviceTypes: [SERVICE_TYPE.WITH_DRIVER],
      withDriverDailyPrice: new Prisma.Decimal('1300000'),
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.bookingDriverAssignment.deleteMany({ where: { tenantId: tenant } });
    await prisma.booking.deleteMany({ where: { tenantId: tenant } });
    await prisma.vehicleOccupancy.deleteMany({ where: { tenantId: tenant } });
    await prisma.auditLog.deleteMany({ where: { tenantId: tenant } });
    await prisma.notification.deleteMany({ where: { tenantId: tenant } });
    await prisma.driver.deleteMany({ where: { tenantId: tenant } });
    await cleanupDriverAccounts(asService);
    await prisma.vehicle.deleteMany({ where: { tenantId: tenant } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: tenant } });
    await prisma.tenant.deleteMany({ where: { id: tenant } });
    await prisma.user.deleteMany({ where: { id: owner } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

const code = (c: string) => ({ response: expect.objectContaining({ code: c }) });

describe('Gán ⇒ hạn trả lời', () => {
  maybe('chuyến xa: hạn = gán + 60′, có trong DTO khu quản lý và "Chuyến tôi lái"', async () => {
    const pickupAt = farPickup();
    const link = await seedDriverLink(asService, { tenantId: tenant });
    const bookingId = await seedBooking(pickupAt);
    const detail = await bookings.assignDriver(tenant, bookingId, owner, link.driverId);

    const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.driverAssignedAt).not.toBeNull();
    expect(row.driverRespondBy?.getTime()).toBe(row.driverAssignedAt!.getTime() + 60 * MIN);
    expect(detail.driver?.respondBy).toBe(row.driverRespondBy?.toISOString());

    const trip = await driverSelf.trip(link.userId, bookingId);
    expect(trip.respondBy).toBe(row.driverRespondBy?.toISOString());
  });

  maybe('chuyến sát giờ (100′ nữa): hạn = gán + 15′ (sàn)', async () => {
    const pickupAt = new Date(Date.now() + 100 * MIN);
    const { bookingId } = await assignFresh(pickupAt);
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.driverRespondBy?.toISOString()).toBe(
      driverRespondByFor(row.driverAssignedAt!, pickupAt).toISOString(),
    );
    expect(row.driverRespondBy!.getTime() - row.driverAssignedAt!.getTime()).toBe(15 * MIN);
  });
});

describe('Nhận chuyến và hạn', () => {
  maybe('nhận TRƯỚC hạn → accepted, mốc hạn về NULL, worker không đụng', async () => {
    const { userId, bookingId } = await assignFresh();
    await drivers.respondToTrip(userId, bookingId, true);
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.driverAssignmentStatus).toBe(DRIVER_ASSIGNMENT_STATUS.ACCEPTED);
    expect(row.driverRespondBy).toBeNull();

    await sweepDriverAssignmentExpiry(prisma);
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(after.driverUserId).toBe(userId);
  });

  maybe('nhận SAU hạn (worker chưa quét) → DRIVER_ASSIGNMENT_EXPIRED, lượt vẫn chờ', async () => {
    const { userId, bookingId } = await assignFresh();
    await lapse(bookingId);
    await expect(drivers.respondToTrip(userId, bookingId, true)).rejects.toMatchObject(
      code(API_ERROR_CODE.DRIVER_ASSIGNMENT_EXPIRED),
    );
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.driverAssignmentStatus).toBe(DRIVER_ASSIGNMENT_STATUS.PENDING);
  });
});

describe('Worker quét hạn trả lời', () => {
  maybe('gỡ lượt, sổ `expired`, đơn KHÔNG huỷ, audit + báo hai phía; chạy lại ra 0', async () => {
    const { userId, driverId, bookingId } = await assignFresh();
    await lapse(bookingId);

    const first = await sweepDriverAssignmentExpiry(prisma);
    expect(first.expired).toBeGreaterThanOrEqual(1);

    const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.status).toBe(BOOKING_STATUS.RESERVED);
    expect(row.driverId).toBeNull();
    expect(row.driverUserId).toBeNull();
    expect(row.driverAssignmentStatus).toBeNull();
    expect(row.driverAssignedAt).toBeNull();
    expect(row.driverRespondBy).toBeNull();

    const episode = await prisma.bookingDriverAssignment.findFirstOrThrow({
      where: { bookingId, driverId },
    });
    expect(episode.outcome).toBe(DRIVER_ASSIGNMENT_OUTCOME.EXPIRED);
    expect(episode.endedAt).not.toBeNull();
    expect(episode.endedBy).toBeNull();

    const auditRow = await prisma.auditLog.findFirst({
      where: { targetId: bookingId, action: 'booking.driver_response_expired' },
    });
    expect(auditRow?.actorUserId).toBeNull();

    const notes = await prisma.notification.findMany({
      where: { targetId: bookingId, type: NOTIFICATION_TYPE.DRIVER_TRIP_RESPONSE_EXPIRED },
    });
    const toOwner = notes.find((n) => n.userId === owner);
    expect(toOwner?.title).toContain('không phản hồi');
    expect(toOwner?.title).toContain('30 phút');
    expect(notes.some((n) => n.userId === userId)).toBe(true);

    // Idempotent: đơn này không bị xử lý lần hai.
    await sweepDriverAssignmentExpiry(prisma);
    const again = await prisma.notification.count({
      where: { targetId: bookingId, type: NOTIFICATION_TYPE.DRIVER_TRIP_RESPONSE_EXPIRED },
    });
    expect(again).toBe(notes.length);

    // Sau khi bị trả về: Nhận ⇒ EXPIRED (không phải 404); Từ chối ⇒ thành công.
    await expect(drivers.respondToTrip(userId, bookingId, true)).rejects.toMatchObject(
      code(API_ERROR_CODE.DRIVER_ASSIGNMENT_EXPIRED),
    );
    await expect(drivers.respondToTrip(userId, bookingId, false)).resolves.toBeUndefined();

    // Tab "Đã qua" của tài xế hiện chuyến với kết cục `expired`.
    const past = await driverSelf.trips(userId, { tab: DRIVER_TRIP_TAB.PAST });
    const item = past.data.find((t) => t.id === bookingId);
    expect(item?.outcome).toBe(DRIVER_ASSIGNMENT_OUTCOME.EXPIRED);
    expect(item?.respondBy).toBeNull();

    // Bên thuê gán lại được ngay — khung giờ của đơn đã trống tài xế.
    const other = await seedDriverLink(asService, { tenantId: tenant });
    await bookings.assignDriver(tenant, bookingId, owner, other.driverId);
  });

  maybe(
    'từ chối SAU hạn trước khi worker quét → kết cục `expired`, bên thuê nhận tin khẩn',
    async () => {
      const { userId, bookingId } = await assignFresh();
      await lapse(bookingId);
      await drivers.respondToTrip(userId, bookingId, false);

      const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      expect(row.driverId).toBeNull();
      const episode = await prisma.bookingDriverAssignment.findFirstOrThrow({
        where: { bookingId, driverUserId: userId },
      });
      expect(episode.outcome).toBe(DRIVER_ASSIGNMENT_OUTCOME.EXPIRED);
      const toOwner = await prisma.notification.findFirst({
        where: {
          targetId: bookingId,
          userId: owner,
          type: NOTIFICATION_TYPE.DRIVER_TRIP_RESPONSE_EXPIRED,
        },
      });
      expect(toOwner).not.toBeNull();
    },
  );

  maybe('từ chối TRƯỚC hạn → `declined`, tin bên thuê yêu cầu gán lại trong 30 phút', async () => {
    const { userId, bookingId } = await assignFresh();
    await drivers.respondToTrip(userId, bookingId, false);
    const episode = await prisma.bookingDriverAssignment.findFirstOrThrow({
      where: { bookingId, driverUserId: userId },
    });
    expect(episode.outcome).toBe(DRIVER_ASSIGNMENT_OUTCOME.DECLINED);
    const toOwner = await prisma.notification.findFirstOrThrow({
      where: { targetId: bookingId, userId: owner, type: NOTIFICATION_TYPE.DRIVER_TRIP_DECLINED },
    });
    expect(toOwner.body).toContain('30 phút');
  });

  maybe('đơn đã giao xe (`active`) KHÔNG bị trả về dù quá hạn', async () => {
    const { userId, bookingId } = await assignFresh();
    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: BOOKING_STATUS.ACTIVE, driverRespondBy: new Date(Date.now() - MIN) },
    });
    await sweepDriverAssignmentExpiry(prisma);
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.driverUserId).toBe(userId);
    expect(row.driverAssignmentStatus).toBe(DRIVER_ASSIGNMENT_STATUS.PENDING);
    // Xe đã lăn bánh: tài xế vẫn xác nhận được.
    await drivers.respondToTrip(userId, bookingId, true);
  });
});
