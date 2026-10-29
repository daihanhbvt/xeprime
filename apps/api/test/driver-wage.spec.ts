import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  bookingRequestRespondBy,
  DRIVER_ASSIGNMENT_AUDIT_ACTION,
  DRIVER_ASSIGNMENT_OUTCOME,
  DRIVER_DROP_REASON,
  DRIVER_LINK_STATUS_FILTER_ANY,
  DRIVER_WAGE_STAGE,
  MEMBERSHIP_STATUS,
  NOTIFICATION_TYPE,
  SERVICE_TYPE,
  SURCHARGE_CATEGORY,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
  type WithDriverLimits,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { SettlementService } from '../src/modules/bookings/settlement/settlement.service';
import { DriverSelfService } from '../src/modules/drivers/driver-self.service';
import { DriversService, vnMonthRange, wageDaysOf } from '../src/modules/drivers/drivers.service';
import { FeePoliciesService } from '../src/modules/fee-policies/fee-policies.service';
import { ReceiptsService } from '../src/modules/finance/receipts.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { cleanupDriverAccounts, seedDriverLink } from './helpers/driver-link';
import {
  makeBookingsService,
  makeCustomersService,
  makeDriversService,
  makeNotificationService,
  makePricingService,
} from './helpers/service-factory';
import { releaseWalletObligations } from './helpers/wallet-cleanup';

/**
 * TIỀN CÔNG TÀI XẾ — ADR 0075 — trên PostgreSQL THẬT.
 *
 * XePrime chỉ GHI NHẬN số chủ xe và tài xế thoả thuận:
 *  1. Gán: mức mặc định/ngày × số ngày, hoặc số bên thuê nhập — kiểm giới hạn; thiếu mức mặc
 *     định thì gán tay bị chặn, tự gán "Đặt ngay" bỏ qua và báo bên thuê.
 *  2. Sửa: không cần tài xế đồng ý, mỗi lần đổi một dòng lịch sử + audit + báo tài xế; khoá sau
 *     kết thúc + 72h; lượt chưa từng nhận không có tiền công.
 *  3. Chuyến không chạy (rút / huỷ): tiền công về 0, ghi được số thoả thuận.
 *  4. Không chạm một đồng nào của đơn; khách không thấy tiền công.
 *  5. Thống kê tháng theo tài xế; phụ phí tài xế đã gỡ; giá có tài/ngày bị chặn khi vô lý.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const drivers: DriversService = makeDriversService(asService, { audit });
const driverSelf = new DriverSelfService(asService);
const feePolicies = new FeePoliciesService(asService, audit);
const pricing = makePricingService(asService);
const bookings = makeBookingsService(asService, {
  audit,
  notifications,
  customers: makeCustomersService(asService, audit),
});
const settlement = new SettlementService(
  asService,
  audit,
  pricing,
  notifications,
  new ReceiptsService(asService, audit),
);

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const DEFAULT_WAGE = 500_000;
let dbAvailable = false;
let owner: string;
let customer: string;
let tenant: string;
let vehicle: string;
let limits: WithDriverLimits;

let seq = 0;
/** Đơn có tài xế `days` ngày, snapshot giá mang đúng số ngày tính tiền. */
async function seedBooking(days: number, pickupInHours = 48): Promise<string> {
  seq += 1;
  const id = newId();
  const pickupAt = new Date(Date.now() + pickupInHours * HOUR);
  const returnAt = new Date(pickupAt.getTime() + days * DAY);
  const phone = `0967${String(100000 + seq).slice(-6)}`;
  await prisma.booking.create({
    data: {
      id,
      tenantId: tenant,
      vehicleId: vehicle,
      code: `DH-WAGE-${Date.now().toString(36)}-${seq}`,
      customerName: 'Khách tiền công',
      customerPhone: phone,
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      routeType: 'in_city',
      pickupAddress: '1 Lê Lợi',
      status: BOOKING_STATUS.RESERVED,
      pickupAt,
      returnAt,
      baseAmount: new Prisma.Decimal('4200000'),
      totalAmount: new Prisma.Decimal('4200000'),
      priceSnapshot: { days } as Prisma.InputJsonObject,
    },
  });
  await prisma.bookingRequest.create({
    data: {
      id: newId(),
      respondBy: bookingRequestRespondBy(new Date()),
      tenantId: tenant,
      vehicleId: vehicle,
      status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      customerName: 'Khách tiền công',
      customerPhone: phone,
      customerUserId: customer,
      bookingId: id,
      pickupAt,
      returnAt,
    },
  });
  return id;
}

