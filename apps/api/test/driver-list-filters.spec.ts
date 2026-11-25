import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
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
  DRIVER_TYPE,
  DRIVER_TYPE_FILTER_INTERNAL,
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

describe('Danh sách GỘP liên kết + nội bộ (Figma 23737:41945, 25/11/2026)', () => {
  const internalIds: Record<string, string> = {};

  beforeAll(async () => {
    if (!dbAvailable) return;
    internalIds.active = newId();
    internalIds.archived = newId();
    await prisma.tenantInternalDriver.createMany({
      data: [
        { id: internalIds.active, tenantId: tenant, name: 'Ánh Nội Bộ', phone: '0911000001' },
        {
          id: internalIds.archived,
          tenantId: tenant,
          name: 'Lưu Trữ Nội Bộ',
          phone: '0911000002',
          archivedAt: new Date(),
        },
      ],
    });
  });

  const rosterIds = async (query: Parameters<typeof drivers.roster>[1]) =>
    (await drivers.roster(tenant, query)).data
      .map((r) => (r.linked ?? r.internal)!.id)
      .sort();

  maybe('mặc định = liên kết đang mở + nội bộ đang dùng; mỗi dòng mang đúng một bên', async () => {
    const page = await drivers.roster(tenant, {});
    expect(page.meta.total).toBe(5);
    for (const row of page.data) {
      expect(Boolean(row.linked) !== Boolean(row.internal)).toBe(true);
    }
    expect(await rosterIds({})).toEqual(
      [ids.onTrip, ids.mismatch, ids.invited, ids.suspended, internalIds.active].sort(),
    );
  });

  maybe('"Hình thức" = nội bộ / trạng thái đã đóng / cần đối chiếu / trạng thái cụ thể', async () => {
    expect(await rosterIds({ driverType: DRIVER_TYPE_FILTER_INTERNAL })).toEqual([
      internalIds.active,
    ]);
    expect(
      await rosterIds({
        driverType: DRIVER_TYPE_FILTER_INTERNAL,
        linkStatus: DRIVER_LINK_STATUS_FILTER_CLOSED,
      }),
    ).toEqual([internalIds.archived]);
    expect(await rosterIds({ linkStatus: DRIVER_LINK_STATUS_FILTER_CLOSED })).toEqual(
      [ids.ended, ids.declined, internalIds.archived].sort(),
    );
    expect(await rosterIds({ licenceCheck: DRIVER_LICENCE_CHECK_FILTER })).toEqual(
      [ids.mismatch, ids.invited, ids.suspended].sort(),
    );
    expect(await rosterIds({ linkStatus: DRIVER_LINK_STATUS.ACTIVE })).toEqual(
      [ids.onTrip, ids.mismatch].sort(),
    );
    expect(await rosterIds({ driverType: DRIVER_TYPE.STAFF })).not.toContain(internalIds.active);
    expect(await rosterIds({ operation: DRIVER_OPERATION_FILTER.ON_TRIP })).toEqual([ids.onTrip]);
    expect(await rosterIds({ q: 'ánh nội' })).toEqual([internalIds.active]);
  });

  maybe('phân trang ở server: các trang không trùng, gộp lại đủ tổng', async () => {
    const seen: string[] = [];
    for (let page = 1; page <= 3; page += 1) {
      const res = await drivers.roster(tenant, { page, limit: 2, sort: DRIVER_LIST_SORT.NAME_ASC });
      expect(res.meta.total).toBe(5);
      seen.push(...res.data.map((r) => (r.linked ?? r.internal)!.id));
    }
    expect(new Set(seen).size).toBe(5);
  });

  maybe('dải số đếm gộp: mỗi ô bằng tổng danh sách khi bấm vào nó', async () => {
    const summary = await drivers.rosterSummary(tenant, {});
    expect(summary).toEqual({
      open: 5,
      active: 2,
      invited: 1,
      suspended: 1,
      closed: 3,
      licenceCheck: 3,
      internalActive: 1,
      internalArchived: 1,
    });
    expect((await drivers.roster(tenant, { linkStatus: DRIVER_LINK_STATUS_FILTER_CLOSED })).meta.total).toBe(
      summary.closed,
    );
    expect(
      await drivers.rosterSummary(tenant, { driverType: DRIVER_TYPE_FILTER_INTERNAL }),
    ).toMatchObject({ open: 1, active: 0, closed: 1, licenceCheck: 0 });
  });

  maybe('tra SĐT ở hộp mời: chỉ tài khoản khách đã xác minh, báo đã liên kết', async () => {
    const link = await prisma.driver.findUniqueOrThrow({
      where: { id: ids.onTrip! },
      select: { phone: true },
    });
    await expect(drivers.lookupAccount(tenant, link.phone)).resolves.toMatchObject({
      found: true,
      alreadyLinked: true,
      displayName: expect.any(String),
    });
    await expect(drivers.lookupAccount(tenant, '0900000009')).resolves.toEqual({
      found: false,
      displayName: null,
      avatarUrl: null,
      alreadyLinked: false,
    });
  });
});

