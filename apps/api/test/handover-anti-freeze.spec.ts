import { createPrismaClient, hasOpenSupportCase, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  AUDIT_TARGET_TYPE,
  SUPPORT_CASE_AUDIT_ACTION,
  SUPPORT_CASE_AUTO_RESOLVE_REASON,
  SUPPORT_CASE_EVENT_KIND,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  bookingRequestRespondBy,
  HANDOVER_CONFIRMATION_GRACE_MINUTES,
  HANDOVER_STATUS,
  HANDOVER_TYPE,
  MEMBERSHIP_STATUS,
  SUPPORT_CASE_CATEGORY,
  SUPPORT_CASE_PRIORITY,
  SUPPORT_CASE_STATUS,
  SUPPORT_PARTY,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { sweepHandoverOverdue } from '../../worker/src/jobs/handover-overdue';
import { AuditService } from '../src/modules/audit/audit.service';
import { BankAccountsService } from '../src/modules/bank-accounts/bank-accounts.service';
import { HandoversService } from '../src/modules/bookings/handovers/handovers.service';
import { SettlementService } from '../src/modules/bookings/settlement/settlement.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { MaintenanceService } from '../src/modules/vehicles/maintenance/maintenance.service';
import { OdometerService } from '../src/modules/vehicles/maintenance/odometer.service';
import { CancellationsService } from '../src/modules/cancellations/cancellations.service';
import { CustomerTripsService } from '../src/modules/customer-trips/customer-trips.service';
import { ReceiptsService } from '../src/modules/finance/receipts.service';
import { HoldSettlementService } from '../src/modules/holds/hold-settlement.service';
import { InsuranceReadService } from '../src/modules/insurance/insurance-read.service';
import type { R2Service } from '../src/modules/storage/r2.service';
import { SupportService } from '../src/modules/support/support.service';
import { VehicleContractsService } from '../src/modules/vehicles/vehicle-contracts.service';
import { WalletService } from '../src/modules/wallet/wallet.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeBookingHoldsService,
  makeBookingsService,
  makeCustomersService,
  makeNotificationService,
  makePricingService,
  makeSupportService,
} from './helpers/service-factory';
import { releaseWalletObligations } from './helpers/wallet-cleanup';

/**
 * Chống treo đơn ở mốc bàn giao — ADR 0066 (đặc tả 02 §3.2), trên PostgreSQL THẬT.
 *
 *  - Lớp 1: khách báo "Chưa nhận được xe" trong `[pickupAt, pickupAt + 120′]` ⇒ MỘT case
 *    `dispute` khẩn (idempotent), ngoài cửa sổ / sai trạng thái / chuyến người khác bị từ chối.
 *  - Lớp 3: worker quét đơn `reserved` quá ân hạn ⇒ cột claim + MỘT case `handover_unconfirmed`;
 *    chạy lại không làm gì; đơn đã xác nhận giao xe không bị đụng.
 * (Giữ quyết toán khi case mở: `booking-hold-lifecycle.spec.ts`.)
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const pricing = makePricingService(asService);
const receipts = new ReceiptsService(asService, audit);
const settlement = new SettlementService(asService, audit, pricing, notifications, receipts);
const occupancy = new OccupancyService(asService);
const bookings = makeBookingsService(asService, {
  occupancy,
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
  new MaintenanceService(asService, occupancy, odometer, files, audit, receipts),
  files,
  audit,
);
const support: SupportService = makeSupportService(asService, notifications);
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
  support,
);

let dbAvailable = false;
let ownerId: string;
let customerId: string;
let strangerId: string;
let adminId: string;
let tenantId: string;
let vehicleId: string;

const MINUTE = 60_000;
/**
 * Mốc "bây giờ" của các lượt quét worker — xa hẳn về tương lai để cửa sổ nhìn lại 7 ngày của
 * worker chỉ thấy đơn của spec này, không đụng đơn của spec khác đang chạy song song.
 */
const SWEEP_NOW = new Date('2031-03-10T05:00:00.000Z');
let slot = 0;

