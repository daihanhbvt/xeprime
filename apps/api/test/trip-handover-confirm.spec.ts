import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  bookingRequestRespondBy,
  CUSTOMER_RETURN_CONFIRM_WINDOW_HOURS,
  HANDOVER_CONFIRM_SOURCE,
  HANDOVER_STATUS,
  HANDOVER_TYPE,
  MEMBERSHIP_STATUS,
  NOTIFICATION_TYPE,
  SERVICE_TYPE,
  SUPPORT_CASE_CATEGORY,
  SUPPORT_CASE_STATUS,
  SUPPORT_PARTY,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { sweepTripReminders } from '../../worker/src/jobs/booking-trip-reminders';
import { AuditService } from '../src/modules/audit/audit.service';
import { BankAccountsService } from '../src/modules/bank-accounts/bank-accounts.service';
import { CustomerHandoverService } from '../src/modules/bookings/handovers/customer-handover.service';
import { HandoversService } from '../src/modules/bookings/handovers/handovers.service';
import { SettlementService } from '../src/modules/bookings/settlement/settlement.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { CancellationsService } from '../src/modules/cancellations/cancellations.service';
import { CustomerTripsService } from '../src/modules/customer-trips/customer-trips.service';
import { ReceiptsService } from '../src/modules/finance/receipts.service';
import { HoldSettlementService } from '../src/modules/holds/hold-settlement.service';
import { InsuranceCertificateService } from '../src/modules/insurance/insurance-certificate.service';
import { InsuranceReadService } from '../src/modules/insurance/insurance-read.service';
import type { R2Service } from '../src/modules/storage/r2.service';
import { MaintenanceService } from '../src/modules/vehicles/maintenance/maintenance.service';
import { OdometerService } from '../src/modules/vehicles/maintenance/odometer.service';
import { VehicleContractsService } from '../src/modules/vehicles/vehicle-contracts.service';
import { WalletService } from '../src/modules/wallet/wallet.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeBookingHoldsService,
  makeBookingsService,
  makeCustomersService,
  makeHandoverMoneyServices,
  makeNotificationService,
  makePricingService,
  makeSupportService,
} from './helpers/service-factory';
import { releaseWalletObligations } from './helpers/wallet-cleanup';

/**
 * Chuyến không treo ở mốc giao/trả xe — ADR 0081, trên PostgreSQL THẬT.
 *
 *  - Worker nhắc chuyến: ba mốc (trước nhận 60′, trước trả 60′, quá trả 30′), mỗi mốc MỘT lần, bỏ
 *    mốc đã lỡ của đơn tạo sát giờ, không báo quá giờ cho đơn lịch sử ngoài cửa sổ nhìn lại.
 *  - Khách "Đã nhận xe" ⇒ đơn `active` + biên bản nguồn `customer`; sớm / có tài xế / người khác bị từ chối.
 *  - Khách "Đã trả xe" ⇒ lời báo + hạn; gian hàng phản đối ⇒ xoá lời báo + tranh chấp; im lặng quá
 *    hạn ⇒ tự hoàn thành (biên bản `auto`), có tranh chấp mở thì không.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const pricing = makePricingService(asService);
const receipts = new ReceiptsService(asService, audit);
const settlement = new SettlementService(asService, audit, pricing, notifications, receipts);
const bookings = makeBookingsService(asService, {
  occupancy: new OccupancyService(asService),
  audit,
  notifications,
  customers: makeCustomersService(asService, audit),
});
const fakeR2 = {
  privateEnabled: true,
  async presignPrivateDownload() {
    return { downloadUrl: 'https://r2.local/signed-get', expiresIn: 120 };
  },
};
const files = new VehicleContractsService(asService, fakeR2 as unknown as R2Service, audit);
const odometer = new OdometerService(asService, audit);
const handovers = new HandoversService(
  asService,
  bookings,
  odometer,
  new MaintenanceService(asService, odometer, files, audit, receipts),
  files,
  audit,
  ...makeHandoverMoneyServices(asService, audit),
);
const customerHandover = new CustomerHandoverService(asService, handovers, notifications, audit);
const trips = new CustomerTripsService(
  asService,
  settlement,
  pricing,
  bookings,
  makeBookingHoldsService(asService),
  files,
  new HoldSettlementService(asService, audit, notifications, new WalletService(asService)),
  new BankAccountsService(asService),
  notifications,
  audit,
  new CancellationsService(),
  new InsuranceReadService(asService),
  makeSupportService(asService, notifications),
  new InsuranceCertificateService(asService, null),
);

let dbAvailable = false;
let ownerId: string;
let customerId: string;
let strangerId: string;
let tenantId: string;
let vehicleId: string;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/**
 * Mốc "bây giờ" của các lượt quét worker — xa hẳn về tương lai để cửa sổ của worker chỉ thấy đơn
 * của spec này, không đụng đơn của spec khác đang chạy song song.
 */
