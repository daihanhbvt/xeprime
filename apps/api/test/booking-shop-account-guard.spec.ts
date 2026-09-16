import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BILLING_MODE,
  BOOKING_REQUEST_STATUS,
  MEMBERSHIP_STATUS,
  PICKUP_PREFERENCE,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';

import { giveTenantPlan } from './helpers/billing-fixture';
import { AuditService } from '../src/modules/audit/audit.service';
import type { AuthService } from '../src/modules/auth/auth.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import type { PhoneVerificationService } from '../src/modules/phone-verification/phone-verification.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeBookingRequestsService,
  makeBookingsService,
  makeCustomersService,
  makeNotificationService,
  makePricingService,
} from './helpers/service-factory';

/**
 * F4 + F5 — TÀI KHOẢN GIAN HÀNG KHÔNG ĐẶT XE, VÀ KHÔNG AI TỰ THUÊ XE CỦA MÌNH.
 *
 * Bốn ca của quyết định sản phẩm, trên PostgreSQL thật:
 *
 *  1. Gian hàng tuyến GÓI đang đăng nhập gọi thẳng API  → 403 SHOP_ACCOUNT_CANNOT_BOOK
 *  2. Gian hàng ĐĂNG XUẤT rồi đặt bằng OTP cùng SĐT     → 403, và KHÔNG cấp phiên
 *  3. Tài khoản khách thuê khác (SĐT khác)              → QUA
 *  4. Chủ xe đặt xe của CHÍNH tenant mình               → 409 CANNOT_BOOK_OWN_VEHICLE
 *
 * Ca 2 là ca dễ trượt nhất: `users.phone` là unique, nên `resolveOrCreateUserByPhone` tìm LẠI
 * đúng tài khoản gian hàng và controller sẽ cấp phiên cho nó. Một cổng chỉ đặt ở nhánh "đang
 * đăng nhập" đi vòng qua hoàn toàn. Ở đây gọi thẳng service (không qua controller) và khẳng định
 * `loginUserId` không bao giờ được trả về — đó chính là thứ controller dùng để cấp phiên.
 *
 * Cộng thêm: chủ xe tuyến HOA HỒNG **được** thuê xe của gian hàng khác (ADR 0032 điều 1), và
 * cổng chạy đúng ở cả ba loại dịch vụ (tự lái, có tài xế, dài hạn).
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const pricing = makePricingService(asService);
const occupancy = new OccupancyService(asService);
const customers = makeCustomersService(asService, audit);
const bookings = makeBookingsService(asService, { occupancy, audit, notifications, customers });

const phoneVerification = {
  assertPhoneVerifiedForBooking: async () => {},
} as unknown as PhoneVerificationService;

/** Khớp SĐT → tài khoản, đúng như `AuthService.resolveOrCreateUserByPhone` làm thật. */
const auth = {
  resolveOrCreateUserByPhone: async (rawPhone: string) => {
    const phone = rawPhone.startsWith('0') ? `84${rawPhone.slice(1)}` : rawPhone;
    const found = await prisma.user.findFirst({ where: { phone }, select: { id: true } });
    if (found) return { userId: found.id, created: false };
    const id = newId();
    await prisma.user.create({
      data: { id, phone, displayName: 'Khách mới', phoneVerifiedAt: new Date() },
    });
    createdUserIds.push(id);
    return { userId: id, created: true };
  },
} as unknown as AuthService;

const requests = makeBookingRequestsService(asService, {
  bookings,
  audit,
  notifications,
  phoneVerification,
  auth,
  occupancy,
  pricing,
  customers,
});

const RUN = newId().slice(-8).toLowerCase();
const DAY = 86_400_000;

let dbAvailable = false;
const userIds: string[] = [];
const createdUserIds: string[] = [];
const tenantIds: string[] = [];

/** Gian hàng tuyến GÓI — chủ, quản lý, nhân viên, người xem; xe đang bán trên chợ. */
let shopTenantId: string;
let shopVehicleId: string;
const shopMembers: Record<string, { userId: string; phone: string }> = {};

