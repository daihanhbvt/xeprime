import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  bookingRequestRespondBy,
  DRIVER_ASSIGNMENT_AUDIT_ACTION,
  DRIVER_ASSIGNMENT_OUTCOME,
  DRIVER_ASSIGNMENT_STATUS,
  DRIVER_SOURCE,
  MEMBERSHIP_STATUS,
  NOTIFICATION_TYPE,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import {
  sweepDriverAssignmentExpiry,
  sweepDriverMissingAlerts,
} from '../../worker/src/jobs/driver-assignment-expiry';
import { createValidationPipe } from '../src/bootstrap';
import { AuditService } from '../src/modules/audit/audit.service';
import { AssignBookingDriverDto } from '../src/modules/bookings/dto/booking.dto';
import { SettlementService } from '../src/modules/bookings/settlement/settlement.service';
import { BankAccountsService } from '../src/modules/bank-accounts/bank-accounts.service';
import { CancellationsService } from '../src/modules/cancellations/cancellations.service';
import { CustomerTripsService } from '../src/modules/customer-trips/customer-trips.service';
import { DriversService } from '../src/modules/drivers/drivers.service';
import { ReceiptsService } from '../src/modules/finance/receipts.service';
import { HoldSettlementService } from '../src/modules/holds/hold-settlement.service';
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
 * TÀI XẾ NGOÀI HỆ THỐNG trên đơn + nhắc khẩn thiếu tài xế — ADR 0067 — trên PostgreSQL THẬT.
 *
 *  1. Ghi tên + SĐT tài xế ngoài: lượt gán liên kết đang chờ bị đóng `unassigned`, người đó được
 *     báo; DTO khu quản lý trả `source = external`, `accepted`, `id = null`; khách của chuyến thấy
 *     cùng tên + SĐT. Audit đã che PII.
 *  2. DTO: đúng MỘT khoá, SĐT di động VN, tên 2–120 ký tự. Service: chỉ `with_driver`, chưa giao xe.
 *  3. Gán tài xế liên kết / bỏ gán xoá tài xế ngoài (audit `driver_external_cleared`). CHECK ở DB
 *     chặn đơn mang cả hai, hay tài xế ngoài trên đơn tự lái.
 *  4. Worker nhắc khẩn MỘT lần khi còn ≤ 120′ mà chưa ai phủ; bỏ qua lượt chờ, tài xế liên kết,
 *     tài xế ngoài, chuyến còn xa, chuyến đã qua giờ nhận. Không đơn nào bị huỷ.
 *
 * Job của worker import THẲNG từ `apps/worker` — chứng minh chính đoạn mã chạy trên production.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const drivers: DriversService = makeDriversService(asService, { audit });
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
let dbAvailable = false;
let owner: string;
let customer: string;
let tenant: string;
let vehicle: string;

let seq = 0;
async function seedBooking(
  pickupAt: Date,
  opts: { status?: string; serviceType?: string; withRequest?: boolean } = {},
): Promise<string> {
  seq += 1;
  const id = newId();
  const withDriver = (opts.serviceType ?? SERVICE_TYPE.WITH_DRIVER) === SERVICE_TYPE.WITH_DRIVER;
  const returnAt = new Date(pickupAt.getTime() + 8 * 60 * MIN);
  await prisma.booking.create({
    data: {
      id,
      tenantId: tenant,
      vehicleId: vehicle,
      code: `DH-EXT-${Date.now().toString(36)}-${seq}`,
      customerName: 'Khách tài xế ngoài',
      customerPhone: `0977${String(100000 + seq).slice(-6)}`,
      serviceType: opts.serviceType ?? SERVICE_TYPE.WITH_DRIVER,
      ...(withDriver ? { routeType: 'in_city', pickupAddress: '1 Lê Lợi' } : {}),
      status: opts.status ?? BOOKING_STATUS.RESERVED,
      pickupAt,
      returnAt,
      baseAmount: new Prisma.Decimal('1000000'),
      totalAmount: new Prisma.Decimal('1000000'),
    },
  });
  if (opts.withRequest) {
    await prisma.bookingRequest.create({
      data: {
        id: newId(),
        respondBy: bookingRequestRespondBy(new Date()),
        tenantId: tenant,
        vehicleId: vehicle,
        status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        customerName: 'Khách tài xế ngoài',
        customerPhone: `0977${String(100000 + seq).slice(-6)}`,
        customerUserId: customer,
        bookingId: id,
        pickupAt,
        returnAt,
      },
    });
  }
  return id;
}

