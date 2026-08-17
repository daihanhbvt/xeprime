import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  BOOKING_STATUS,
  DRIVER_STATUS,
  MEMBERSHIP_STATUS,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { DriversService } from '../src/modules/drivers/drivers.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { NotificationService } from '../src/modules/notification/notification.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Lịch bận tài xế (17/08), trên PostgreSQL THẬT:
 *
 *   1. MỘT tài xế không nhận được hai đơn "sống" giao nhau — service chặn với thông điệp rõ,
 *      và exclusion constraint `bookings_driver_schedule_excl` là chốt chặn cuối (ADR 0006
 *      pattern: INSERT thô lách qua service vẫn bị DB từ chối).
 *   2. Biên nửa hở: trả 10:00 và nhận chuyến kế 10:00 KHÔNG tính trùng.
 *   3. GPLX hết hạn trước lúc trả xe → không gán; inactive/deleted → không gán;
 *      tài xế shop khác → không gán (composite FK).
 *   4. Đơn khép lại (completed/cancelled) rời phạm vi constraint — tài xế rảnh khung giờ đó.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const drivers = new DriversService(asService, audit);
const bookings = new BookingsService(
  asService,
  new OccupancyService(asService),
  audit,
  new NotificationService(asService),
  drivers,
);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let otherTenantId: string;
let vehicleId: string;
let vehicle2Id: string;

const BASE = new Date('2027-09-01T02:00:00.000Z');
const hours = (n: number) => new Date(BASE.getTime() + n * 3_600_000);

let seq = 0;
async function seedBooking(opts: {
  pickupAt: Date;
  returnAt: Date;
  status?: string;
  driverId?: string | null;
  vehicle?: string;
}): Promise<string> {
  seq += 1;
  const id = newId();
  await prisma.booking.create({
    data: {
      id,
      tenantId,
      vehicleId: opts.vehicle ?? vehicleId,
      code: `DH-DRV-${seq}`,
      customerName: 'Khách Driver',
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      routeType: 'in_city',
      pickupAddress: '1 Lê Lợi',
      status: opts.status ?? BOOKING_STATUS.RESERVED,
      pickupAt: opts.pickupAt,
      returnAt: opts.returnAt,
      driverId: opts.driverId ?? null,
      baseAmount: new Prisma.Decimal('1000000'),
      totalAmount: new Prisma.Decimal('1000000'),
    },
  });
  return id;
}