const SWEEP_NOW = new Date('2032-06-15T03:00:00.000Z');
let slot = 0;

async function seedBooking(opts: {
  pickupAt: Date;
  returnAt?: Date;
  status?: string;
  serviceType?: string;
  createdAt?: Date;
  customerReturnedAt?: Date;
}): Promise<{ bookingId: string; requestId: string }> {
  const bookingId = newId();
  const requestId = newId();
  // Mỗi chuyến lệch vài giây: unique `(vehicle_id, customer_phone, pickup_at, return_at)`.
  const pickupAt = new Date(opts.pickupAt.getTime() + slot * 1_000);
  const returnAt = opts.returnAt
    ? new Date(opts.returnAt.getTime() + slot * 1_000)
    : new Date(pickupAt.getTime() + 24 * HOUR);
  slot += 1;
  await prisma.booking.create({
    data: {
      id: bookingId,
      tenantId,
      vehicleId,
      code: `DH${bookingId.slice(-6).toUpperCase()}`,
      customerName: 'Khách Test',
      status: opts.status ?? BOOKING_STATUS.RESERVED,
      serviceType: opts.serviceType ?? SERVICE_TYPE.SELF_DRIVE,
      pickupAt,
      returnAt,
      baseAmount: new Prisma.Decimal('1000000'),
      discountAmount: new Prisma.Decimal('0'),
      deliveryFee: new Prisma.Decimal('0'),
      totalAmount: new Prisma.Decimal('1000000'),
      depositAmount: new Prisma.Decimal('0'),
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      ...(opts.customerReturnedAt
        ? {
            customerReturnedAt: opts.customerReturnedAt,
            returnAutoCompleteAt: new Date(
              opts.customerReturnedAt.getTime() + CUSTOMER_RETURN_CONFIRM_WINDOW_HOURS * HOUR,
            ),
          }
        : {}),
    },
  });
  await prisma.bookingRequest.create({
    data: {
      respondBy: bookingRequestRespondBy(new Date()),
      id: requestId,
      tenantId,
      vehicleId,
      status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
      serviceType: opts.serviceType ?? SERVICE_TYPE.SELF_DRIVE,
      customerName: 'Khách Test',
      customerPhone: '0900000000',
      customerUserId: customerId,
      bookingId,
      pickupAt,
      returnAt,
    },
  });
  return { bookingId, requestId };
}

const minutesFromNow = (n: number) => new Date(Date.now() + n * MINUTE);
const at = (base: Date, minutes: number) => new Date(base.getTime() + minutes * MINUTE);

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
  customerId = newId();
  strangerId = newId();
  tenantId = newId();
  vehicleId = newId();

  await prisma.user.createMany({
    data: [
      {
        realm: ACCOUNT_REALM.PARTNER,
        id: ownerId,
        displayName: 'Chủ xe',
        email: `owner-${ownerId}@xeprime.test`,
      },
      {
        realm: ACCOUNT_REALM.CUSTOMER,
        id: customerId,
        displayName: 'Khách A',
        email: `cus-${customerId}@xeprime.test`,
      },
      {
        realm: ACCOUNT_REALM.CUSTOMER,
        id: strangerId,
        displayName: 'Khách B',
        email: `other-${strangerId}@xeprime.test`,
      },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `TEST-${tenantId.slice(-8)}`,
      slug: `test-${tenantId.toLowerCase().slice(-8)}`,
      name: 'Gian hàng nhắc chuyến',
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
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: 'V1',
      name: 'Kia Morning 2024',
      vehicleType: VEHICLE_TYPE.CAR,
      plateNumber: '43A-888.02',
      seatCount: 5,
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.supportCase.deleteMany({ where: { tenantId } });
    await releaseWalletObligations(prisma, {
      tenantIds: [tenantId],
      userIds: [ownerId, customerId, strangerId],
    });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, customerId, strangerId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

const notificationsFor = (userId: string, bookingId: string) =>
  prisma.notification.findMany({
    where: { userId, targetId: bookingId, type: NOTIFICATION_TYPE.BOOKING_STATUS_CHANGED },
    orderBy: { createdAt: 'asc' },
  });

const bookingOf = (bookingId: string) =>
  prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });

async function expectApiCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({ response: { code } });
}

