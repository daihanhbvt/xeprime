import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  DRIVER_ASSIGNMENT_OUTCOME,
  DRIVER_ASSIGNMENT_STATUS,
  DRIVER_LINK_END_PARTY,
  DRIVER_LINK_OPEN_STATUSES,
  DRIVER_LINK_STATUS,
  DRIVER_TRIP_TAB,
  MEMBERSHIP_STATUS,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  USER_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { DriverSelfService } from '../src/modules/drivers/driver-self.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  cleanupDriverAccounts,
  randomDriverPhone,
  seedDriverLink,
  trackDriverAccount,
} from './helpers/driver-link';
import { customerAccountFor } from './helpers/customer-account';
import {
  makeBookingsService,
  makeCustomersService,
  makeDriversService,
} from './helpers/service-factory';

/**
 * Tài xế = LIÊN KẾT giữa bên thuê và một tài khoản KHÁCH (ADR 0063), trên PostgreSQL THẬT:
 *
 *   1. Mời: chỉ tài khoản khách đã xác minh SĐT, đang hoạt động; một liên kết MỞ cho mỗi cặp
 *      (bên thuê, tài khoản) — unique partial `drivers_one_open_link_key`.
 *   2. Tài xế đồng ý / từ chối lời mời; lượt trả lời thứ hai là xung đột trạng thái.
 *   3. Gán vào chuyến: luôn `pending`, tài xế nhận/từ chối. Chỉ đơn có tài xế, liên kết `active`,
 *      tài xế không phải khách của chính chuyến.
 *   4. Lịch bận theo NGƯỜI, xuyên mọi bên thuê: service chặn `DRIVER_BUSY`, và EXCLUDE
 *      `bookings_driver_user_schedule_excl` là trọng tài khi hai lượt gán đua nhau.
 *   5. Kết thúc liên kết: bị chặn khi tài xế đang chạy chuyến, nhả các chuyến chưa nhận xe.
 *   6. "Chuyến tôi lái": chỉ chuyến của chính mình; SĐT khách chỉ hiện khi đã nhận chuyến và
 *      vào cửa sổ trước giờ nhận xe.
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

let dbAvailable = false;
let ownerA: string;
let ownerB: string;
let tenantA: string;
let tenantB: string;
let vehicleA1: string;
let vehicleA2: string;
let vehicleB: string;

const BASE = new Date('2027-09-01T02:00:00.000Z');
const hours = (n: number) => new Date(BASE.getTime() + n * 3_600_000);

let seq = 0;
async function seedBooking(opts: {
  tenant?: string;
  vehicle?: string;
  pickupAt: Date;
  returnAt: Date;
  status?: string;
  serviceType?: string;
  customerUserId?: string;
}): Promise<string> {
  seq += 1;
  const id = newId();
  const tenantId = opts.tenant ?? tenantA;
  const withDriver = (opts.serviceType ?? SERVICE_TYPE.WITH_DRIVER) === SERVICE_TYPE.WITH_DRIVER;
  const customerPhone = `0977${String(100000 + seq).slice(-6)}`;
  await prisma.booking.create({
    data: {
      id,
      tenantId,
      vehicleId: opts.vehicle ?? vehicleA1,
      code: `DH-DRV-${Date.now().toString(36)}-${seq}`,
      customerName: 'Khách Driver',
      customerPhone,
      serviceType: opts.serviceType ?? SERVICE_TYPE.WITH_DRIVER,
      ...(withDriver ? { routeType: 'in_city', pickupAddress: '1 Lê Lợi' } : {}),
      status: opts.status ?? BOOKING_STATUS.RESERVED,
      pickupAt: opts.pickupAt,
      returnAt: opts.returnAt,
      baseAmount: new Prisma.Decimal('1000000'),
      totalAmount: new Prisma.Decimal('1000000'),
    },
  });
  if (opts.customerUserId) {
    await prisma.bookingRequest.create({
      data: {
        id: newId(),
        tenantId,
        vehicleId: opts.vehicle ?? vehicleA1,
        bookingId: id,
        customerUserId: opts.customerUserId,
        customerName: 'Khách Driver',
        customerPhone,
        status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        pickupAt: opts.pickupAt,
        returnAt: opts.returnAt,
        respondBy: new Date(opts.pickupAt.getTime() - 3_600_000),
      },
    });
  }
  return id;
}

/** Cửa sổ giờ riêng cho từng ca — tránh ca này làm bận tài xế của ca khác. */
let slot = 0;
function nextWindow(lengthH = 24): { pickupAt: Date; returnAt: Date; at: (h: number) => Date } {
  slot += 1;
  const start = slot * 1000;
  return { pickupAt: hours(start), returnAt: hours(start + lengthH), at: (h) => hours(start + h) };
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

  ownerA = newId();
  ownerB = newId();
  tenantA = newId();
  tenantB = newId();
  vehicleA1 = newId();
  vehicleA2 = newId();
  vehicleB = newId();

  for (const [uid, label] of [
    [ownerA, 'a'],
    [ownerB, 'b'],
  ] as const) {
    await prisma.user.create({
      data: {
        realm: ACCOUNT_REALM.PARTNER,
        id: uid,
        displayName: `Chủ ${label}`,
        email: `drv-${uid}@xeprime.test`,
      },
    });
  }
  for (const [tid, owner, name] of [
    [tenantA, ownerA, 'Shop Driver A'],
    [tenantB, ownerB, 'Shop Driver B'],
  ] as const) {
    await prisma.tenant.create({
      data: {
        id: tid,
        code: `T-${tid.slice(-8)}`,
        slug: `t-${tid.toLowerCase().slice(-10)}`,
        name,
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: owner,
        // Tiền công tài xế/ngày mặc định (ADR 0075) — gán tài xế cần một số để tài xế thấy trước.
        driverDailyWage: new Prisma.Decimal('500000'),
      },
    });
    await prisma.tenantMembership.create({
      data: {
        id: newId(),
        tenantId: tid,
        userId: owner,
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
    });
  }
  for (const [vid, tid, code] of [
    [vehicleA1, tenantA, 'V-DRV-A1'],
    [vehicleA2, tenantA, 'V-DRV-A2'],
    [vehicleB, tenantB, 'V-DRV-B'],
  ] as const) {
    await prisma.vehicle.create({
      data: {
        id: vid,
        tenantId: tid,
        code: `${code}-${vid.slice(-6)}`,
        name: `Innova ${code}`,
        vehicleType: VEHICLE_TYPE.CAR,
        serviceTypes: [SERVICE_TYPE.WITH_DRIVER, SERVICE_TYPE.SELF_DRIVE],
        withDriverDailyPrice: new Prisma.Decimal('1300000'),
      },
    });
  }
});

