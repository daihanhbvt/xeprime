import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  BOOKING_REQUEST_STATUS,
  MEMBERSHIP_STATUS,
  ROUTE_TYPE,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import type { AuthService } from '../src/modules/auth/auth.service';
import { BookingRequestsService } from '../src/modules/booking-requests/booking-requests.service';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { CustomersService } from '../src/modules/customers/customers.service';
import { ContractsService } from '../src/modules/contracts/contracts.service';
import { DriversService } from '../src/modules/drivers/drivers.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { NotificationService } from '../src/modules/notification/notification.service';
import type { PhoneVerificationService } from '../src/modules/phone-verification/phone-verification.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Hành trình chuyến CÓ TÀI XẾ đi trọn vòng đời (đợt hoàn thiện 17/08), trên PostgreSQL THẬT:
 *
 *   1. Yêu cầu → duyệt → Booking GIỮ nguyên lộ trình/địa chỉ đón/điểm đến (trước đây mất sạch
 *      — chỉ serviceType + tiền được copy).
 *   2. Đơn shop lập tay with_driver cũng phải nộp đủ hành trình; dịch vụ khác bị normalize
 *      về null.
 *   3. CHECK `bookings_route_context_service_check` ở DB là chốt chặn cuối — dữ liệu lệch bị
 *      từ chối kể cả khi một writer nào đó quên gọi normalize.
 *   4. Hợp đồng đóng băng hành trình vào snapshot.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const notifications = new NotificationService(asService);
const pricing = new PricingService(asService, audit);
const bookings = new BookingsService(
  asService,
  new OccupancyService(asService),
  audit,
  notifications,
  new DriversService(asService, audit),
  new CustomersService(asService, audit),
);
const contracts = new ContractsService(asService, audit);

const phoneVerification = {
  assertPhoneVerifiedForBooking: async () => {},
} as unknown as PhoneVerificationService;

let guestUserId: string;
const auth = {
  resolveOrCreateUserByPhone: async () => ({ userId: guestUserId }),
} as unknown as AuthService;

const requests = new BookingRequestsService(
  asService,
  bookings,
  audit,
  notifications,
  phoneVerification,
  auth,
  new OccupancyService(asService),
  pricing,
  new CustomersService(asService, audit),
);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let vehicleId: string;