/** Mỗi ca một ngày riêng trong tương lai xa — không đụng lịch và không lọt cửa sổ nhắc 2 giờ. */
let day = 0;
function farPickup(): Date {
  day += 1;
  return new Date(Date.UTC(2029, 2, 1 + day, 2));
}

const EXTERNAL = { name: '  Nguyễn Văn Tài  ', phone: '0912 345 678' };

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
        displayName: 'Chủ tài xế ngoài',
        email: `drv-ext-${owner}@xeprime.test`,
      },
      {
        realm: ACCOUNT_REALM.CUSTOMER,
        id: customer,
        displayName: 'Khách tài xế ngoài',
        email: `drv-ext-cus-${customer}@xeprime.test`,
      },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenant,
      code: `T-${tenant.slice(-8)}`,
      slug: `t-${tenant.toLowerCase().slice(-10)}`,
      name: 'Shop tài xế ngoài',
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
      code: `V-EXT-${vehicle.slice(-6)}`,
      name: 'Innova tài xế ngoài',
      vehicleType: VEHICLE_TYPE.CAR,
      serviceTypes: [SERVICE_TYPE.WITH_DRIVER, SERVICE_TYPE.SELF_DRIVE],
      withDriverDailyPrice: new Prisma.Decimal('1300000'),
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.bookingDriverAssignment.deleteMany({ where: { tenantId: tenant } });
    await prisma.bookingRequest.deleteMany({ where: { tenantId: tenant } });
    await prisma.booking.deleteMany({ where: { tenantId: tenant } });
    await prisma.auditLog.deleteMany({ where: { tenantId: tenant } });
    await prisma.notification.deleteMany({ where: { tenantId: tenant } });
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

function validateBody(body: unknown) {
  return createValidationPipe().transform(body, {
    type: 'body',
    metatype: AssignBookingDriverDto,
  }) as Promise<AssignBookingDriverDto>;
}

describe('DTO PATCH /bookings/:id/driver — đúng một khoá', () => {
  it('nhận driverId, driverId null, hoặc externalDriver (cắt khoảng trắng, bỏ dấu cách SĐT)', async () => {
    await expect(validateBody({ driverId: null })).resolves.toMatchObject({ driverId: null });
    await expect(validateBody({ driverId: newId() })).resolves.toBeDefined();
    const ext = await validateBody({ externalDriver: EXTERNAL });
    expect(ext.externalDriver).toEqual({ name: 'Nguyễn Văn Tài', phone: '0912345678' });
    await expect(
      validateBody({ externalDriver: { name: 'An', phone: '+84912345678' } }),
    ).resolves.toBeDefined();
  });

  it.each([
    ['body rỗng', {}],
    ['cả hai khoá', { driverId: null, externalDriver: EXTERNAL }],
    ['SĐT sai', { externalDriver: { name: 'Nguyễn Văn Tài', phone: '12345' } }],
    ['SĐT bàn 11 số', { externalDriver: { name: 'Nguyễn Văn Tài', phone: '02838123456' } }],
    ['thiếu SĐT', { externalDriver: { name: 'Nguyễn Văn Tài' } }],
    ['tên 1 ký tự sau khi cắt', { externalDriver: { name: '  A ', phone: '0912345678' } }],
    ['tên quá 120 ký tự', { externalDriver: { name: 'A'.repeat(121), phone: '0912345678' } }],
    ['trường lạ', { externalDriver: { ...EXTERNAL, cccd: '0123' } }],
    ['driverId sai độ dài', { driverId: 'abc' }],
  ])('từ chối %s ⇒ VALIDATION_FAILED', async (_label, body) => {
    await expect(validateBody(body)).rejects.toMatchObject(code(API_ERROR_CODE.VALIDATION_FAILED));
  });
});

