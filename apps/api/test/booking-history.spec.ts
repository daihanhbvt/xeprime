import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  BILLING_MODE,
  BOOKING_HISTORY_KIND,
  BOOKING_HISTORY_OUTCOME,
  BOOKING_HISTORY_TAB,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  CANCELLATION_PARTY,
  CANCELLATION_REASON_CATEGORY,
  CANCELLATION_STAGE,
  SERVICE_TYPE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { BookingHistoryService } from '../src/modules/booking-history/booking-history.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * "Đơn đã kết thúc" — trên PostgreSQL THẬT (05/11/2026).
 *
 * Endpoint viết SQL tay (`UNION ALL` hai bảng, xếp theo một BIỂU THỨC "lúc kết thúc"), nên spec
 * khoá đúng những chỗ SQL tay dễ sai mà Prisma từng lo hộ: thứ tự xuyên hai bảng, số đếm bốn ngăn
 * cùng phạm vi với trang, tìm kiếm cùng nghĩa với hai hộp thư, phạm vi chi nhánh fail-closed, và
 * cổng liên hệ khách (ADR 0056) cho dòng yêu cầu.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/api test -- test/booking-history.spec.ts
 */
const prisma = createPrismaClient();
const history = new BookingHistoryService(prisma as unknown as PrismaService);

const RUN = newId().slice(-8).toLowerCase();
let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let branchA: string;
let branchB: string;
let vehicleA: string;
let vehicleB: string;

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

/** Bốn đơn + ba yêu cầu, mỗi dòng một mốc kết thúc khác nhau — thứ tự đúng là theo mốc đó. */
const ids = {
  completed: newId(),
  cancelledByCustomer: newId(),
  cancelledByHost: newId(),
  noShow: newId(),
  rejected: newId(),
  expired: newId(),
  holdCancelled: newId(),
};

