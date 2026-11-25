import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  bookingRequestRespondBy,
  DRIVER_ASSIGNMENT_AUDIT_ACTION,
  DRIVER_SOURCE,
  MEMBERSHIP_STATUS,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { createValidationPipe } from '../src/bootstrap';
import { AuditService } from '../src/modules/audit/audit.service';
import { BankAccountsService } from '../src/modules/bank-accounts/bank-accounts.service';
import { AssignBookingDriverDto } from '../src/modules/bookings/dto/booking.dto';
import { SettlementService } from '../src/modules/bookings/settlement/settlement.service';
import { CancellationsService } from '../src/modules/cancellations/cancellations.service';
import { CustomerTripsService } from '../src/modules/customer-trips/customer-trips.service';
import { CreateInternalDriverDto } from '../src/modules/drivers/dto/internal-driver.dto';
import { ReceiptsService } from '../src/modules/finance/receipts.service';
import { InsuranceCertificateService } from '../src/modules/insurance/insurance-certificate.service';
import { InsuranceReadService } from '../src/modules/insurance/insurance-read.service';
import type { R2Service } from '../src/modules/storage/r2.service';
import { VehicleContractsService } from '../src/modules/vehicles/vehicle-contracts.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { cleanupDriverAccounts, seedDriverLink } from './helpers/driver-link';
import {
  makeBookingHoldsService,
  makeBookingsService,
  makeCustomersService,
  makeHoldSettlementService,
  makeInternalDriversService,
  makeNotificationService,
  makePricingService,
  makeSupportService,
  TEST_R2_PUBLIC_BASE_URL,
} from './helpers/service-factory';
import { releaseWalletObligations } from './helpers/wallet-cleanup';