describe('Worker nhắc chuyến', () => {
  maybe('trước giờ nhận 60′ ⇒ MỘT tin cho gian hàng + khách; lượt hai không gửi lại', async () => {
    const { bookingId } = await seedBooking({
      pickupAt: at(SWEEP_NOW, 40),
      createdAt: at(SWEEP_NOW, -2 * 24 * 60),
    });

    const first = await sweepTripReminders(prisma, SWEEP_NOW);
    expect(first.pickupReminders).toBeGreaterThanOrEqual(1);
    expect((await bookingOf(bookingId)).pickupRemindedAt).toEqual(SWEEP_NOW);
    expect(await notificationsFor(ownerId, bookingId)).toHaveLength(1);
    expect(await notificationsFor(customerId, bookingId)).toHaveLength(1);

    await sweepTripReminders(prisma, at(SWEEP_NOW, 1));
    expect(await notificationsFor(ownerId, bookingId)).toHaveLength(1);
    expect(await notificationsFor(customerId, bookingId)).toHaveLength(1);
  });

  maybe('đơn tạo SÁT giờ nhận không có mốc nhắc — không claim, không gửi', async () => {
    const { bookingId } = await seedBooking({
      pickupAt: at(SWEEP_NOW, 30),
      createdAt: at(SWEEP_NOW, -10),
    });
    await sweepTripReminders(prisma, SWEEP_NOW);
    expect((await bookingOf(bookingId)).pickupRemindedAt).toBeNull();
    expect(await notificationsFor(ownerId, bookingId)).toHaveLength(0);
  });

  maybe('trước giờ trả 60′ của chuyến đang thuê ⇒ nhắc một lần', async () => {
    const { bookingId } = await seedBooking({
      status: BOOKING_STATUS.ACTIVE,
      pickupAt: at(SWEEP_NOW, -24 * 60),
      returnAt: at(SWEEP_NOW, 45),
    });
    await sweepTripReminders(prisma, SWEEP_NOW);
    expect((await bookingOf(bookingId)).returnRemindedAt).toEqual(SWEEP_NOW);
    expect(await notificationsFor(customerId, bookingId)).toHaveLength(1);
  });

  maybe(
    'quá giờ trả 30′ ⇒ báo cả hai bên; đơn lịch sử ngoài cửa sổ nhìn lại thì không',
    async () => {
      const recent = await seedBooking({
        status: BOOKING_STATUS.ACTIVE,
        pickupAt: at(SWEEP_NOW, -26 * 60),
        returnAt: at(SWEEP_NOW, -45),
      });
      const stale = await seedBooking({
        status: BOOKING_STATUS.ACTIVE,
        pickupAt: at(SWEEP_NOW, -5 * 24 * 60),
        returnAt: at(SWEEP_NOW, -3 * 24 * 60),
      });

      await sweepTripReminders(prisma, SWEEP_NOW);
      expect((await bookingOf(recent.bookingId)).returnOverdueNotifiedAt).toEqual(SWEEP_NOW);
      expect(await notificationsFor(ownerId, recent.bookingId)).toHaveLength(1);
      expect(await notificationsFor(customerId, recent.bookingId)).toHaveLength(1);
      expect((await bookingOf(stale.bookingId)).returnOverdueNotifiedAt).toBeNull();
    },
  );

  maybe('khách đã báo trả xe ⇒ không báo quá giờ trả nữa', async () => {
    const { bookingId } = await seedBooking({
      status: BOOKING_STATUS.ACTIVE,
      pickupAt: at(SWEEP_NOW, -26 * 60),
      returnAt: at(SWEEP_NOW, -40),
      customerReturnedAt: at(SWEEP_NOW, -50),
    });
    await sweepTripReminders(prisma, SWEEP_NOW);
    expect((await bookingOf(bookingId)).returnOverdueNotifiedAt).toBeNull();
  });
});