function baseTenant(billingMode: (typeof BILLING_MODE)[keyof typeof BILLING_MODE] | null = null) {
  return { tenantId, allowedBranchIds: null, billingMode };
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
  branchA = newId();
  branchB = newId();
  vehicleA = newId();
  vehicleB = newId();

  await prisma.user.create({
    data: {
      realm: ACCOUNT_REALM.PARTNER,
      id: ownerId,
      displayName: 'Chủ',
      email: `bh-own-${RUN}@xeprime.test`,
    },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `HistoryShop-${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantBranch.createMany({
    data: [
      { id: branchA, tenantId, code: `A${RUN}`, name: 'Chi nhánh A' },
      { id: branchB, tenantId, code: `B${RUN}`, name: 'Chi nhánh B' },
    ],
  });
  await prisma.vehicle.createMany({
    data: [
      {
        id: vehicleA,
        tenantId,
        branchId: branchA,
        code: `HA${RUN}`,
        name: 'Vinfast VF6',
        plateNumber: `51K-${RUN.slice(0, 5)}`,
        vehicleType: VEHICLE_TYPE.CAR,
        createdBy: ownerId,
      },
      {
        id: vehicleB,
        tenantId,
        branchId: branchB,
        code: `HB${RUN}`,
        name: 'Honda City',
        plateNumber: `30A-${RUN.slice(0, 5)}`,
        vehicleType: VEHICLE_TYPE.CAR,
        createdBy: ownerId,
      },
    ],
  });

  const pickup = hoursAgo(200);
  const booking = (id: string, status: string, vehicleId: string, extra: Partial<Prisma.BookingCreateManyInput> = {}) => ({
    id,
    tenantId,
    vehicleId,
    code: `DH-${id.slice(-6)}`,
    customerName: 'Nguyễn Văn Lịch Sử',
    customerPhone: '0909000111',
    status,
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    pickupAt: pickup,
    returnAt: hoursAgo(150),
    ...extra,
  });
  await prisma.booking.createMany({
    data: [
      // Kết thúc 10 giờ trước — bằng mốc trả xe THẬT, không phải giờ hẹn.
      booking(ids.completed, BOOKING_STATUS.COMPLETED, vehicleA, { actualReturnAt: hoursAgo(10) }),
      booking(ids.cancelledByCustomer, BOOKING_STATUS.CANCELLED, vehicleA),
      booking(ids.cancelledByHost, BOOKING_STATUS.CANCELLED, vehicleB),
      booking(ids.noShow, BOOKING_STATUS.NO_SHOW, vehicleB),
    ],
  });
  const cancellation = (bookingId: string, party: string, at: Date) => ({
    id: newId(),
    tenantId,
    bookingId,
    stage: CANCELLATION_STAGE.BOOKING_BEFORE_PICKUP,
    actorScope: 'tenant',
    responsibleParty: party,
    reasonCategory: CANCELLATION_REASON_CATEGORY.OTHER,
    countsAgainstHost: party === CANCELLATION_PARTY.HOST,
    cancelledAt: at,
  });
  await prisma.bookingCancellation.createMany({
    data: [
      cancellation(ids.cancelledByCustomer, CANCELLATION_PARTY.CUSTOMER, hoursAgo(20)),
      cancellation(ids.cancelledByHost, CANCELLATION_PARTY.HOST, hoursAgo(30)),
    ],
  });

  const request = (id: string, status: string, vehicleId: string, extra: Partial<Prisma.BookingRequestCreateManyInput> = {}) => ({
    id,
    tenantId,
    vehicleId,
    status,
    customerName: 'Trần Thị Yêu Cầu',
    customerPhone: '0909000222',
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    pickupAt: hoursAgo(100),
    returnAt: hoursAgo(50),
    respondBy: hoursAgo(5),
    ...extra,
  });
  await prisma.bookingRequest.createMany({
    data: [
      // Từ chối 2 giờ trước — mốc là lượt QUYẾT ĐỊNH.
      request(ids.rejected, BOOKING_REQUEST_STATUS.REJECTED_BY_HOST, vehicleA, {
        decidedAt: hoursAgo(2),
        decidedBy: ownerId,
      }),
      // Quá hạn phản hồi — mốc là hạn phản hồi (5 giờ trước).
      request(ids.expired, BOOKING_REQUEST_STATUS.EXPIRED, vehicleB),
      request(ids.holdCancelled, BOOKING_REQUEST_STATUS.CANCELLED_BY_HOST, vehicleA, {
        decidedAt: hoursAgo(60),
        decidedBy: ownerId,
      }),
    ],
  });
  await prisma.bookingCancellation.create({
    data: {
      id: newId(),
      tenantId,
      bookingRequestId: ids.holdCancelled,
      stage: CANCELLATION_STAGE.AWAITING_HOLD,
      actorScope: 'tenant',
      responsibleParty: CANCELLATION_PARTY.HOST,
      reasonCategory: CANCELLATION_REASON_CATEGORY.OTHER,
      countsAgainstHost: true,
      cancelledAt: hoursAgo(40),
    },
  });
  // ĐƠN đã có `no_show` mà không có dòng trách nhiệm ⇒ mốc là `updated_at` — đặt cụ thể để xếp được.
  await prisma.$executeRaw`UPDATE "public"."bookings" SET updated_at = ${hoursAgo(1)} WHERE id = ${ids.noShow}`;
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.bookingCancellation.deleteMany({ where: { tenantId } });
    await prisma.bookingRequest.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('GET /booking-history', () => {
  maybe('xếp đơn và yêu cầu theo LÚC KẾT THÚC giảm dần, kết cục do server suy', async () => {
    const page = await history.list(baseTenant(BILLING_MODE.PACKAGE), {}, true);
    expect(page.data.map((row) => [row.id, row.outcome])).toEqual([
      [ids.noShow, BOOKING_HISTORY_OUTCOME.NO_SHOW], // 1h
      [ids.rejected, BOOKING_HISTORY_OUTCOME.REQUEST_REJECTED], // 2h
      [ids.expired, BOOKING_HISTORY_OUTCOME.REQUEST_EXPIRED], // 5h
      [ids.completed, BOOKING_HISTORY_OUTCOME.COMPLETED], // 10h
      [ids.cancelledByCustomer, BOOKING_HISTORY_OUTCOME.CANCELLED_BY_CUSTOMER], // 20h
      [ids.cancelledByHost, BOOKING_HISTORY_OUTCOME.CANCELLED_BY_HOST], // 30h
      [ids.holdCancelled, BOOKING_HISTORY_OUTCOME.REQUEST_CANCELLED_BY_HOST], // 40h
    ]);
    expect(page.meta.tabCounts).toEqual({ all: 7, completed: 1, cancelled: 3, notConverted: 3 });
    expect(page.meta.total).toBe(7);
    const rejected = page.data.find((row) => row.id === ids.rejected);
    expect(rejected).toMatchObject({ kind: BOOKING_HISTORY_KIND.REQUEST, code: null });
    expect(page.data.find((row) => row.id === ids.completed)?.code).toBe(`DH-${ids.completed.slice(-6)}`);
  });

  maybe('ngăn + kết cục thu hẹp trang; số đếm bốn ngăn giữ nguyên', async () => {
    const cancelled = await history.list(
      baseTenant(BILLING_MODE.PACKAGE),
      { tab: BOOKING_HISTORY_TAB.CANCELLED },
      true,
    );
    expect(cancelled.data.map((row) => row.id)).toEqual([
      ids.noShow,
      ids.cancelledByCustomer,
      ids.cancelledByHost,
    ]);
    expect(cancelled.meta.tabCounts.all).toBe(7);

    const byHost = await history.list(
      baseTenant(BILLING_MODE.PACKAGE),
      { tab: BOOKING_HISTORY_TAB.CANCELLED, outcome: BOOKING_HISTORY_OUTCOME.CANCELLED_BY_HOST },
      true,
    );
    expect(byHost.data.map((row) => row.id)).toEqual([ids.cancelledByHost]);
    expect(byHost.meta.total).toBe(1);
  });

  maybe('phân trang ở database — trang 2 nối tiếp trang 1, không lặp dòng', async () => {
    const first = await history.list(baseTenant(BILLING_MODE.PACKAGE), { limit: 3 }, true);
    const second = await history.list(baseTenant(BILLING_MODE.PACKAGE), { limit: 3, page: 2 }, true);
    expect(first.meta.hasNext).toBe(true);
    expect([...first.data, ...second.data].map((row) => row.id)).toEqual([
      ids.noShow,
      ids.rejected,
      ids.expired,
      ids.completed,
      ids.cancelledByCustomer,
      ids.cancelledByHost,
    ]);
  });

  maybe('tìm theo biển số khớp cả đơn lẫn yêu cầu của chiếc xe đó', async () => {
    const page = await history.list(
      baseTenant(BILLING_MODE.PACKAGE),
      { q: `30a-${RUN.slice(0, 5)}` },
      true,
    );
    expect(page.data.map((row) => row.id).sort()).toEqual(
      [ids.noShow, ids.expired, ids.cancelledByHost].sort(),
    );
    // Ký tự đại diện của LIKE là CHỮ, không phải mẫu — `%` không khớp mọi dòng.
    const wildcard = await history.list(baseTenant(BILLING_MODE.PACKAGE), { q: '%' }, true);
    expect(wildcard.meta.total).toBe(0);
  });

  maybe('phạm vi chi nhánh: được giao một chi nhánh thì chỉ thấy xe của chi nhánh đó', async () => {
    const page = await history.list(
      { tenantId, allowedBranchIds: [branchA], billingMode: BILLING_MODE.PACKAGE },
      {},
      true,
    );
    expect(page.meta.tabCounts).toEqual({ all: 4, completed: 1, cancelled: 1, notConverted: 2 });
    // Mảng RỖNG = không được giao chi nhánh nào ⇒ không thấy gì (fail-closed, ADR 0052).
    const none = await history.list(
      { tenantId, allowedBranchIds: [], billingMode: BILLING_MODE.PACKAGE },
      {},
      true,
    );
    expect(none.meta.total).toBe(0);
  });

  maybe('thiếu quyền xem yêu cầu ⇒ không có dòng yêu cầu, ngăn "Không thành đơn" = 0', async () => {
    const page = await history.list(baseTenant(BILLING_MODE.PACKAGE), {}, false);
    expect(page.data.every((row) => row.kind === BOOKING_HISTORY_KIND.BOOKING)).toBe(true);
    expect(page.meta.tabCounts.notConverted).toBe(0);
    expect(page.meta.includesRequests).toBe(false);
  });

  maybe('tuyến hoa hồng: dòng yêu cầu KHÔNG mang SĐT khách (ADR 0056); dòng đơn vẫn có', async () => {
    const page = await history.list(baseTenant(BILLING_MODE.COMMISSION), {}, true);
    expect(page.data.find((row) => row.id === ids.rejected)?.customerPhone).toBeNull();
    expect(page.data.find((row) => row.id === ids.completed)?.customerPhone).toBe('0909000111');

    const packagePage = await history.list(baseTenant(BILLING_MODE.PACKAGE), {}, true);
    expect(packagePage.data.find((row) => row.id === ids.rejected)?.customerPhone).toBe('0909000222');
  });
});
