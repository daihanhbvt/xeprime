import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  AUDIT_TARGET_TYPE,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  bookingRequestRespondBy,
  CANCELLATION_PARTY,
  CANCELLATION_STAGE,
  HANDOVER_CONFIRM_SOURCE,
  HANDOVER_STATUS,
  HANDOVER_TYPE,
  MEMBERSHIP_STATUS,
  RETURN_CONFIRMATION_GRACE_MINUTES,
  SUPPORT_CASE_AUDIT_ACTION,
  SUPPORT_CASE_AUTO_RESOLVE_REASON,
  SUPPORT_CASE_CATEGORY,
  SUPPORT_CASE_PRIORITY,
  SUPPORT_CASE_STATUS,
  SUPPORT_PARTY,
  TENANT_ROLE,
  TENANT_STATUS,
  TRIP_VERDICT,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { sweepReturnOverdue } from '../../worker/src/jobs/return-overdue';
import { AuditService } from '../src/modules/audit/audit.service';
import { HandoversService } from '../src/modules/bookings/handovers/handovers.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { ReceiptsService } from '../src/modules/finance/receipts.service';
import type { R2Service } from '../src/modules/storage/r2.service';
import type { SupportService } from '../src/modules/support/support.service';
import { TaxService } from '../src/modules/tax/tax.service';
import { TripVerdictService } from '../src/modules/trip-verdict/trip-verdict.service';
import { MaintenanceService } from '../src/modules/vehicles/maintenance/maintenance.service';
import { OdometerService } from '../src/modules/vehicles/maintenance/odometer.service';
import { VehicleContractsService } from '../src/modules/vehicles/vehicle-contracts.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeBookingsService,
  makeCustomersService,
  makeHandoverMoneyServices,
  makeNotificationService,
  makeSupportService,
  makeHoldSettlementService,
} from './helpers/service-factory';
import { releaseWalletObligations } from './helpers/wallet-cleanup';

/**
 * Kết luận chuyến của nền tảng + lưới chống treo ở mốc TRẢ XE — ADR 0094, trên PostgreSQL THẬT.
 *
 *  - Worker `return-overdue`: đơn `active` quá `returnAt + 24h`, chưa biên bản trả, khách chưa báo
 *    trả, không tranh chấp ⇒ cột claim + MỘT case `return_unconfirmed`; biên bản trả xe muộn tự
 *    kết luận case đó.
 *  - Kết luận chuyến: bốn kết luận đi đúng đường của gian hàng/khách, case xác minh không đóng trần
 *    được khi đơn còn treo, và kết luận hết hiệu lực khi đơn đã đi tiếp.
 * (Tiền giữ chỗ chốt theo kết luận: `booking-hold-lifecycle.spec.ts`.)
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const receipts = new ReceiptsService(asService, audit);
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
  new MaintenanceService(asService, odometer, files, audit, receipts),
  files,
  audit,
  ...makeHandoverMoneyServices(asService, audit),
);
const support: SupportService = makeSupportService(asService, notifications);
const settlement = makeHoldSettlementService(asService, audit, notifications);
const tax = new TaxService(asService, audit);
const verdicts = new TripVerdictService(
  asService,
  audit,
  support,
  bookings,
  handovers,
  settlement,
  tax,
);

let dbAvailable = false;
let ownerId: string;
let customerId: string;
let adminId: string;
let tenantId: string;
let vehicleId: string;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** Mốc quét xa hẳn về tương lai — cửa sổ nhìn lại của worker chỉ thấy đơn của spec này. */
const SWEEP_NOW = new Date('2031-05-20T05:00:00.000Z');
let slot = 0;