afterAll(async () => {
  if (dbAvailable) {
    const tenants = { in: [tenantA, tenantB] };
    await prisma.bookingRequest.deleteMany({ where: { tenantId: tenants } });
    await prisma.booking.deleteMany({ where: { tenantId: tenants } });
    await prisma.vehicleOccupancy.deleteMany({ where: { tenantId: tenants } });
    await prisma.auditLog.deleteMany({ where: { tenantId: tenants } });
    await prisma.notification.deleteMany({ where: { tenantId: tenants } });
    await prisma.driver.deleteMany({ where: { tenantId: tenants } });
    await cleanupDriverAccounts(asService);
    await prisma.vehicle.deleteMany({ where: { tenantId: tenants } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: tenants } });
    await prisma.tenant.deleteMany({ where: { id: tenants } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerA, ownerB] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

const code = (c: string) => ({ response: expect.objectContaining({ code: c }) });

async function customerAccount(phone = randomDriverPhone(), name = 'Tài xế mời'): Promise<string> {
  const id = await customerAccountFor(asService, phone, name);
  trackDriverAccount(id);
  return id;
}

describe('Mời tài xế', () => {
  maybe('SĐT chưa có tài khoản / chưa xác minh / tài khoản bị khoá → DRIVER_ACCOUNT_NOT_FOUND', async () => {
    await expect(
      drivers.invite(tenantA, ownerA, { phone: randomDriverPhone(), name: 'Không ai' }),
    ).rejects.toMatchObject({ status: 404, ...code(API_ERROR_CODE.DRIVER_ACCOUNT_NOT_FOUND) });

    const unverifiedPhone = randomDriverPhone();
    const unverified = await customerAccount(unverifiedPhone);
    await prisma.user.update({ where: { id: unverified }, data: { phoneVerifiedAt: null } });
    await expect(
      drivers.invite(tenantA, ownerA, { phone: unverifiedPhone, name: 'Chưa xác minh' }),
    ).rejects.toMatchObject(code(API_ERROR_CODE.DRIVER_ACCOUNT_NOT_FOUND));

    const lockedPhone = randomDriverPhone();
    const locked = await customerAccount(lockedPhone);
    await prisma.user.update({ where: { id: locked }, data: { status: USER_STATUS.LOCKED } });
    await expect(
      drivers.invite(tenantA, ownerA, { phone: lockedPhone, name: 'Bị khoá' }),
    ).rejects.toMatchObject(code(API_ERROR_CODE.DRIVER_ACCOUNT_NOT_FOUND));
  });

  maybe('SĐT chỉ thuộc một tài khoản ĐỐI TÁC không được nhận làm tài xế', async () => {
    const phone = randomDriverPhone();
    const partnerId = newId();
    trackDriverAccount(partnerId);
    await prisma.user.create({
      data: {
        id: partnerId,
        realm: ACCOUNT_REALM.PARTNER,
        phone,
        phoneVerifiedAt: new Date(),
        displayName: 'Đối tác',
        status: USER_STATUS.ACTIVE,
      },
    });
    await expect(
      drivers.invite(tenantA, ownerA, { phone, name: 'Đối tác' }),
    ).rejects.toMatchObject(code(API_ERROR_CODE.DRIVER_ACCOUNT_NOT_FOUND));
  });

  maybe('mời trùng khi còn liên kết mở → DRIVER_ALREADY_LINKED; bên thuê KHÁC vẫn mời được', async () => {
    const phone = randomDriverPhone();
    const userId = await customerAccount(phone);
    const link = await drivers.invite(tenantA, ownerA, { phone, name: 'Tài xế Một' });
    expect(link.linkStatus).toBe(DRIVER_LINK_STATUS.INVITED);

    await expect(
      drivers.invite(tenantA, ownerA, { phone, name: 'Lặp' }),
    ).rejects.toMatchObject({ status: 409, ...code(API_ERROR_CODE.DRIVER_ALREADY_LINKED) });

    const other = await drivers.invite(tenantB, ownerB, { phone, name: 'Ở shop B' });
    expect(other.linkStatus).toBe(DRIVER_LINK_STATUS.INVITED);

    // Thông báo mời tới đúng tài khoản khách.
    expect(
      await prisma.notification.count({ where: { userId, targetId: link.id } }),
    ).toBe(1);
  });

  maybe('sau khi tài xế TỪ CHỐI, bên thuê mời lại được', async () => {
    const phone = randomDriverPhone();
    const userId = await customerAccount(phone);
    const first = await drivers.invite(tenantA, ownerA, { phone, name: 'Từ chối' });
    await drivers.respondToInvite(userId, first.id, false);
    const declined = await prisma.driver.findUniqueOrThrow({ where: { id: first.id } });
    expect(declined.linkStatus).toBe(DRIVER_LINK_STATUS.DECLINED);
    expect(declined.respondedAt).not.toBeNull();

    const again = await drivers.invite(tenantA, ownerA, { phone, name: 'Mời lại' });
    expect(again.id).not.toBe(first.id);
    expect(again.linkStatus).toBe(DRIVER_LINK_STATUS.INVITED);
  });
});

describe('Tài xế trả lời lời mời', () => {
  maybe('đồng ý → active; trả lời lần hai → DRIVER_LINK_STATE_CONFLICT; người khác → 404', async () => {
    const phone = randomDriverPhone();
    const userId = await customerAccount(phone);
    const link = await drivers.invite(tenantA, ownerA, { phone, name: 'Đồng ý' });

    const stranger = await customerAccount();
    await expect(drivers.respondToInvite(stranger, link.id, true)).rejects.toMatchObject({
      status: 404,
    });

    await drivers.respondToInvite(userId, link.id, true);
    expect((await prisma.driver.findUniqueOrThrow({ where: { id: link.id } })).linkStatus).toBe(
      DRIVER_LINK_STATUS.ACTIVE,
    );

    await expect(drivers.respondToInvite(userId, link.id, false)).rejects.toMatchObject({
      status: 409,
      ...code(API_ERROR_CODE.DRIVER_LINK_STATE_CONFLICT),
    });
  });
});

describe('Gán tài xế vào chuyến', () => {
  maybe('lượt gán mới ở PENDING; tài xế nhận → accepted; trả lời lần hai → xung đột', async () => {
    const w = nextWindow();
    const { driverId, userId } = await seedDriverLink(asService, { tenantId: tenantA });
    const bookingId = await seedBooking(w);

    const detail = await bookings.assignDriver(tenantA, bookingId, ownerA, driverId);
    expect(detail.driver?.id).toBe(driverId);
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.driverUserId).toBe(userId);
    expect(row.driverAssignmentStatus).toBe(DRIVER_ASSIGNMENT_STATUS.PENDING);
    expect(row.driverAssignedAt).not.toBeNull();

    // Người khác không trả lời thay được.
    const stranger = await customerAccount();
    await expect(drivers.respondToTrip(stranger, bookingId, true)).rejects.toMatchObject({
      status: 404,
    });

    await drivers.respondToTrip(userId, bookingId, true);
    const accepted = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(accepted.driverAssignmentStatus).toBe(DRIVER_ASSIGNMENT_STATUS.ACCEPTED);
    expect(accepted.driverRespondedAt).not.toBeNull();

    await expect(drivers.respondToTrip(userId, bookingId, false)).rejects.toMatchObject(
      code(API_ERROR_CODE.DRIVER_ASSIGNMENT_STATE_CONFLICT),
    );
  });

  maybe('tài xế TỪ CHỐI → đơn về chưa có tài xế, lịch người đó được nhả', async () => {
    const w = nextWindow();
    const { driverId, userId } = await seedDriverLink(asService, { tenantId: tenantA });
    const bookingId = await seedBooking(w);
    await bookings.assignDriver(tenantA, bookingId, ownerA, driverId);

    await drivers.respondToTrip(userId, bookingId, false);
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.driverId).toBeNull();
    expect(row.driverUserId).toBeNull();
    expect(row.driverAssignmentStatus).toBeNull();

    // Khung giờ đó giờ gán được cho chuyến khác.
    const other = await seedBooking({ ...w, vehicle: vehicleA2 });
    await bookings.assignDriver(tenantA, other, ownerA, driverId);
  });

  maybe('đơn KHÔNG phải có tài xế → DRIVER_ASSIGN_SERVICE_NOT_SUPPORTED', async () => {
    const w = nextWindow();
    const { driverId } = await seedDriverLink(asService, { tenantId: tenantA });
    const selfDrive = await seedBooking({ ...w, serviceType: SERVICE_TYPE.SELF_DRIVE });
    await expect(
      bookings.assignDriver(tenantA, selfDrive, ownerA, driverId),
    ).rejects.toMatchObject({
      status: 422,
      ...code(API_ERROR_CODE.DRIVER_ASSIGN_SERVICE_NOT_SUPPORTED),
    });
  });

  maybe('liên kết tạm khoá / chờ đồng ý → DRIVER_NOT_ASSIGNABLE; của bên thuê khác → 404', async () => {
    const w = nextWindow();
    const bookingId = await seedBooking(w);
    for (const linkStatus of [DRIVER_LINK_STATUS.SUSPENDED, DRIVER_LINK_STATUS.INVITED]) {
      const { driverId } = await seedDriverLink(asService, { tenantId: tenantA, linkStatus });
      await expect(
        bookings.assignDriver(tenantA, bookingId, ownerA, driverId),
      ).rejects.toMatchObject(code(API_ERROR_CODE.DRIVER_NOT_ASSIGNABLE));
    }

    const foreign = await seedDriverLink(asService, { tenantId: tenantB });
    await expect(
      bookings.assignDriver(tenantA, bookingId, ownerA, foreign.driverId),
    ).rejects.toMatchObject({ status: 404 });
  });

  maybe('setSuspended chặn gán mới nhưng GIỮ chuyến đã gán', async () => {
    const w = nextWindow();
    const { driverId } = await seedDriverLink(asService, { tenantId: tenantA });
    const kept = await seedBooking(w);
    await bookings.assignDriver(tenantA, kept, ownerA, driverId);

    const dto = await drivers.setSuspended(tenantA, ownerA, driverId, true);
    expect(dto.linkStatus).toBe(DRIVER_LINK_STATUS.SUSPENDED);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: kept } })).driverId).toBe(
      driverId,
    );

    const later = await seedBooking({ pickupAt: w.at(100), returnAt: w.at(120) });
    await expect(bookings.assignDriver(tenantA, later, ownerA, driverId)).rejects.toMatchObject(
      code(API_ERROR_CODE.DRIVER_NOT_ASSIGNABLE),
    );
    await expect(drivers.setSuspended(tenantA, ownerA, driverId, true)).rejects.toMatchObject(
      code(API_ERROR_CODE.DRIVER_LINK_STATE_CONFLICT),
    );
    await drivers.setSuspended(tenantA, ownerA, driverId, false);
    await bookings.assignDriver(tenantA, later, ownerA, driverId);
  });

  maybe('tài xế là KHÁCH của chính chuyến → DRIVER_IS_TRIP_CUSTOMER', async () => {
    const w = nextWindow();
    const { driverId, userId } = await seedDriverLink(asService, { tenantId: tenantA });
    const bookingId = await seedBooking({ ...w, customerUserId: userId });
    await expect(
      bookings.assignDriver(tenantA, bookingId, ownerA, driverId),
    ).rejects.toMatchObject(code(API_ERROR_CODE.DRIVER_IS_TRIP_CUSTOMER));
  });

  maybe('đổi người: người cũ được báo gỡ, người mới ở pending; bỏ gán xoá cả bốn cột', async () => {
    const w = nextWindow();
    const first = await seedDriverLink(asService, { tenantId: tenantA });
    const second = await seedDriverLink(asService, { tenantId: tenantA });
    const bookingId = await seedBooking(w);
    await bookings.assignDriver(tenantA, bookingId, ownerA, first.driverId);
    await bookings.assignDriver(tenantA, bookingId, ownerA, second.driverId);

    const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.driverUserId).toBe(second.userId);
    expect(row.driverAssignmentStatus).toBe(DRIVER_ASSIGNMENT_STATUS.PENDING);
    expect(
      await prisma.notification.count({
        where: { userId: first.userId, targetId: bookingId, type: 'driver_trip_unassigned' },
      }),
    ).toBe(1);

    await bookings.assignDriver(tenantA, bookingId, ownerA, null);
    const cleared = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect([
      cleared.driverId,
      cleared.driverUserId,
      cleared.driverAssignmentStatus,
      cleared.driverAssignedAt,
    ]).toEqual([null, null, null, null]);
  });
});

