import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
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
 * Wave 12 — hai lỗ hổng GHI được phát hiện khi soát toàn tuyến, trên PostgreSQL THẬT.
 *
 *  1. **Đơn đã khép vẫn sửa được.** `update()` và `updateDeliveryFee()` không hề nhìn trạng
 *     thái: một chuyến đã hoàn tất, đã quyết toán và đã hoàn cọc vẫn đổi được giờ thuê, tiền
 *     thuê và phí giao nhận — viết lại chính bản ghi mà hai bên đã dựa vào để trả tiền.
 *  2. **Chặn gửi trùng lách được bằng ĐỊNH DẠNG SĐT.** Index unique một phần so khớp chuỗi thô
 *     trên `customer_phone`, trong khi DTO từng nhận cả `0…` lẫn `+84…`. Từ ADR 0060 SĐT của yêu
 *     cầu đọc từ TÀI KHOẢN (luôn ghi dạng nội địa), còn SĐT trong payload bị bỏ qua — spec khoá
 *     rằng payload không còn là một ngả để lách.
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

const requests = makeBookingRequestsService(asService, {
  bookings: bookings,
  audit: audit,
  notifications: notifications,
  pricing: pricing,
  customers: makeCustomersService(asService, audit),
});

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let vehicleId: string;

/** Tài khoản khách đã gửi yêu cầu trong spec — dọn ở `afterAll`. */
const customerIds = new Set<string>();
/**
 * Người gửi yêu cầu: một tài khoản KHÁCH đã xác minh SĐT (ADR 0060) — mỗi số một người, nên
 * chặn trùng (khoá theo SĐT của tài khoản) thấy đúng người đang gửi lại.
 */
async function customer(name: string, phone: string): Promise<string> {
  const id = await customerAccountFor(asService, phone, name);
  customerIds.add(id);
  return id;
}

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
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, ...customerIds] } } });
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
    for (const status of [BOOKING_STATUS.RESERVED, BOOKING_STATUS.ACTIVE]) {
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
  /**
   * `payloadPhone` là trường ĐÃ GỠ (ADR 0060) mà bản app cũ vẫn gửi — truyền vào để chứng minh
   * server bỏ qua nó. Bỏ trống ở mọi ca không nói về chuyện đó.
   */
  const submit = (customerUserId: string, offsetHours: number, payloadPhone?: string) =>
    requests.submitPublic(
      {
        vehicleId,
        ...(payloadPhone === undefined ? {} : { customerPhone: payloadPhone }),
        pickupAt: hours(offsetHours).toISOString(),
        returnAt: hours(offsetHours + 24).toISOString(),
      },
      customerUserId,
    );

  maybe('gửi lại y hệt → lỗi trùng', async () => {
    const id = await customer('Nguyễn Văn A', '0901234567');
    await submit(id, 1000);
    await expect(submit(id, 1000)).rejects.toMatchObject({ status: 409 });
  });

  /**
   * Lỗ hổng Wave 12: index unique một phần so khớp chuỗi thô trên `customer_phone` — nên `+84…`
   * và `0…` là hai dòng khác nhau với DB.
   *
   * Từ ADR 0060 SĐT của yêu cầu là SĐT ĐÃ XÁC MINH của TÀI KHOẢN, luôn ghi dạng nội địa; SĐT
   * trong payload bị bỏ qua. Đổi định dạng — hay đổi hẳn số — trong payload vì thế không còn là
   * một ngả lách: cùng tài khoản là cùng một người.
   */
  maybe('đổi SĐT trong payload không lách được — danh tính đọc từ tài khoản', async () => {
    const id = await customer('Nguyễn Văn A', '0902223344');
    await submit(id, 2000);
    await expect(submit(id, 2000, '+84902223344')).rejects.toMatchObject({ status: 409 });
    await expect(submit(id, 2000, '0911112222')).rejects.toMatchObject({ status: 409 });

    const rows = await prisma.bookingRequest.findMany({
      where: { vehicleId, pickupAt: hours(2000), returnAt: hours(2000 + 24) },
      select: { customerPhone: true },
    });
    expect(rows).toHaveLength(1);
    // Dạng nội địa của số tài khoản (`users.phone` lưu `84…`) — đúng dạng index chống trùng so.
    expect(rows[0]!.customerPhone).toBe('0902223344');
  });

  maybe('khung giờ khác thì vẫn gửi được — không chặn nhầm', async () => {
    const id = await customer('Nguyễn Văn A', '0903334455');
    await submit(id, 3000);
    await expect(submit(id, 3100)).resolves.toBeTruthy();
  });

  maybe('yêu cầu cũ đã được xử lý thì không chặn lần sau', async () => {
    const id = await customer('Nguyễn Văn A', '0904445566');
    const receipt = await submit(id, 4000);
    // Shop từ chối → khách được phép hỏi lại đúng khung giờ đó.
    await prisma.bookingRequest.update({
      where: { id: receipt.id },
      data: { status: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST },
    });

    await expect(submit(id, 4000)).resolves.toBeTruthy();
  });
});

describe('Người gửi phải là tài khoản khách đã xác minh SĐT (ADR 0060)', () => {
  /**
   * Tài khoản có số nhưng CHƯA qua OTP (tạo trước ADR 0060): gian hàng sẽ gọi vào số đó, và chặn
   * trùng/sổ khách khoá theo nó — nên số chưa chứng minh sở hữu thì chưa gửi được. Cổng nằm
   * TRƯỚC transaction ghi: không có yêu cầu nào sinh ra.
   */
  maybe('SĐT chưa xác minh → 403 PHONE_NOT_VERIFIED, không ghi yêu cầu', async () => {
    const id = await customer('Khách chưa xác minh', '0905556677');
    await prisma.user.update({ where: { id }, data: { phoneVerifiedAt: null } });

    await expect(
      requests.submitPublic(
        {
          vehicleId,
          pickupAt: hours(5000).toISOString(),
          returnAt: hours(5000 + 24).toISOString(),
        },
        id,
      ),
    ).rejects.toMatchObject({
      status: 403,
      response: { code: API_ERROR_CODE.PHONE_NOT_VERIFIED },
    });
    expect(await prisma.bookingRequest.count({ where: { vehicleId, pickupAt: hours(5000) } })).toBe(
      0,
    );
  });
});