const BASE = new Date('2027-06-01T02:00:00.000Z');
const hours = (n: number) => new Date(BASE.getTime() + n * 3_600_000);

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
  guestUserId = newId();
  tenantId = newId();
  vehicleId = newId();

  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ shop', email: `owner-${ownerId}@xeprime.test` },
      { id: guestUserId, displayName: 'Khách vãng lai', email: `g-${guestUserId}@xeprime.test` },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `TEST-${tenantId.slice(-8)}`,
      slug: `test-${tenantId.toLowerCase().slice(-8)}`,
      name: 'Shop Route',
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
      code: 'V-ROUTE',
      name: 'Toyota Innova 2024',
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      serviceTypes: [SERVICE_TYPE.SELF_DRIVE, SERVICE_TYPE.WITH_DRIVER],
      weekdayPrice: new Prisma.Decimal('700000'),
      withDriverDailyPrice: new Prisma.Decimal('1300000'),
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.contract.deleteMany({ where: { tenantId } });
    await prisma.bookingRequest.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.vehicleOccupancy.deleteMany({ where: { tenantId } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.notification.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, guestUserId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Yêu cầu → duyệt → đơn GIỮ nguyên hành trình', () => {
  maybe('with_driver liên tỉnh: route/địa chỉ đón/điểm đến sang đơn không mất', async () => {
    const { receipt } = await requests.submitPublic(
      {
        vehicleId,
        customerName: 'Nguyễn Văn A',
        customerPhone: '0901111222',
        pickupAt: hours(0).toISOString(),
        returnAt: hours(48).toISOString(),
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        routeType: ROUTE_TYPE.INTER_CITY,
        pickupAddress: '12 Lê Lợi, Q.1, TP.HCM',
        destination: 'TP. Đà Lạt, Lâm Đồng',
      },
      null,
    );

    const approved = await requests.approve(tenantId, ownerId, receipt.id);
    expect(approved.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
    expect(approved.bookingId).toBeTruthy();

    const booking = await bookings.getOne(tenantId, approved.bookingId!);
    expect(booking.serviceType).toBe(SERVICE_TYPE.WITH_DRIVER);
    expect(booking.routeType).toBe(ROUTE_TYPE.INTER_CITY);
    expect(booking.pickupAddress).toBe('12 Lê Lợi, Q.1, TP.HCM');
    expect(booking.destination).toBe('TP. Đà Lạt, Lâm Đồng');

    // Hợp đồng đóng băng hành trình vào snapshot — in ra là thấy, không phải quay lại yêu cầu.
    const contract = await contracts.createFromBooking(tenantId, ownerId, approved.bookingId!);
    expect(contract.snapshot.rental.routeType).toBe(ROUTE_TYPE.INTER_CITY);
    expect(contract.snapshot.rental.pickupAddress).toBe('12 Lê Lợi, Q.1, TP.HCM');
    expect(contract.snapshot.rental.destination).toBe('TP. Đà Lạt, Lâm Đồng');
  });
});

describe('Đơn lập tay: hành trình theo đúng điều kiện dịch vụ', () => {
  maybe('with_driver thiếu lộ trình/địa chỉ đón → 400', async () => {
    await expect(
      bookings.create(tenantId, ownerId, {
        vehicleId,
        customerName: 'Khách B',
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        pickupAt: hours(200).toISOString(),
        returnAt: hours(224).toISOString(),
      }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      bookings.create(tenantId, ownerId, {
        vehicleId,
        customerName: 'Khách B',
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        routeType: ROUTE_TYPE.INTER_CITY,
        pickupAddress: '1 Trần Phú, Nha Trang',
        // liên tỉnh thiếu điểm đến
        pickupAt: hours(200).toISOString(),
        returnAt: hours(224).toISOString(),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  maybe('nội thành: điểm đến bị normalize về null; tự lái: cả ba trường về null', async () => {
    const inCity = await bookings.create(tenantId, ownerId, {
      vehicleId,
      customerName: 'Khách C',
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      routeType: ROUTE_TYPE.IN_CITY,
      pickupAddress: '99 Hùng Vương, Đà Nẵng',
      destination: 'bị bỏ qua vì nội thành',
      pickupAt: hours(300).toISOString(),
      returnAt: hours(324).toISOString(),
    });
    expect(inCity.routeType).toBe(ROUTE_TYPE.IN_CITY);
    expect(inCity.pickupAddress).toBe('99 Hùng Vương, Đà Nẵng');
    expect(inCity.destination).toBeNull();

    const selfDrive = await bookings.create(tenantId, ownerId, {
      vehicleId,
      customerName: 'Khách D',
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      routeType: ROUTE_TYPE.INTER_CITY,
      pickupAddress: 'bị bỏ qua vì tự lái',
      destination: 'bị bỏ qua vì tự lái',
      pickupAt: hours(400).toISOString(),
      returnAt: hours(424).toISOString(),
    });
    expect(selfDrive.routeType).toBeNull();
    expect(selfDrive.pickupAddress).toBeNull();
    expect(selfDrive.destination).toBeNull();
  });

  maybe('rời with_driver khi sửa đơn → hành trình bị clear (CHECK DB không cho lệch)', async () => {
    const created = await bookings.create(tenantId, ownerId, {
      vehicleId,
      customerName: 'Khách E',
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      routeType: ROUTE_TYPE.IN_CITY,
      pickupAddress: '5 Nguyễn Huệ, Huế',
      pickupAt: hours(500).toISOString(),
      returnAt: hours(524).toISOString(),
    });

    const updated = await bookings.update(tenantId, created.id, {
      serviceType: SERVICE_TYPE.SELF_DRIVE,
    });
    expect(updated.serviceType).toBe(SERVICE_TYPE.SELF_DRIVE);
    expect(updated.routeType).toBeNull();
    expect(updated.pickupAddress).toBeNull();
    expect(updated.destination).toBeNull();
  });
});

describe('CHECK DB là chốt chặn cuối', () => {
  maybe('INSERT thô đơn tự lái mang route_type → constraint từ chối', async () => {
    await expect(
      prisma.booking.create({
        data: {
          id: newId(),
          tenantId,
          vehicleId,
          code: `DH-RAW-${Date.now()}`,
          customerName: 'Khách lệch',
          serviceType: SERVICE_TYPE.SELF_DRIVE,
          routeType: ROUTE_TYPE.IN_CITY,
          pickupAt: hours(600),
          returnAt: hours(624),
        },
      }),
    ).rejects.toThrow(/route_context|check/i);
  });
});