describe('Lịch bận theo NGƯỜI, xuyên mọi bên thuê', () => {
  maybe('cùng một tài khoản lái cho HAI bên thuê: chuyến giao nhau → DRIVER_BUSY; kề nhau thì được', async () => {
    const w = nextWindow();
    const phone = randomDriverPhone();
    const atA = await seedDriverLink(asService, { tenantId: tenantA, phone });
    const atB = await seedDriverLink(asService, { tenantId: tenantB, phone });
    expect(atA.userId).toBe(atB.userId);

    const tripA = await seedBooking(w);
    await bookings.assignDriver(tenantA, tripA, ownerA, atA.driverId);

    // Lượt gán còn PENDING vẫn giữ lịch người đó.
    const overlapB = await seedBooking({
      tenant: tenantB,
      vehicle: vehicleB,
      pickupAt: w.at(12),
      returnAt: w.at(36),
    });
    await expect(
      bookings.assignDriver(tenantB, overlapB, ownerB, atB.driverId),
    ).rejects.toMatchObject({ status: 409, ...code(API_ERROR_CODE.DRIVER_BUSY) });

    // Biên nửa hở: nhận đúng lúc chuyến trước trả → không trùng.
    const adjacentB = await seedBooking({
      tenant: tenantB,
      vehicle: vehicleB,
      pickupAt: w.at(24),
      returnAt: w.at(48),
    });
    await bookings.assignDriver(tenantB, adjacentB, ownerB, atB.driverId);
  });

  maybe('hai lượt gán ĐUA nhau ở hai bên thuê: EXCLUDE chỉ cho đúng một lượt thắng', async () => {
    const w = nextWindow();
    const phone = randomDriverPhone();
    const atA = await seedDriverLink(asService, { tenantId: tenantA, phone });
    const atB = await seedDriverLink(asService, { tenantId: tenantB, phone });
    const tripA = await seedBooking(w);
    const tripB = await seedBooking({ ...w, tenant: tenantB, vehicle: vehicleB });

    const results = await Promise.allSettled([
      bookings.assignDriver(tenantA, tripA, ownerA, atA.driverId),
      bookings.assignDriver(tenantB, tripB, ownerB, atB.driverId),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.reason).toMatchObject(code(API_ERROR_CODE.DRIVER_BUSY));
    expect(
      await prisma.booking.count({ where: { driverUserId: atA.userId, id: { in: [tripA, tripB] } } }),
    ).toBe(1);
  });

  maybe('ghi thô lách service vẫn bị EXCLUDE từ chối (chốt chặn cuối)', async () => {
    const w = nextWindow();
    const { driverId, userId } = await seedDriverLink(asService, { tenantId: tenantA });
    const first = await seedBooking(w);
    await bookings.assignDriver(tenantA, first, ownerA, driverId);
    const second = await seedBooking({ ...w, vehicle: vehicleA2 });
    await expect(
      prisma.booking.update({
        where: { id: second },
        data: {
          driverId,
          driverUserId: userId,
          driverAssignmentStatus: DRIVER_ASSIGNMENT_STATUS.ACCEPTED,
          driverAssignedAt: new Date(),
          driverRespondedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/bookings_driver_user_schedule_excl|exclusion/i);
  });

  maybe('đơn đã khép (completed) không giữ lịch tài xế', async () => {
    const w = nextWindow();
    const { driverId } = await seedDriverLink(asService, { tenantId: tenantA });
    const done = await seedBooking(w);
    await bookings.assignDriver(tenantA, done, ownerA, driverId);
    await prisma.booking.update({
      where: { id: done },
      data: { status: BOOKING_STATUS.COMPLETED },
    });
    const next = await seedBooking({ ...w, vehicle: vehicleA2 });
    await bookings.assignDriver(tenantA, next, ownerA, driverId);
  });

  maybe('assignable(): trả mọi tài xế đang liên kết kèm cờ bận; hasAvailableDriver theo đó', async () => {
    const w = nextWindow();
    const busy = await seedDriverLink(asService, { tenantId: tenantB, name: 'B bận' });
    // Bận vì một chuyến của BÊN THUÊ KHÁC (A) — cùng tài khoản.
    const busyAtA = await seedDriverLink(asService, {
      tenantId: tenantA,
      phone: (await prisma.user.findUniqueOrThrow({ where: { id: busy.userId } })).phone!,
    });
    const tripA = await seedBooking(w);
    await bookings.assignDriver(tenantA, tripA, ownerA, busyAtA.driverId);

    const free = await seedDriverLink(asService, { tenantId: tenantB, name: 'B rảnh' });
    await seedDriverLink(asService, {
      tenantId: tenantB,
      name: 'B tạm khoá',
      linkStatus: DRIVER_LINK_STATUS.SUSPENDED,
    });

    const list = await drivers.assignable(tenantB, w);
    const byId = new Map(list.map((d) => [d.id, d]));
    expect(byId.get(busy.driverId)?.busy).toBe(true);
    expect(byId.get(free.driverId)?.busy).toBe(false);
    // Tạm khoá không nằm trong bộ chọn.
    expect(list.some((d) => d.name === 'B tạm khoá')).toBe(false);
    expect(await drivers.hasAvailableDriver(asService, tenantB, w)).toBe(true);

    // Loại trừ chính đơn đang sửa: không tự coi mình là bận.
    const self = await drivers.assignable(tenantA, { ...w, excludeBookingId: tripA });
    expect(self.find((d) => d.id === busyAtA.driverId)?.busy).toBe(false);
  });

  /*
   * "Đặt ngay" nhận chuyến có tài xế ⇒ hệ thống TỰ GÁN (19/10/2026): người rảnh, ít chuyến nhất
   * quanh ngày chuyến, không phải chính khách của chuyến. Lượt gán vẫn `pending`.
   */
  maybe('pickForAutoAssign(): người rảnh ít chuyến nhất, bỏ người bận và chính khách', async () => {
    const tenant = tenantA;
    const w = nextWindow();
    // Chỉ ba người dưới đây được xét: kết thúc mọi liên kết mở của các test trước.
    await prisma.driver.updateMany({
      where: { tenantId: tenant, linkStatus: { in: [...DRIVER_LINK_OPEN_STATUSES] } },
      data: {
        linkStatus: DRIVER_LINK_STATUS.ENDED,
        endedAt: new Date(),
        endedByParty: DRIVER_LINK_END_PARTY.EMPLOYER,
      },
    });
    // An: đã có một chuyến khác trong tuần (không trùng giờ) ⇒ "nặng" hơn.
    const an = await seedDriverLink(asService, { tenantId: tenant, name: 'A An' });
    const earlier = await seedBooking({
      pickupAt: new Date(w.pickupAt.getTime() - 2 * 86_400_000),
      returnAt: new Date(w.pickupAt.getTime() - 86_400_000),
    });
    await bookings.assignDriver(tenant, earlier, ownerA, an.driverId);
    // Bình: rảnh, chưa có chuyến nào ⇒ được chọn.
    const binh = await seedDriverLink(asService, { tenantId: tenant, name: 'B Bình' });
    // Cường: bận đúng khung giờ.
    const cuong = await seedDriverLink(asService, { tenantId: tenant, name: 'C Cường' });
    const clash = await seedBooking(w);
    await bookings.assignDriver(tenant, clash, ownerA, cuong.driverId);

    const picked = await drivers.pickForAutoAssign(asService, tenant, w);
    expect(picked?.id).toBe(binh.driverId);

    // Bình là chính khách của chuyến ⇒ không tự gán Bình; còn An (rảnh, nặng hơn).
    const asCustomer = await drivers.pickForAutoAssign(asService, tenant, {
      ...w,
      excludeUserId: binh.userId,
    });
    expect(asCustomer?.id).toBe(an.driverId);
  });
});

describe('Kết thúc liên kết', () => {
  maybe('bên thuê kết thúc: bị chặn khi đang chạy chuyến; xong thì nhả chuyến chưa nhận xe', async () => {
    const w = nextWindow();
    const { driverId, userId } = await seedDriverLink(asService, { tenantId: tenantA });
    const running = await seedBooking(w);
    await bookings.assignDriver(tenantA, running, ownerA, driverId);
    await prisma.booking.update({
      where: { id: running },
      data: { status: BOOKING_STATUS.ACTIVE },
    });
    const upcoming = await seedBooking({ pickupAt: w.at(100), returnAt: w.at(120) });
    await bookings.assignDriver(tenantA, upcoming, ownerA, driverId);

    await expect(drivers.endByEmployer(tenantA, ownerA, driverId)).rejects.toMatchObject(
      code(API_ERROR_CODE.DRIVER_HAS_ACTIVE_TRIP),
    );

    await prisma.booking.update({
      where: { id: running },
      data: { status: BOOKING_STATUS.COMPLETED },
    });
    await drivers.endByEmployer(tenantA, ownerA, driverId);

    const link = await prisma.driver.findUniqueOrThrow({ where: { id: driverId } });
    expect(link.linkStatus).toBe(DRIVER_LINK_STATUS.ENDED);
    expect(link.endedByParty).toBe(DRIVER_LINK_END_PARTY.EMPLOYER);
    const released = await prisma.booking.findUniqueOrThrow({ where: { id: upcoming } });
    expect(released.driverId).toBeNull();
    expect(released.driverUserId).toBeNull();
    // Chuyến đã xong giữ tài xế làm lịch sử.
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: running } })).driverUserId).toBe(
      userId,
    );
    // Kết thúc lần nữa: không còn liên kết mở.
    await expect(drivers.endByEmployer(tenantA, ownerA, driverId)).rejects.toMatchObject({
      status: 404,
    });
  });

  maybe('bên thuê thu hồi lời mời đang chờ', async () => {
    const { driverId } = await seedDriverLink(asService, {
      tenantId: tenantA,
      linkStatus: DRIVER_LINK_STATUS.INVITED,
    });
    await drivers.endByEmployer(tenantA, ownerA, driverId);
    expect((await prisma.driver.findUniqueOrThrow({ where: { id: driverId } })).linkStatus).toBe(
      DRIVER_LINK_STATUS.ENDED,
    );
  });

  maybe('tài xế rời bên thuê: ended_by_party = driver; lời mời chưa nhận thì không "rời" được', async () => {
    const w = nextWindow();
    const { driverId, userId } = await seedDriverLink(asService, { tenantId: tenantA });
    const upcoming = await seedBooking(w);
    await bookings.assignDriver(tenantA, upcoming, ownerA, driverId);

    await expect(drivers.leave(newId(), driverId)).rejects.toMatchObject({ status: 404 });
    await drivers.leave(userId, driverId);
    const link = await prisma.driver.findUniqueOrThrow({ where: { id: driverId } });
    expect(link.linkStatus).toBe(DRIVER_LINK_STATUS.ENDED);
    expect(link.endedByParty).toBe(DRIVER_LINK_END_PARTY.DRIVER);
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: upcoming } })).driverId).toBeNull();

    const invited = await seedDriverLink(asService, {
      tenantId: tenantA,
      linkStatus: DRIVER_LINK_STATUS.INVITED,
    });
    await expect(drivers.leave(invited.userId, invited.driverId)).rejects.toMatchObject(
      code(API_ERROR_CODE.DRIVER_LINK_STATE_CONFLICT),
    );
  });

  maybe('tài xế còn chuyến ĐÃ NHẬN chưa chạy → không được ngừng; chỉ còn chuyến chờ nhận thì được', async () => {
    const { driverId, userId } = await seedDriverLink(asService, { tenantId: tenantA });
    const accepted = await seedBooking(nextWindow());
    await bookings.assignDriver(tenantA, accepted, ownerA, driverId);
    await drivers.respondToTrip(userId, accepted, true);

    await expect(drivers.leave(userId, driverId)).rejects.toMatchObject(
      code(API_ERROR_CODE.DRIVER_HAS_ACCEPTED_TRIPS),
    );
    expect((await prisma.driver.findUniqueOrThrow({ where: { id: driverId } })).linkStatus).toBe(
      DRIVER_LINK_STATUS.ACTIVE,
    );

    await bookings.assignDriver(tenantA, accepted, ownerA, null);
    await drivers.leave(userId, driverId);
    expect((await prisma.driver.findUniqueOrThrow({ where: { id: driverId } })).linkStatus).toBe(
      DRIVER_LINK_STATUS.ENDED,
    );
  });
});