/**
 * DANH BẠ TÀI XẾ NỘI BỘ (ADR 0108) — trên PostgreSQL THẬT.
 *
 *  1. Danh bạ: thêm, trùng SĐT đang dùng ⇒ 409, tìm, lưu trữ / khôi phục (khôi phục trùng SĐT ⇒ 409).
 *  2. Gán vào đơn `with_driver`: ảnh chụp tên + SĐT, `source = internal` phía bên thuê, `external`
 *     phía khách; khép lượt liên kết đang mở; bỏ gán xoá cả ba cột.
 *  3. Chặn trùng lịch: service báo `DRIVER_BUSY`; EXCLUDE ở DB chặn lượt ghi thẳng.
 *  4. Luật: đơn tự lái, người đã lưu trữ, id của bên thuê khác.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const internal = makeInternalDriversService(asService, audit);
const pricing = makePricingService(asService);
const bookings = makeBookingsService(asService, {
  audit,
  notifications,
  customers: makeCustomersService(asService, audit),
});
const receipts = new ReceiptsService(asService, audit);
const settlement = new SettlementService(asService, audit, pricing, notifications, receipts);
const trips = new CustomerTripsService(
  asService,
  settlement,
  pricing,
  bookings,
  makeBookingHoldsService(asService),
  new VehicleContractsService(asService, { privateEnabled: false } as unknown as R2Service, audit),
  makeHoldSettlementService(asService, audit, notifications),
  new BankAccountsService(asService),
  notifications,
  audit,
  new CancellationsService(),
  new InsuranceReadService(asService),
  makeSupportService(asService, notifications),
  new InsuranceCertificateService(asService, null),
);

const HOUR = 3_600_000;
let dbAvailable = false;
let owner: string;
let customer: string;
let tenant: string;
let otherTenant: string;
let vehicle: string;
let vehicle2: string;

let seq = 0;
async function seedBooking(
  pickupAt: Date,
  opts: { serviceType?: string; vehicleId?: string; withRequest?: boolean } = {},
): Promise<string> {
  seq += 1;
  const id = newId();
  const serviceType = opts.serviceType ?? SERVICE_TYPE.WITH_DRIVER;
  const withDriver = serviceType === SERVICE_TYPE.WITH_DRIVER;
  const returnAt = new Date(pickupAt.getTime() + 8 * HOUR);
  await prisma.booking.create({
    data: {
      id,
      tenantId: tenant,
      vehicleId: opts.vehicleId ?? vehicle,
      code: `DH-INT-${Date.now().toString(36)}-${seq}`,
      customerName: 'Khách tài xế nội bộ',
      customerPhone: `0966${String(100000 + seq).slice(-6)}`,
      serviceType,
      ...(withDriver ? { routeType: 'in_city', pickupAddress: '1 Lê Lợi' } : {}),
      status: BOOKING_STATUS.RESERVED,
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
        vehicleId: opts.vehicleId ?? vehicle,
        status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        serviceType,
        customerName: 'Khách tài xế nội bộ',
        customerPhone: `0966${String(100000 + seq).slice(-6)}`,
        customerUserId: customer,
        bookingId: id,
        pickupAt,
        returnAt,
      },
    });
  }
  return id;
}

let day = 0;
function farPickup(): Date {
  day += 1;
  return new Date(Date.UTC(2029, 5, 1 + day, 2));
}

let phoneSeq = 0;
function nextPhone(): string {
  phoneSeq += 1;
  return `0912${String(300000 + phoneSeq).slice(-6)}`;
}

async function addPerson(name = 'Tài xế Một', phone = nextPhone()) {
  return internal.create(tenant, owner, { name, phone });
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
  otherTenant = newId();
  vehicle = newId();
  vehicle2 = newId();
  await prisma.user.createMany({
    data: [
      {
        realm: ACCOUNT_REALM.PARTNER,
        id: owner,
        displayName: 'Chủ danh bạ',
        email: `drv-int-${owner}@xeprime.test`,
      },
      {
        realm: ACCOUNT_REALM.CUSTOMER,
        id: customer,
        displayName: 'Khách danh bạ',
        email: `drv-int-cus-${customer}@xeprime.test`,
      },
    ],
  });
  for (const id of [tenant, otherTenant]) {
    await prisma.tenant.create({
      data: {
        id,
        code: `T-${id.slice(-8)}`,
        slug: `t-${id.toLowerCase().slice(-10)}`,
        name: 'Shop danh bạ tài xế',
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: owner,
        driverDailyWage: new Prisma.Decimal('500000'),
      },
    });
  }
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId: tenant,
      userId: owner,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });
  for (const id of [vehicle, vehicle2]) {
    await prisma.vehicle.create({
      data: {
        id,
        tenantId: tenant,
        code: `V-INT-${id.slice(-6)}`,
        name: 'Innova có tài',
        vehicleType: VEHICLE_TYPE.CAR,
        serviceTypes: [SERVICE_TYPE.WITH_DRIVER, SERVICE_TYPE.SELF_DRIVE],
        withDriverDailyPrice: new Prisma.Decimal('1300000'),
      },
    });
  }
});

afterAll(async () => {
  if (dbAvailable) {
    const tenants = [tenant, otherTenant];
    await prisma.bookingDriverAssignment.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.bookingRequest.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.booking.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.tenantInternalDriver.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.notification.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.driver.deleteMany({ where: { tenantId: { in: tenants } } });
    await cleanupDriverAccounts(asService);
    await releaseWalletObligations(prisma, { tenantIds: tenants, userIds: [owner, customer] });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
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

describe('DTO', () => {
  it('PATCH /bookings/:id/driver nhận internalDriverId, từ chối gửi kèm driverId', async () => {
    const pipe = createValidationPipe();
    const meta = { type: 'body' as const, metatype: AssignBookingDriverDto };
    await expect(pipe.transform({ internalDriverId: newId() }, meta)).resolves.toBeDefined();
    await expect(
      pipe.transform({ internalDriverId: newId(), driverId: null }, meta),
    ).rejects.toThrow();
    await expect(pipe.transform({ internalDriverId: 'ngắn' }, meta)).rejects.toThrow();
    await expect(pipe.transform({}, meta)).rejects.toThrow();
  });

  it('tạo tài xế: cắt khoảng trắng tên, quy +84 về 0…, chặn số bàn', async () => {
    const pipe = createValidationPipe();
    const meta = { type: 'body' as const, metatype: CreateInternalDriverDto };
    await expect(
      pipe.transform({ name: '  Lê Văn Lái  ', phone: '+84912000111', note: '  ' }, meta),
    ).resolves.toEqual(
      expect.objectContaining({ name: 'Lê Văn Lái', phone: '0912000111', note: null }),
    );
    await expect(pipe.transform({ name: 'A', phone: '0912000111' }, meta)).rejects.toThrow();
    await expect(pipe.transform({ name: 'Lê Lái', phone: '02838123456' }, meta)).rejects.toThrow();
  });
});

describe('Danh bạ', () => {
  maybe('thêm, trùng SĐT đang dùng ⇒ 409, tìm theo tên và SĐT', async () => {
    const phone = nextPhone();
    const p = await addPerson('Phạm Văn Danh', phone);
    expect(p).toMatchObject({ name: 'Phạm Văn Danh', phone, archivedAt: null, activeTripCount: 0 });
    await expect(addPerson('Người khác', phone)).rejects.toMatchObject(
      code(API_ERROR_CODE.INTERNAL_DRIVER_PHONE_TAKEN),
    );
    const byName = await internal.list(tenant, { q: 'danh' });
    expect(byName.data.map((d) => d.id)).toContain(p.id);
    const byPhone = await internal.list(tenant, { q: phone.slice(-6) });
    expect(byPhone.data.map((d) => d.id)).toContain(p.id);
    // Bên thuê khác không thấy.
    expect((await internal.list(otherTenant, {})).data).toHaveLength(0);
  });

  maybe('lưu trữ nhả SĐT; khôi phục khi SĐT đã bị dòng khác chiếm ⇒ 409', async () => {
    const phone = nextPhone();
    const first = await addPerson('Lưu Trữ', phone);
    const archived = await internal.archive(tenant, owner, first.id);
    expect(archived.archivedAt).not.toBeNull();
    expect((await internal.list(tenant, {})).data.map((d) => d.id)).not.toContain(first.id);
    expect((await internal.list(tenant, { archived: true })).data.map((d) => d.id)).toContain(
      first.id,
    );
    // Lưu trữ lần nữa là no-op.
    await expect(internal.archive(tenant, owner, first.id)).resolves.toMatchObject({
      id: first.id,
    });
    // Sửa người đã lưu trữ ⇒ 409.
    await expect(
      internal.update(tenant, owner, first.id, { name: 'Đổi tên' }),
    ).rejects.toMatchObject(code(API_ERROR_CODE.INTERNAL_DRIVER_ARCHIVED));
    const second = await addPerson('Người mới cùng số', phone);
    await expect(internal.restore(tenant, owner, first.id)).rejects.toMatchObject(
      code(API_ERROR_CODE.INTERNAL_DRIVER_PHONE_TAKEN),
    );
    await internal.archive(tenant, owner, second.id);
    await expect(internal.restore(tenant, owner, first.id)).resolves.toMatchObject({
      archivedAt: null,
    });
  });

  maybe('id của bên thuê khác ⇒ 404', async () => {
    const p = await addPerson();
    await expect(
      internal.update(otherTenant, owner, p.id, { name: 'Lấn sân' }),
    ).rejects.toMatchObject(code(API_ERROR_CODE.INTERNAL_DRIVER_NOT_FOUND));
  });

  maybe('ảnh tuỳ chọn: chỉ nhận ảnh vừa tải lên kho của CHÍNH bên thuê; gỡ bằng null', async () => {
    const own = `${TEST_R2_PUBLIC_BASE_URL}/tenants/${tenant}/drivers/${newId()}-avatar.jpg`;
    const foreign = `${TEST_R2_PUBLIC_BASE_URL}/tenants/${otherTenant}/drivers/${newId()}-a.jpg`;
    const created = await internal.create(tenant, owner, {
      name: 'Có Ảnh',
      phone: nextPhone(),
      photoUrl: own,
    });
    expect(created.photoUrl).toBe(own);
    // Không ảnh vẫn tạo được (ảnh KHÔNG bắt buộc).
    await expect(addPerson('Không Ảnh')).resolves.toMatchObject({ photoUrl: null });
    for (const bad of [
      foreign,
      'https://evil.example/tenants/x/drivers/a.jpg',
      `${TEST_R2_PUBLIC_BASE_URL}/tenants/${tenant}/vehicles/${newId()}-xe.jpg`,
    ]) {
      await expect(
        internal.update(tenant, owner, created.id, { photoUrl: bad }),
      ).rejects.toMatchObject(code(API_ERROR_CODE.INTERNAL_DRIVER_PHOTO_INVALID));
    }
    // Gửi lại đúng ảnh đang có (form sửa giữ nguyên) không bị kiểm lại.
    await expect(
      internal.update(tenant, owner, created.id, { photoUrl: own, name: 'Có Ảnh Mới' }),
    ).resolves.toMatchObject({ photoUrl: own, name: 'Có Ảnh Mới' });
    await expect(
      internal.update(tenant, owner, created.id, { photoUrl: null }),
    ).resolves.toMatchObject({ photoUrl: null });
  });

  maybe('trang chi tiết: đơn đang gán + bảng chuyến theo tháng trả xe, tìm + lọc', async () => {
    const p = await addPerson('Chi Tiết Nội Bộ');
    const pickupAt = new Date(Date.UTC(2029, 8, 10, 2));
    const bookingId = await seedBooking(pickupAt);
    await bookings.assignInternalDriver(tenant, bookingId, owner, p.id);

    const detail = await internal.detail(tenant, p.id);
    expect(detail.driver.activeTripCount).toBe(1);
    expect(detail.current).toEqual([
      expect.objectContaining({
        bookingId,
        customerName: 'Khách tài xế nội bộ',
        assignmentStatus: null,
        wageAmount: null,
      }),
    ]);

    const month = '2029-09';
    const all = await internal.trips(tenant, p.id, { month });
    expect(all.data.map((r) => r.bookingId)).toEqual([bookingId]);
    const bookingCode = all.data[0]!.bookingCode;
    expect((await internal.trips(tenant, p.id, { month, q: bookingCode })).meta.total).toBe(1);
    expect((await internal.trips(tenant, p.id, { month, q: 'không-khớp-gì' })).meta.total).toBe(0);
    expect(
      (await internal.trips(tenant, p.id, { month, status: BOOKING_STATUS.COMPLETED })).meta.total,
    ).toBe(0);
    // Tháng khác không có chuyến; bên thuê khác không đọc được.
    expect((await internal.trips(tenant, p.id, { month: '2029-10' })).meta.total).toBe(0);
    await expect(internal.detail(otherTenant, p.id)).rejects.toMatchObject(
      code(API_ERROR_CODE.INTERNAL_DRIVER_NOT_FOUND),
    );
  });
});

describe('Gán vào đơn', () => {
  maybe(
    'chụp tên + SĐT, source internal (bên thuê) / external (khách), audit che PII',
    async () => {
      const p = await addPerson('Trần Văn Nội');
      const bookingId = await seedBooking(farPickup(), { withRequest: true });
      const detail = await bookings.assignInternalDriver(tenant, bookingId, owner, p.id);
      expect(detail.driver).toMatchObject({
        source: DRIVER_SOURCE.INTERNAL,
        id: p.id,
        name: 'Trần Văn Nội',
        phone: p.phone,
      });
      const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
      expect(row).toMatchObject({
        internalDriverId: p.id,
        externalDriverName: 'Trần Văn Nội',
        externalDriverPhone: p.phone,
        driverId: null,
      });
      expect(row.driverAssignedAt).not.toBeNull();

      const renter = await trips.detail(customer, bookingId);
      expect(renter.driver).toMatchObject({
        source: DRIVER_SOURCE.EXTERNAL,
        id: null,
        name: 'Trần Văn Nội',
      });

      // Sửa danh bạ KHÔNG viết lại đơn đã gán.
      await internal.update(tenant, owner, p.id, { name: 'Tên Mới' });
      expect((await bookings.getOne(tenant, bookingId)).driver?.name).toBe('Trần Văn Nội');

      const log = await prisma.auditLog.findFirstOrThrow({
        where: { targetId: bookingId, action: DRIVER_ASSIGNMENT_AUDIT_ACTION.INTERNAL_SET },
      });
      expect(JSON.stringify(log.afterJson)).not.toContain(p.phone);

      // Danh sách đếm chuyến đang mở.
      expect((await internal.list(tenant, { q: p.phone })).data[0]?.activeTripCount).toBe(1);
    },
  );

  maybe('gán tài xế nội bộ khép lượt liên kết đang mở; bỏ gán xoá cả ba cột', async () => {
    const link = await seedDriverLink(asService, { tenantId: tenant });
    const bookingId = await seedBooking(farPickup());
    await bookings.assignDriver(tenant, bookingId, owner, link.driverId, null);
    const p = await addPerson();
    const detail = await bookings.assignInternalDriver(tenant, bookingId, owner, p.id);
    expect(detail.driver?.source).toBe(DRIVER_SOURCE.INTERNAL);
    const open = await prisma.bookingDriverAssignment.count({
      where: { bookingId, outcome: 'open' },
    });
    expect(open).toBe(0);

    const cleared = await bookings.assignDriver(tenant, bookingId, owner, null, null);
    expect(cleared.driver).toBeNull();
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row).toMatchObject({
      internalDriverId: null,
      externalDriverName: null,
      externalDriverPhone: null,
      driverAssignedAt: null,
    });
  });

  maybe('gán tài xế liên kết lên đơn đang có tài xế nội bộ thì xoá tài xế nội bộ', async () => {
    const link = await seedDriverLink(asService, { tenantId: tenant });
    const p = await addPerson();
    const bookingId = await seedBooking(farPickup());
    await bookings.assignInternalDriver(tenant, bookingId, owner, p.id);
    const detail = await bookings.assignDriver(tenant, bookingId, owner, link.driverId, null);
    expect(detail.driver?.source).toBe(DRIVER_SOURCE.LINKED);
    const row = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.internalDriverId).toBeNull();
    expect(row.externalDriverName).toBeNull();
  });

  maybe(
    'trùng giờ ⇒ DRIVER_BUSY; bộ chọn đánh dấu bận; EXCLUDE chặn lượt ghi thẳng DB',
    async () => {
      const p = await addPerson('Bận Rộn');
      const start = farPickup();
      const a = await seedBooking(start);
      const b = await seedBooking(new Date(start.getTime() + 2 * HOUR), { vehicleId: vehicle2 });
      await bookings.assignInternalDriver(tenant, a, owner, p.id);
      await expect(bookings.assignInternalDriver(tenant, b, owner, p.id)).rejects.toMatchObject(
        code(API_ERROR_CODE.DRIVER_BUSY),
      );

      const picker = await internal.assignable(tenant, {
        pickupAt: new Date(start.getTime() + 2 * HOUR).toISOString(),
        returnAt: new Date(start.getTime() + 10 * HOUR).toISOString(),
        excludeBookingId: b,
      });
      expect(picker.data.find((d) => d.id === p.id)?.busy).toBe(true);
      // Chính đơn đang gán không tự coi là bận.
      const own = await internal.assignable(tenant, {
        pickupAt: start.toISOString(),
        returnAt: new Date(start.getTime() + 8 * HOUR).toISOString(),
        excludeBookingId: a,
      });
      expect(own.data.find((d) => d.id === p.id)?.busy).toBe(false);

      await expect(
        prisma.booking.update({
          where: { id: b },
          data: {
            internalDriverId: p.id,
            externalDriverName: p.name,
            externalDriverPhone: p.phone,
            driverAssignedAt: new Date(),
          },
        }),
      ).rejects.toThrow(/bookings_internal_driver_schedule_excl/);

      // Đơn đầu huỷ ⇒ lịch nhả, gán được.
      await prisma.booking.update({ where: { id: a }, data: { status: BOOKING_STATUS.CANCELLED } });
      await expect(bookings.assignInternalDriver(tenant, b, owner, p.id)).resolves.toBeDefined();
    },
  );

  maybe('đơn tự lái ⇒ 422; người đã lưu trữ ⇒ 409; id bên thuê khác ⇒ 404', async () => {
    const p = await addPerson();
    const selfDrive = await seedBooking(farPickup(), { serviceType: SERVICE_TYPE.SELF_DRIVE });
    await expect(
      bookings.assignInternalDriver(tenant, selfDrive, owner, p.id),
    ).rejects.toMatchObject(code(API_ERROR_CODE.DRIVER_ASSIGN_SERVICE_NOT_SUPPORTED));

    const bookingId = await seedBooking(farPickup());
    const gone = await addPerson();
    await internal.archive(tenant, owner, gone.id);
    await expect(
      bookings.assignInternalDriver(tenant, bookingId, owner, gone.id),
    ).rejects.toMatchObject(code(API_ERROR_CODE.INTERNAL_DRIVER_ARCHIVED));

    const foreign = await internal.create(otherTenant, owner, {
      name: 'Bên khác',
      phone: nextPhone(),
    });
    await expect(
      bookings.assignInternalDriver(tenant, bookingId, owner, foreign.id),
    ).rejects.toMatchObject(code(API_ERROR_CODE.INTERNAL_DRIVER_NOT_FOUND));
  });

  maybe('CHECK DB: có internal_driver_id mà mất ảnh chụp ⇒ từ chối', async () => {
    const p = await addPerson();
    const bookingId = await seedBooking(farPickup());
    await bookings.assignInternalDriver(tenant, bookingId, owner, p.id);
    await expect(
      prisma.booking.update({
        where: { id: bookingId },
        data: { externalDriverName: null, externalDriverPhone: null },
      }),
    ).rejects.toThrow(/bookings_internal_driver_snapshot_check|bookings_driver_assignment/);
  });
});