describe('Khách "Đã nhận xe"', () => {
  maybe(
    'trong cửa sổ ⇒ đơn đang thuê, biên bản giao xe nguồn customer, báo gian hàng',
    async () => {
      const { bookingId, requestId } = await seedBooking({ pickupAt: minutesFromNow(30) });

      const before = await trips.detail(customerId, requestId);
      expect(before.canConfirmPickup).toBe(true);

      await customerHandover.confirmPickup(customerId, requestId);

      const booking = await bookingOf(bookingId);
      expect(booking.status).toBe(BOOKING_STATUS.ACTIVE);
      expect(booking.actualPickupAt).not.toBeNull();
      const handover = await prisma.vehicleHandover.findFirstOrThrow({
        where: { bookingId, type: HANDOVER_TYPE.PICKUP },
      });
      expect(handover).toMatchObject({
        status: HANDOVER_STATUS.CONFIRMED,
        confirmSource: HANDOVER_CONFIRM_SOURCE.CUSTOMER,
        confirmedBy: customerId,
        odometerMissing: true,
      });
      expect(await notificationsFor(ownerId, bookingId)).toHaveLength(1);

      const after = await trips.detail(customerId, requestId);
      expect(after.canConfirmPickup).toBe(false);
      expect(after.canReportReturn).toBe(true);
      // Bấm lại (mạng chập chờn): đơn đã sang đang thuê ⇒ 409, không nhân bản hệ quả.
      await expectApiCode(
        customerHandover.confirmPickup(customerId, requestId),
        API_ERROR_CODE.TRIP_PICKUP_CONFIRM_NOT_ALLOWED,
      );
    },
  );

  maybe('quá sớm ⇒ 409 TOO_EARLY kèm mốc mở; trang chuyến nói mốc mở', async () => {
    const { requestId } = await seedBooking({ pickupAt: minutesFromNow(3 * 60) });
    await expectApiCode(
      customerHandover.confirmPickup(customerId, requestId),
      API_ERROR_CODE.TRIP_PICKUP_CONFIRM_TOO_EARLY,
    );
    const detail = await trips.detail(customerId, requestId);
    expect(detail.canConfirmPickup).toBe(false);
    expect(detail.pickupConfirmOpensAt).not.toBeNull();
  });

  maybe('chuyến có tài xế ⇒ 409 NOT_ALLOWED; chuyến của người khác ⇒ 404', async () => {
    const withDriver = await seedBooking({
      pickupAt: minutesFromNow(10),
      serviceType: SERVICE_TYPE.WITH_DRIVER,
    });
    await expectApiCode(
      customerHandover.confirmPickup(customerId, withDriver.requestId),
      API_ERROR_CODE.TRIP_PICKUP_CONFIRM_NOT_ALLOWED,
    );

    const mine = await seedBooking({ pickupAt: minutesFromNow(10) });
    await expectApiCode(
      customerHandover.confirmPickup(strangerId, mine.requestId),
      API_ERROR_CODE.NOT_FOUND,
    );
    expect((await bookingOf(mine.bookingId)).status).toBe(BOOKING_STATUS.RESERVED);
  });
});

