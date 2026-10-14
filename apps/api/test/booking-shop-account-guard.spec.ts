import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
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
  type AccountRealm,
} from '@xeprime/types';

import { giveTenantPlan } from './helpers/billing-fixture';
import { AuditService } from '../src/modules/audit/audit.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeBookingRequestsService,
  makeBookingsService,
  makeCustomersService,
  makeNotificationService,
  makePricingService,
} from './helpers/service-factory';

/**
 * AI ĐƯỢC ĐẶT XE — ADR 0053 điều 2 và 7 + ADR 0060, trên PostgreSQL thật.
 *
 *  1. Tài khoản PARTNER/PLATFORM (mọi vai, mọi tuyến) gọi thẳng đường đặt xe → 403
 *     SHOP_ACCOUNT_CANNOT_BOOK. Route đặt xe chỉ khai realm `customer`; service kiểm lại vì đây là
 *     chỗ cuối cùng trước khi một `customer_user_id` được ghi.
 *  2. Tài khoản KHÁCH chưa xác minh SĐT (hoặc chưa có SĐT) → 403 PHONE_NOT_VERIFIED, không ghi gì
 *     (ADR 0060): không còn khách vãng lai, danh tính của yêu cầu là SĐT ĐÃ XÁC MINH của tài khoản.
 *  3. Tài khoản khách cùng SĐT với một thành viên → đặt xe gian hàng KHÁC được; đặt xe của CHÍNH
 *     gian hàng đó → 409 CANNOT_BOOK_OWN_VEHICLE (chặn tự đặt — quyết định sản phẩm 02/10/2026).
 *  4. Khách thuần, số khác → QUA.
 *
 * Cổng chạy ở cả ba loại dịch vụ (tự lái, có tài xế, dài hạn).
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const pricing = makePricingService(asService);
const occupancy = new OccupancyService(asService);
const customers = makeCustomersService(asService, audit);
const bookings = makeBookingsService(asService, { occupancy, audit, notifications, customers });

const requests = makeBookingRequestsService(asService, {
  bookings,
  audit,
  notifications,
  occupancy,
  pricing,
  customers,
});

const RUN = newId().slice(-8).toLowerCase();
const DAY = 86_400_000;

let dbAvailable = false;
const userIds: string[] = [];
const tenantIds: string[] = [];

/** SĐT của suite — tiền tố riêng để không đụng dữ liệu seed hay spec khác. */
const SUITE = String(Date.now() % 1_000).padStart(3, '0');
const phoneOf = (n: number) => `0938${SUITE}${String(n).padStart(3, '0')}`;
const stored = (phone: string) => `84${phone.slice(1)}`;

/** Gian hàng tuyến GÓI — chủ, quản lý, nhân viên, người xem; xe đang bán trên chợ. */
let shopTenantId: string;
let shopVehicleId: string;
const shopMembers: Record<string, { userId: string; phone: string }> = {};

/** Chủ xe tuyến HOA HỒNG — cũng ở site partner. */
let liteTenantId: string;
let liteOwnerId: string;
let liteVehicleId: string;
const LITE_PHONE = phoneOf(5);

/** Khách thuần. */
let renterId: string;
const RENTER_PHONE = phoneOf(9);

/** Tài khoản KHÁCH song sinh (cùng SĐT) của chủ gian hàng gói, của nhân viên, và của chủ xe lite. */
let ownerTwinId: string;
let staffTwinId: string;
let liteTwinId: string;

/** Một tài khoản quản trị nền tảng — cũng không đặt xe. */
let platformUserId: string;

/**
 * Mặc định SĐT ĐÃ xác minh. `phoneVerified: false` ⇒ có số nhưng chưa qua OTP; `phone: null` ⇒
 * tài khoản chưa có số nào (đăng ký bằng Google/Facebook) — hai hình dạng mà ADR 0060 chặn ở cửa.
 */
