import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  MEMBERSHIP_STATUS,
  SERVICE_TYPE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TRIP_HISTORY_FILTER,
  VEHICLE_TRIP_HISTORY_KIND,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { VehicleTripHistoryService } from '../src/modules/vehicle-settings/vehicle-trip-history.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * LỊCH SỬ CHUYẾN CỦA MỘT XE — đơn thuê ∪ yêu cầu chưa thành đơn, trộn ở SQL, trên PostgreSQL THẬT.
 *
 * Luật được khoá:
 *
 *  1. Một chuyến chỉ xuất hiện MỘT lần: yêu cầu đã chuyển thành đơn không hiện thêm dòng riêng.
 *  2. Phân trang do DB cắt trên CÙNG tập đã trộn — `total` khớp số dòng thật, hai trang không lặp.
 *  3. Bộ lọc hoàn thành/đã huỷ đúng nghĩa vận hành (huỷ gồm cả yêu cầu bị từ chối/hết hạn).
 *  4. Không rò sang gian hàng khác và không rò sang xe khác của cùng gian hàng.
 *  5. Tiền là chuỗi (ADR 0007); đơn chưa có tiền trả về `null`, không phải `0`.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const history = new VehicleTripHistoryService(asService);

const RUN = newId().slice(-8).toLowerCase();
const DAY = 24 * 3600_000;

let dbAvailable = false;
let ownerId: string;
let customerId: string;
let tenantId: string;
let otherTenantId: string;
let otherOwnerId: string;
let vehicleId: string;
/** Xe thứ hai CÙNG gian hàng — lịch sử không được trộn hai xe vào nhau. */
let siblingVehicleId: string;
let otherVehicleId: string;
let seq = 0;

const ago = (days: number) => new Date(Date.now() - days * DAY);

