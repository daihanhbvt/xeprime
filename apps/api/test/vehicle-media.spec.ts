import { createPrismaClient, newId } from '@xeprime/prisma';
import { MEMBERSHIP_STATUS, TENANT_ROLE, TENANT_STATUS, VEHICLE_TYPE } from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { BillingService } from '../src/modules/billing/billing.service';
import { CatalogService } from '../src/modules/catalog/catalog.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { VehiclesService } from '../src/modules/vehicles/vehicles.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Gap 4 — gallery ảnh + tiện ích xe, chạy trên PostgreSQL THẬT. Kiểm chứng: create/update
 * replace-set (thay toàn bộ, giữ thứ tự ảnh, khử trùng feature), bỏ trống field thì giữ nguyên,
 * xoá xe thì ảnh/feature cascade. Không có DB thì tự skip.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const vehicles = new VehiclesService(
  asService,
  new AuditService(asService),
  new ListingsService(asService),
  new BillingService(asService, new AuditService(asService)),
  new CatalogService(asService, new AuditService(asService)),
);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;

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
  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: 'Shop Media',
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
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
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

async function createBase(code: string) {
  return vehicles.create(tenantId, ownerId, {
    code,
    name: 'Toyota Vios',
    vehicleType: VEHICLE_TYPE.CAR,
    images: ['https://img/1.jpg', 'https://img/2.jpg'],
    features: ['bluetooth', 'gps'],
  });
}

describe('Vehicle gallery + features (Gap 4)', () => {
  maybe('create lưu ảnh (đúng thứ tự) + tiện ích', async () => {
    const v = await createBase('MED-1');
    expect(v.images).toEqual(['https://img/1.jpg', 'https://img/2.jpg']);
    expect([...v.features].sort()).toEqual(['bluetooth', 'gps']);
  });

  maybe('update replace-set: ảnh mới thay toàn bộ, giữ thứ tự', async () => {
    const created = await createBase('MED-2');
    const updated = await vehicles.update(tenantId, created.id, ownerId, {
      images: ['https://img/x.jpg'],
      features: ['camera_360'],
    });
    expect(updated.images).toEqual(['https://img/x.jpg']);
    expect(updated.features).toEqual(['camera_360']);
  });

  maybe('update khử trùng feature (unique)', async () => {
    const created = await createBase('MED-3');
    const updated = await vehicles.update(tenantId, created.id, ownerId, {
      features: ['gps', 'gps', 'usb'],
    });
    expect([...updated.features].sort()).toEqual(['gps', 'usb']);
  });

  maybe('update không gửi images/features → giữ nguyên', async () => {
    const created = await createBase('MED-4');
    const updated = await vehicles.update(tenantId, created.id, ownerId, { name: 'Đổi tên' });
    expect(updated.name).toBe('Đổi tên');
    expect(updated.images).toEqual(['https://img/1.jpg', 'https://img/2.jpg']);
    expect([...updated.features].sort()).toEqual(['bluetooth', 'gps']);
  });

  maybe('update images = [] → xoá hết ảnh', async () => {
    const created = await createBase('MED-5');
    const updated = await vehicles.update(tenantId, created.id, ownerId, { images: [] });
    expect(updated.images).toEqual([]);
  });

  maybe('xoá mềm xe → ảnh/feature cascade khi xoá cứng (FK)', async () => {
    const created = await createBase('MED-6');
    const imgBefore = await prisma.vehicleImage.count({ where: { vehicleId: created.id } });
    expect(imgBefore).toBe(2);
    // Xoá cứng để kiểm cascade FK (afterAll deleteMany cũng dựa vào cascade này).
    await prisma.vehicle.delete({ where: { id: created.id } });
    const imgAfter = await prisma.vehicleImage.count({ where: { vehicleId: created.id } });
    const featAfter = await prisma.vehicleFeature.count({ where: { vehicleId: created.id } });
    expect(imgAfter).toBe(0);
    expect(featAfter).toBe(0);
  });
});
