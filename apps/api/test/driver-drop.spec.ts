import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  BOOKING_HOLD_OUTCOME,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  bookingRequestRespondBy,
  CANCELLATION_PARTY,
  CANCELLATION_REASON_CATEGORY,
  DRIVER_ASSIGNMENT_AUDIT_ACTION,
  DRIVER_ASSIGNMENT_OUTCOME,
  DRIVER_ASSIGNMENT_STATUS,
  DRIVER_DROP_REASON,
  DRIVER_DROP_ZONE,
  DRIVER_INCIDENT_LEVEL,
  driverDropPolicy,
  HOLD_REFUND_REASON,
  MEMBERSHIP_STATUS,
  NOTIFICATION_TYPE,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { SettlementService } from '../src/modules/bookings/settlement/settlement.service';
import { BankAccountsService } from '../src/modules/bank-accounts/bank-accounts.service';
import { CancellationsService } from '../src/modules/cancellations/cancellations.service';
import { CustomerTripsService } from '../src/modules/customer-trips/customer-trips.service';
import { DriverSelfService } from '../src/modules/drivers/driver-self.service';
import { DriversService } from '../src/modules/drivers/drivers.service';
import { ReceiptsService } from '../src/modules/finance/receipts.service';
import { decideOutcome, HoldSettlementService } from '../src/modules/holds/hold-settlement.service';
import { InsuranceReadService } from '../src/modules/insurance/insurance-read.service';
import type { R2Service } from '../src/modules/storage/r2.service';
import { VehicleContractsService } from '../src/modules/vehicles/vehicle-contracts.service';
import { WalletService } from '../src/modules/wallet/wallet.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { cleanupDriverAccounts, seedDriverLink } from './helpers/driver-link';
import {
  makeBookingHoldsService,
  makeBookingsService,
  makeCustomersService,
  makeDriversService,
  makeNotificationService,
  makePricingService,
  makeSupportService,
} from './helpers/service-factory';
import { releaseWalletObligations } from './helpers/wallet-cleanup';