async function mkUser(
  tag: string,
  phone: string | null,
  realm: AccountRealm,
  phoneVerified = true,
): Promise<string> {
  const id = newId();
  await prisma.user.create({
    data: {
      id,
      realm,
      displayName: `BSG ${tag}`,
      email: `bsg-${tag}-${RUN}@xeprime.test`,
      phone: phone === null ? null : stored(phone),
      phoneVerifiedAt: phone !== null && phoneVerified ? new Date() : null,
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

/** Mỗi lượt đặt một khung giờ riêng — tránh cổng chống gửi trùng che mất thứ đang kiểm. */
let slot = 0;
function nextWindow(): { pickupAt: string; returnAt: string } {
  slot += 2;
  return { pickupAt: vnAt(3 + slot, 9).toISOString(), returnAt: vnAt(4 + slot, 9).toISOString() };
}

/**
 * Gửi yêu cầu đúng hình dạng mà controller truyền xuống. Người gửi LUÔN là một tài khoản đã đăng
 * nhập (ADR 0060) — họ tên và SĐT của yêu cầu đọc từ tài khoản đó, không từ payload.
 */
function submit(
  vehicleId: string,
  customerUserId: string,
  overrides: Record<string, unknown> = {},
) {
  return requests.submitPublic(
    {
      vehicleId,
      ...nextWindow(),
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

  const P = ACCOUNT_REALM.PARTNER;
  const roles = [
    TENANT_ROLE.SHOP_OWNER,
    TENANT_ROLE.SHOP_MANAGER,
    TENANT_ROLE.SHOP_STAFF,
    TENANT_ROLE.SHOP_VIEWER,
  ] as const;
  for (const [index, role] of roles.entries()) {
    const phone = phoneOf(index + 1);
    shopMembers[role] = { userId: await mkUser(role, phone, P), phone };
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

  liteOwnerId = await mkUser('lite', LITE_PHONE, P);
  const lite = await mkTenantWithVehicle('commission', liteOwnerId, BILLING_MODE.COMMISSION);
  liteTenantId = lite.tenantId;
  liteVehicleId = lite.vehicleId;

  const C = ACCOUNT_REALM.CUSTOMER;
  renterId = await mkUser('renter', RENTER_PHONE, C);
  ownerTwinId = await mkUser('owner-twin', shopMembers[TENANT_ROLE.SHOP_OWNER]!.phone, C);
  staffTwinId = await mkUser('staff-twin', shopMembers[TENANT_ROLE.SHOP_STAFF]!.phone, C);
  liteTwinId = await mkUser('lite-twin', LITE_PHONE, C);
  platformUserId = await mkUser('platform', phoneOf(20), ACCOUNT_REALM.PLATFORM);
});

afterAll(async () => {
  if (dbAvailable) {
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
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
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
const ownVehicleError = expect.objectContaining({
  response: expect.objectContaining({ code: API_ERROR_CODE.CANNOT_BOOK_OWN_VEHICLE }),
});
const phoneNotVerifiedError = expect.objectContaining({
  response: expect.objectContaining({ code: API_ERROR_CODE.PHONE_NOT_VERIFIED }),
});

describe('ca 1 — tài khoản partner/platform không đặt xe', () => {
  for (const role of [
    TENANT_ROLE.SHOP_OWNER,
    TENANT_ROLE.SHOP_MANAGER,
    TENANT_ROLE.SHOP_STAFF,
    TENANT_ROLE.SHOP_VIEWER,
  ]) {
    maybe(`${role} tuyến gói: 403 SHOP_ACCOUNT_CANNOT_BOOK`, async () => {
      const member = shopMembers[role]!;
      await expect(submit(liteVehicleId, member.userId)).rejects.toThrow(shopAccountError);
    });
  }

  maybe(
    'chủ xe tuyến HOA HỒNG bằng tài khoản partner: cũng 403 (đi thuê bằng tài khoản khách)',
    async () => {
      await expect(submit(shopVehicleId, liteOwnerId)).rejects.toThrow(shopAccountError);
    },
  );

  maybe('tài khoản quản trị nền tảng: 403', async () => {
    await expect(submit(shopVehicleId, platformUserId)).rejects.toThrow(shopAccountError);
  });

  maybe('không yêu cầu nào được tạo — cổng nằm TRƯỚC transaction ghi', async () => {
    const before = await prisma.bookingRequest.count({ where: { tenantId: liteTenantId } });
    const owner = shopMembers[TENANT_ROLE.SHOP_OWNER]!;
    await expect(submit(liteVehicleId, owner.userId)).rejects.toThrow();
    expect(await prisma.bookingRequest.count({ where: { tenantId: liteTenantId } })).toBe(before);
  });
});

/*
 * CA 2 — tài khoản KHÁCH mà SĐT chưa xác minh (ADR 0060).
 *
 * Không còn đường "đăng xuất rồi đặt bằng OTP": người gửi luôn là một tài khoản khách, và danh
 * tính của yêu cầu là SĐT ĐÃ XÁC MINH của tài khoản đó — gian hàng liên lạc qua số này, sổ khách
 * và chống trùng khoá theo nó, cổng tự đặt so trên nó. Một số chưa qua OTP không chứng minh được
 * gì, nên cổng này đứng TRƯỚC mọi phép kiểm khác và không để lại dấu vết nào.
 */
describe('ca 2 — tài khoản khách chưa xác minh SĐT', () => {
  maybe('có SĐT nhưng chưa xác minh: 403 PHONE_NOT_VERIFIED, không ghi yêu cầu nào', async () => {
    const unverifiedId = await mkUser('unverified', phoneOf(30), ACCOUNT_REALM.CUSTOMER, false);
    await expect(submit(shopVehicleId, unverifiedId)).rejects.toThrow(phoneNotVerifiedError);
    expect(await prisma.bookingRequest.count({ where: { customerUserId: unverifiedId } })).toBe(0);
  });

  maybe('chưa có SĐT nào (đăng ký bằng Google/Facebook): 403 PHONE_NOT_VERIFIED', async () => {
    const noPhoneId = await mkUser('no-phone', null, ACCOUNT_REALM.CUSTOMER);
    await expect(submit(liteVehicleId, noPhoneId)).rejects.toThrow(phoneNotVerifiedError);
    expect(await prisma.bookingRequest.count({ where: { customerUserId: noPhoneId } })).toBe(0);
  });

  maybe('số chưa xác minh trùng số thành viên: PHONE_NOT_VERIFIED chứ không phải 409', async () => {
    // Chưa qua OTP thì chưa biết số có phải của người đặt hay không — kết luận "xe của chính bạn"
    // trên một số như vậy là nói điều hệ thống không biết.
    const manager = shopMembers[TENANT_ROLE.SHOP_MANAGER]!;
    const managerTwin = await mkUser('manager-twin', manager.phone, ACCOUNT_REALM.CUSTOMER, false);
    await expect(submit(shopVehicleId, managerTwin)).rejects.toThrow(phoneNotVerifiedError);
    expect(await prisma.bookingRequest.count({ where: { customerUserId: managerTwin } })).toBe(0);
  });
});

describe('ca 3 — tài khoản KHÁCH cùng SĐT với thành viên gian hàng', () => {
  maybe('chủ gian hàng gói (tài khoản khách) thuê xe của gian hàng KHÁC: QUA', async () => {
    const receipt = await submit(liteVehicleId, ownerTwinId);
    expect(receipt.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
  });

  maybe('chủ gian hàng gói (tài khoản khách) đặt xe của CHÍNH gian hàng mình: 409', async () => {
    await expect(submit(shopVehicleId, ownerTwinId)).rejects.toThrow(ownVehicleError);
  });

  maybe('nhân viên (tài khoản khách) đặt xe của gian hàng mình làm: 409', async () => {
    await expect(submit(shopVehicleId, staffTwinId)).rejects.toThrow(ownVehicleError);
  });

  maybe('chủ xe hoa hồng (tài khoản khách) đặt xe của chính mình: 409', async () => {
    await expect(submit(liteVehicleId, liteTwinId)).rejects.toThrow(ownVehicleError);
  });

  /*
   * Bản app cũ vẫn gửi `customerPhone` trong payload — server BỎ QUA nó (ADR 0060): SĐT của yêu
   * cầu là số ĐÃ XÁC MINH của tài khoản, nên gõ một số khác ở form không lách được cổng tự đặt.
   */
  maybe('payload mang SĐT khác nhưng SĐT TÀI KHOẢN trùng thành viên: vẫn 409', async () => {
    await expect(submit(liteVehicleId, liteTwinId, { customerPhone: phoneOf(77) })).rejects.toThrow(
      ownVehicleError,
    );
  });

  maybe('thành viên đã RỜI gian hàng thì không còn bị chặn', async () => {
    const viewer = shopMembers[TENANT_ROLE.SHOP_VIEWER]!;
    const viewerTwin = await mkUser('viewer-twin', viewer.phone, ACCOUNT_REALM.CUSTOMER);
    await prisma.tenantMembership.updateMany({
      where: { tenantId: shopTenantId, userId: viewer.userId },
      data: { status: MEMBERSHIP_STATUS.REMOVED },
    });
    try {
      const receipt = await submit(shopVehicleId, viewerTwin);
      expect(receipt.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    } finally {
      await prisma.tenantMembership.updateMany({
        where: { tenantId: shopTenantId, userId: viewer.userId },
        data: { status: MEMBERSHIP_STATUS.ACTIVE },
      });
    }
  });
});

describe('ca 4 — khách thuần', () => {
  maybe('khách thuê đặt xe của gian hàng gói ⇒ QUA', async () => {
    const receipt = await submit(shopVehicleId, renterId);
    // Qua cổng tài khoản ⇒ yêu cầu vào hàng chờ duyệt (ADR 0044): chưa ai nhận thì chưa thu tiền.
    expect(receipt.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);

    // Danh tính của yêu cầu là của TÀI KHOẢN (ADR 0060) — SĐT lưu dạng nội địa `0xxxxxxxxx`.
    const row = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id: receipt.id },
      select: { customerUserId: true, customerName: true, customerPhone: true },
    });
    expect(row).toEqual({
      customerUserId: renterId,
      customerName: 'BSG renter',
      customerPhone: RENTER_PHONE,
    });
  });
});

describe('cổng chạy đúng ở cả ba loại dịch vụ', () => {
  maybe('có tài xế', async () => {
    await expect(
      submit(shopVehicleId, ownerTwinId, {
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        routeType: 'one_way',
        pickupAddress: '1 Lê Lợi',
        destination: 'Vũng Tàu',
      }),
    ).rejects.toThrow(ownVehicleError);
  });

  maybe('dài hạn theo GÓI THÁNG (không có ngày trả từ client — ADR 0011)', async () => {
    const owner = shopMembers[TENANT_ROLE.SHOP_OWNER]!;
    await expect(
      submit(liteVehicleId, owner.userId, {
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
        customerPhone: LITE_PHONE,
        customerUserId: liteOwnerId,
        pickupAt: vnAt(60, 9),
        returnAt: vnAt(61, 9),
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