describe('Khách "Đã trả xe"', () => {
  maybe('ghi lời báo + hạn 24h, báo gian hàng; báo lần hai ⇒ 409', async () => {
    const { bookingId, requestId } = await seedBooking({
      status: BOOKING_STATUS.ACTIVE,
      pickupAt: minutesFromNow(-24 * 60),
      returnAt: minutesFromNow(30),
    });

    await customerHandover.reportReturn(customerId, requestId);
    const booking = await bookingOf(bookingId);
    expect(booking.status).toBe(BOOKING_STATUS.ACTIVE);
    expect(booking.customerReturnedAt).not.toBeNull();
    expect(booking.returnAutoCompleteAt!.getTime() - booking.customerReturnedAt!.getTime()).toBe(
      CUSTOMER_RETURN_CONFIRM_WINDOW_HOURS * HOUR,
    );
    expect(await notificationsFor(ownerId, bookingId)).toHaveLength(1);

    const detail = await trips.detail(customerId, requestId);
    expect(detail.canReportReturn).toBe(false);
    expect(detail.customerReturnedAt).not.toBeNull();

    await expectApiCode(
      customerHandover.reportReturn(customerId, requestId),
      API_ERROR_CODE.TRIP_RETURN_REPORT_NOT_ALLOWED,
    );
  });

  maybe(
    'gian hàng báo "Khách chưa trả xe" ⇒ xoá lời báo + MỘT tranh chấp khẩn; lần hai ⇒ 409',
    async () => {
      const { bookingId } = await seedBooking({
        status: BOOKING_STATUS.ACTIVE,
        pickupAt: minutesFromNow(-24 * 60),
        returnAt: minutesFromNow(-10),
        customerReturnedAt: minutesFromNow(-20),
      });

      await customerHandover.rejectReturnReport(tenantId, bookingId, ownerId);
      const booking = await bookingOf(bookingId);
      expect(booking.customerReturnedAt).toBeNull();
      expect(booking.returnAutoCompleteAt).toBeNull();
      const cases = await prisma.supportCase.findMany({
        where: { bookingId, category: SUPPORT_CASE_CATEGORY.DISPUTE },
      });
      expect(cases).toHaveLength(1);
      expect(cases[0]).toMatchObject({
        status: SUPPORT_CASE_STATUS.OPEN,
        openedByUserId: ownerId,
        openedByScope: SUPPORT_PARTY.TENANT,
      });
      expect(await notificationsFor(customerId, bookingId)).toHaveLength(1);

      await expectApiCode(
        customerHandover.rejectReturnReport(tenantId, bookingId, ownerId),
        API_ERROR_CODE.BOOKING_RETURN_REPORT_NOT_PENDING,
      );
    },
  );

  maybe(
    'quá hạn mà gian hàng im lặng ⇒ tự hoàn thành, mốc trả là lúc khách báo; chạy lại không làm gì',
    async () => {
      const reportedAt = new Date(Date.now() - (CUSTOMER_RETURN_CONFIRM_WINDOW_HOURS + 1) * HOUR);
      const { bookingId } = await seedBooking({
        status: BOOKING_STATUS.ACTIVE,
        pickupAt: new Date(reportedAt.getTime() - 48 * HOUR),
        returnAt: new Date(reportedAt.getTime() + 10 * MINUTE),
        customerReturnedAt: reportedAt,
      });

      const done = await customerHandover.completeDueReturns(new Date());
      expect(done).toBeGreaterThanOrEqual(1);
      const booking = await bookingOf(bookingId);
      expect(booking.status).toBe(BOOKING_STATUS.COMPLETED);
      expect(booking.actualReturnAt?.getTime()).toBe(booking.customerReturnedAt?.getTime());
      const handover = await prisma.vehicleHandover.findFirstOrThrow({
        where: { bookingId, type: HANDOVER_TYPE.RETURN },
      });
      expect(handover).toMatchObject({
        status: HANDOVER_STATUS.CONFIRMED,
        confirmSource: HANDOVER_CONFIRM_SOURCE.AUTO,
        confirmedBy: customerId,
      });
      expect(await notificationsFor(ownerId, bookingId)).toHaveLength(1);
      expect(await notificationsFor(customerId, bookingId)).toHaveLength(1);

      await customerHandover.completeDueReturns(new Date());
      expect(
        await prisma.vehicleHandover.count({ where: { bookingId, type: HANDOVER_TYPE.RETURN } }),
      ).toBe(1);
    },
  );

  maybe('đang có tranh chấp mở ⇒ KHÔNG tự hoàn thành', async () => {
    const reportedAt = new Date(Date.now() - (CUSTOMER_RETURN_CONFIRM_WINDOW_HOURS + 2) * HOUR);
    const { bookingId } = await seedBooking({
      status: BOOKING_STATUS.ACTIVE,
      pickupAt: new Date(reportedAt.getTime() - 48 * HOUR),
      returnAt: new Date(reportedAt.getTime() + 5 * MINUTE),
      customerReturnedAt: reportedAt,
    });
    await makeSupportService(asService, notifications).open(
      { userId: ownerId, scope: SUPPORT_PARTY.TENANT, tenantId },
      {
        category: SUPPORT_CASE_CATEGORY.DISPUTE,
        bookingId,
        subject: 'Xe trả về bị trầy',
        description: 'Gian hàng mở tranh chấp về hư hỏng.',
      },
    );

    await customerHandover.completeDueReturns(new Date());
    expect((await bookingOf(bookingId)).status).toBe(BOOKING_STATUS.ACTIVE);
  });
});