describe('"Đã đối chiếu" bằng lái (25/11/2026)', () => {
  maybe('tắt "Cần đối chiếu" cho đúng bằng hiện tại; bằng mới thì hiện lại; gỡ được', async () => {
    const before = await listIds({ licenceCheck: DRIVER_LICENCE_CHECK_FILTER });
    expect(before).toContain(ids.mismatch);

    const checked = await drivers.setLicenceChecked(tenant, owner, ids.mismatch!, true);
    expect(checked.licenceCheck).toMatchObject({ checkedAt: expect.any(String) });
    expect(await listIds({ licenceCheck: DRIVER_LICENCE_CHECK_FILTER })).not.toContain(
      ids.mismatch,
    );
    expect((await drivers.summary(tenant, {})).licenceCheck).toBe(before.length - 1);

    // Tài xế nộp bằng MỚI (vẫn lệch tên) ⇒ mốc đối chiếu cũ hết giá trị.
    const link = await prisma.driver.findUniqueOrThrow({
      where: { id: ids.mismatch! },
      select: { userId: true },
    });
    // Như luồng thật: bằng cũ thành `superseded` khi bằng mới được xác thực (một bằng verified/tài khoản).
    await prisma.customerDriverLicence.updateMany({
      where: { userId: link.userId, status: DRIVER_LICENCE_STATUS.VERIFIED },
      data: { status: DRIVER_LICENCE_STATUS.SUPERSEDED },
    });
    await verifiedLicence(link.userId, 'LE VAN CUONG MOI');
    expect(await listIds({ licenceCheck: DRIVER_LICENCE_CHECK_FILTER })).toContain(ids.mismatch);
    const list = await drivers.list(tenant, {});
    expect(list.data.find((d) => d.id === ids.mismatch)?.licenceCheck).toBeNull();

    // Gỡ đánh dấu: cột về null.
    await drivers.setLicenceChecked(tenant, owner, ids.mismatch!, false);
    const row = await prisma.driver.findUniqueOrThrow({
      where: { id: ids.mismatch! },
      select: { licenceCheckedLicenceId: true, licenceCheckedAt: true },
    });
    expect(row).toEqual({ licenceCheckedLicenceId: null, licenceCheckedAt: null });
  });

  maybe('chưa có bằng đã xác thực còn hạn ⇒ 409 DRIVER_LICENCE_NOT_VERIFIED', async () => {
    await expect(drivers.setLicenceChecked(tenant, owner, ids.invited!, true)).rejects.toMatchObject({
      response: expect.objectContaining({ code: API_ERROR_CODE.DRIVER_LICENCE_NOT_VERIFIED }),
    });
    await expect(drivers.setLicenceChecked(tenant, owner, ids.suspended!, true)).rejects.toMatchObject({
      response: expect.objectContaining({ code: API_ERROR_CODE.DRIVER_LICENCE_NOT_VERIFIED }),
    });
  });
});