async function seedBooking(opts: {
  pickupAt: Date;
  returnAt?: Date;
  status: string;
}): Promise<{ bookingId: string; code: string }> {
  const bookingId = newId();
  const code = `DH${bookingId.slice(-6).toUpperCase()}`;
  // Mỗi chuyến lệch vài giây: unique `(vehicle_id, customer_phone, pickup_at, return_at)`.
  const shift = slot * 1_000;
  slot += 1;
  const pickupAt = new Date(opts.pickupAt.getTime() - shift);
  const returnAt = new Date(
    (opts.returnAt ?? new Date(opts.pickupAt.getTime() + HOUR)).getTime() - shift,
  );
  await prisma.booking.create({
    data: {
      id: bookingId,
      tenantId,
      vehicleId,
      code,
      customerName: 'Khách Test',
      status: opts.status,
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
      id: newId(),
      tenantId,
      vehicleId,
      status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
      customerName: 'Khách Test',
      customerPhone: '0900000000',
      customerUserId: customerId,
      bookingId,
      pickupAt,
      returnAt,
    },
  });
  return { bookingId, code };
}

/** Case xác minh do hệ thống mở, ghi thẳng (giờ nhận ở quá khứ thật để no-show hợp lệ). */
async function openVerificationCase(bookingId: string, category: string): Promise<string> {
  const id = newId();
  await prisma.supportCase.create({
    data: {
      id,
      code: `SC${id.slice(-6).toUpperCase()}`,
      tenantId,
      bookingId,
      openedByUserId: null,
      openedByScope: SUPPORT_PARTY.PLATFORM,
      category,
      priority: SUPPORT_CASE_PRIORITY.URGENT,
      status: SUPPORT_CASE_STATUS.OPEN,
      subject: 'Chưa xác nhận bàn giao',
      description: 'Case xác minh của spec',
    },
  });
  return id;
}

/** Đơn `reserved` đã qua giờ nhận 3 tiếng — đủ cả ân hạn no-show lẫn ân hạn bàn giao. */
const pastPickup = () => new Date(Date.now() - 3 * HOUR);

