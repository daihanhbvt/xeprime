import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  MEMBERSHIP_STATUS,
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
import { DriversService } from '../src/modules/drivers/drivers.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { NotificationService } from '../src/modules/notification/notification.service';
import type { PhoneVerificationService } from '../src/modules/phone-verification/phone-verification.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Wave 12 — hai lỗ hổng GHI được phát hiện khi soát toàn tuyến, trên PostgreSQL THẬT.
 *
 *  1. **Đơn đã khép vẫn sửa được.** `update()` và `updateDeliveryFee()` không hề nhìn trạng
 *     thái: một chuyến đã hoàn tất, đã quyết toán và đã hoàn cọc vẫn đổi được giờ thuê, tiền
 *     thuê và phí giao nhận — viết lại chính bản ghi mà hai bên đã dựa vào để trả tiền.
 *  2. **Chặn gửi trùng lách được bằng ĐỊNH DẠNG SĐT.** Index unique một phần so khớp chuỗi thô
 *     trên `customer_phone`, trong khi DTO nhận cả `0…` lẫn `+84…`.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const notifications = new NotificationService(asService);
const pricing = new PricingService(asService, audit, new ListingsService(asService));
const bookings = new BookingsService(
  asService,
  new OccupancyService(asService),
  audit,
  notifications,
  new DriversService(asService, audit),
  new CustomersService(asService, audit),
);

/**
 * Nhánh test không đi qua OTP hay đăng nhập: SĐT coi như đã xác thực, và khách vãng lai được
 * gán vào một tài khoản dựng sẵn. Hai stub này giữ test bám đúng luật CHẶN TRÙNG.
 */
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

const BASE = new Date('2027-03-02T02:00:00.000Z');
const hours = (n: number) => new Date(BASE.getTime() + n * 3_600_000);

let slot = 0;

async function seedBooking(status: string): Promise<string> {
  slot += 1;
  const id = newId();
  await prisma.booking.create({
    data: {
      id,
      tenantId,
      vehicleId,
      code: `DH-W12-${slot}`,
      customerName: 'Khách Test',
      status,
      pickupAt: hours(slot * 100),
      returnAt: hours(slot * 100 + 24),
      baseAmount: new Prisma.Decimal('1000000'),
      totalAmount: new Prisma.Decimal('1000000'),
    },
  });
  return id;
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
      name: 'Shop W12',
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
      code: 'V-W12',
      name: 'Toyota Vios 2024',
      vehicleType: VEHICLE_TYPE.CAR,
      // Xe phải công khai + shop active thì `submitPublic` mới nhận.
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      weekdayPrice: new Prisma.Decimal('500000'),
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
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

describe('Đơn đã khép là CHỈ ĐỌC', () => {
  const CLOSED = [BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW];

  maybe('không sửa được thông tin/giá của đơn đã kết thúc', async () => {
    for (const status of CLOSED) {
      const id = await seedBooking(status);
      await expect(
        bookings.update(tenantId, id, { baseAmount: '9999000', customerName: 'Đổi tên' }),
      ).rejects.toMatchObject({ status: 409 });
    }
  });

  maybe('không đổi được phí giao nhận sau khi chuyến đã quyết toán', async () => {
    for (const status of CLOSED) {
      const id = await seedBooking(status);
      await expect(
        bookings.updateDeliveryFee(tenantId, id, ownerId, { deliveryFee: '300000' }),
      ).rejects.toMatchObject({ status: 409 });
    }
  });

  maybe('chặn TRƯỚC khi ghi — số tiền trên đơn không hề nhúc nhích', async () => {
    const id = await seedBooking(BOOKING_STATUS.COMPLETED);
    await expect(
      bookings.updateDeliveryFee(tenantId, id, ownerId, { deliveryFee: '300000' }),
    ).rejects.toMatchObject({ status: 409 });

    const after = await prisma.booking.findUniqueOrThrow({
      where: { id },
      select: { deliveryFee: true, totalAmount: true },
    });
    expect(after.deliveryFee.toFixed(2)).toBe('0.00');
    expect(after.totalAmount.toFixed(2)).toBe('1000000.00');
  });

  maybe('đơn còn sống vẫn sửa bình thường — khoá đúng chỗ, không khoá tất', async () => {
    for (const status of [
      BOOKING_STATUS.RESERVED,
      BOOKING_STATUS.CONFIRMED,
      BOOKING_STATUS.ACTIVE,
    ]) {
      const id = await seedBooking(status);
      const updated = await bookings.updateDeliveryFee(tenantId, id, ownerId, {
        deliveryFee: '120000',
      });
      // So theo GIÁ TRỊ: DTO đơn trả chuỗi Decimal thô (`120000`), còn quyết toán dùng
      // `toFixed(2)` — cả hai đều hợp lệ theo ADR 0007 và `formatMoneyVnd` đọc được cả hai.
      expect(Number(updated.deliveryFee)).toBe(120_000);
      expect(Number(updated.totalAmount)).toBe(1_120_000);
    }
  });
});

describe('Chặn gửi yêu cầu trùng', () => {
  const submit = (phone: string, offsetHours: number) =>
    requests.submitPublic(
      {
        vehicleId,
        customerName: 'Nguyễn Văn A',
        customerPhone: phone,
        pickupAt: hours(offsetHours).toISOString(),
        returnAt: hours(offsetHours + 24).toISOString(),
      },
      null,
    );

  maybe('gửi lại y hệt → lỗi trùng', async () => {
    await submit('0901234567', 1000);
    await expect(submit('0901234567', 1000)).rejects.toMatchObject({ status: 409 });
  });

  /**
   * Lỗ hổng Wave 12: cột `customer_phone` cố ý giữ nguyên như người dùng gõ, còn index unique
   * một phần so khớp chuỗi thô — nên `+84…` và `0…` là hai dòng khác nhau với DB.
   */
  maybe('đổi ĐỊNH DẠNG SĐT không lách được — vẫn là cùng một người', async () => {
    await submit('0902223344', 2000);
    await expect(submit('+84902223344', 2000)).rejects.toMatchObject({ status: 409 });

    const rows = await prisma.bookingRequest.count({
      where: { vehicleId, pickupAt: hours(2000), returnAt: hours(2000 + 24) },
    });
    expect(rows).toBe(1);
  });

  maybe('khung giờ khác thì vẫn gửi được — không chặn nhầm', async () => {
    await submit('0903334455', 3000);
    await expect(submit('0903334455', 3100)).resolves.toBeTruthy();
  });

  maybe('yêu cầu cũ đã được xử lý thì không chặn lần sau', async () => {
    const receipt = await submit('0904445566', 4000);
    // Shop từ chối → khách được phép hỏi lại đúng khung giờ đó.
    await prisma.bookingRequest.update({
      where: { id: receipt.receipt.id },
      data: { status: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST },
    });

    await expect(submit('0904445566', 4000)).resolves.toBeTruthy();
  });
});
