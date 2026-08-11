import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  BOOKING_STATUS,
  MEMBERSHIP_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { BillingService } from '../src/modules/billing/billing.service';
import { CatalogService } from '../src/modules/catalog/catalog.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { VehiclesService } from '../src/modules/vehicles/vehicles.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Wave 1 (Vehicle 360) — `fleetSummary` + `summary360`, chạy trên PostgreSQL THẬT.
 *
 * Kiểm chứng: đếm đội xe theo trạng thái đúng scope tenant (không tính xe xoá mềm, không tính
 * xe shop khác); tổng hợp 360 trả 404 cho xe ngoài tenant; hai danh sách đơn gate theo
 * `canViewBookings`; tiền gate theo `canViewFinance`; "sắp tới" chỉ gồm đơn còn chiếm lịch và
 * xếp theo ngày nhận gần nhất. Không có DB thì tự skip.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const vehicles = new VehiclesService(
  asService,
  new AuditService(asService),
  new ListingsService(asService),
  new BillingService(asService, new AuditService(asService)),
  new CatalogService(asService, new AuditService(asService)),
  new PricingService(asService, new AuditService(asService)),
);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let otherTenantId: string;
let vehicleId: string;
let otherVehicleId: string;

const HOUR = 60 * 60 * 1000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR);

async function createTenant(name: string) {
  const id = newId();
  await prisma.tenant.create({
    data: {
      id,
      code: `T-${id.slice(-8)}`,
      slug: `t-${id.toLowerCase().slice(-10)}`,
      name,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  return id;
}

async function createBooking(input: {
  tenantId: string;
  vehicleId: string;
  status: string;
  pickupAt: Date;
  returnAt: Date;
  customerName?: string;
  totalAmount?: string;
}) {
  const id = newId();
  await prisma.booking.create({
    data: {
      id,
      tenantId: input.tenantId,
      vehicleId: input.vehicleId,
      code: `BK-${id.slice(-8)}`,
      customerName: input.customerName ?? 'Khách test',
      status: input.status,
      pickupAt: input.pickupAt,
      returnAt: input.returnAt,
      totalAmount: input.totalAmount ?? '0',
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
  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
  });
  tenantId = await createTenant('Shop Summary');
  otherTenantId = await createTenant('Shop Khác');
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });

  const mine = await vehicles.create(tenantId, ownerId, {
    code: 'SUM-1',
    name: 'Toyota Vios',
    vehicleType: VEHICLE_TYPE.CAR,
  });
  vehicleId = mine.id;
  const theirs = await vehicles.create(otherTenantId, ownerId, {
    code: 'SUM-X',
    name: 'Xe shop khác',
    vehicleType: VEHICLE_TYPE.CAR,
  });
  otherVehicleId = theirs.id;
});

afterAll(async () => {
  if (dbAvailable) {
    const tenants = [tenantId, otherTenantId];
    await prisma.booking.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.publicListing.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('fleetSummary — đếm đội xe theo trạng thái vận hành', () => {
  maybe('đếm theo trạng thái, đúng scope tenant, bỏ xe xoá mềm', async () => {
    const extra = await vehicles.create(tenantId, ownerId, {
      code: 'SUM-2',
      name: 'Xe bảo dưỡng',
      vehicleType: VEHICLE_TYPE.CAR,
      operationStatus: VEHICLE_OPERATION_STATUS.MAINTENANCE,
    });
    const deleted = await vehicles.create(tenantId, ownerId, {
      code: 'SUM-3',
      name: 'Xe sẽ xoá',
      vehicleType: VEHICLE_TYPE.CAR,
    });
    await vehicles.remove(tenantId, deleted.id);

    const summary = await vehicles.fleetSummary(tenantId);

    // SUM-1 (available) + SUM-2 (maintenance); SUM-3 đã xoá mềm và xe shop khác không được tính.
    expect(summary.total).toBe(2);
    expect(summary.available).toBe(1);
    expect(summary.maintenance).toBe(1);
    expect(summary.renting).toBe(0);
    expect(summary.inactive).toBe(0);

    // Dọn để các test sau đếm trên trạng thái sạch.
    await prisma.vehicle.deleteMany({ where: { id: { in: [extra.id, deleted.id] } } });
    await prisma.publicListing.deleteMany({
      where: { vehicleId: { in: [extra.id, deleted.id] } },
    });
  });
});

describe('summary360 — tổng hợp Hồ sơ 360', () => {
  maybe('xe của shop khác: 404, không lộ tồn tại', async () => {
    await expect(
      vehicles.summary360(tenantId, otherVehicleId, {
        canViewFinance: true,
        canViewBookings: true,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  maybe('đơn sắp tới: chỉ đơn còn chiếm lịch, xếp theo ngày nhận gần nhất', async () => {
    await prisma.booking.deleteMany({ where: { tenantId } });
    // Còn chiếm lịch: reserved/confirmed/active với return trong tương lai.
    await createBooking({
      tenantId,
      vehicleId,
      status: BOOKING_STATUS.CONFIRMED,
      customerName: 'Khách B',
      pickupAt: inHours(48),
      returnAt: inHours(72),
    });
    await createBooking({
      tenantId,
      vehicleId,
      status: BOOKING_STATUS.ACTIVE,
      customerName: 'Khách A',
      pickupAt: inHours(-2),
      returnAt: inHours(24),
      totalAmount: '1700000',
    });
    // Không được xuất hiện trong "sắp tới": đã xong / đã huỷ / đã trả xe trong quá khứ.
    await createBooking({
      tenantId,
      vehicleId,
      status: BOOKING_STATUS.COMPLETED,
      pickupAt: inHours(-72),
      returnAt: inHours(-48),
    });
    await createBooking({
      tenantId,
      vehicleId,
      status: BOOKING_STATUS.CANCELLED,
      pickupAt: inHours(24),
      returnAt: inHours(48),
    });

    const summary = await vehicles.summary360(tenantId, vehicleId, {
      canViewFinance: true,
      canViewBookings: true,
    });

    expect(summary.upcomingBookings?.map((b) => b.customerName)).toEqual(['Khách A', 'Khách B']);
    // Tiền là string (ADR 0007) — Decimal của Prisma sẽ được interceptor serialize, service trả thô.
    expect(String(summary.upcomingBookings?.[0]?.totalAmount)).toBe('1700000');
    // Hoạt động gần đây: tối đa 3, mới thay đổi nhất trước, mọi trạng thái.
    expect(summary.recentBookings).toHaveLength(3);
  });

  maybe('stats gate theo canViewFinance; đơn gate theo canViewBookings', async () => {
    const noFinance = await vehicles.summary360(tenantId, vehicleId, {
      canViewFinance: false,
      canViewBookings: true,
    });
    expect(noFinance.stats.totalIncome).toBeUndefined();
    expect(noFinance.stats.totalExpense).toBeUndefined();
    expect(noFinance.stats.activeBookings).toBe(1);
    expect(noFinance.upcomingBookings).toBeDefined();

    const noBookings = await vehicles.summary360(tenantId, vehicleId, {
      canViewFinance: true,
      canViewBookings: false,
    });
    expect(noBookings.upcomingBookings).toBeUndefined();
    expect(noBookings.recentBookings).toBeUndefined();
    expect(noBookings.stats.totalIncome).toBe('0');
  });
});