async function openAssignmentOf(bookingId: string) {
  return prisma.bookingDriverAssignment.findFirstOrThrow({
    where: { bookingId },
    orderBy: { assignedAt: 'desc' },
  });
}

/** Gán (mức mặc định) + tài xế nhận. */
async function acceptedTrip(days = 3) {
  const link = await seedDriverLink(asService, { tenantId: tenant, name: 'Tài xế An' });
  const bookingId = await seedBooking(days);
  await bookings.assignDriver(tenant, bookingId, owner, link.driverId);
  await drivers.respondToTrip(link.userId, bookingId, true);
  return { ...link, bookingId, assignmentId: (await openAssignmentOf(bookingId)).id };
}

async function setDefaultWage(value: number | null) {
  await prisma.tenant.update({
    where: { id: tenant },
    data: { driverDailyWage: value === null ? null : new Prisma.Decimal(value) },
  });
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
  limits = await feePolicies.withDriverLimits();
  owner = newId();
  customer = newId();
  tenant = newId();
  vehicle = newId();
  await prisma.user.createMany({
    data: [
      {
        realm: ACCOUNT_REALM.PARTNER,
        id: owner,
        displayName: 'Chủ tiền công',
        email: `drv-wage-${owner}@xeprime.test`,
      },
      {
        realm: ACCOUNT_REALM.CUSTOMER,
        id: customer,
        displayName: 'Khách tiền công',
        email: `drv-wage-cus-${customer}@xeprime.test`,
      },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenant,
      code: `T-${tenant.slice(-8)}`,
      slug: `t-${tenant.toLowerCase().slice(-10)}`,
      name: 'Shop tiền công',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: owner,
      driverDailyWage: new Prisma.Decimal(DEFAULT_WAGE),
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
      code: `V-WAGE-${vehicle.slice(-6)}`,
      name: 'Innova tiền công',
      vehicleType: VEHICLE_TYPE.CAR,
      serviceTypes: [SERVICE_TYPE.WITH_DRIVER],
      withDriverDailyPrice: new Prisma.Decimal('1400000'),
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.bookingSurcharge.deleteMany({ where: { tenantId: tenant } });
    await prisma.bookingDriverWageChange.deleteMany({ where: { tenantId: tenant } });
    await prisma.bookingDriverAssignment.deleteMany({ where: { tenantId: tenant } });
    await prisma.bookingRequest.deleteMany({ where: { tenantId: tenant } });
    await prisma.booking.deleteMany({ where: { tenantId: tenant } });
    await prisma.auditLog.deleteMany({ where: { tenantId: tenant } });
    await prisma.notification.deleteMany({ where: { tenantId: tenant } });
    await prisma.notification.deleteMany({ where: { userId: customer } });
    await prisma.driver.deleteMany({ where: { tenantId: tenant } });
    await cleanupDriverAccounts(asService);
    await releaseWalletObligations(prisma, { tenantIds: [tenant], userIds: [owner, customer] });
    await prisma.vehicle.deleteMany({ where: { tenantId: tenant } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: tenant } });
    await prisma.tenant.deleteMany({ where: { id: tenant } });
    await prisma.user.deleteMany({ where: { id: { in: [owner, customer] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

const code = (c: string) => ({ response: expect.objectContaining({ code: c }) });
const wageMax = (days: number) => Number(limits.wageDaily.max) * days;
const wageMin = (days: number) => Number(limits.wageDaily.min) * days;

describe('wageDaysOf / vnMonthRange — thuần', () => {
  it('đọc số ngày từ snapshot, thiếu thì làm tròn lên theo 24h', () => {
    const pickupAt = new Date('2030-01-01T00:00:00Z');
    expect(
      wageDaysOf({
        priceSnapshot: { days: 3 },
        pickupAt,
        returnAt: new Date(pickupAt.getTime() + HOUR),
      }),
    ).toBe(3);
    expect(
      wageDaysOf({
        priceSnapshot: null,
        pickupAt,
        returnAt: new Date(pickupAt.getTime() + 25 * HOUR),
      }),
    ).toBe(2);
    expect(wageDaysOf({ priceSnapshot: null, pickupAt, returnAt: pickupAt })).toBe(1);
  });

  it('tháng theo giờ Việt Nam', () => {
    const { from, to } = vnMonthRange('2026-11');
    expect(from.toISOString()).toBe('2026-10-31T17:00:00.000Z');
    expect(to.toISOString()).toBe('2026-11-30T17:00:00.000Z');
  });
});

describe('Tiền công tài xế — gán (ADR 0075)', () => {
  maybe('gán dùng mức mặc định × số ngày, tài xế thấy trước khi nhận', async () => {
    const link = await seedDriverLink(asService, { tenantId: tenant });
    const bookingId = await seedBooking(3);
    await bookings.assignDriver(tenant, bookingId, owner, link.driverId);

    const row = await openAssignmentOf(bookingId);
    expect(row.wageAmount?.toFixed(0)).toBe('1500000');
    expect(row.wageDays).toBe(3);
    expect(await prisma.bookingDriverWageChange.count({ where: { assignmentId: row.id } })).toBe(0);

    const trip = await driverSelf.trip(link.userId, bookingId);
    expect(trip.wage).toMatchObject({
      amount: '1500000',
      days: 3,
      stage: DRIVER_WAGE_STAGE.OFFER,
      editable: false,
      range: null,
      changes: [],
    });
    const list = await driverSelf.trips(link.userId, { tab: 'upcoming' });
    expect(list.data.find((t) => t.id === bookingId)?.wage.amount).toBe('1500000');
    const invite = await prisma.notification.findFirstOrThrow({
      where: { userId: link.userId, type: NOTIFICATION_TYPE.DRIVER_TRIP_ASSIGNED },
      orderBy: { createdAt: 'desc' },
    });
    expect(invite.body).toContain('1.500.000đ');
  });

  maybe('gợi ý cho hộp gán = cùng phép tính lúc ghi', async () => {
    const bookingId = await seedBooking(3);
    const quote = await bookings.driverWageQuote(tenant, bookingId);
    expect(quote).toEqual({
      days: 3,
      dailyWage: String(DEFAULT_WAGE),
      suggestedAmount: String(DEFAULT_WAGE * 3),
      range: { min: String(wageMin(3)), max: String(wageMax(3)) },
      wageDaily: limits.wageDaily,
      // Mức gợi ý chỉ là lời nhắc của nền tảng — không phải mức của gian hàng.
      suggestedDaily: limits.wageDailySuggested,
      rentAmount: '4200000',
    });
    await expect(bookings.driverWageQuote(newId(), bookingId)).rejects.toMatchObject({
      status: 404,
    });
  });

  maybe('gán kèm số bên thuê nhập; ngoài khoảng bị từ chối kèm khoảng hợp lệ', async () => {
    const link = await seedDriverLink(asService, { tenantId: tenant });
    const bookingId = await seedBooking(2);
    await expect(
      bookings.assignDriver(tenant, bookingId, owner, link.driverId, String(wageMax(2) + 1000)),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: API_ERROR_CODE.DRIVER_WAGE_OUT_OF_RANGE,
        details: { min: String(wageMin(2)), max: String(wageMax(2)) },
      }),
    });
    // Không có lượt gán nào lọt vào sổ khi bị từ chối.
    expect(await prisma.bookingDriverAssignment.count({ where: { bookingId } })).toBe(0);

    await bookings.assignDriver(tenant, bookingId, owner, link.driverId, '1100000');
    expect((await openAssignmentOf(bookingId)).wageAmount?.toFixed(0)).toBe('1100000');
  });

  maybe('chưa có mức mặc định: gán tay bị chặn, tự gán bỏ qua và báo bên thuê', async () => {
    await setDefaultWage(null);
    try {
      const link = await seedDriverLink(asService, { tenantId: tenant });
      const manual = await seedBooking(1);
      await expect(
        bookings.assignDriver(tenant, manual, owner, link.driverId),
      ).rejects.toMatchObject(code(API_ERROR_CODE.DRIVER_WAGE_REQUIRED));

      const auto = await seedBooking(1);
      const result = await prisma.$transaction((tx) =>
        drivers.assignWithinTx(tx, {
          tenantId: tenant,
          bookingId: auto,
          driverId: link.driverId,
          actorUserId: null,
        }),
      );
      expect(result).toEqual({ skipped: true });
      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: auto } });
      expect(booking.driverId).toBeNull();
      expect(await prisma.bookingDriverAssignment.count({ where: { bookingId: auto } })).toBe(0);
      expect(
        await prisma.notification.count({
          where: {
            tenantId: tenant,
            type: NOTIFICATION_TYPE.BOOKING_DRIVER_MISSING,
            targetId: auto,
          },
        }),
      ).toBeGreaterThan(0);
    } finally {
      await setDefaultWage(DEFAULT_WAGE);
    }
  });
});

describe('Tiền công tài xế — sửa, lịch sử, khoá (ADR 0075)', () => {
  maybe('sửa sau khi nhận: lịch sử + audit + báo tài xế; lưu lại cùng số là no-op', async () => {
    const t = await acceptedTrip(3);
    const before = await prisma.booking.findUniqueOrThrow({ where: { id: t.bookingId } });

    const history = await bookings.updateDriverWage(tenant, t.bookingId, t.assignmentId, owner, {
      amount: '1700000',
      reason: 'thêm buổi tối',
    });
    const item = history.find((h) => h.id === t.assignmentId)!;
    expect(item.wage).toMatchObject({
      amount: '1700000',
      stage: DRIVER_WAGE_STAGE.RUNNING,
      editable: true,
      editableUntil: null,
      range: { min: String(wageMin(3)), max: String(wageMax(3)) },
    });
    expect(item.wage.changes).toHaveLength(1);
    expect(item.wage.changes[0]).toMatchObject({
      oldAmount: '1500000',
      newAmount: '1700000',
      reason: 'thêm buổi tối',
      changedByName: 'Chủ tiền công',
    });
    expect(
      await prisma.auditLog.count({
        where: { targetId: t.bookingId, action: DRIVER_ASSIGNMENT_AUDIT_ACTION.WAGE_UPDATED },
      }),
    ).toBe(1);
    const notice = await prisma.notification.findFirstOrThrow({
      where: { userId: t.userId, type: NOTIFICATION_TYPE.DRIVER_TRIP_WAGE_CHANGED },
    });
    expect(notice.body).toContain('1.500.000đ → 1.700.000đ');

    // Tài xế thấy lịch sử của chính lượt mình.
    const trip = await driverSelf.trip(t.userId, t.bookingId);
    expect(trip.wage.amount).toBe('1700000');
    expect(trip.wage.changes.map((c) => c.newAmount)).toEqual(['1700000']);

    // Cùng số ⇒ không thêm lịch sử.
    await bookings.updateDriverWage(tenant, t.bookingId, t.assignmentId, owner, {
      amount: '1700000',
    });
    expect(
      await prisma.bookingDriverWageChange.count({ where: { assignmentId: t.assignmentId } }),
    ).toBe(1);

    // Không một đồng nào của đơn đổi theo tiền công (INV-01/02).
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: t.bookingId } });
    expect(after.totalAmount.toFixed(0)).toBe(before.totalAmount.toFixed(0));
    expect(after.baseAmount.toFixed(0)).toBe(before.baseAmount.toFixed(0));
    expect(after.depositAmount.toFixed(0)).toBe(before.depositAmount.toFixed(0));
  });

  maybe('đơn đổi số ngày sau lúc gán ⇒ lần sửa chụp lại số ngày hiện tại; cùng số chỉ đồng bộ ngày', async () => {
    const t = await acceptedTrip(3);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: t.bookingId } });
    const snap = booking.priceSnapshot as Record<string, unknown>;
    await prisma.booking.update({
      where: { id: t.bookingId },
      data: { priceSnapshot: { ...snap, days: 4 } },
    });

    // Cùng tổng nhưng đơn đã 4 ngày: chỉ đổi mẫu số — không lịch sử, không báo tài xế.
    await bookings.updateDriverWage(tenant, t.bookingId, t.assignmentId, owner, { amount: '1500000' });
    let row = await prisma.bookingDriverAssignment.findUniqueOrThrow({ where: { id: t.assignmentId } });
    expect(row.wageDays).toBe(4);
    expect(row.wageAmount?.toFixed(0)).toBe('1500000');
    expect(await prisma.bookingDriverWageChange.count({ where: { assignmentId: t.assignmentId } })).toBe(0);

    // Khoảng hợp lệ theo 4 ngày: trần của 3 ngày + 1 ngày nữa giờ qua được.
    await bookings.updateDriverWage(tenant, t.bookingId, t.assignmentId, owner, {
      amount: String(wageMax(4)),
    });
    row = await prisma.bookingDriverAssignment.findUniqueOrThrow({ where: { id: t.assignmentId } });
    expect(row.wageAmount?.toFixed(0)).toBe(String(wageMax(4)));
    expect(await prisma.bookingDriverWageChange.count({ where: { assignmentId: t.assignmentId } })).toBe(1);
  });

  maybe('ngoài khoảng chuyến chạy bị từ chối', async () => {
    const t = await acceptedTrip(3);
    for (const amount of [wageMax(3) + 1000, wageMin(3) - 1000]) {
      await expect(
        bookings.updateDriverWage(tenant, t.bookingId, t.assignmentId, owner, {
          amount: String(amount),
        }),
      ).rejects.toMatchObject(code(API_ERROR_CODE.DRIVER_WAGE_OUT_OF_RANGE));
    }
  });

  maybe('hai lần sửa đồng thời đều có dòng lịch sử, nối tiếp nhau', async () => {
    const t = await acceptedTrip(3);
    await Promise.all([
      bookings.updateDriverWage(tenant, t.bookingId, t.assignmentId, owner, { amount: '1600000' }),
      bookings.updateDriverWage(tenant, t.bookingId, t.assignmentId, owner, { amount: '1800000' }),
    ]);
    const changes = await prisma.bookingDriverWageChange.findMany({
      where: { assignmentId: t.assignmentId },
      orderBy: { changedAt: 'asc' },
    });
    expect(changes).toHaveLength(2);
    expect(changes[1]!.oldAmount.toFixed(0)).toBe(changes[0]!.newAmount.toFixed(0));
    const row = await prisma.bookingDriverAssignment.findUniqueOrThrow({
      where: { id: t.assignmentId },
    });
    expect(row.wageAmount?.toFixed(0)).toBe(changes[1]!.newAmount.toFixed(0));
  });

  maybe('hoàn thành ⇒ giữ số, sửa được tới kết thúc + 72h rồi khoá', async () => {
    const t = await acceptedTrip(2);
    await prisma.booking.update({
      where: { id: t.bookingId },
      data: { status: BOOKING_STATUS.COMPLETED },
    });
    await prisma.$transaction((tx) =>
      drivers.onBookingClosedWithinTx(tx, t.bookingId, BOOKING_STATUS.COMPLETED),
    );
    const done = await prisma.bookingDriverAssignment.findUniqueOrThrow({
      where: { id: t.assignmentId },
    });
    expect(done.outcome).toBe(DRIVER_ASSIGNMENT_OUTCOME.COMPLETED);
    expect(done.wageAmount?.toFixed(0)).toBe('1000000');
    expect((await driverSelf.trip(t.userId, t.bookingId)).wage.stage).toBe(
      DRIVER_WAGE_STAGE.COMPLETED,
    );

    await bookings.updateDriverWage(tenant, t.bookingId, t.assignmentId, owner, {
      amount: '1200000',
    });
    await prisma.bookingDriverAssignment.update({
      where: { id: t.assignmentId },
      data: { endedAt: new Date(Date.now() - 73 * HOUR) },
    });
    await expect(
      bookings.updateDriverWage(tenant, t.bookingId, t.assignmentId, owner, { amount: '1300000' }),
    ).rejects.toMatchObject(code(API_ERROR_CODE.DRIVER_WAGE_LOCKED));
    const history = await bookings.driverHistory(tenant, t.bookingId);
    expect(history.find((h) => h.id === t.assignmentId)?.wage.editable).toBe(false);
  });

  maybe('tài xế rút ⇒ tiền công về 0, ghi được số thoả thuận trong [0; max × N]', async () => {
    const t = await acceptedTrip(3);
    await drivers.dropTrip(t.userId, t.bookingId, {
      reasonCategory: DRIVER_DROP_REASON.HEALTH_ISSUE,
    });
    const dropped = await prisma.bookingDriverAssignment.findUniqueOrThrow({
      where: { id: t.assignmentId },
    });
    expect(dropped.outcome).toBe(DRIVER_ASSIGNMENT_OUTCOME.DROPPED);
    expect(dropped.wageAmount?.toFixed(0)).toBe('0');
    expect(dropped.dropReasonCategory).toBe(DRIVER_DROP_REASON.HEALTH_ISSUE);

    await bookings.updateDriverWage(tenant, t.bookingId, t.assignmentId, owner, {
      amount: '300000',
      reason: 'bồi thường thoả thuận',
    });
    const trip = await driverSelf.trip(t.userId, t.bookingId);
    expect(trip.wage).toMatchObject({ amount: '300000', stage: DRIVER_WAGE_STAGE.NOT_RUN });
    await expect(
      bookings.updateDriverWage(tenant, t.bookingId, t.assignmentId, owner, {
        amount: String(wageMax(3) + 1000),
      }),
    ).rejects.toMatchObject(code(API_ERROR_CODE.DRIVER_WAGE_OUT_OF_RANGE));
  });

  maybe('lượt chưa từng nhận không có tiền công', async () => {
    const link = await seedDriverLink(asService, { tenantId: tenant });
    const bookingId = await seedBooking(1);
    await bookings.assignDriver(tenant, bookingId, owner, link.driverId);
    await drivers.respondToTrip(link.userId, bookingId, false);
    const row = await openAssignmentOf(bookingId);
    expect(row.outcome).toBe(DRIVER_ASSIGNMENT_OUTCOME.DECLINED);
    await expect(
      bookings.updateDriverWage(tenant, bookingId, row.id, owner, { amount: '500000' }),
    ).rejects.toMatchObject(code(API_ERROR_CODE.DRIVER_WAGE_NOT_APPLICABLE));
  });

  maybe('lượt của gian hàng khác ⇒ 404', async () => {
    const t = await acceptedTrip(1);
    await expect(
      bookings.updateDriverWage(newId(), t.bookingId, t.assignmentId, owner, { amount: '500000' }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('Mức mặc định + thống kê tháng (ADR 0075)', () => {
  maybe('đặt mức mặc định trong giới hạn; ngoài khoảng bị từ chối; xoá được', async () => {
    await expect(
      drivers.setWageSettings(tenant, owner, {
        dailyWage: String(Number(limits.wageDaily.max) + 1000),
      }),
    ).rejects.toMatchObject(code(API_ERROR_CODE.DRIVER_WAGE_OUT_OF_RANGE));
    const set = await drivers.setWageSettings(tenant, owner, { dailyWage: '600000' });
    expect(set).toMatchObject({ dailyWage: '600000', wageDaily: limits.wageDaily });
    expect(
      await prisma.auditLog.count({
        where: { tenantId: tenant, action: DRIVER_ASSIGNMENT_AUDIT_ACTION.DEFAULT_WAGE_UPDATED },
      }),
    ).toBeGreaterThan(0);
    const cleared = await drivers.setWageSettings(tenant, owner, { dailyWage: null });
    expect(cleared.dailyWage).toBeNull();
    await setDefaultWage(DEFAULT_WAGE);
  });

  maybe('cột tháng ở trang Tài xế + ngăn kéo lượt gán', async () => {
    const t = await acceptedTrip(2);
    await prisma.booking.update({
      where: { id: t.bookingId },
      data: { status: BOOKING_STATUS.COMPLETED },
    });
    await prisma.$transaction((tx) =>
      drivers.onBookingClosedWithinTx(tx, t.bookingId, BOOKING_STATUS.COMPLETED),
    );
    const page = await drivers.list(tenant, { linkStatus: DRIVER_LINK_STATUS_FILTER_ANY });
    const row = page.data.find((d) => d.id === t.driverId)!;
    expect(row.monthCompletedTrips).toBe(1);
    expect(row.monthWageTotal).toBe('1000000');

    const lastMonth = vnMonthRange(undefined).from;
    const prev = new Date(lastMonth.getTime() - DAY);
    const prevKey = new Date(prev.getTime() + 7 * HOUR).toISOString().slice(0, 7);
    const old = await drivers.list(tenant, {
      linkStatus: DRIVER_LINK_STATUS_FILTER_ANY,
      month: prevKey,
    });
    expect(old.data.find((d) => d.id === t.driverId)?.monthCompletedTrips).toBe(0);

    const drawer = await drivers.assignments(tenant, t.driverId, {});
    expect(drawer.data).toEqual([
      expect.objectContaining({
        bookingId: t.bookingId,
        stage: DRIVER_WAGE_STAGE.COMPLETED,
        wageAmount: '1000000',
        wageDays: 2,
      }),
    ]);
    expect(drawer.meta.total).toBe(1);
  });
});

describe('Phụ phí tài xế đã gỡ + giới hạn giá có tài (ADR 0075)', () => {
  maybe('quyết toán không nhận danh mục đã gỡ / quá giờ trên đơn có tài xế', async () => {
    const bookingId = await seedBooking(1);
    await expect(
      settlement.addSurcharge(tenant, bookingId, owner, {
        category: SURCHARGE_CATEGORY.OVERNIGHT,
        amount: '200000',
        reason: 'qua đêm',
      }),
    ).rejects.toMatchObject(code(API_ERROR_CODE.SURCHARGE_CATEGORY_RETIRED));
    await expect(
      settlement.addSurcharge(tenant, bookingId, owner, {
        category: SURCHARGE_CATEGORY.OVERTIME,
        amount: '100000',
        reason: 'quá giờ',
      }),
    ).rejects.toMatchObject(code(API_ERROR_CODE.SURCHARGE_NOT_ALLOWED_WITH_DRIVER));
    // Sự cố thật vẫn ghi được.
    await settlement.addSurcharge(tenant, bookingId, owner, {
      category: SURCHARGE_CATEGORY.CLEANING,
      amount: '150000',
      reason: 'vệ sinh xe',
    });
  });

  maybe('giá có tài/ngày ngoài khoảng bị chặn, null (xoá giá) luôn qua', async () => {
    await expect(
      pricing.assertWithDriverPrices({
        withDriverDailyPrice: String(Number(limits.priceDaily.max) + 1000),
      }),
    ).rejects.toMatchObject(code(API_ERROR_CODE.WITH_DRIVER_PRICE_OUT_OF_RANGE));
    await expect(
      pricing.assertWithDriverPrices({
        withDriverOneWayPrice: String(Number(limits.priceDaily.min) - 1000),
      }),
    ).rejects.toMatchObject(code(API_ERROR_CODE.WITH_DRIVER_PRICE_OUT_OF_RANGE));
    await expect(
      pricing.assertWithDriverPrices({
        withDriverDailyPrice: limits.priceDaily.max,
        withDriverInterCityPrice: null,
      }),
    ).resolves.toBeUndefined();
  });
});