/**
 * TÀI XẾ RÚT KHỎI CHUYẾN ĐÃ NHẬN — ADR 0074 — trên PostgreSQL THẬT.
 *
 *  1. Rút theo vùng: cột tài xế về NULL, sổ khép `dropped` + lý do + vùng, sự cố + hạn điều phối
 *     ghi trên đơn, cooldown "Đặt ngay" khi sát giờ, audit, báo khẩn bên thuê. Đơn KHÔNG bị huỷ.
 *  2. Điều kiện: chỉ lượt ĐÃ NHẬN, `other` phải có ghi chú.
 *  3. Khách: thấy mức sự cố (không lộ ai rút); huỷ trong cửa sổ sự cố ⇒ lượt huỷ ghi cho phía cho
 *     thuê (`driver_unavailable`); tiền hoàn 100% (`decideOutcome`, lý do `driver_incident`).
 *  4. Tài xế mới nhận ⇒ sự cố khép, khách được báo.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const drivers: DriversService = makeDriversService(asService, { audit });
const driverSelf = new DriverSelfService(asService);
const pricing = makePricingService(asService);
const bookings = makeBookingsService(asService, {
  audit,
  notifications,
  customers: makeCustomersService(asService, audit),
});
const receipts = new ReceiptsService(asService, audit);
const settlement = new SettlementService(asService, audit, pricing, notifications, receipts);
const fakeR2 = { privateEnabled: false } as unknown as R2Service;
const trips = new CustomerTripsService(
  asService,
  settlement,
  pricing,
  bookings,
  makeBookingHoldsService(asService),
  new VehicleContractsService(asService, fakeR2, audit),
  new HoldSettlementService(asService, audit, notifications, new WalletService(asService)),
  new BankAccountsService(asService),
  notifications,
  audit,
  new CancellationsService(),
  new InsuranceReadService(asService),
  makeSupportService(asService, notifications),
);

const MIN = 60_000;
const HOUR = 60 * MIN;
let dbAvailable = false;
let owner: string;
let customer: string;
let tenant: string;
let vehicle: string;

let seq = 0;
async function seedBooking(pickupAt: Date): Promise<string> {
  seq += 1;
  const id = newId();
  const returnAt = new Date(pickupAt.getTime() + 8 * HOUR);
  const phone = `0966${String(100000 + seq).slice(-6)}`;
  await prisma.booking.create({
    data: {
      id,
      tenantId: tenant,
      vehicleId: vehicle,
      code: `DH-DROP-${Date.now().toString(36)}-${seq}`,
      customerName: 'Khách rút chuyến',
      customerPhone: phone,
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      routeType: 'in_city',
      pickupAddress: '1 Lê Lợi',
      status: BOOKING_STATUS.RESERVED,
      pickupAt,
      returnAt,
      baseAmount: new Prisma.Decimal('1000000'),
      totalAmount: new Prisma.Decimal('1000000'),
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
      customerName: 'Khách rút chuyến',
      customerPhone: phone,
      customerUserId: customer,
      bookingId: id,
      pickupAt,
      returnAt,
    },
  });
  return id;
}

/** Gán + tài xế nhận, rồi đẩy mốc nhận lùi `acceptedAgoMin` phút để điều khiển cửa sổ trả lại. */
async function acceptedTrip(pickupAt: Date, acceptedAgoMin: number) {
  const link = await seedDriverLink(asService, { tenantId: tenant, name: 'Tài xế Rút' });
  const bookingId = await seedBooking(pickupAt);
  await bookings.assignDriver(tenant, bookingId, owner, link.driverId);
  await drivers.respondToTrip(link.userId, bookingId, true);
  await prisma.booking.update({
    where: { id: bookingId },
    data: { driverRespondedAt: new Date(Date.now() - acceptedAgoMin * MIN) },
  });
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
  customer = newId();
  tenant = newId();
  vehicle = newId();
  await prisma.user.createMany({
    data: [
      {
        realm: ACCOUNT_REALM.PARTNER,
        id: owner,
        displayName: 'Chủ rút chuyến',
        email: `drv-drop-${owner}@xeprime.test`,
      },
      {
        realm: ACCOUNT_REALM.CUSTOMER,
        id: customer,
        displayName: 'Khách rút chuyến',
        email: `drv-drop-cus-${customer}@xeprime.test`,
      },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenant,
      code: `T-${tenant.slice(-8)}`,
      slug: `t-${tenant.toLowerCase().slice(-10)}`,
      name: 'Shop rút chuyến',
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
      code: `V-DROP-${vehicle.slice(-6)}`,
      name: 'Innova rút chuyến',
      vehicleType: VEHICLE_TYPE.CAR,
      serviceTypes: [SERVICE_TYPE.WITH_DRIVER],
      withDriverDailyPrice: new Prisma.Decimal('1300000'),
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.bookingCancellation.deleteMany({ where: { tenantId: tenant } });
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

describe('driverDropPolicy — vùng, hạn điều phối, cooldown', () => {
  const at = new Date('2030-01-01T00:00:00Z');
  const pickupIn = (h: number) => new Date(at.getTime() + h * HOUR);

  it.each([
    [24, DRIVER_DROP_ZONE.FAR, 120, null],
    [12, DRIVER_DROP_ZONE.FAR, 120, null],
    [5, DRIVER_DROP_ZONE.SAME_DAY, 45, 24],
    [2, DRIVER_DROP_ZONE.SAME_DAY, 45, 24],
    [1, DRIVER_DROP_ZONE.CRITICAL, 15, 48],
  ])('còn %sh ⇒ %s, SLA %s′, cooldown %sh', (h, zone, sla, cooldown) => {
    const p = driverDropPolicy({ droppedAt: at, pickupAt: pickupIn(h), releaseUntil: null });
    expect(p.zone).toBe(zone);
    expect(p.reassignBy.getTime()).toBe(at.getTime() + sla * MIN);
    expect(p.cooldownUntil?.getTime() ?? null).toBe(
      cooldown === null ? null : at.getTime() + cooldown * HOUR,
    );
  });

  it('còn trong cửa sổ trả lại ⇒ grace, không cooldown; hạn điều phối kẹp bởi giờ nhận', () => {
    const p = driverDropPolicy({
      droppedAt: at,
      pickupAt: pickupIn(0.1),
      releaseUntil: new Date(at.getTime() + MIN),
    });
    expect(p.zone).toBe(DRIVER_DROP_ZONE.GRACE);
    expect(p.cooldownUntil).toBeNull();
    expect(p.reassignBy.getTime()).toBe(pickupIn(0.1).getTime());
  });
});

describe('decideOutcome — khách huỷ do sự cố tài xế', () => {
  it('qua mốc miễn phí nhưng driverFault ⇒ refunded / driver_incident', () => {
    const past = new Date(Date.now() - HOUR);
    expect(
      decideOutcome({
        to: BOOKING_STATUS.CANCELLED,
        actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
        freeCancelUntil: past,
      })?.outcome,
    ).toBe(BOOKING_HOLD_OUTCOME.SPLIT_LATE_CANCEL);
    expect(
      decideOutcome({
        to: BOOKING_STATUS.CANCELLED,
        actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
        freeCancelUntil: past,
        driverFault: true,
      }),
    ).toEqual({
      outcome: BOOKING_HOLD_OUTCOME.REFUNDED,
      refundReason: HOLD_REFUND_REASON.DRIVER_INCIDENT,
    });
  });
});

describe('Tài xế rút khỏi chuyến đã nhận', () => {
  maybe('vùng xa: đơn giữ nguyên, sự cố + hạn 120′, sổ dropped, không cooldown, báo khẩn', async () => {
    const t = await acceptedTrip(new Date(Date.now() + 30 * HOUR), 180);
    expect((await driverSelf.trip(t.userId, t.bookingId)).canDrop).toBe(true);

    const before = Date.now();
    await drivers.dropTrip(t.userId, t.bookingId, {
      reasonCategory: DRIVER_DROP_REASON.HEALTH_ISSUE,
      reason: '  Sốt cao  ',
    });

    const row = await prisma.booking.findUniqueOrThrow({ where: { id: t.bookingId } });
    expect(row.status).toBe(BOOKING_STATUS.RESERVED);
    expect(row.driverId).toBeNull();
    expect(row.driverUserId).toBeNull();
    expect(row.driverAssignmentStatus).toBeNull();
    expect(row.driverDroppedAt).not.toBeNull();
    expect(row.driverReassignBy!.getTime() - row.driverDroppedAt!.getTime()).toBe(120 * MIN);
    expect(row.driverDroppedAt!.getTime()).toBeGreaterThanOrEqual(before);

    const episode = await prisma.bookingDriverAssignment.findFirstOrThrow({
      where: { bookingId: t.bookingId, driverId: t.driverId },
    });
    expect(episode).toMatchObject({
      outcome: DRIVER_ASSIGNMENT_OUTCOME.DROPPED,
      dropReasonCategory: DRIVER_DROP_REASON.HEALTH_ISSUE,
      dropReason: 'Sốt cao',
      dropZone: DRIVER_DROP_ZONE.FAR,
    });
    expect(
      (await prisma.driver.findUniqueOrThrow({ where: { id: t.driverId } }))
        .autoAssignCooldownUntil,
    ).toBeNull();
    expect(
      await prisma.auditLog.count({
        where: { targetId: t.bookingId, action: DRIVER_ASSIGNMENT_AUDIT_ACTION.DROPPED },
      }),
    ).toBe(1);
    const alert = await prisma.notification.findFirstOrThrow({
      where: { targetId: t.bookingId, userId: owner, type: NOTIFICATION_TYPE.DRIVER_TRIP_DECLINED },
    });
    expect(alert.title).toContain('KHẨN CẤP');

    // Bên thuê thấy sự cố kèm người rút + lý do; khách thấy "đang sắp xếp", chưa được huỷ miễn phí.
    const detail = await bookings.getOne(tenant, t.bookingId);
    expect(detail.driverIncident).toMatchObject({
      driverName: 'Tài xế Rút',
      reasonCategory: DRIVER_DROP_REASON.HEALTH_ISSUE,
      zone: DRIVER_DROP_ZONE.FAR,
      customerCanCancelFree: false,
      level: DRIVER_INCIDENT_LEVEL.ARRANGING,
    });
    const renter = await trips.detail(customer, t.bookingId);
    expect(renter.driver).toBeNull();
    expect(renter.driverIncident).toEqual({
      level: DRIVER_INCIDENT_LEVEL.ARRANGING,
      freeCancel: false,
    });

    // Lịch sử của bên thuê mang lý do.
    const history = await bookings.driverHistory(tenant, t.bookingId);
    expect(history.at(-1)).toMatchObject({ dropReason: 'Sốt cao', dropZone: DRIVER_DROP_ZONE.FAR });

    // Tài xế: chuyến sang "Đã qua" với kết cục dropped, không còn rút được.
    const mine = await driverSelf.trip(t.userId, t.bookingId);
    expect(mine.outcome).toBe(DRIVER_ASSIGNMENT_OUTCOME.DROPPED);
    expect(mine.canDrop).toBe(false);
  });

  maybe('sát giờ: cooldown 48h, loại khỏi tự gán; khách huỷ ⇒ lỗi ghi cho bên thuê', async () => {
    const t = await acceptedTrip(new Date(Date.now() + 90 * MIN), 60);
    await drivers.dropTrip(t.userId, t.bookingId, {
      reasonCategory: DRIVER_DROP_REASON.VEHICLE_ACCIDENT,
    });

    const link = await prisma.driver.findUniqueOrThrow({ where: { id: t.driverId } });
    expect(link.autoAssignCooldownUntil!.getTime()).toBeGreaterThan(Date.now() + 47 * HOUR);
    const picked = await drivers.pickForAutoAssign(asService, tenant, {
      pickupAt: new Date(Date.now() + 100 * HOUR),
      returnAt: new Date(Date.now() + 108 * HOUR),
    });
    expect(picked?.id).not.toBe(t.driverId);
    const list = await drivers.list(tenant, {});
    expect(list.data.find((d) => d.id === t.driverId)).toMatchObject({
      dropCount: 1,
      criticalDropCount: 1,
    });

    const renter = await trips.detail(customer, t.bookingId);
    expect(renter.driverIncident).toEqual({
      level: DRIVER_INCIDENT_LEVEL.URGENT,
      freeCancel: true,
    });
    const preview = await trips.cancelPreview(customer, t.bookingId);
    expect(preview.allowed).toBe(true);
    expect(preview.driverIncident).toBe(true);

    await trips.cancel(customer, t.bookingId);
    const cancelled = await prisma.booking.findUniqueOrThrow({
      where: { id: t.bookingId },
      include: { cancellation: true },
    });
    expect(cancelled.status).toBe(BOOKING_STATUS.CANCELLED);
    expect(cancelled.cancellation).toMatchObject({
      responsibleParty: CANCELLATION_PARTY.HOST,
      reasonCategory: CANCELLATION_REASON_CATEGORY.DRIVER_UNAVAILABLE,
      countsAgainstHost: true,
    });
  });

  maybe('còn trong cửa sổ trả lại ⇒ grace, không phạt, vẫn ghi sự cố', async () => {
    const t = await acceptedTrip(new Date(Date.now() + 30 * HOUR), 0);
    await drivers.dropTrip(t.userId, t.bookingId, {
      reasonCategory: DRIVER_DROP_REASON.FAMILY_EMERGENCY,
    });
    const episode = await prisma.bookingDriverAssignment.findFirstOrThrow({
      where: { bookingId: t.bookingId, driverId: t.driverId },
    });
    expect(episode.dropZone).toBe(DRIVER_DROP_ZONE.GRACE);
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: t.bookingId } });
    expect(row.driverDroppedAt).not.toBeNull();
    const list = await drivers.list(tenant, {});
    expect(list.data.find((d) => d.id === t.driverId)?.dropCount).toBe(0);
  });

  maybe('other thiếu ghi chú ⇒ 422; lượt chưa nhận ⇒ 409; chuyến người khác ⇒ 404', async () => {
    const t = await acceptedTrip(new Date(Date.now() + 30 * HOUR), 180);
    await expect(
      drivers.dropTrip(t.userId, t.bookingId, {
        reasonCategory: DRIVER_DROP_REASON.OTHER,
        reason: 'ngắn',
      }),
    ).rejects.toMatchObject(code(API_ERROR_CODE.DRIVER_DROP_NOTE_REQUIRED));
    await expect(
      drivers.dropTrip(newId(), t.bookingId, { reasonCategory: DRIVER_DROP_REASON.HEALTH_ISSUE }),
    ).rejects.toMatchObject({ status: 404 });

    const pendingLink = await seedDriverLink(asService, { tenantId: tenant });
    const pending = await seedBooking(new Date(Date.now() + 40 * HOUR));
    await bookings.assignDriver(tenant, pending, owner, pendingLink.driverId);
    await expect(
      drivers.dropTrip(pendingLink.userId, pending, {
        reasonCategory: DRIVER_DROP_REASON.HEALTH_ISSUE,
      }),
    ).rejects.toMatchObject(code(API_ERROR_CODE.DRIVER_ASSIGNMENT_STATE_CONFLICT));
  });

  maybe('tài xế mới nhận ⇒ sự cố khép, khách được báo, thấy tài xế mới', async () => {
    const t = await acceptedTrip(new Date(Date.now() + 30 * HOUR), 180);
    await drivers.dropTrip(t.userId, t.bookingId, {
      reasonCategory: DRIVER_DROP_REASON.ROUTE_BLOCKED,
    });
    const b = await seedDriverLink(asService, { tenantId: tenant, name: 'Tài xế Mới' });
    await bookings.assignDriver(tenant, t.bookingId, owner, b.driverId);
    // Lượt mới còn chờ nhận: sự cố vẫn mở với khách.
    expect((await trips.detail(customer, t.bookingId)).driverIncident).not.toBeNull();

    await drivers.respondToTrip(b.userId, t.bookingId, true);
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: t.bookingId } });
    expect(row.driverDroppedAt).toBeNull();
    expect(row.driverReassignBy).toBeNull();
    const renter = await trips.detail(customer, t.bookingId);
    expect(renter.driverIncident).toBeNull();
    expect(renter.driver?.name).toBe('Tài xế Mới');
    expect(
      await prisma.notification.count({
        where: { userId: customer, title: { contains: 'đã có tài xế mới' } },
      }),
    ).toBeGreaterThan(0);
  });
});