const ADMIN = () => ({ userId: adminId, scope: SUPPORT_PARTY.PLATFORM, tenantId: null }) as const;

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
      name: 'Gian hàng kết luận chuyến',
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
      plateNumber: '43A-999.02',
      seatCount: 5,
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.supportCase.deleteMany({ where: { tenantId } });
    await releaseWalletObligations(prisma, {
      tenantIds: [tenantId],
      userIds: [ownerId, customerId, adminId],
    });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, customerId, adminId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Worker return-overdue — cả hai bên im lặng sau giờ trả', () => {
  const overdueReturn = () =>
    new Date(SWEEP_NOW.getTime() - (RETURN_CONFIRMATION_GRACE_MINUTES + 10) * MINUTE);
  const seedActive = (returnAt: Date) =>
    seedBooking({
      pickupAt: new Date(returnAt.getTime() - 24 * HOUR),
      returnAt,
      status: BOOKING_STATUS.ACTIVE,
    });

  maybe('quá ân hạn ⇒ claim + MỘT case return_unconfirmed; chạy lại không làm gì', async () => {
    const { bookingId, code } = await seedActive(overdueReturn());

    const first = await sweepReturnOverdue(prisma, SWEEP_NOW);
    expect(first.flagged).toBeGreaterThanOrEqual(1);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.returnUnconfirmedAt?.toISOString()).toBe(SWEEP_NOW.toISOString());
    expect(booking.status).toBe(BOOKING_STATUS.ACTIVE);

    const cases = await prisma.supportCase.findMany({ where: { bookingId } });
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({
      category: SUPPORT_CASE_CATEGORY.RETURN_UNCONFIRMED,
      priority: SUPPORT_CASE_PRIORITY.URGENT,
      openedByUserId: null,
      openedByScope: SUPPORT_PARTY.PLATFORM,
    });
    expect(
      await prisma.notification.count({
        where: {
          userId: { in: [ownerId, customerId] },
          targetId: bookingId,
          title: { contains: code },
        },
      }),
    ).toBe(2);

    await sweepReturnOverdue(prisma, SWEEP_NOW);
    expect(await prisma.supportCase.count({ where: { bookingId } })).toBe(1);
  });

  maybe('chưa hết ân hạn ⇒ chưa đụng', async () => {
    const { bookingId } = await seedActive(
      new Date(SWEEP_NOW.getTime() - (RETURN_CONFIRMATION_GRACE_MINUTES - 30) * MINUTE),
    );
    await sweepReturnOverdue(prisma, SWEEP_NOW);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.returnUnconfirmedAt).toBeNull();
  });

  maybe('khách đã báo "Đã trả xe" ⇒ không mở case (đã có đường tự hoàn thành riêng)', async () => {
    const { bookingId } = await seedActive(overdueReturn());
    await prisma.booking.update({
      where: { id: bookingId },
      data: { customerReturnedAt: SWEEP_NOW, returnAutoCompleteAt: SWEEP_NOW },
    });
    await sweepReturnOverdue(prisma, SWEEP_NOW);
    expect(await prisma.supportCase.count({ where: { bookingId } })).toBe(0);
  });

  maybe('đơn đang có tranh chấp mở ⇒ không mở case thứ hai', async () => {
    const { bookingId } = await seedActive(overdueReturn());
    await openVerificationCase(bookingId, SUPPORT_CASE_CATEGORY.DISPUTE);
    await sweepReturnOverdue(prisma, SWEEP_NOW);
    expect(
      await prisma.supportCase.count({
        where: { bookingId, category: SUPPORT_CASE_CATEGORY.RETURN_UNCONFIRMED },
      }),
    ).toBe(0);
  });

  maybe('chủ xe xác nhận TRẢ XE sau lượt quét ⇒ case tự kết luận, đơn hoàn thành', async () => {
    const { bookingId } = await seedActive(overdueReturn());
    await sweepReturnOverdue(prisma, SWEEP_NOW);
    const overdueCase = await prisma.supportCase.findFirstOrThrow({
      where: { bookingId, category: SUPPORT_CASE_CATEGORY.RETURN_UNCONFIRMED },
    });

    await handovers.confirm(
      tenantId,
      bookingId,
      HANDOVER_TYPE.RETURN,
      ownerId,
      {},
      {
        canViewFiles: true,
      },
    );

    const resolved = await prisma.supportCase.findUniqueOrThrow({ where: { id: overdueCase.id } });
    expect(resolved.status).toBe(SUPPORT_CASE_STATUS.RESOLVED);
    const log = await prisma.auditLog.findFirst({
      where: {
        targetType: AUDIT_TARGET_TYPE.SUPPORT_CASE,
        targetId: overdueCase.id,
        action: SUPPORT_CASE_AUDIT_ACTION.RESOLVE,
      },
    });
    expect((log?.afterJson as { reason?: string } | null)?.reason).toBe(
      SUPPORT_CASE_AUTO_RESOLVE_REASON.RETURN_CONFIRMED,
    );
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe(BOOKING_STATUS.COMPLETED);
  });
});

