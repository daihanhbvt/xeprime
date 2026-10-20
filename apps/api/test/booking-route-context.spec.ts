import { BadRequestException } from '@nestjs/common';
import { createValidationPipe } from '../src/bootstrap';
import { UpdateBookingDto } from '../src/modules/bookings/dto/booking.dto';
import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import { giveTenantPlan } from './helpers/billing-fixture';
import {
  ACCOUNT_REALM,
  BILLING_MODE,
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
import { BankAccountsService } from '../src/modules/bank-accounts/bank-accounts.service';
import { ContractsService } from '../src/modules/contracts/contracts.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { customerAccountFor } from './helpers/customer-account';
import {
  makeBookingRequestsService,
  makeBookingsService,
  makeCustomersService,
  makeNotificationService,
  makePricingService,
} from './helpers/service-factory';

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
const notifications = makeNotificationService(asService);
const pricing = makePricingService(asService);
const bookings = makeBookingsService(asService, {
  occupancy: new OccupancyService(asService),
  audit: audit,
  notifications: notifications,
  customers: makeCustomersService(asService, audit),
});
const contracts = new ContractsService(asService, audit, new BankAccountsService(asService));

const requests = makeBookingRequestsService(asService, {
  bookings: bookings,
  audit: audit,
  notifications: notifications,
  pricing: pricing,
  customers: makeCustomersService(asService, audit),
});

let dbAvailable = false;
let ownerId: string;
/** Người gửi yêu cầu — tài khoản KHÁCH đã xác minh SĐT (ADR 0060). */
let customerId: string;
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
  tenantId = newId();
  vehicleId = newId();

  await prisma.user.createMany({
    data: [
      {
        realm: ACCOUNT_REALM.PARTNER,
        id: ownerId,
        displayName: 'Chủ shop',
        email: `owner-${ownerId}@xeprime.test`,
      },
    ],
  });
  customerId = await customerAccountFor(asService, '0901111222', 'Nguyễn Văn A');
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
  await giveTenantPlan(prisma, tenantId, { billingMode: BILLING_MODE.PACKAGE });
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
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, customerId] } } });
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
    const receipt = await requests.submitPublic(
      {
        vehicleId,
        pickupAt: hours(0).toISOString(),
        returnAt: hours(48).toISOString(),
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        routeType: ROUTE_TYPE.INTER_CITY,
        pickupAddress: '12 Lê Lợi, Q.1, TP.HCM',
        destination: 'TP. Đà Lạt, Lâm Đồng',
      },
      customerId,
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

describe('Lời nhắn của khách cho chủ xe', () => {
  const submitWithNote = (note: string, startHour: number) =>
    requests.submitPublic(
      {
        vehicleId,
        pickupAt: hours(startHour).toISOString(),
        returnAt: hours(startHour + 48).toISOString(),
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        routeType: ROUTE_TYPE.IN_CITY,
        pickupAddress: '12 Lê Lợi, Q.1, TP.HCM',
        note,
      },
      customerId,
    );

  maybe('lưu lời nhắn đã cắt khoảng trắng hai đầu', async () => {
    const receipt = await submitWithNote('  Cần ghế trẻ em cho bé 2 tuổi  ', 300);
    const saved = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(saved.note).toBe('Cần ghế trẻ em cho bé 2 tuổi');
  });

  maybe('chỉ có khoảng trắng ⇒ không có lời nhắn (null), không phải chuỗi rỗng', async () => {
    const receipt = await submitWithNote('   \n  ', 400);
    const saved = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(saved.note).toBeNull();
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

  /*
   * 19/10/2026: Sửa đơn chỉ còn tên/SĐT khách, cọc và ghi chú — dịch vụ + hành trình đóng băng
   * lúc tạo. Pipe từ chối trường lạ ở cửa HTTP; service bỏ qua nếu ai gọi thẳng.
   */
  maybe('sửa đơn KHÔNG đổi được dịch vụ / hành trình (đóng băng lúc tạo)', async () => {
    const created = await bookings.create(tenantId, ownerId, {
      vehicleId,
      customerName: 'Khách E',
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      routeType: ROUTE_TYPE.IN_CITY,
      pickupAddress: '5 Nguyễn Huệ, Huế',
      pickupAt: hours(500).toISOString(),
      returnAt: hours(524).toISOString(),
    });

    await expect(
      createValidationPipe().transform(
        { serviceType: SERVICE_TYPE.SELF_DRIVE, customerName: 'Khách E2' },
        { type: 'body', metatype: UpdateBookingDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const updated = await bookings.update(tenantId, created.id, {
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      customerName: 'Khách E2',
    } as UpdateBookingDto);
    expect(updated.customerName).toBe('Khách E2');
    expect(updated.serviceType).toBe(SERVICE_TYPE.WITH_DRIVER);
    expect(updated.routeType).toBe(ROUTE_TYPE.IN_CITY);
    expect(updated.pickupAddress).toContain('Nguyễn Huệ');
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