async function seedBooking(opts: {
  pickupAt: Date;
  status?: string;
  customerUserId?: string;
}): Promise<{ bookingId: string; requestId: string; code: string }> {
  const bookingId = newId();
  const requestId = newId();
  const code = `DH${bookingId.slice(-6).toUpperCase()}`;
  // Mỗi chuyến lệch vài giây: unique `(vehicle_id, customer_phone, pickup_at, return_at)`.
  const pickupAt = new Date(opts.pickupAt.getTime() + slot * 1_000);
  const returnAt = new Date(pickupAt.getTime() + 24 * 60 * MINUTE);
  slot += 1;
  await prisma.booking.create({
    data: {
      id: bookingId,
      tenantId,
      vehicleId,
      code,
      customerName: 'Khách Test',
      status: opts.status ?? BOOKING_STATUS.RESERVED,
      pickupAt,
      returnAt,
      baseAmount: new Prisma.Decimal('1000000'),
      discountAmount: new Prisma.Decimal('0'),
      deliveryFee: new Prisma.Decimal('0'),
      totalAmount: new Prisma.Decimal('1000000'),
      depositAmount: new Prisma.Decimal('0'),
    },
  });
  await prisma.bookingRequest.create({
    data: {
      respondBy: bookingRequestRespondBy(new Date()),
      id: requestId,
      tenantId,
      vehicleId,
      status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
      customerName: 'Khách Test',
      customerPhone: '0900000000',
      customerUserId: opts.customerUserId ?? customerId,
      bookingId,
      pickupAt,
      returnAt,
    },
  });
  return { bookingId, requestId, code };
}

const minutesFromNow = (n: number) => new Date(Date.now() + n * MINUTE);

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
  adminId = newId();
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
      {
        realm: ACCOUNT_REALM.PLATFORM,
        id: adminId,
        displayName: 'CSKH',
        email: `admin-${adminId}@xeprime.test`,
      },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `TEST-${tenantId.slice(-8)}`,
      slug: `test-${tenantId.toLowerCase().slice(-8)}`,
      name: 'Gian hàng bàn giao',
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
      name: 'Toyota Vios 2024',
      vehicleType: VEHICLE_TYPE.CAR,
      plateNumber: '43A-999.01',
      seatCount: 5,
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.supportCase.deleteMany({ where: { tenantId } });
    await releaseWalletObligations(prisma, {
      tenantIds: [tenantId],
      userIds: [ownerId, customerId, strangerId, adminId],
    });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, customerId, strangerId, adminId] } },
    });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

const disputesOf = (bookingId: string) =>
  prisma.supportCase.findMany({
    where: { bookingId, category: SUPPORT_CASE_CATEGORY.DISPUTE },
  });

const TENANT_ACTOR = () => ({ userId: ownerId, scope: SUPPORT_PARTY.TENANT, tenantId });

/** Chủ xe xác nhận biên bản GIAO XE theo luồng nhanh (không cần nháp trước). */
const confirmPickup = (bookingId: string) =>
  handovers.confirm(tenantId, bookingId, HANDOVER_TYPE.PICKUP, ownerId, {}, { canViewFiles: true });

/** Gian hàng tự mở một tranh chấp thường trên chuyến (`POST /support/cases`). */
const openShopDispute = (bookingId: string) =>
  support.open(TENANT_ACTOR(), {
    category: SUPPORT_CASE_CATEGORY.DISPUTE,
    bookingId,
    subject: 'Khách làm trầy xe',
    description: 'Gian hàng mở tranh chấp về hư hỏng.',
  });

/**
 * Lời báo "chưa nhận được xe" ghi THẲNG qua đường ghi của service — cho các chuyến của lượt quét
 * (giờ nhận ở 2031, ngoài cửa sổ thời gian thực của `reportNotReceived`).
 */
const openCustomerReport = (booking: { bookingId: string; requestId: string; code: string }) =>
  prisma.$transaction((tx) =>
    support.openTripNotReceivedWithinTx(tx, customerId, {
      id: booking.bookingId,
      tenantId,
      code: booking.code,
      bookingRequestId: booking.requestId,
    }),
  );