describe('Kết luận chuyến — case chưa xác nhận giao xe', () => {
  maybe('chi tiết case liệt kê ba kết luận; kết luận/đóng trần bị chặn', async () => {
    const { bookingId } = await seedBooking({
      pickupAt: pastPickup(),
      status: BOOKING_STATUS.RESERVED,
    });
    const caseId = await openVerificationCase(
      bookingId,
      SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED,
    );

    const detail = await support.detail(caseId, ADMIN());
    expect(detail.tripVerdicts).toEqual([
      TRIP_VERDICT.HANDED_OVER,
      TRIP_VERDICT.CUSTOMER_NO_SHOW,
      TRIP_VERDICT.HOST_NOT_DELIVERED,
    ]);
    // Hai bên còn lại không có gì để bấm.
    const asOwner = await support.detail(caseId, {
      userId: ownerId,
      scope: SUPPORT_PARTY.TENANT,
      tenantId,
    });
    expect(asOwner.tripVerdicts).toEqual([]);

    await expect(support.resolve(caseId, adminId, 'Đóng cho xong việc')).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.SUPPORT_CASE_TRIP_VERDICT_REQUIRED },
    });
    await expect(
      support.transition(caseId, ADMIN(), SUPPORT_CASE_STATUS.CLOSED, null),
    ).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.SUPPORT_CASE_TRIP_VERDICT_REQUIRED },
    });
  });

  maybe(
    '"xe đã giao" ⇒ biên bản giao xe nguồn platform, đơn active, case kết luận, audit',
    async () => {
      const { bookingId } = await seedBooking({
        pickupAt: pastPickup(),
        status: BOOKING_STATUS.RESERVED,
      });
      const caseId = await openVerificationCase(
        bookingId,
        SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED,
      );

      await verdicts.apply(caseId, adminId, {
        verdict: TRIP_VERDICT.HANDED_OVER,
        note: 'Đã gọi chủ xe và khách, xe giao lúc 9h',
      });

      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      expect(booking.status).toBe(BOOKING_STATUS.ACTIVE);
      const handover = await prisma.vehicleHandover.findFirstOrThrow({
        where: { bookingId, type: HANDOVER_TYPE.PICKUP },
      });
      expect(handover).toMatchObject({
        status: HANDOVER_STATUS.CONFIRMED,
        confirmSource: HANDOVER_CONFIRM_SOURCE.PLATFORM,
        confirmedBy: adminId,
      });
      expect(handover.occurredAt?.getTime()).toBe(booking.pickupAt.getTime());

      const resolved = await prisma.supportCase.findUniqueOrThrow({ where: { id: caseId } });
      expect(resolved.status).toBe(SUPPORT_CASE_STATUS.RESOLVED);
      expect(resolved.resolution).toContain('xe giao lúc 9h');
      const log = await prisma.auditLog.findFirst({
        where: { targetId: caseId, action: SUPPORT_CASE_AUDIT_ACTION.TRIP_VERDICT },
      });
      expect(log).toMatchObject({ actorUserId: adminId });
      expect((log?.afterJson as { verdict?: string } | null)?.verdict).toBe(
        TRIP_VERDICT.HANDED_OVER,
      );
    },
  );

  maybe('"khách không đến" ⇒ đơn no_show, không ghi lượt huỷ', async () => {
    const { bookingId } = await seedBooking({
      pickupAt: pastPickup(),
      status: BOOKING_STATUS.RESERVED,
    });
    const caseId = await openVerificationCase(
      bookingId,
      SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED,
    );

    await verdicts.apply(caseId, adminId, {
      verdict: TRIP_VERDICT.CUSTOMER_NO_SHOW,
      note: 'Khách xác nhận không đi nữa, không báo trước',
    });

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe(BOOKING_STATUS.NO_SHOW);
    expect(await prisma.bookingCancellation.count({ where: { bookingId } })).toBe(0);
  });

  maybe('"chủ xe không giao được" ⇒ đơn huỷ, trách nhiệm CHỦ XE do nền tảng xác minh', async () => {
    const { bookingId } = await seedBooking({
      pickupAt: pastPickup(),
      status: BOOKING_STATUS.RESERVED,
    });
    const caseId = await openVerificationCase(
      bookingId,
      SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED,
    );

    await verdicts.apply(caseId, adminId, {
      verdict: TRIP_VERDICT.HOST_NOT_DELIVERED,
      note: 'Xe hỏng, chủ xe không báo khách',
    });

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe(BOOKING_STATUS.CANCELLED);
    const cancellation = await prisma.bookingCancellation.findFirstOrThrow({
      where: { bookingId },
    });
    expect(cancellation).toMatchObject({
      responsibleParty: CANCELLATION_PARTY.HOST,
      countsAgainstHost: true,
      actorUserId: adminId,
    });
  });

  maybe('kết luận không thuộc loại case ⇒ 409, không đổi gì', async () => {
    const { bookingId } = await seedBooking({
      pickupAt: pastPickup(),
      status: BOOKING_STATUS.RESERVED,
    });
    const caseId = await openVerificationCase(
      bookingId,
      SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED,
    );

    await expect(
      verdicts.apply(caseId, adminId, { verdict: TRIP_VERDICT.RETURNED, note: 'Nhầm nút trả xe' }),
    ).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.SUPPORT_TRIP_VERDICT_NOT_ALLOWED },
    });
    const still = await prisma.supportCase.findUniqueOrThrow({ where: { id: caseId } });
    expect(still.status).toBe(SUPPORT_CASE_STATUS.OPEN);
  });

  maybe('đơn đã đi tiếp (chủ xe vừa huỷ) ⇒ hết kết luận, case đóng trần được', async () => {
    const { bookingId } = await seedBooking({
      pickupAt: pastPickup(),
      status: BOOKING_STATUS.RESERVED,
    });
    const caseId = await openVerificationCase(
      bookingId,
      SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED,
    );
    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: BOOKING_STATUS.CANCELLED },
    });

    await expect(
      verdicts.apply(caseId, adminId, {
        verdict: TRIP_VERDICT.CUSTOMER_NO_SHOW,
        note: 'Khách không đến nhận xe',
      }),
    ).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.SUPPORT_TRIP_VERDICT_NOT_ALLOWED },
    });
    expect((await support.detail(caseId, ADMIN())).tripVerdicts).toEqual([]);

    await support.resolve(caseId, adminId, 'Chủ xe đã huỷ đơn, không còn gì để xác minh');
    const resolved = await prisma.supportCase.findUniqueOrThrow({ where: { id: caseId } });
    expect(resolved.status).toBe(SUPPORT_CASE_STATUS.RESOLVED);
  });
});