async function seedTenant(label: string) {
  const owner = newId();
  const tenant = newId();
  await prisma.user.create({
    data: { id: owner, displayName: `Chủ ${label}`, email: `hist-${label}-${RUN}@xeprime.test` },
  });
  await prisma.tenant.create({
    data: {
      id: tenant,
      code: `T-${tenant.slice(-8)}`,
      slug: `t-${tenant.toLowerCase().slice(-10)}`,
      name: `HistShop-${label}-${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: owner,
    },
  });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId: tenant,
      userId: owner,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
      joinedAt: new Date(),
    },
  });
  return { owner, tenant };
}

async function seedVehicle(tenant: string, owner: string, name: string): Promise<string> {
  const id = newId();
  await prisma.vehicle.create({
    data: {
      id,
      tenantId: tenant,
      code: `XE${id.slice(-5)}`,
      name,
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      weekdayPrice: new Prisma.Decimal('700000'),
      createdBy: owner,
    },
  });
  return id;
}

/** Một đơn thuê, kèm (tuỳ chọn) yêu cầu đã chuyển đổi trỏ về chính nó. */
async function seedBooking(opts: {
  vehicle?: string;
  tenant?: string;
  status: string;
  daysAgo: number;
  totalAmount?: string | null;
  withRequest?: boolean;
}): Promise<{ bookingId: string; requestId: string | null }> {
  const tenant = opts.tenant ?? tenantId;
  const vehicle = opts.vehicle ?? vehicleId;
  const bookingId = newId();
  const pickupAt = ago(opts.daysAgo);
  const returnAt = new Date(pickupAt.getTime() + DAY);
  seq += 1;
  await prisma.booking.create({
    data: {
      id: bookingId,
      tenantId: tenant,
      vehicleId: vehicle,
      code: `BK-${RUN}-${seq}`,
      status: opts.status,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      customerName: `Khách ${seq}`,
      customerPhone: `0977${String(100000 + seq).slice(-6)}`,
      pickupAt,
      returnAt,
      baseAmount: new Prisma.Decimal('700000'),
      ...(opts.totalAmount === undefined
        ? { totalAmount: new Prisma.Decimal('700000') }
        : opts.totalAmount === null
          ? {}
          : { totalAmount: new Prisma.Decimal(opts.totalAmount) }),
    },
  });
  let requestId: string | null = null;
  if (opts.withRequest) {
    requestId = newId();
    await prisma.bookingRequest.create({
      data: {
        id: requestId,
        tenantId: tenant,
        vehicleId: vehicle,
        status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        customerName: `Khách ${seq}`,
        customerPhone: `0977${String(100000 + seq).slice(-6)}`,
        customerUserId: customerId,
        pickupAt,
        returnAt,
        respondBy: new Date(pickupAt.getTime() - 3600_000),
        bookingId,
        decidedBy: ownerId,
        decidedAt: pickupAt,
      },
    });
  }
  return { bookingId, requestId };
}

/** Một yêu cầu KHÔNG thành đơn (chờ, bị từ chối, hết hạn…). */
async function seedRequest(opts: {
  vehicle?: string;
  tenant?: string;
  status: string;
  daysAgo: number;
}): Promise<string> {
  const id = newId();
  const tenant = opts.tenant ?? tenantId;
  const pickupAt = ago(opts.daysAgo);
  seq += 1;
  await prisma.bookingRequest.create({
    data: {
      id,
      tenantId: tenant,
      vehicleId: opts.vehicle ?? vehicleId,
      status: opts.status,
      customerName: `Khách YC ${seq}`,
      customerPhone: `0966${String(100000 + seq).slice(-6)}`,
      customerUserId: customerId,
      pickupAt,
      returnAt: new Date(pickupAt.getTime() + DAY),
      respondBy: new Date(pickupAt.getTime() - 3600_000),
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
  const main = await seedTenant('main');
  ownerId = main.owner;
  tenantId = main.tenant;
  const other = await seedTenant('other');
  otherOwnerId = other.owner;
  otherTenantId = other.tenant;

  customerId = newId();
  await prisma.user.create({
    data: {
      id: customerId,
      displayName: 'Khách quen',
      email: `hist-cus-${RUN}@xeprime.test`,
      avatarUrl: 'https://img/avatar.jpg',
    },
  });

  vehicleId = await seedVehicle(tenantId, ownerId, 'Xe chính');
  siblingVehicleId = await seedVehicle(tenantId, ownerId, 'Xe cùng shop');
  otherVehicleId = await seedVehicle(otherTenantId, otherOwnerId, 'Xe shop khác');
});

afterEach(async () => {
  if (!dbAvailable) return;
  const tenants = { in: [tenantId, otherTenantId] };
  await prisma.bookingRequest.deleteMany({ where: { tenantId: tenants } });
  await prisma.booking.deleteMany({ where: { tenantId: tenants } });
});

afterAll(async () => {
  if (dbAvailable) {
    const tenants = { in: [tenantId, otherTenantId] };
    await prisma.vehicle.deleteMany({ where: { tenantId: tenants } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: tenants } });
    await prisma.tenant.deleteMany({ where: { id: tenants } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherOwnerId, customerId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Trộn hai nguồn — mỗi chuyến đúng một dòng', () => {
  maybe('yêu cầu đã thành đơn KHÔNG sinh thêm dòng riêng', async () => {
    const { bookingId, requestId } = await seedBooking({
      status: BOOKING_STATUS.COMPLETED,
      daysAgo: 3,
      withRequest: true,
    });

    const page = await history.list(tenantId, vehicleId, {});
    expect(page.meta.total).toBe(1);
    expect(page.data).toHaveLength(1);
    const row = page.data[0]!;
    expect(row.kind).toBe(VEHICLE_TRIP_HISTORY_KIND.BOOKING);
    expect(row.bookingId).toBe(bookingId);
    // Dòng đơn vẫn nhớ yêu cầu gốc — không mất đường quay về nguồn của chuyến.
    expect(row.requestId).toBe(requestId);
    expect(row.customerAvatarUrl).toBe('https://img/avatar.jpg');
  });

  maybe('yêu cầu chưa thành đơn và đơn tự lập cùng có mặt', async () => {
    await seedBooking({ status: BOOKING_STATUS.COMPLETED, daysAgo: 2 });
    await seedRequest({ status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, daysAgo: 1 });

    const page = await history.list(tenantId, vehicleId, {});
    expect(page.meta.total).toBe(2);
    expect(page.data.map((r) => r.kind).sort()).toEqual(
      [VEHICLE_TRIP_HISTORY_KIND.BOOKING, VEHICLE_TRIP_HISTORY_KIND.REQUEST].sort(),
    );
    // Khoá của mỗi dòng là duy nhất — danh sách React không bao giờ trùng key.
    expect(new Set(page.data.map((r) => r.key)).size).toBe(2);
  });

  maybe('tiền là CHUỖI; đơn chưa có tổng tiền trả null chứ không phải 0', async () => {
    await seedBooking({ status: BOOKING_STATUS.COMPLETED, daysAgo: 2, totalAmount: '1560000' });
    await seedRequest({ status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, daysAgo: 1 });

    const page = await history.list(tenantId, vehicleId, {});
    const booking = page.data.find((r) => r.kind === VEHICLE_TRIP_HISTORY_KIND.BOOKING)!;
    const request = page.data.find((r) => r.kind === VEHICLE_TRIP_HISTORY_KIND.REQUEST)!;
    expect(booking.totalAmount).toBe('1560000');
    expect(typeof booking.totalAmount).toBe('string');
    // Yêu cầu chưa chốt giá: không có tiền để hiện — null nói đúng điều đó.
    expect(request.totalAmount).toBeNull();
  });
});

describe('Phân trang — DB cắt trên tập đã trộn', () => {
  maybe('total khớp tổng thật, hai trang không lặp và không sót', async () => {
    for (let i = 0; i < 4; i += 1) {
      await seedBooking({ status: BOOKING_STATUS.COMPLETED, daysAgo: 10 + i });
    }
    for (let i = 0; i < 3; i += 1) {
      await seedRequest({ status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, daysAgo: 20 + i });
    }

    const first = await history.list(tenantId, vehicleId, { page: 1, limit: 4 });
    expect(first.meta.total).toBe(7);
    expect(first.data).toHaveLength(4);
    expect(first.meta.hasNext).toBe(true);

    const second = await history.list(tenantId, vehicleId, { page: 2, limit: 4 });
    expect(second.data).toHaveLength(3);
    expect(second.meta.hasNext).toBe(false);

    const keys = [...first.data, ...second.data].map((r) => r.key);
    expect(new Set(keys).size).toBe(7);
  });

  maybe('sắp theo mốc chuyến giảm dần — chuyến gần đây đứng trước', async () => {
    await seedBooking({ status: BOOKING_STATUS.COMPLETED, daysAgo: 30 });
    await seedBooking({ status: BOOKING_STATUS.COMPLETED, daysAgo: 1 });
    await seedRequest({ status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, daysAgo: 15 });

    const page = await history.list(tenantId, vehicleId, {});
    const stamps = page.data.map((r) => new Date(r.pickupAt!).getTime());
    expect(stamps).toEqual([...stamps].sort((a, b) => b - a));
  });
});

describe('Bộ lọc — đúng nghĩa vận hành', () => {
  maybe('hoàn thành: chỉ đơn đã hoàn thành', async () => {
    await seedBooking({ status: BOOKING_STATUS.COMPLETED, daysAgo: 5 });
    await seedBooking({ status: BOOKING_STATUS.CANCELLED, daysAgo: 4 });
    await seedBooking({ status: BOOKING_STATUS.RESERVED, daysAgo: 3 });
    await seedRequest({ status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, daysAgo: 2 });

    const page = await history.list(tenantId, vehicleId, {
      filter: VEHICLE_TRIP_HISTORY_FILTER.COMPLETED,
    });
    expect(page.meta.total).toBe(1);
    expect(page.data[0]!.bookingStatus).toBe(BOOKING_STATUS.COMPLETED);
  });

  maybe('đã huỷ: gồm đơn huỷ/không đến VÀ yêu cầu bị từ chối/hết hạn', async () => {
    await seedBooking({ status: BOOKING_STATUS.CANCELLED, daysAgo: 6 });
    await seedBooking({ status: BOOKING_STATUS.NO_SHOW, daysAgo: 5 });
    await seedBooking({ status: BOOKING_STATUS.COMPLETED, daysAgo: 4 });
    await seedRequest({ status: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST, daysAgo: 3 });
    await seedRequest({ status: BOOKING_REQUEST_STATUS.EXPIRED, daysAgo: 2 });
    await seedRequest({ status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, daysAgo: 1 });

    const page = await history.list(tenantId, vehicleId, {
      filter: VEHICLE_TRIP_HISTORY_FILTER.CANCELLED,
    });
    expect(page.meta.total).toBe(4);
    // Yêu cầu đang chờ KHÔNG phải một chuyến đã huỷ.
    expect(page.data.some((r) => r.requestStatus === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL))
      .toBe(false);
  });

  maybe('tất cả: đếm đủ mọi trạng thái', async () => {
    await seedBooking({ status: BOOKING_STATUS.COMPLETED, daysAgo: 3 });
    await seedRequest({ status: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST, daysAgo: 2 });
    const page = await history.list(tenantId, vehicleId, {
      filter: VEHICLE_TRIP_HISTORY_FILTER.ALL,
    });
    expect(page.meta.total).toBe(2);
  });
});

describe('Phạm vi — không rò sang xe khác hay gian hàng khác', () => {
  maybe('chuyến của xe khác cùng gian hàng không lọt vào', async () => {
    await seedBooking({ status: BOOKING_STATUS.COMPLETED, daysAgo: 3 });
    await seedBooking({ status: BOOKING_STATUS.COMPLETED, daysAgo: 2, vehicle: siblingVehicleId });

    const page = await history.list(tenantId, vehicleId, {});
    expect(page.meta.total).toBe(1);
  });

  maybe('gian hàng khác hỏi lịch sử xe này: 404, không phải danh sách rỗng', async () => {
    await seedBooking({ status: BOOKING_STATUS.COMPLETED, daysAgo: 3 });
    await expect(history.list(otherTenantId, vehicleId, {})).rejects.toMatchObject({ status: 404 });
  });

  maybe('xe của gian hàng khác có chuyến riêng, không trộn vào tenant này', async () => {
    await seedBooking({
      status: BOOKING_STATUS.COMPLETED,
      daysAgo: 3,
      vehicle: otherVehicleId,
      tenant: otherTenantId,
    });
    const mine = await history.list(tenantId, vehicleId, {});
    expect(mine.meta.total).toBe(0);
    const theirs = await history.list(otherTenantId, otherVehicleId, {});
    expect(theirs.meta.total).toBe(1);
  });
});
