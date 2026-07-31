import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  LISTING_STATUS,
  SERVICE_TYPE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { PlatformDashboardService } from '../src/modules/platform-admin/platform-dashboard.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Phase 7 — Dashboard nền tảng, chạy trên PostgreSQL THẬT. Các suite jest chạy SONG SONG cùng
 * ghi bảng global (tenants/bookings/listings) nên KHÔNG assert số tuyệt đối hay delta — chỉ
 * assert CẬN DƯỚI (fixture của suite này còn sống ⇒ count ≥ 1) + bất biến nội tại của summary
 * (tenantTotal = tổng byStatus, listingTotal ≥ listingActive, recentTenants sắp mới→cũ).
 */
const prisma = createPrismaClient();
const service = new PlatformDashboardService(prisma as unknown as PrismaService);

let dbAvailable = false;
let ownerId: string;
let tActive: string;
let tSuspended: string;
let vehicleId: string;
let listingId: string;
let bookingId: string;
let approvalId: string;

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
  tActive = newId();
  tSuspended = newId();
  vehicleId = newId();
  listingId = newId();
  bookingId = newId();
  approvalId = newId();
});

afterAll(async () => {
  if (dbAvailable && ownerId) {
    await prisma.approvalTask.deleteMany({ where: { id: approvalId } });
    await prisma.booking.deleteMany({ where: { id: bookingId } });
    await prisma.publicListing.deleteMany({ where: { id: listingId } });
    await prisma.vehicle.deleteMany({ where: { id: vehicleId } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tActive, tSuspended] } } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Platform dashboard (Phase 7)', () => {
  maybe('summary: cận dưới theo fixture + bất biến nội tại', async () => {
    await prisma.user.create({
      data: { id: ownerId, displayName: 'Owner', email: `own-${ownerId}@xeprime.test` },
    });
    const mkTenant = (id: string, status: string) =>
      prisma.tenant.create({
        data: {
          id,
          code: `T-${id.slice(-8)}`,
          slug: `t-${id.toLowerCase().slice(-10)}`,
          name: `Dash-${id.slice(-6)}`,
          status,
          ownerUserId: ownerId,
        },
      });
    await mkTenant(tActive, TENANT_STATUS.ACTIVE);
    await mkTenant(tSuspended, TENANT_STATUS.SUSPENDED);
    await prisma.vehicle.create({
      data: {
        id: vehicleId,
        tenantId: tActive,
        code: `XE-${vehicleId.slice(-6)}`,
        name: 'Vios',
        vehicleType: VEHICLE_TYPE.CAR,
      },
    });
    await prisma.publicListing.create({
      data: {
        id: listingId,
        tenantId: tActive,
        vehicleId,
        shopSlug: `t-${tActive.toLowerCase().slice(-10)}`,
        title: 'Vios',
        status: LISTING_STATUS.ACTIVE,
        vehicleType: VEHICLE_TYPE.CAR,
        serviceType: SERVICE_TYPE.SELF_DRIVE,
      },
    });
    await prisma.booking.create({
      data: {
        id: bookingId,
        tenantId: tActive,
        vehicleId,
        code: `BK-${bookingId.slice(-6)}`,
        customerName: 'Khách test',
        pickupAt: new Date(),
        returnAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    await prisma.approvalTask.create({
      data: {
        id: approvalId,
        tenantId: tActive,
        targetType: APPROVAL_TARGET_TYPE.TENANT,
        targetId: tActive,
        status: APPROVAL_STATUS.PENDING,
        submittedBy: ownerId,
      },
    });

    const summary = await service.summary();

    // Cận dưới: fixture của suite này chưa bị xoá nên mỗi count phải chứa nó.
    expect(summary.tenantTotal).toBeGreaterThanOrEqual(2);
    expect(summary.tenantsByStatus.active).toBeGreaterThanOrEqual(1);
    expect(summary.tenantsByStatus.suspended).toBeGreaterThanOrEqual(1);
    expect(summary.listingActive).toBeGreaterThanOrEqual(1);
    expect(summary.bookingTotal).toBeGreaterThanOrEqual(1);
    // Booking vừa tạo → createdAt = bây giờ, chắc chắn thuộc tháng VN hiện tại.
    expect(summary.bookingThisMonth).toBeGreaterThanOrEqual(1);
    expect(summary.approvalPendingTenant).toBeGreaterThanOrEqual(1);

    // Bất biến nội tại — không phụ thuộc suite khác ghi song song.
    const statusSum = Object.values(summary.tenantsByStatus).reduce((a, b) => a + b, 0);
    expect(summary.tenantTotal).toBe(statusSum);
    expect(summary.listingTotal).toBeGreaterThanOrEqual(summary.listingActive);
    expect(summary.bookingTotal).toBeGreaterThanOrEqual(summary.bookingThisMonth);
    expect(summary.approvalPending).toBeGreaterThanOrEqual(
      summary.approvalPendingTenant + summary.approvalPendingVehicle,
    );

    // "Gian hàng mới": tối đa 5, sắp mới→cũ, item đúng shape (không assert chứa fixture —
    // suite khác có thể tạo tenant mới hơn ngay sau).
    expect(summary.recentTenants.length).toBeLessThanOrEqual(5);
    expect(summary.recentTenants.length).toBeGreaterThanOrEqual(1);
    const times = summary.recentTenants.map((t) => new Date(t.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    for (const t of summary.recentTenants) {
      expect(typeof t.id).toBe('string');
      expect(typeof t.name).toBe('string');
      expect(typeof t.status).toBe('string');
    }
  });
});