describe('Chuyến tôi lái (DriverSelfService)', () => {
  maybe('chỉ thấy chuyến của chính mình; chuyến người khác → 404', async () => {
    const w = nextWindow();
    const me = await seedDriverLink(asService, { tenantId: tenantA });
    const other = await seedDriverLink(asService, { tenantId: tenantA });
    const mine = await seedBooking(w);
    const theirs = await seedBooking({ ...w, vehicle: vehicleA2 });
    await bookings.assignDriver(tenantA, mine, ownerA, me.driverId);
    await bookings.assignDriver(tenantA, theirs, ownerA, other.driverId);

    const page = await driverSelf.trips(me.userId, { tab: DRIVER_TRIP_TAB.UPCOMING });
    expect(page.data.map((t) => t.id)).toEqual([mine]);
    expect(page.data[0]!.assignmentStatus).toBe(DRIVER_ASSIGNMENT_STATUS.PENDING);

    const counts = await driverSelf.pendingCounts(me.userId);
    expect(counts.trips).toBe(1);

    await expect(driverSelf.trip(me.userId, theirs)).rejects.toMatchObject({ status: 404 });
    const detail = await driverSelf.trip(me.userId, mine);
    expect(detail.id).toBe(mine);
  });

  maybe('tài xế thấy tên + SĐT khách ngay khi được gán, kể cả chưa nhận chuyến', async () => {
    const { driverId, userId } = await seedDriverLink(asService, { tenantId: tenantA });
    const trip = await seedBooking(nextWindow());
    await bookings.assignDriver(tenantA, trip, ownerA, driverId);
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: trip } });

    const pending = await driverSelf.trip(userId, trip);
    expect(pending.customer.name).toBe(row.customerName);
    expect(pending.customer.phone).toBe(row.customerPhone);
    expect(pending.customer.contactVisibleFrom).toBeNull();
  });

  maybe('đổi qua lại nhiều lần: "Đã qua" hiện đơn MỘT lần với kết quả cuối; lịch sử bên thuê đủ mọi lượt', async () => {
    const a = await seedDriverLink(asService, { tenantId: tenantA });
    const b = await seedDriverLink(asService, { tenantId: tenantA });
    const trip = await seedBooking(nextWindow());

    // A → B → A → B: A bị gỡ hai lần, cuối cùng B giữ chuyến.
    await bookings.assignDriver(tenantA, trip, ownerA, a.driverId);
    await bookings.assignDriver(tenantA, trip, ownerA, b.driverId);
    await bookings.assignDriver(tenantA, trip, ownerA, a.driverId);
    await bookings.assignDriver(tenantA, trip, ownerA, b.driverId);

    const pastA = await driverSelf.trips(a.userId, { tab: DRIVER_TRIP_TAB.PAST });
    const rowsA = pastA.data.filter((t) => t.id === trip);
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0]!.outcome).toBe(DRIVER_ASSIGNMENT_OUTCOME.UNASSIGNED);
    // Không còn là chuyến của A ⇒ không lộ SĐT khách, nhưng vẫn mở được chi tiết.
    expect(rowsA[0]!.customer.phone).toBeNull();
    expect((await driverSelf.trip(a.userId, trip)).outcome).toBe(DRIVER_ASSIGNMENT_OUTCOME.UNASSIGNED);

    // B đang giữ chuyến: ở "Sắp tới", chưa ở "Đã qua".
    const pastB = await driverSelf.trips(b.userId, { tab: DRIVER_TRIP_TAB.PAST });
    expect(pastB.data.some((t) => t.id === trip)).toBe(false);

    // B từ chối ⇒ B sang "Đã qua" với kết quả "từ chối".
    await drivers.respondToTrip(b.userId, trip, false);
    const declined = await driverSelf.trips(b.userId, { tab: DRIVER_TRIP_TAB.PAST });
    expect(declined.data.find((t) => t.id === trip)?.outcome).toBe(
      DRIVER_ASSIGNMENT_OUTCOME.DECLINED,
    );

    const history = await bookings.driverHistory(tenantA, trip);
    expect(history.map((h) => h.outcome)).toEqual([
      DRIVER_ASSIGNMENT_OUTCOME.UNASSIGNED,
      DRIVER_ASSIGNMENT_OUTCOME.UNASSIGNED,
      DRIVER_ASSIGNMENT_OUTCOME.UNASSIGNED,
      DRIVER_ASSIGNMENT_OUTCOME.DECLINED,
    ]);
    // Bên thuê khác không đọc được lịch sử của đơn này.
    await expect(bookings.driverHistory(tenantB, trip)).rejects.toMatchObject({ status: 404 });
  });
});