describe('Ghi tài xế ngoài hệ thống', () => {
  maybe(
    'đóng lượt liên kết đang chờ (unassigned + báo người đó), DTO external/accepted, khách thấy, audit đã che',
    async () => {
      const link = await seedDriverLink(asService, { tenantId: tenant, name: 'Tài xế Liên kết' });
      const bookingId = await seedBooking(farPickup(), { withRequest: true });
      await bookings.assignDriver(tenant, bookingId, owner, link.driverId);

      // Khách chưa thấy ai khi lượt liên kết còn CHỜ nhận — "Đang sắp xếp tài xế".
      expect((await trips.detail(customer, bookingId)).driver).toBeNull();

      const detail = await bookings.setExternalDriver(tenant, bookingId, owner, {
        name: 'Nguyễn Văn Tài',
        phone: '0912345678',
      });
      expect(detail.driver).toMatchObject({
        source: DRIVER_SOURCE.EXTERNAL,
        id: null,
        name: 'Nguyễn Văn Tài',
        phone: '0912345678',
        assignmentStatus: DRIVER_ASSIGNMENT_STATUS.ACCEPTED,
        respondBy: null,
      });

      const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      expect(row.externalDriverPhone).toBe('84912345678');
      expect(row.driverId).toBeNull();
      expect(row.driverUserId).toBeNull();
      expect(row.driverAssignmentStatus).toBeNull();
      expect(row.driverRespondBy).toBeNull();
      expect(row.driverAssignedAt).not.toBeNull();

      const episode = await prisma.bookingDriverAssignment.findFirstOrThrow({
        where: { bookingId, driverId: link.driverId },
      });
      expect(episode.outcome).toBe(DRIVER_ASSIGNMENT_OUTCOME.UNASSIGNED);
      const unassignedNote = await prisma.notification.findFirst({
        where: {
          targetId: bookingId,
          userId: link.userId,
          type: NOTIFICATION_TYPE.DRIVER_TRIP_UNASSIGNED,
        },
      });
      expect(unassignedNote).not.toBeNull();

      const auditRow = await prisma.auditLog.findFirstOrThrow({
        where: { targetId: bookingId, action: DRIVER_ASSIGNMENT_AUDIT_ACTION.EXTERNAL_SET },
      });
      const after = JSON.stringify(auditRow.afterJson);
      expect(after).not.toContain('0912345678');
      expect(after).not.toContain('84912345678');
      expect(after).toContain('091****678');
      expect(after).toContain('Nguyễn Văn T.');

      // Khách của chuyến: cùng tên + SĐT, không lộ id liên kết / hạn nội bộ.
      const renter = await trips.detail(customer, bookingId);
      expect(renter.driver).toMatchObject({
        source: DRIVER_SOURCE.EXTERNAL,
        id: null,
        name: 'Nguyễn Văn Tài',
        phone: '0912345678',
      });
      // Danh sách chuyến của khách cũng đọc cùng mapper.
      const list = await trips.list(customer, {});
      expect(list.data.find((t) => t.bookingId === bookingId)?.driver?.name).toBe('Nguyễn Văn Tài');

      // Gửi lại đúng người: không đổi gì, không audit trùng.
      await bookings.setExternalDriver(tenant, bookingId, owner, {
        name: 'Nguyễn Văn Tài',
        phone: '+84912345678',
      });
      expect(
        await prisma.auditLog.count({
          where: { targetId: bookingId, action: DRIVER_ASSIGNMENT_AUDIT_ACTION.EXTERNAL_SET },
        }),
      ).toBe(1);
    },
  );

  maybe('đơn tự lái ⇒ DRIVER_ASSIGN_SERVICE_NOT_SUPPORTED', async () => {
    const bookingId = await seedBooking(farPickup(), { serviceType: SERVICE_TYPE.SELF_DRIVE });
    await expect(
      bookings.setExternalDriver(tenant, bookingId, owner, {
        name: 'Nguyễn Văn Tài',
        phone: '0912345678',
      }),
    ).rejects.toMatchObject(code(API_ERROR_CODE.DRIVER_ASSIGN_SERVICE_NOT_SUPPORTED));
  });

  maybe(
    'đơn đã giao xe ⇒ DRIVER_ASSIGNMENT_LOCKED; đơn đã khép ⇒ INVALID_STATUS_TRANSITION',
    async () => {
      const active = await seedBooking(farPickup(), { status: BOOKING_STATUS.ACTIVE });
      await expect(
        bookings.setExternalDriver(tenant, active, owner, { name: 'Tài', phone: '0912345678' }),
      ).rejects.toMatchObject(code(API_ERROR_CODE.DRIVER_ASSIGNMENT_LOCKED));
      const done = await seedBooking(farPickup(), { status: BOOKING_STATUS.COMPLETED });
      await expect(
        bookings.setExternalDriver(tenant, done, owner, { name: 'Tài', phone: '0912345678' }),
      ).rejects.toMatchObject(code(API_ERROR_CODE.INVALID_STATUS_TRANSITION));
    },
  );

  maybe('đơn của gian hàng khác ⇒ 404', async () => {
    const bookingId = await seedBooking(farPickup());
    await expect(
      bookings.setExternalDriver(newId(), bookingId, owner, { name: 'Tài', phone: '0912345678' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  maybe('gán tài xế liên kết xoá tài xế ngoài (audit cleared); bỏ gán cũng xoá', async () => {
    const bookingId = await seedBooking(farPickup());
    await bookings.setExternalDriver(tenant, bookingId, owner, {
      name: 'Tài xế Ngoài',
      phone: '0912000111',
    });

    const link = await seedDriverLink(asService, { tenantId: tenant });
    const linked = await bookings.assignDriver(tenant, bookingId, owner, link.driverId);
    expect(linked.driver).toMatchObject({
      source: DRIVER_SOURCE.LINKED,
      id: link.driverId,
      assignmentStatus: DRIVER_ASSIGNMENT_STATUS.PENDING,
    });
    let row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.externalDriverName).toBeNull();
    expect(row.externalDriverPhone).toBeNull();
    expect(
      await prisma.auditLog.count({
        where: { targetId: bookingId, action: DRIVER_ASSIGNMENT_AUDIT_ACTION.EXTERNAL_CLEARED },
      }),
    ).toBe(1);

    // Trở lại tài xế ngoài rồi bỏ gán hẳn.
    await bookings.setExternalDriver(tenant, bookingId, owner, {
      name: 'Tài xế Ngoài',
      phone: '0912000111',
    });
    const cleared = await bookings.assignDriver(tenant, bookingId, owner, null);
    expect(cleared.driver).toBeNull();
    row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.externalDriverName).toBeNull();
    expect(row.driverAssignedAt).toBeNull();
    expect(
      await prisma.auditLog.count({
        where: { targetId: bookingId, action: DRIVER_ASSIGNMENT_AUDIT_ACTION.EXTERNAL_CLEARED },
      }),
    ).toBe(2);
  });

  maybe('CHECK ở DB: không mang cả hai, không trên đơn tự lái, tên/SĐT đi cùng nhau', async () => {
    const link = await seedDriverLink(asService, { tenantId: tenant });
    const linkedBooking = await seedBooking(farPickup());
    await bookings.assignDriver(tenant, linkedBooking, owner, link.driverId);
    await expect(
      prisma.booking.update({
        where: { id: linkedBooking },
        data: { externalDriverName: 'Lén', externalDriverPhone: '84912345678' },
      }),
    ).rejects.toThrow(/bookings_external_driver_exclusive_check/);

    const selfDrive = await seedBooking(farPickup(), { serviceType: SERVICE_TYPE.SELF_DRIVE });
    await expect(
      prisma.booking.update({
        where: { id: selfDrive },
        data: {
          externalDriverName: 'Lén',
          externalDriverPhone: '84912345678',
          driverAssignedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/bookings_external_driver_service_check/);

    const plain = await seedBooking(farPickup());
    await expect(
      prisma.booking.update({
        where: { id: plain },
        data: { externalDriverName: 'Lén', driverAssignedAt: new Date() },
      }),
    ).rejects.toThrow(/bookings_external_driver_pair_check/);
    await expect(
      prisma.booking.update({
        where: { id: plain },
        data: { externalDriverName: 'Lén', externalDriverPhone: '84912345678' },
      }),
    ).rejects.toThrow(/bookings_driver_assignment_consistency_check/);
  });
});

describe('Worker nhắc khẩn chuyến sắp nhận chưa có tài xế', () => {
  maybe(
    'báo MỘT lần cho đơn trống trong 2 giờ; bỏ qua đơn đã phủ / còn xa / đã qua giờ',
    async () => {
      const soon = () => new Date(Date.now() + 90 * MIN);
      const uncovered = await seedBooking(soon());

      const pendingLinked = await seedBooking(soon());
      const pendingLink = await seedDriverLink(asService, { tenantId: tenant });
      await bookings.assignDriver(tenant, pendingLinked, owner, pendingLink.driverId);

      const external = await seedBooking(soon());
      await bookings.setExternalDriver(tenant, external, owner, {
        name: 'Tài xế Ngoài',
        phone: '0912000222',
      });

      const far = await seedBooking(new Date(Date.now() + 5 * 60 * MIN));
      const past = await seedBooking(new Date(Date.now() - 10 * MIN));
      const selfDrive = await seedBooking(soon(), { serviceType: SERVICE_TYPE.SELF_DRIVE });

      await sweepDriverMissingAlerts(prisma);

      const notes = await prisma.notification.findMany({
        where: { tenantId: tenant, type: NOTIFICATION_TYPE.BOOKING_DRIVER_MISSING },
      });
      const alertedIds = new Set(notes.map((n) => n.targetId));
      expect(alertedIds.has(uncovered)).toBe(true);
      for (const id of [pendingLinked, external, far, past, selfDrive]) {
        expect(alertedIds.has(id)).toBe(false);
      }
      const toOwner = notes.find((n) => n.targetId === uncovered && n.userId === owner);
      expect(toOwner?.title).toContain('chưa có tài xế');
      expect(toOwner?.body).toContain('tài xế ngoài hệ thống');

      const row = await prisma.booking.findUniqueOrThrow({ where: { id: uncovered } });
      expect(row.driverMissingAlertedAt).not.toBeNull();
      expect(row.status).toBe(BOOKING_STATUS.RESERVED);
      expect(
        await prisma.auditLog.count({
          where: { targetId: uncovered, action: DRIVER_ASSIGNMENT_AUDIT_ACTION.MISSING_ALERTED },
        }),
      ).toBe(1);

      // Chạy lại: không báo lần hai.
      await sweepDriverMissingAlerts(prisma);
      expect(
        await prisma.notification.count({
          where: { targetId: uncovered, type: NOTIFICATION_TYPE.BOOKING_DRIVER_MISSING },
        }),
      ).toBe(notes.filter((n) => n.targetId === uncovered).length);
    },
  );

  maybe(
    'lượt liên kết QUÁ HẠN trong cửa sổ: tin hết hạn thay cho tin nhắc — không báo trùng',
    async () => {
      const bookingId = await seedBooking(new Date(Date.now() + 100 * MIN));
      const link = await seedDriverLink(asService, { tenantId: tenant });
      await bookings.assignDriver(tenant, bookingId, owner, link.driverId);
      await prisma.booking.update({
        where: { id: bookingId },
        data: { driverRespondBy: new Date(Date.now() - MIN) },
      });

      await sweepDriverAssignmentExpiry(prisma);
      await sweepDriverMissingAlerts(prisma);

      expect(
        await prisma.notification.count({
          where: { targetId: bookingId, type: NOTIFICATION_TYPE.DRIVER_TRIP_RESPONSE_EXPIRED },
        }),
      ).toBeGreaterThan(0);
      expect(
        await prisma.notification.count({
          where: { targetId: bookingId, type: NOTIFICATION_TYPE.BOOKING_DRIVER_MISSING },
        }),
      ).toBe(0);
    },
  );

  maybe('tài xế từ chối khi còn > 2 giờ: tới mốc 2 giờ vẫn được nhắc', async () => {
    const bookingId = await seedBooking(new Date(Date.now() + 5 * 60 * MIN));
    const link = await seedDriverLink(asService, { tenantId: tenant });
    await bookings.assignDriver(tenant, bookingId, owner, link.driverId);
    await drivers.respondToTrip(link.userId, bookingId, false);

    let row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.driverMissingAlertedAt).toBeNull();

    // Giờ nhận trôi vào cửa sổ (mô phỏng bằng cách kéo giờ nhận lại gần).
    await prisma.booking.update({
      where: { id: bookingId },
      data: { pickupAt: new Date(Date.now() + 60 * MIN) },
    });
    await sweepDriverMissingAlerts(prisma);
    row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.driverMissingAlertedAt).not.toBeNull();
  });
});