describe('Kết luận chuyến — case chưa xác nhận trả xe', () => {
  maybe('"xe đã trả" ⇒ biên bản trả xe nguồn platform, đơn hoàn thành', async () => {
    const returnAt = new Date(Date.now() - 30 * HOUR);
    const { bookingId } = await seedBooking({
      pickupAt: new Date(returnAt.getTime() - 24 * HOUR),
      returnAt,
      status: BOOKING_STATUS.ACTIVE,
    });
    const caseId = await openVerificationCase(bookingId, SUPPORT_CASE_CATEGORY.RETURN_UNCONFIRMED);
    expect((await support.detail(caseId, ADMIN())).tripVerdicts).toEqual([TRIP_VERDICT.RETURNED]);

    await verdicts.apply(caseId, adminId, {
      verdict: TRIP_VERDICT.RETURNED,
      note: 'Chủ xe xác nhận xe đã về bãi hôm qua',
    });

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe(BOOKING_STATUS.COMPLETED);
    const handover = await prisma.vehicleHandover.findFirstOrThrow({
      where: { bookingId, type: HANDOVER_TYPE.RETURN },
    });
    expect(handover.confirmSource).toBe(HANDOVER_CONFIRM_SOURCE.PLATFORM);
    const resolved = await prisma.supportCase.findUniqueOrThrow({ where: { id: caseId } });
    expect(resolved.status).toBe(SUPPORT_CASE_STATUS.RESOLVED);
  });
});