describe('Lớp 1 — khách báo "Chưa nhận được xe"', () => {
  maybe(
    'trong cửa sổ ⇒ MỘT case tranh chấp khẩn gắn đơn, báo gian hàng, chi tiết lật cờ',
    async () => {
      const { bookingId, requestId } = await seedBooking({ pickupAt: minutesFromNow(-10) });

      const before = await trips.detail(customerId, requestId);
      expect(before.canReportNotReceived).toBe(true);
      expect(before.openDispute).toBe(false);
      expect(before.notReceivedReportUntil).not.toBeNull();

      const after = await trips.reportNotReceived(customerId, requestId);
      expect(after.openDispute).toBe(true);
      expect(after.canReportNotReceived).toBe(false);

      const cases = await disputesOf(bookingId);
      expect(cases).toHaveLength(1);
      expect(cases[0]).toMatchObject({
        priority: SUPPORT_CASE_PRIORITY.URGENT,
        status: SUPPORT_CASE_STATUS.OPEN,
        tenantId,
        bookingRequestId: requestId,
        openedByUserId: customerId,
        openedByScope: SUPPORT_PARTY.CUSTOMER,
      });

      const notice = await prisma.notification.findFirst({
        where: { userId: ownerId, targetId: bookingId },
      });
      expect(notice).not.toBeNull();
    },
  );

  maybe('bấm lại (theo id đơn) ⇒ không mở thêm case', async () => {
    const { bookingId } = await seedBooking({ pickupAt: minutesFromNow(-30) });
    await trips.reportNotReceived(customerId, bookingId);
    await trips.reportNotReceived(customerId, bookingId);
    expect(await disputesOf(bookingId)).toHaveLength(1);
  });

  maybe('hai lượt bấm SONG SONG ⇒ vẫn một case', async () => {
    const { bookingId, requestId } = await seedBooking({ pickupAt: minutesFromNow(-5) });
    await Promise.all([
      trips.reportNotReceived(customerId, requestId),
      trips.reportNotReceived(customerId, requestId),
    ]);
    expect(await disputesOf(bookingId)).toHaveLength(1);
  });

  maybe('đơn ĐANG THUÊ (chủ xe đã xác nhận giao) vẫn báo được trong cửa sổ', async () => {
    const { bookingId, requestId } = await seedBooking({
      pickupAt: minutesFromNow(-60),
      status: BOOKING_STATUS.ACTIVE,
    });
    await trips.reportNotReceived(customerId, requestId);
    expect(await disputesOf(bookingId)).toHaveLength(1);
  });

  maybe('chưa tới giờ nhận xe ⇒ TRIP_NOT_RECEIVED_TOO_EARLY, không mở case', async () => {
    const { bookingId, requestId } = await seedBooking({ pickupAt: minutesFromNow(30) });
    const detail = await trips.detail(customerId, requestId);
    expect(detail.canReportNotReceived).toBe(false);
    expect(detail.notReceivedReportUntil).not.toBeNull();

    await expect(trips.reportNotReceived(customerId, requestId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.TRIP_NOT_RECEIVED_TOO_EARLY },
    });
    expect(await disputesOf(bookingId)).toHaveLength(0);
  });

  maybe('quá ân hạn ⇒ TRIP_NOT_RECEIVED_WINDOW_CLOSED, không mở case', async () => {
    const { bookingId, requestId } = await seedBooking({
      pickupAt: minutesFromNow(-(HANDOVER_CONFIRMATION_GRACE_MINUTES + 5)),
    });
    const detail = await trips.detail(customerId, requestId);
    expect(detail.canReportNotReceived).toBe(false);
    expect(detail.notReceivedReportUntil).toBeNull();

    await expect(trips.reportNotReceived(customerId, requestId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.TRIP_NOT_RECEIVED_WINDOW_CLOSED },
    });
    expect(await disputesOf(bookingId)).toHaveLength(0);
  });

  maybe('đơn đã HOÀN THÀNH ⇒ TRIP_NOT_RECEIVED_NOT_ALLOWED', async () => {
    const { bookingId, requestId } = await seedBooking({
      pickupAt: minutesFromNow(-10),
      status: BOOKING_STATUS.COMPLETED,
    });
    await expect(trips.reportNotReceived(customerId, requestId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.TRIP_NOT_RECEIVED_NOT_ALLOWED },
    });
    expect(await disputesOf(bookingId)).toHaveLength(0);
  });

  maybe('chuyến của khách KHÁC ⇒ 404, không mở case', async () => {
    const { bookingId, requestId } = await seedBooking({ pickupAt: minutesFromNow(-10) });
    await expect(trips.reportNotReceived(strangerId, requestId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
    expect(await disputesOf(bookingId)).toHaveLength(0);
  });

  maybe(
    'gian hàng đã tự mở tranh chấp ⇒ lời báo của khách VẪN thành case riêng của khách',
    async () => {
      const { bookingId, requestId } = await seedBooking({ pickupAt: minutesFromNow(-15) });
      const shopCase = await openShopDispute(bookingId);

      // Tranh chấp của gian hàng không phải lời báo của khách: khách vẫn thấy nút, không thấy
      // khối "khiếu nại của bạn đang được xử lý".
      const before = await trips.detail(customerId, requestId);
      expect(before.openDispute).toBe(false);
      expect(before.canReportNotReceived).toBe(true);

      const after = await trips.reportNotReceived(customerId, requestId);
      expect(after.openDispute).toBe(true);
      expect(after.canReportNotReceived).toBe(false);

      const cases = await disputesOf(bookingId);
      expect(cases).toHaveLength(2);
      const own = cases.find((c) => c.id !== shopCase.id);
      expect(own).toMatchObject({
        openedByUserId: customerId,
        openedByScope: SUPPORT_PARTY.CUSTOMER,
        priority: SUPPORT_CASE_PRIORITY.URGENT,
      });

      // Bấm lại ⇒ trả lại đúng case của khách, không đẻ case thứ ba.
      await trips.reportNotReceived(customerId, requestId);
      expect(await disputesOf(bookingId)).toHaveLength(2);
    },
  );

  maybe(
    'chủ xe ghi "khách không đến" CHEN VÀO giữa lượt báo ⇒ kiểm lại sau khoá, không mở case',
    async () => {
      const { bookingId, requestId } = await seedBooking({ pickupAt: minutesFromNow(-20) });

      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let markLocked!: () => void;
      const locked = new Promise<void>((resolve) => (markLocked = resolve));

      // Lượt "khách không đến" giữ khoá dòng đơn và đổi trạng thái, CHƯA commit.
      const noShow = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1 FROM "public"."bookings" WHERE "id" = ${bookingId} FOR UPDATE`;
          await tx.booking.update({
            where: { id: bookingId },
            data: { status: BOOKING_STATUS.NO_SHOW },
          });
          markLocked();
          await gate;
        },
        { timeout: 20_000 },
      );
      await locked;

      // Lượt báo đọc yêu cầu (đơn còn `reserved` ngoài transaction) rồi xếp hàng sau khoá.
      const report = trips.reportNotReceived(customerId, requestId).then(
        () => null,
        (err: unknown) => err,
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      release();
      await noShow;

      expect(await report).toMatchObject({
        response: { code: API_ERROR_CODE.TRIP_NOT_RECEIVED_NOT_ALLOWED },
      });
      expect(await disputesOf(bookingId)).toHaveLength(0);
    },
  );

  maybe('client không tự mở được case `handover_unconfirmed` qua POST /support/cases', async () => {
    await expect(
      support.open(
        { userId: customerId, scope: SUPPORT_PARTY.CUSTOMER, tenantId: null },
        {
          category: SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED,
          subject: 'Tự mở case hệ thống',
          description: 'Không được phép',
        },
      ),
    ).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.SUPPORT_CASE_CATEGORY_NOT_ALLOWED },
    });
  });
});

describe('Lớp 3 — worker: cả hai bên im lặng quá ân hạn', () => {
  const overduePickup = () =>
    new Date(SWEEP_NOW.getTime() - (HANDOVER_CONFIRMATION_GRACE_MINUTES + 10) * MINUTE);

  maybe(
    'đơn reserved quá ân hạn ⇒ claim + MỘT case handover_unconfirmed; chạy lại không làm gì',
    async () => {
      const { bookingId, code } = await seedBooking({ pickupAt: overduePickup() });

      const first = await sweepHandoverOverdue(prisma, SWEEP_NOW);
      expect(first.flagged).toBeGreaterThanOrEqual(1);

      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      expect(booking.handoverOverdueAt?.toISOString()).toBe(SWEEP_NOW.toISOString());
      // Không đổi trạng thái đơn — ADR 0066 không thêm trạng thái nào.
      expect(booking.status).toBe(BOOKING_STATUS.RESERVED);

      const cases = await prisma.supportCase.findMany({ where: { bookingId } });
      expect(cases).toHaveLength(1);
      expect(cases[0]).toMatchObject({
        category: SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED,
        priority: SUPPORT_CASE_PRIORITY.URGENT,
        status: SUPPORT_CASE_STATUS.OPEN,
        openedByUserId: null,
        openedByScope: SUPPORT_PARTY.PLATFORM,
        tenantId,
      });

      const log = await prisma.auditLog.findFirst({
        where: { targetType: AUDIT_TARGET_TYPE.SUPPORT_CASE, targetId: cases[0]!.id },
      });
      expect(log?.actorUserId).toBeNull();

      const ownerNotice = await prisma.notification.findFirst({
        where: { userId: ownerId, targetId: bookingId, title: { contains: code } },
      });
      const customerNotice = await prisma.notification.findFirst({
        where: { userId: customerId, targetId: bookingId, title: { contains: code } },
      });
      expect(ownerNotice).not.toBeNull();
      expect(customerNotice).not.toBeNull();

      await sweepHandoverOverdue(prisma, SWEEP_NOW);
      expect(await prisma.supportCase.count({ where: { bookingId } })).toBe(1);

      // Case hệ thống đọc được qua service hỗ trợ của nền tảng — người mở `null`, không nổ.
      const asAdmin = await support.detail(cases[0]!.id, {
        userId: ownerId,
        scope: SUPPORT_PARTY.PLATFORM,
        tenantId: null,
      });
      expect(asAdmin.openedByName).toBeNull();
    },
  );

  maybe('đơn đã có biên bản GIAO XE xác nhận ⇒ không bị đụng', async () => {
    const { bookingId } = await seedBooking({ pickupAt: overduePickup() });
    await prisma.vehicleHandover.create({
      data: {
        id: newId(),
        tenantId,
        vehicleId,
        bookingId,
        type: HANDOVER_TYPE.PICKUP,
        status: HANDOVER_STATUS.CONFIRMED,
        odometerMissing: true,
        occurredAt: SWEEP_NOW,
        confirmedAt: SWEEP_NOW,
        confirmedBy: ownerId,
      },
    });

    await sweepHandoverOverdue(prisma, SWEEP_NOW);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.handoverOverdueAt).toBeNull();
    expect(await prisma.supportCase.count({ where: { bookingId } })).toBe(0);
  });

  maybe('chưa hết ân hạn ⇒ chưa đụng', async () => {
    const { bookingId } = await seedBooking({
      pickupAt: new Date(SWEEP_NOW.getTime() - (HANDOVER_CONFIRMATION_GRACE_MINUTES - 5) * MINUTE),
    });
    await sweepHandoverOverdue(prisma, SWEEP_NOW);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.handoverOverdueAt).toBeNull();
  });

  maybe('khách ĐÃ báo "chưa nhận được xe" ⇒ không mở case thứ hai, không claim', async () => {
    const seeded = await seedBooking({ pickupAt: overduePickup() });
    await openCustomerReport(seeded);

    await sweepHandoverOverdue(prisma, SWEEP_NOW);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: seeded.bookingId } });
    expect(booking.handoverOverdueAt).toBeNull();
    expect(
      await prisma.supportCase.count({
        where: {
          bookingId: seeded.bookingId,
          category: SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED,
        },
      }),
    ).toBe(0);
  });

  maybe('chỉ GIAN HÀNG mở tranh chấp ⇒ vẫn là "khách im lặng", vẫn mở case', async () => {
    const { bookingId } = await seedBooking({ pickupAt: overduePickup() });
    await openShopDispute(bookingId);

    await sweepHandoverOverdue(prisma, SWEEP_NOW);

    expect(
      await prisma.supportCase.count({
        where: { bookingId, category: SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED },
      }),
    ).toBe(1);
  });

  maybe(
    'chủ xe xác nhận GIAO XE sau lượt quét ⇒ case handover_unconfirmed tự kết luận, tranh chấp của khách vẫn mở',
    async () => {
      const seeded = await seedBooking({ pickupAt: overduePickup() });
      const { bookingId } = seeded;
      await sweepHandoverOverdue(prisma, SWEEP_NOW);
      const overdueCase = await prisma.supportCase.findFirstOrThrow({
        where: { bookingId, category: SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED },
      });
      expect(await hasOpenSupportCase(prisma, bookingId)).toBe(true);

      await confirmPickup(bookingId);

      const resolved = await prisma.supportCase.findUniqueOrThrow({
        where: { id: overdueCase.id },
      });
      expect(resolved.status).toBe(SUPPORT_CASE_STATUS.RESOLVED);
      expect(resolved.resolution).toContain(seeded.code);
      expect(resolved.resolvedAt).not.toBeNull();

      const event = await prisma.supportCaseEvent.findFirst({
        where: { caseId: overdueCase.id, kind: SUPPORT_CASE_EVENT_KIND.RESOLUTION },
      });
      expect(event).toMatchObject({
        actorUserId: ownerId,
        actorScope: SUPPORT_PARTY.TENANT,
        toStatus: SUPPORT_CASE_STATUS.RESOLVED,
      });
      const log = await prisma.auditLog.findFirst({
        where: {
          targetType: AUDIT_TARGET_TYPE.SUPPORT_CASE,
          targetId: overdueCase.id,
          action: SUPPORT_CASE_AUDIT_ACTION.RESOLVE,
        },
      });
      expect((log?.afterJson as { reason?: string } | null)?.reason).toBe(
        SUPPORT_CASE_AUTO_RESOLVE_REASON.HANDOVER_CONFIRMED,
      );

      // Không còn case nào GIỮ quyết toán — đúng câu `HoldSettlementService` hỏi.
      expect(await hasOpenSupportCase(prisma, bookingId)).toBe(false);
      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      expect(booking.status).toBe(BOOKING_STATUS.ACTIVE);
    },
  );

  maybe('xác nhận giao xe KHÔNG tự đóng tranh chấp "chưa nhận được xe" của khách', async () => {
    const seeded = await seedBooking({ pickupAt: overduePickup() });
    await sweepHandoverOverdue(prisma, SWEEP_NOW);
    // Khách báo sau lượt quét (ghi thẳng — giờ nhận ở tương lai giả lập).
    const report = await openCustomerReport(seeded);

    await confirmPickup(seeded.bookingId);

    const dispute = await prisma.supportCase.findUniqueOrThrow({ where: { id: report.caseId } });
    expect(dispute.status).toBe(SUPPORT_CASE_STATUS.OPEN);
    expect(
      await prisma.supportCase.count({
        where: {
          bookingId: seeded.bookingId,
          category: SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED,
          status: SUPPORT_CASE_STATUS.RESOLVED,
        },
      }),
    ).toBe(1);
    // Tiền vẫn bị giữ — vì tranh chấp của khách, không vì case hệ thống.
    expect(await hasOpenSupportCase(prisma, seeded.bookingId)).toBe(true);
  });
});

describe('Case GIỮ tiền chỉ nền tảng kết luận/đóng', () => {
  maybe('gian hàng không tự đóng tranh chấp của CHÍNH MÌNH; nền tảng kết luận được', async () => {
    const { bookingId } = await seedBooking({ pickupAt: minutesFromNow(-10) });
    const shopCase = await openShopDispute(bookingId);

    await expect(
      support.transition(shopCase.id, TENANT_ACTOR(), SUPPORT_CASE_STATUS.CLOSED, null),
    ).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.SUPPORT_CASE_PLATFORM_RESOLVE_ONLY },
    });
    expect(await hasOpenSupportCase(prisma, bookingId)).toBe(true);

    const resolved = await support.resolve(shopCase.id, adminId, 'Đã xác minh, không có hư hỏng.');
    expect(resolved.status).toBe(SUPPORT_CASE_STATUS.RESOLVED);
    expect(await hasOpenSupportCase(prisma, bookingId)).toBe(false);
  });

  maybe('case `handover_unconfirmed` — gian hàng không đóng được', async () => {
    const { bookingId } = await seedBooking({
      pickupAt: new Date(SWEEP_NOW.getTime() - (HANDOVER_CONFIRMATION_GRACE_MINUTES + 30) * MINUTE),
    });
    await sweepHandoverOverdue(prisma, SWEEP_NOW);
    const overdueCase = await prisma.supportCase.findFirstOrThrow({
      where: { bookingId, category: SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED },
    });
    await expect(
      support.transition(overdueCase.id, TENANT_ACTOR(), SUPPORT_CASE_STATUS.CLOSED, null),
    ).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.SUPPORT_CASE_PLATFORM_RESOLVE_ONLY },
    });
  });

  maybe('case thường của gian hàng vẫn tự đóng được', async () => {
    const own = await support.open(TENANT_ACTOR(), {
      category: SUPPORT_CASE_CATEGORY.OTHER,
      subject: 'Hỏi về hoá đơn',
      description: 'Câu hỏi chung.',
    });
    const closed = await support.transition(
      own.id,
      TENANT_ACTOR(),
      SUPPORT_CASE_STATUS.CLOSED,
      null,
    );
    expect(closed.status).toBe(SUPPORT_CASE_STATUS.CLOSED);
  });
});