/** Chủ xe tuyến HOA HỒNG — được đi thuê xe của người khác. */
let liteTenantId: string;
let liteOwnerId: string;
let liteVehicleId: string;

/** Khách thuê thuần. */
let renterId: string;

async function mkUser(tag: string, phone: string): Promise<string> {
  const id = newId();
  await prisma.user.create({
    data: {
      id,
      displayName: `BSG ${tag}`,
      email: `bsg-${tag}-${RUN}@xeprime.test`,
      phone,
      phoneVerifiedAt: new Date(),
    },
  });
  userIds.push(id);
  return id;
}

async function mkTenantWithVehicle(
  tag: string,
  ownerUserId: string,
  billingMode: string,
): Promise<{ tenantId: string; vehicleId: string }> {
  const tenantId = newId();
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `BSG-${tenantId.slice(-8)}`,
      slug: `bsg-${tenantId.toLowerCase().slice(-10)}`,
      name: `Shop ${tag} ${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId,
    },
  });
  tenantIds.push(tenantId);
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerUserId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });
  await giveTenantPlan(prisma, tenantId, {
    billingMode: billingMode as 'commission' | 'package',
  });

  const vehicleId = newId();
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: `XE${vehicleId.slice(-5)}`,
      name: `Xe ${tag}`,
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      serviceTypes: [SERVICE_TYPE.SELF_DRIVE, SERVICE_TYPE.WITH_DRIVER, SERVICE_TYPE.LONG_TERM],
      weekdayPrice: new Prisma.Decimal('700000'),
      weekendPrice: new Prisma.Decimal('700000'),
      withDriverDailyPrice: new Prisma.Decimal('1200000'),
      monthlyPrice: new Prisma.Decimal('12000000'),
      createdBy: ownerUserId,
    },
  });
  return { tenantId, vehicleId };
}

/** `offsetDays` ngày nữa lúc `hourVn` giờ Việt Nam. */
function vnAt(offsetDays: number, hourVn: number): Date {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + offsetDays);
  base.setUTCHours(hourVn - 7, 0, 0, 0);
  return base;
}

/**
 * Gửi yêu cầu đúng hình dạng mà controller công khai truyền xuống.
 * `customerUserId = undefined` mô phỏng người ĐÃ ĐĂNG XUẤT — danh tính chỉ đến từ SĐT.
 */
function submit(
  vehicleId: string,
  phone: string,
  customerUserId?: string,
  overrides: Record<string, unknown> = {},
) {
  return requests.submitPublic(
    {
      vehicleId,
      customerName: 'Người đặt',
      customerPhone: phone,
      pickupAt: vnAt(3, 9).toISOString(),
      returnAt: vnAt(4, 9).toISOString(),
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      acceptedTerms: true,
      ...overrides,
    } as never,
    customerUserId,
  );
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

  for (const [role, phone] of [
    [TENANT_ROLE.SHOP_OWNER, '0900000001'],
    [TENANT_ROLE.SHOP_MANAGER, '0900000002'],
    [TENANT_ROLE.SHOP_STAFF, '0900000003'],
    [TENANT_ROLE.SHOP_VIEWER, '0900000004'],
  ] as const) {
    shopMembers[role] = { userId: await mkUser(role, `84${phone.slice(1)}`), phone };
  }

  const shop = await mkTenantWithVehicle(
    'package',
    shopMembers[TENANT_ROLE.SHOP_OWNER]!.userId,
    BILLING_MODE.PACKAGE,
  );
  shopTenantId = shop.tenantId;
  shopVehicleId = shop.vehicleId;

  // Ba vai còn lại vào chính gian hàng tuyến gói đó.
  for (const role of [TENANT_ROLE.SHOP_MANAGER, TENANT_ROLE.SHOP_STAFF, TENANT_ROLE.SHOP_VIEWER]) {
    await prisma.tenantMembership.create({
      data: {
        id: newId(),
        tenantId: shopTenantId,
        userId: shopMembers[role]!.userId,
        roleKey: role,
        status: MEMBERSHIP_STATUS.ACTIVE,
      },
    });
  }

  liteOwnerId = await mkUser('lite', '84900000005');
  const lite = await mkTenantWithVehicle('commission', liteOwnerId, BILLING_MODE.COMMISSION);
  liteTenantId = lite.tenantId;
  liteVehicleId = lite.vehicleId;

  renterId = await mkUser('renter', '84900000009');
});

afterAll(async () => {
  if (dbAvailable) {
    const all = [...userIds, ...createdUserIds];
    await prisma.bookingRequest.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicleOccupancy.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.booking.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.notification.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantCustomer.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { id: { in: all } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

const shopAccountError = expect.objectContaining({
  response: expect.objectContaining({ code: API_ERROR_CODE.SHOP_ACCOUNT_CANNOT_BOOK }),
});

describe('ca 1 — gian hàng tuyến GÓI đang đăng nhập, gọi thẳng API', () => {

  for (const role of [
    TENANT_ROLE.SHOP_OWNER,
    TENANT_ROLE.SHOP_MANAGER,
    TENANT_ROLE.SHOP_STAFF,
    TENANT_ROLE.SHOP_VIEWER,
  ]) {
    maybe(`${role}: 403 SHOP_ACCOUNT_CANNOT_BOOK`, async () => {
      const member = shopMembers[role]!;
      await expect(submit(liteVehicleId, member.phone, member.userId)).rejects.toThrow(
        shopAccountError,
      );
    });
  }

  maybe('không yêu cầu nào được tạo — cổng nằm TRƯỚC transaction ghi', async () => {
    const before = await prisma.bookingRequest.count({ where: { tenantId: liteTenantId } });
    const owner = shopMembers[TENANT_ROLE.SHOP_OWNER]!;
    await expect(submit(liteVehicleId, owner.phone, owner.userId)).rejects.toThrow();
    expect(await prisma.bookingRequest.count({ where: { tenantId: liteTenantId } })).toBe(before);
  });
});

/*
 * CA 2 — đường vòng nguy hiểm nhất.
 *
 * `customerUserId` để trống = đã đăng xuất. Service gọi `resolveOrCreateUserByPhone`, và vì
 * `users.phone` unique nên nó tìm LẠI đúng tài khoản gian hàng. Nếu cổng chỉ đặt ở nhánh "đang
 * đăng nhập", ca này đi lọt VÀ controller cấp cho họ một phiên mới.
 */
describe('ca 2 — đăng xuất rồi đặt bằng OTP với CÙNG số điện thoại', () => {
  for (const role of [TENANT_ROLE.SHOP_OWNER, TENANT_ROLE.SHOP_STAFF]) {
    maybe(`${role}: vẫn 403, và KHÔNG cấp phiên`, async () => {
      const member = shopMembers[role]!;
      // `loginUserId` là thứ DUY NHẤT controller dùng để cấp phiên — ném thì nó không tồn tại.
      await expect(submit(liteVehicleId, member.phone)).rejects.toThrow(shopAccountError);
    });
  }

  maybe('tài khoản gian hàng không bị tạo thêm bản sao nào theo SĐT', async () => {
    const owner = shopMembers[TENANT_ROLE.SHOP_OWNER]!;
    const phone = `84${owner.phone.slice(1)}`;
    await expect(submit(liteVehicleId, owner.phone)).rejects.toThrow();
    expect(await prisma.user.count({ where: { phone } })).toBe(1);
  });
});

describe('ca 3 — tài khoản khách thuê KHÁC với số điện thoại khác: được đặt', () => {
  maybe('khách thuê thuần đặt xe của gian hàng gói ⇒ QUA', async () => {
    const receipt = await submit(shopVehicleId, '0900000009', renterId);
    expect(receipt.receipt.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
  });

  maybe('khách vãng lai SĐT hoàn toàn mới ⇒ QUA và được cấp phiên', async () => {
    const result = await submit(shopVehicleId, '0977000123', undefined, {
      pickupAt: vnAt(6, 9).toISOString(),
      returnAt: vnAt(7, 9).toISOString(),
    });
    expect(result.receipt.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    expect(result.loginUserId).toBeTruthy();
  });

  /* ADR 0032 điều 1: chủ xe tuyến hoa hồng vẫn thuê xe như người dùng thường. */
  maybe('chủ xe tuyến HOA HỒNG đặt xe của gian hàng khác ⇒ QUA', async () => {
    const receipt = await submit(shopVehicleId, '0900000005', liteOwnerId, {
      pickupAt: vnAt(9, 9).toISOString(),
      returnAt: vnAt(10, 9).toISOString(),
    });
    expect(receipt.receipt.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
  });
});

describe('ca 4 — không ai đặt xe của CHÍNH gian hàng mình', () => {
  const ownVehicleError = expect.objectContaining({
    response: expect.objectContaining({ code: API_ERROR_CODE.CANNOT_BOOK_OWN_VEHICLE }),
  });

  maybe('chủ xe tuyến hoa hồng đặt xe của chính mình ⇒ 409', async () => {
    await expect(submit(liteVehicleId, '0900000005', liteOwnerId)).rejects.toThrow(ownVehicleError);
  });

  maybe('nhân viên đặt xe của chính gian hàng mình ⇒ 409 (cụ thể hơn mã tài khoản gian hàng)', async () => {
    const staff = shopMembers[TENANT_ROLE.SHOP_STAFF]!;
    await expect(submit(shopVehicleId, staff.phone, staff.userId)).rejects.toThrow(ownVehicleError);
  });

  maybe('đăng xuất rồi đặt xe của chính mình bằng OTP ⇒ vẫn 409', async () => {
    await expect(submit(liteVehicleId, '0900000005')).rejects.toThrow(ownVehicleError);
  });
});

describe('cổng chạy đúng ở cả ba loại dịch vụ', () => {
  maybe('có tài xế', async () => {
    const owner = shopMembers[TENANT_ROLE.SHOP_OWNER]!;
    await expect(
      submit(liteVehicleId, owner.phone, owner.userId, {
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        routeType: 'one_way',
        pickupAddress: '1 Lê Lợi',
        destination: 'Vũng Tàu',
      }),
    ).rejects.toThrow(shopAccountError);
  });

  maybe('dài hạn theo GÓI THÁNG (không có ngày trả từ client — ADR 0011)', async () => {
    const owner = shopMembers[TENANT_ROLE.SHOP_OWNER]!;
    await expect(
      submit(liteVehicleId, owner.phone, owner.userId, {
        serviceType: SERVICE_TYPE.LONG_TERM,
        pickupAt: undefined,
        returnAt: undefined,
        longTermPackageMonths: 3,
        pickupPreference: PICKUP_PREFERENCE.SPECIFIC_DATE,
        requestedPickupDate: '2026-10-20',
      }),
    ).rejects.toThrow(shopAccountError);
  });
});

describe('tự duyệt yêu cầu của chính mình — cổng THỨ HAI', () => {
  maybe('chủ xe duyệt yêu cầu mà customerUserId là chính họ ⇒ 409', async () => {
    // Dựng thẳng một yêu cầu tự đặt, mô phỏng dữ liệu CÓ TRƯỚC khi cổng đầu tồn tại.
    const id = newId();
    await prisma.bookingRequest.create({
      data: {
        id,
        tenantId: liteTenantId,
        vehicleId: liteVehicleId,
        status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
        customerName: 'Chính chủ',
        customerPhone: '0900000005',
        customerUserId: liteOwnerId,
        pickupAt: vnAt(20, 9),
        returnAt: vnAt(21, 9),
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        respondBy: new Date(Date.now() + DAY),
      },
    });

    const ownRequestError = expect.objectContaining({
      response: expect.objectContaining({ code: API_ERROR_CODE.CANNOT_DECIDE_OWN_REQUEST }),
    });
    await expect(requests.approve(liteTenantId, liteOwnerId, id)).rejects.toThrow(ownRequestError);
    await expect(requests.reject(liteTenantId, liteOwnerId, id, 'thử')).rejects.toThrow(
      ownRequestError,
    );

    // Yêu cầu vẫn nguyên trạng — không bị nửa vời.
    const after = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id },
      select: { status: true, decidedAt: true },
    });
    expect(after.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    expect(after.decidedAt).toBeNull();
  });
});