describe('Kết luận chuyến — tranh chấp trước nhận xe (ADR 0095)', () => {
  maybe('có bốn kết luận nhưng KHÔNG bắt buộc: kết luận trần vẫn được', async () => {
    const { bookingId } = await seedBooking({
      pickupAt: pastPickup(),
      status: BOOKING_STATUS.RESERVED,
    });
    const caseId = await openVerificationCase(bookingId, SUPPORT_CASE_CATEGORY.DISPUTE);

    const detail = await support.detail(caseId, ADMIN());
    expect(detail.tripVerdicts).toEqual([
      TRIP_VERDICT.HANDED_OVER,
      TRIP_VERDICT.CUSTOMER_NO_SHOW,
      TRIP_VERDICT.HOST_NOT_DELIVERED,
      TRIP_VERDICT.PLATFORM_CANCELLED,
    ]);
    expect(detail.tripVerdictRequired).toBe(false);

    await support.resolve(caseId, adminId, 'Hai bên thống nhất đổi giờ nhận, chuyến vẫn đi');
    const resolved = await prisma.supportCase.findUniqueOrThrow({ where: { id: caseId } });
    expect(resolved.status).toBe(SUPPORT_CASE_STATUS.RESOLVED);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe(BOOKING_STATUS.RESERVED);
  });

  maybe('case giao xe vẫn bắt buộc kết luận chuyến', async () => {
    const { bookingId } = await seedBooking({
      pickupAt: pastPickup(),
      status: BOOKING_STATUS.RESERVED,
    });
    const caseId = await openVerificationCase(
      bookingId,
      SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED,
    );
    expect((await support.detail(caseId, ADMIN())).tripVerdictRequired).toBe(true);
  });

  maybe('"khách không đến" qua tranh chấp ⇒ đơn no_show, case kết luận', async () => {
    const { bookingId } = await seedBooking({
      pickupAt: pastPickup(),
      status: BOOKING_STATUS.RESERVED,
    });
    const caseId = await openVerificationCase(bookingId, SUPPORT_CASE_CATEGORY.DISPUTE);

    await verdicts.apply(caseId, adminId, {
      verdict: TRIP_VERDICT.CUSTOMER_NO_SHOW,
      note: 'Gọi khách 3 lần không nghe, chủ xe gửi ảnh chờ ở điểm hẹn',
    });

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe(BOOKING_STATUS.NO_SHOW);
    const resolved = await prisma.supportCase.findUniqueOrThrow({ where: { id: caseId } });
    expect(resolved.status).toBe(SUPPORT_CASE_STATUS.RESOLVED);
  });

  maybe(
    'đơn đang chạy ⇒ tranh chấp không có kết luận chuyến nào, lượt kết luận bị từ chối',
    async () => {
      const { bookingId } = await seedBooking({
        pickupAt: pastPickup(),
        status: BOOKING_STATUS.ACTIVE,
      });
      const caseId = await openVerificationCase(bookingId, SUPPORT_CASE_CATEGORY.DISPUTE);
      expect((await support.detail(caseId, ADMIN())).tripVerdicts).toEqual([]);
      expect((await verdicts.preview(caseId)).items).toEqual([]);
      await expect(
        verdicts.apply(caseId, adminId, {
          verdict: TRIP_VERDICT.PLATFORM_CANCELLED,
          note: 'Huỷ chuyến đang chạy',
        }),
      ).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.SUPPORT_TRIP_VERDICT_NOT_ALLOWED },
      });
      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      expect(booking.status).toBe(BOOKING_STATUS.ACTIVE);
    },
  );
});

/*
 * ADR 0104 điều 3: chủ xe đã bấm giao xe (đơn `active`) nhưng khách báo CHƯA NHẬN ĐƯỢC XE. Chỉ lời
 * báo đó (dấu `trip_not_received`) mở kết luận chuyến cho đơn đang thuê; kết luận huỷ gỡ biên bản giao
 * xe trước rồi đi tiếp như một đơn chưa giao.
 */
