import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  LISTING_STATUS,
  TENANT_STATUS,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { PlatformVehiclesService } from '../src/modules/platform-admin/platform-vehicles.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Phase 7 — Xe toàn hệ thống + kiểm duyệt ẩn/bỏ ẩn, chạy trên PostgreSQL THẬT.
 *
 * Điểm quan trọng nhất được kiểm chứng: ẩn xe KHÔNG chỉ đổi `publicStatus` mà còn hạ snapshot
 * `public_listings` xuống `hidden` trong cùng transaction (ADR 0008) — nếu không, xe vẫn nằm
 * trên Marketplace dù admin đã ẩn.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const service = new PlatformVehiclesService(
  asService,
  new AuditService(asService),
  new ListingsService(asService),
);

let dbAvailable = false;
let adminId: string;
let activeTenant: string;
let suspendedTenant: string;
let publicVehicle: string;
let draftVehicle: string;
let otherShopVehicle: string;
let tag: string;

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }

  adminId = newId();
  activeTenant = newId();
  suspendedTenant = newId();
  publicVehicle = newId();
  draftVehicle = newId();
  otherShopVehicle = newId();
  tag = activeTenant.slice(-6);

  await prisma.user.create({
    data: { id: adminId, displayName: 'Admin', email: `pv-${adminId}@xeprime.test` },
  });

  const mkTenant = (id: string, status: string) =>
    prisma.tenant.create({
      data: {
        id,
        code: `T-${id.slice(-8)}`,
        slug: `t-${id.toLowerCase().slice(-10)}`,
        name: `Shop-${id.slice(-6)}`,
        status,
        ownerUserId: adminId,
      },
    });
  await mkTenant(activeTenant, TENANT_STATUS.ACTIVE);
  await mkTenant(suspendedTenant, TENANT_STATUS.SUSPENDED);

  const mkVehicle = (id: string, tenantId: string, name: string, publicStatus: string) =>
    prisma.vehicle.create({
      data: {
        id,
        tenantId,
        code: `XE-${id.slice(-6)}`,
        name,
        plateNumber: `51A-${id.slice(-5)}`,
        vehicleType: VEHICLE_TYPE.CAR,
        publicStatus,
        operationStatus: VEHICLE_OPERATION_STATUS.AVAILABLE,
        weekdayPrice: '700000',
      },
    });
  await mkVehicle(publicVehicle, activeTenant, `Vios-${tag}`, VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC);
  await mkVehicle(draftVehicle, activeTenant, `Nhap-${tag}`, VEHICLE_PUBLIC_STATUS.DRAFT);
  await mkVehicle(
    otherShopVehicle,
    suspendedTenant,
    `Khoa-${tag}`,
    VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
  );

  // Snapshot Marketplace của xe đã duyệt — dựng qua chính writer hợp lệ (ADR 0008).
  const listings = new ListingsService(asService);
  await listings.syncFromVehicle(publicVehicle);
  await listings.syncFromVehicle(otherShopVehicle);
});

afterAll(async () => {
  if (dbAvailable) {
    const tenantIds = [activeTenant, suspendedTenant];
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.publicListing.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { id: adminId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Platform vehicles (Phase 7)', () => {
  maybe('list: tìm theo tên/biển số, lọc trạng thái duyệt + trạng thái gian hàng', async () => {
    const byName = await service.list({ q: `Vios-${tag}` });
    expect(byName.data.map((v) => v.id)).toContain(publicVehicle);
    expect(byName.data[0]?.tenantName).toMatch(/^Shop-/);
    expect(byName.data[0]?.listingStatus).toBe(LISTING_STATUS.ACTIVE);

    const row = byName.data.find((v) => v.id === publicVehicle);
    // Service trả Decimal; ResponseInterceptor mới ép sang string ở biên HTTP (ADR 0007).
    // Điều cần chắc ở tầng này: giá trị không bị làm tròn/đổi kiểu trên đường đi.
    expect(String(row?.weekdayPrice)).toBe('700000');

    const byPlate = await service.list({ q: publicVehicle.slice(-5) });
    expect(byPlate.data.map((v) => v.id)).toContain(publicVehicle);

    const drafts = await service.list({ tenantId: activeTenant, publicStatus: VEHICLE_PUBLIC_STATUS.DRAFT });
    expect(drafts.data.map((v) => v.id)).toEqual([draftVehicle]);
    // Xe chưa từng duyệt thì không có snapshot.
    expect(drafts.data[0]?.listingStatus).toBeNull();

    const ofSuspended = await service.list({ tenantStatus: TENANT_STATUS.SUSPENDED, q: `Khoa-${tag}` });
    expect(ofSuspended.data.map((v) => v.id)).toEqual([otherShopVehicle]);
  });

  maybe('phân trang: limit=1 trong 1 tenant → hasNext đúng, không trùng dòng', async () => {
    const p1 = await service.list({ tenantId: activeTenant, limit: 1, page: 1 });
    expect(p1.data).toHaveLength(1);
    expect(p1.meta).toMatchObject({ page: 1, limit: 1, total: 2, hasNext: true });

    const p2 = await service.list({ tenantId: activeTenant, limit: 1, page: 2 });
    expect(p2.meta.hasNext).toBe(false);
    expect(p1.data[0]!.id).not.toBe(p2.data[0]!.id);
  });

  maybe('ẩn xe: publicStatus → hidden, snapshot Marketplace → hidden, ghi audit', async () => {
    const res = await service.hide(publicVehicle, adminId, { reason: 'Ảnh vi phạm' });
    expect(res.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.HIDDEN);
    expect(res.listingStatus).toBe(LISTING_STATUS.HIDDEN);

    const listing = await prisma.publicListing.findUnique({ where: { vehicleId: publicVehicle } });
    expect(listing?.status).toBe(LISTING_STATUS.HIDDEN);

    const audit = await prisma.auditLog.findFirst({
      where: { targetId: publicVehicle, action: 'vehicle.platform_hide' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.actorScope).toBe('platform');
    expect(audit?.afterJson).toMatchObject({ reason: 'Ảnh vi phạm' });
  });

  maybe('ẩn lần nữa → INVALID_STATUS_TRANSITION (không ghi đè im lặng)', async () => {
    await expect(service.hide(publicVehicle, adminId, { reason: 'x' })).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION },
    });
  });

  maybe('bỏ ẩn: hidden → approved_public, snapshot bật lại active', async () => {
    const res = await service.unhide(publicVehicle, adminId);
    expect(res.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC);
    expect(res.listingStatus).toBe(LISTING_STATUS.ACTIVE);

    const listing = await prisma.publicListing.findUnique({ where: { vehicleId: publicVehicle } });
    expect(listing?.status).toBe(LISTING_STATUS.ACTIVE);
  });

  maybe('không ẩn được xe chưa duyệt public; không bỏ ẩn được xe đang hiển thị', async () => {
    await expect(service.hide(draftVehicle, adminId, { reason: 'x' })).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION },
    });
    await expect(service.unhide(publicVehicle, adminId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION },
    });
  });

  maybe('getOne / hide với id lạ → NOT_FOUND', async () => {
    await expect(service.getOne(newId())).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
    await expect(service.hide(newId(), adminId, { reason: 'x' })).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
  });
});
