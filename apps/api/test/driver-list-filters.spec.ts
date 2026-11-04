import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  BOOKING_STATUS,
  DRIVER_LICENCE_CHECK_FILTER,
  DRIVER_LICENCE_DECISION_SOURCE,
  DRIVER_LICENCE_KIND,
  DRIVER_LICENCE_STATUS,
  DRIVER_LINK_END_PARTY,
  DRIVER_LINK_STATUS,
  DRIVER_LINK_STATUS_FILTER_CLOSED,
  DRIVER_LIST_SORT,
  DRIVER_OPERATION_FILTER,
  MEMBERSHIP_STATUS,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { cleanupDriverAccounts, seedDriverLink } from './helpers/driver-link';
import { makeDriversService } from './helpers/service-factory';

/**
 * Bộ lọc + dải số đếm của màn Tài xế (04/11/2026), trên PostgreSQL THẬT:
 *
 *   1. "Vận hành": đang có chuyến = gán ít nhất một đơn chiếm lịch — cùng tập với `activeBookingCount`.
 *   2. "Cần đối chiếu giấy tờ": liên kết còn mở chưa có bằng đã xác thực còn hạn, hoặc tên trên bằng
 *      lệch tên mời (so bỏ dấu — "Nguyễn Văn A" khớp "NGUYEN VAN A").
 *   3. `closed` = đã từ chối + đã kết thúc; mỗi ô của dải đếm bằng tổng danh sách khi bấm vào nó.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const drivers = makeDriversService(asService, { audit: new AuditService(asService) });

let dbAvailable = false;
let owner: string;
let tenant: string;
let vehicle: string;
const ids: Record<string, string> = {};
const licenceUserIds: string[] = [];

async function verifiedLicence(userId: string, fullName: string, expiresOn = '2031-01-01') {
  licenceUserIds.push(userId);
  await prisma.customerDriverLicence.create({
    data: {
      id: newId(),
      userId,
      status: DRIVER_LICENCE_STATUS.VERIFIED,
      objectKey: `test/${newId()}.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: 100,
      consentedAt: new Date(),
      uploadedAt: new Date(),
      kind: DRIVER_LICENCE_KIND.VN,
      licenceNumber: String(Date.now()).slice(-12),
      fullName,
      licenceClasses: ['B2'],
      expiresOn: new Date(`${expiresOn}T00:00:00Z`),
      decisionSource: DRIVER_LICENCE_DECISION_SOURCE.AUTO,
      decidedAt: new Date(),
    },
  });
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
  tenant = newId();
  vehicle = newId();
  await prisma.user.create({
    data: {
      realm: ACCOUNT_REALM.PARTNER,
      id: owner,
      displayName: 'Chủ lọc tài xế',
      email: `drv-filter-${owner}@xeprime.test`,
    },
  });
  await prisma.tenant.create({
    data: {
      id: tenant,
      code: `T-${tenant.slice(-8)}`,
      slug: `t-${tenant.toLowerCase().slice(-10)}`,
      name: 'Shop lọc tài xế',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: owner,
      driverDailyWage: new Prisma.Decimal('500000'),
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
      code: `V-FLT-${vehicle.slice(-6)}`,
      name: 'Innova lọc',
      vehicleType: VEHICLE_TYPE.CAR,
      serviceTypes: [SERVICE_TYPE.WITH_DRIVER],
      withDriverDailyPrice: new Prisma.Decimal('1300000'),
    },
  });

  // Đang liên kết, bằng hợp lệ, tên khớp (khác dấu/hoa thường) — KHÔNG cần đối chiếu; có chuyến.
  const onTrip = await seedDriverLink(asService, { tenantId: tenant, name: 'Nguyễn Văn An' });
  await verifiedLicence(onTrip.userId, 'NGUYEN VAN AN');
  ids.onTrip = onTrip.driverId;
  // Đang liên kết, bằng hợp lệ nhưng TÊN LỆCH — cần đối chiếu.
  const mismatch = await seedDriverLink(asService, { tenantId: tenant, name: 'Trần Bình' });
  await verifiedLicence(mismatch.userId, 'LE VAN CUONG');
  ids.mismatch = mismatch.driverId;
  // Chờ đồng ý, chưa có bằng — cần đối chiếu.
  ids.invited = (
    await seedDriverLink(asService, { tenantId: tenant, linkStatus: DRIVER_LINK_STATUS.INVITED })
  ).driverId;
  // Tạm khoá, bằng ĐÃ HẾT HẠN — cần đối chiếu.
  const suspended = await seedDriverLink(asService, {
    tenantId: tenant,
    name: 'Phạm Dũng',
    linkStatus: DRIVER_LINK_STATUS.SUSPENDED,
  });
  await verifiedLicence(suspended.userId, 'PHAM DUNG', '2020-01-01');
  ids.suspended = suspended.driverId;
  // Lịch sử — không bao giờ vào "cần đối chiếu".
  ids.ended = (await seedDriverLink(asService, { tenantId: tenant })).driverId;
  await prisma.driver.update({
    where: { id: ids.ended },
    data: {
      linkStatus: DRIVER_LINK_STATUS.ENDED,
      endedAt: new Date(),
      endedByParty: DRIVER_LINK_END_PARTY.EMPLOYER,
    },
  });
  ids.declined = (
    await seedDriverLink(asService, { tenantId: tenant, linkStatus: DRIVER_LINK_STATUS.DECLINED })
  ).driverId;

  const bookingId = newId();
  await prisma.booking.create({
    data: {
      id: bookingId,
      tenantId: tenant,
      vehicleId: vehicle,
      code: `DH-FLT-${Date.now().toString(36)}`,
      customerName: 'Khách lọc',
      customerPhone: '0977000111',
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      routeType: 'in_city',
      pickupAddress: '1 Lê Lợi',
      status: BOOKING_STATUS.RESERVED,
      pickupAt: new Date('2027-11-01T02:00:00.000Z'),
      returnAt: new Date('2027-11-02T02:00:00.000Z'),
      baseAmount: new Prisma.Decimal('1000000'),
      totalAmount: new Prisma.Decimal('1000000'),
    },
  });
  await prisma.$transaction((tx) =>
    drivers.assignWithinTx(tx, {
      tenantId: tenant,
      bookingId,
      driverId: ids.onTrip!,
      actorUserId: null,
    }),
  );
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.bookingDriverAssignment.deleteMany({ where: { tenantId: tenant } });
    await prisma.booking.deleteMany({ where: { tenantId: tenant } });
    await prisma.auditLog.deleteMany({ where: { tenantId: tenant } });
    await prisma.notification.deleteMany({ where: { tenantId: tenant } });
    await prisma.driver.deleteMany({ where: { tenantId: tenant } });
    await prisma.customerDriverLicence.deleteMany({ where: { userId: { in: licenceUserIds } } });
    await cleanupDriverAccounts(asService);
    await prisma.vehicle.deleteMany({ where: { tenantId: tenant } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: tenant } });
    await prisma.tenant.deleteMany({ where: { id: tenant } });
    await prisma.user.deleteMany({ where: { id: owner } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

const listIds = async (query: Parameters<typeof drivers.list>[1]) =>
  (await drivers.list(tenant, query)).data.map((d) => d.id).sort();

describe('Ngăn chi tiết — chuyến đang gán', () => {
  maybe('liệt kê đúng các đơn mà "N chuyến" của thẻ đếm', async () => {
    const overview = await drivers.overview(tenant, ids.onTrip!, undefined);
    expect(overview.driver.activeBookingCount).toBe(1);
    expect(overview.current).toHaveLength(1);
    expect(overview.current[0]).toMatchObject({
      bookingStatus: BOOKING_STATUS.RESERVED,
      vehicleName: expect.any(String),
    });
    expect((await drivers.overview(tenant, ids.mismatch!, undefined)).current).toEqual([]);
  });
});

describe('Danh sách tài xế — bộ lọc', () => {
  maybe('"Vận hành": đang có chuyến ↔ rảnh, chỉ trong liên kết còn mở', async () => {
    expect(await listIds({ operation: DRIVER_OPERATION_FILTER.ON_TRIP })).toEqual([ids.onTrip]);
    expect(await listIds({ operation: DRIVER_OPERATION_FILTER.IDLE })).toEqual(
      [ids.mismatch, ids.invited, ids.suspended].sort(),
    );
  });

  maybe(
    '"Cần đối chiếu": chưa có bằng, bằng hết hạn, tên lệch — không gồm tên chỉ khác dấu',
    async () => {
      expect(await listIds({ licenceCheck: DRIVER_LICENCE_CHECK_FILTER })).toEqual(
        [ids.mismatch, ids.invited, ids.suspended].sort(),
      );
    },
  );

  maybe('`closed` = đã từ chối + đã kết thúc', async () => {
    expect(await listIds({ linkStatus: DRIVER_LINK_STATUS_FILTER_CLOSED })).toEqual(
      [ids.ended, ids.declined].sort(),
    );
  });

  maybe('sắp xếp tên A–Z và mới nhất', async () => {
    const byName = (await drivers.list(tenant, { sort: DRIVER_LIST_SORT.NAME_ASC })).data.map(
      (d) => d.name,
    );
    // Thứ tự là của COLLATION DB, không phải mã ký tự: `postgres:16` ở CI dùng `en_US.utf8` nên
    // "Tài" đứng trước "Trần", còn `Array.sort()` của JS thì ngược lại. Để DB tự sắp làm mốc.
    const expected = await prisma.$queryRaw<{ n: string }[]>`
      SELECT n FROM unnest(${byName}::text[]) AS n ORDER BY n`;
    expect(byName).toEqual(expected.map((r) => r.n));
    const newest = (await drivers.list(tenant, { sort: DRIVER_LIST_SORT.NEWEST })).data.map(
      (d) => d.invitedAt,
    );
    expect(newest).toEqual([...newest].sort().reverse());
  });
});

describe('Dải số đếm', () => {
  maybe('mỗi ô bằng tổng danh sách khi bấm vào nó', async () => {
    const summary = await drivers.summary(tenant, {});
    expect(summary).toEqual({
      open: 4,
      active: 2,
      invited: 1,
      suspended: 1,
      closed: 2,
      licenceCheck: 3,
    });
  });

  maybe('áp cùng bộ lọc chung với danh sách', async () => {
    const summary = await drivers.summary(tenant, { operation: DRIVER_OPERATION_FILTER.ON_TRIP });
    expect(summary).toMatchObject({ open: 1, active: 1, licenceCheck: 0, closed: 0 });
  });
});