describe('Kết luận chuyến - đơn đang thuê, khách báo chưa nhận được xe (ADR 0104)', () => {
  async function seedHandedOver(): Promise<{
    bookingId: string;
    code: string;
    handoverId: string;
  }> {
    const seeded = await seedBooking({ pickupAt: pastPickup(), status: BOOKING_STATUS.ACTIVE });
    await prisma.booking.update({
      where: { id: seeded.bookingId },
      data: { actualPickupAt: new Date(Date.now() - 2 * HOUR) },
    });
    const handoverId = newId();
    await prisma.vehicleHandover.create({
      data: {
        id: handoverId,
        tenantId,
        bookingId: seeded.bookingId,
        vehicleId,
        type: HANDOVER_TYPE.PICKUP,
        status: HANDOVER_STATUS.CONFIRMED,
        odometerMissing: true,
        confirmedAt: new Date(Date.now() - 2 * HOUR),
        confirmedBy: ownerId,
        occurredAt: new Date(Date.now() - 2 * HOUR),
      },
    });
    return { ...seeded, handoverId };
  }

  /** Lời báo thật của khách - cùng đường `reportNotReceived` dùng, mang dấu audit. */
  async function reportNotReceived(bookingId: string, code: string): Promise<string> {
    const opened = await prisma.$transaction((tx) =>
      support.openTripNotReceivedWithinTx(tx, customerId, {
        id: bookingId,
        tenantId,
        code,
        bookingRequestId: null,
      }),
    );
    return opened.caseId;
  }

  maybe('lời báo "chưa nhận được xe" ⇒ đủ bốn kết luận; xem trước báo sẽ gỡ giao xe', async () => {
    const { bookingId, code } = await seedHandedOver();
    const caseId = await reportNotReceived(bookingId, code);

    expect((await support.detail(caseId, ADMIN())).tripVerdicts).toEqual([
      TRIP_VERDICT.HANDED_OVER,
      TRIP_VERDICT.CUSTOMER_NO_SHOW,
      TRIP_VERDICT.HOST_NOT_DELIVERED,
      TRIP_VERDICT.PLATFORM_CANCELLED,
    ]);
    const preview = await verdicts.preview(caseId);
    expect(preview.revertsHandover).toBe(true);
    expect(preview.insuranceIssued).toBe(false);
  });

  maybe(
    '"chủ xe không giao được" ⇒ gỡ biên bản giao xe, đơn huỷ, lượt huỷ ghi chặng trước nhận xe',
    async () => {
      const { bookingId, code, handoverId } = await seedHandedOver();
      const caseId = await reportNotReceived(bookingId, code);

      await verdicts.apply(caseId, adminId, {
        verdict: TRIP_VERDICT.HOST_NOT_DELIVERED,
        note: 'Chủ xe bấm giao nhầm, khách chờ ở điểm hẹn không thấy xe',
      });

      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      expect(booking.status).toBe(BOOKING_STATUS.CANCELLED);
      expect(booking.actualPickupAt).toBeNull();
      const handover = await prisma.vehicleHandover.findUniqueOrThrow({
        where: { id: handoverId },
      });
      expect(handover.status).toBe(HANDOVER_STATUS.CANCELED);
      // Lịch sử của lượt bấm vẫn còn.
      expect(handover.confirmedBy).toBe(ownerId);
      const cancellation = await prisma.bookingCancellation.findFirstOrThrow({
        where: { bookingId },
      });
      expect(cancellation.stage).toBe(CANCELLATION_STAGE.BOOKING_BEFORE_PICKUP);
      expect(cancellation.responsibleParty).toBe(CANCELLATION_PARTY.HOST);
      expect(
        await prisma.auditLog.count({
          where: { targetId: bookingId, action: 'booking.pickup_reverted' },
        }),
      ).toBe(1);
    },
  );

  maybe('"xe đã giao" ⇒ giữ chuyến đang thuê, biên bản giữ nguyên, case kết luận', async () => {
    const { bookingId, code, handoverId } = await seedHandedOver();
    const caseId = await reportNotReceived(bookingId, code);

    await verdicts.apply(caseId, adminId, {
      verdict: TRIP_VERDICT.HANDED_OVER,
      note: 'Khách đã nhận xe, báo nhầm chuyến',
    });

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe(BOOKING_STATUS.ACTIVE);
    const handover = await prisma.vehicleHandover.findUniqueOrThrow({ where: { id: handoverId } });
    expect(handover.status).toBe(HANDOVER_STATUS.CONFIRMED);
    const resolved = await prisma.supportCase.findUniqueOrThrow({ where: { id: caseId } });
    expect(resolved.status).toBe(SUPPORT_CASE_STATUS.RESOLVED);
  });
});