async function seedDriver(opts: {
  name: string;
  tenant?: string;
  status?: string;
  licenseExpiresAt?: Date | null;
  deletedAt?: Date | null;
}): Promise<string> {
  const id = newId();
  await prisma.driver.create({
    data: {
      id,
      tenantId: opts.tenant ?? tenantId,
      name: opts.name,
      phone: '0901112233',
      status: opts.status ?? DRIVER_STATUS.ACTIVE,
      licenseExpiresAt: opts.licenseExpiresAt ?? null,
      deletedAt: opts.deletedAt ?? null,
    },
  });
  return id;
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

  ownerId = newId();
  tenantId = newId();
  otherTenantId = newId();
  vehicleId = newId();
  vehicle2Id = newId();

  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ shop', email: `drv-${ownerId}@xeprime.test` },
  });
  for (const [tid, name] of [
    [tenantId, 'Shop Driver'],
    [otherTenantId, 'Shop Khác'],
  ] as const) {
    await prisma.tenant.create({
      data: {
        id: tid,
        code: `T-${tid.slice(-8)}`,
        slug: `t-${tid.toLowerCase().slice(-10)}`,
        name,
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: ownerId,
      },
    });
  }
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });
  for (const [vid, code] of [
    [vehicleId, 'V-DRV-1'],
    [vehicle2Id, 'V-DRV-2'],
  ] as const) {
    await prisma.vehicle.create({
      data: {
        id: vid,
        tenantId,
        code,
        name: `Innova ${code}`,
        vehicleType: VEHICLE_TYPE.CAR,
        serviceTypes: [SERVICE_TYPE.WITH_DRIVER],
        withDriverDailyPrice: new Prisma.Decimal('1300000'),
      },
    });
  }
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.vehicleOccupancy.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.driver.deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Một tài xế không nhận hai đơn giao nhau', () => {
  maybe('gán vào đơn giao nhau → 409 kèm mã đơn đang bận; đơn KỀ NHAU thì gán được', async () => {
    const driverId = await seedDriver({ name: 'Tài xế A' });
    const first = await seedBooking({ pickupAt: hours(0), returnAt: hours(24) });
    await bookings.assignDriver(tenantId, first, ownerId, driverId);

    // Đơn thứ hai (xe khác) đè giữa khung giờ → chặn, thông điệp nêu mã đơn đang bận.
    const overlapping = await seedBooking({
      pickupAt: hours(12),
      returnAt: hours(36),
      vehicle: vehicle2Id,
    });
    await expect(
      bookings.assignDriver(tenantId, overlapping, ownerId, driverId),
    ).rejects.toMatchObject({ status: 409 });

    // Biên nửa hở: nhận đúng lúc đơn trước trả (hours 24) → KHÔNG trùng.
    const adjacent = await seedBooking({
      pickupAt: hours(24),
      returnAt: hours(48),
      vehicle: vehicle2Id,
    });
    const assigned = await bookings.assignDriver(tenantId, adjacent, ownerId, driverId);
    expect(assigned.driver?.id).toBe(driverId);
  });

  maybe('đơn đã KHÉP không giữ chỗ tài xế — completed rời phạm vi constraint', async () => {
    const driverId = await seedDriver({ name: 'Tài xế B' });
    await seedBooking({
      pickupAt: hours(100),
      returnAt: hours(124),
      status: BOOKING_STATUS.COMPLETED,
      driverId,
    });
    const next = await seedBooking({
      pickupAt: hours(100),
      returnAt: hours(124),
      vehicle: vehicle2Id,
    });
    const assigned = await bookings.assignDriver(tenantId, next, ownerId, driverId);
    expect(assigned.driver?.id).toBe(driverId);
  });

  maybe('INSERT thô lách qua service vẫn bị exclusion constraint từ chối (chốt chặn cuối)', async () => {
    const driverId = await seedDriver({ name: 'Tài xế C' });
    await seedBooking({ pickupAt: hours(200), returnAt: hours(224), driverId });
    await expect(
      seedBooking({
        pickupAt: hours(210),
        returnAt: hours(230),
        vehicle: vehicle2Id,
        driverId,
      }),
    ).rejects.toThrow(/driver_schedule_excl|exclusion/i);
  });

  maybe('assignable: người bận/GPLX hết hạn vẫn được trả về kèm CỜ lý do', async () => {
    const busyId = await seedDriver({ name: 'Tài xế Bận' });
    await seedBooking({ pickupAt: hours(300), returnAt: hours(324), driverId: busyId });
    const expiredId = await seedDriver({
      name: 'Tài xế Hết hạn',
      licenseExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
    });

    const list = await drivers.assignable(tenantId, {
      pickupAt: hours(310),
      returnAt: hours(320),
    });
    const busy = list.find((d) => d.id === busyId);
    const expired = list.find((d) => d.id === expiredId);
    expect(busy?.busy).toBe(true);
    expect(expired?.licenseExpired).toBe(true);
    expect(expired?.busy).toBe(false);
  });
});

describe('Điều kiện gán: trạng thái, GPLX, tenant', () => {
  maybe('GPLX hết hạn trước lúc TRẢ XE → 409; còn hạn tới hết chuyến → gán được', async () => {
    const driverId = await seedDriver({
      name: 'Tài xế GPLX',
      // Hết hạn 2027-09-05; chuyến kết thúc 2027-09-11 → chặn.
      licenseExpiresAt: new Date('2027-09-05T00:00:00.000Z'),
    });
    const longTrip = await seedBooking({ pickupAt: hours(400), returnAt: hours(400 + 96) });
    await expect(
      bookings.assignDriver(tenantId, longTrip, ownerId, driverId),
    ).rejects.toMatchObject({ status: 409 });

    // Chuyến ngắn kết thúc 2027-09-03 (trước hạn 09-05) → hợp lệ.
    const shortTrip = await seedBooking({
      pickupAt: hours(30),
      returnAt: hours(40),
      vehicle: vehicle2Id,
    });
    const assigned = await bookings.assignDriver(tenantId, shortTrip, ownerId, driverId);
    expect(assigned.driver?.id).toBe(driverId);
  });

  maybe('inactive / đã xoá / thuộc shop khác → không gán được', async () => {
    const target = await seedBooking({ pickupAt: hours(500), returnAt: hours(524) });

    const inactive = await seedDriver({ name: 'Ngừng', status: DRIVER_STATUS.INACTIVE });
    await expect(bookings.assignDriver(tenantId, target, ownerId, inactive)).rejects.toMatchObject({
      status: 404,
    });

    const deleted = await seedDriver({ name: 'Đã xoá', deletedAt: new Date() });
    await expect(bookings.assignDriver(tenantId, target, ownerId, deleted)).rejects.toMatchObject({
      status: 404,
    });

    // Tài xế của shop khác: service không thấy (scope tenant) → 404; kể cả service quên thì
    // composite FK (driver_id, tenant_id) ở DB cũng từ chối.
    const foreign = await seedDriver({ name: 'Shop khác', tenant: otherTenantId });
    await expect(bookings.assignDriver(tenantId, target, ownerId, foreign)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      prisma.booking.update({ where: { id: target }, data: { driverId: foreign } }),
    ).rejects.toThrow();
  });
});
