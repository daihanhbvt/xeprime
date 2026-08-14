import { createPrismaClient, newId } from '@xeprime/prisma';
import { TENANT_STATUS, VEHICLE_PUBLIC_STATUS, VEHICLE_TYPE } from '@xeprime/types';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makePublicListingsService, seedBranch } from './helpers/service-factory';

/**
 * Phase 3 — trang gian hàng công khai `/shops/[slug]` chạy trên PostgreSQL THẬT. Kiểm chứng:
 * chỉ shop `active` mở được (404 nếu draft/không tồn tại), chỉ xe `approved_public` của đúng shop
 * lọt, và phân trang `meta` đúng. Không có DB thì tự skip.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/api test
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const service = makePublicListingsService(asService);
const listings = new ListingsService(asService);

/** Tỉnh chính thức 79 — có sẵn sau migration danh mục, không cần seed riêng. */
const PROV = '79';
const PROV_NAME = 'Hồ Chí Minh';
const branchByTenant = new Map<string, string>();

let dbAvailable = false;
let ownerId: string;
let activeTenantId: string;
let draftTenantId: string;
let otherTenantId: string;
let activeSlug: string;
let draftSlug: string;

async function seedTenant(status: string): Promise<{ id: string; slug: string }> {
  const id = newId();
  const slug = `shop-${id.toLowerCase().slice(-10)}`;
  await prisma.tenant.create({
    data: {
      id,
      code: `T-${id.slice(-8)}`,
      slug,
      name: `Shop ${status}`,
      status,
      ownerUserId: ownerId,
      ratingAvg: '4.50',
      ratingCount: 3,
    },
  });
  // Tỉnh CHÍNH THỨC (79 = Hồ Chí Minh) có sẵn trong mọi database sau migration danh mục —
  // spec không phải tự dựng dữ liệu tham chiếu.
  await prisma.tenantProfile.create({
    data: {
      tenantId: id,
      displayName: `Shop ${status}`,
      provinceCode: PROV,
      provinceName: PROV_NAME,
    },
  });
  branchByTenant.set(id, await seedBranch(asService, { tenantId: id, provinceCode: PROV }));
  return { id, slug };
}

async function seedVehicle(tenantId: string, publicStatus: string): Promise<string> {
  const id = newId();
  await prisma.vehicle.create({
    data: {
      id,
      tenantId,
      branchId: branchByTenant.get(tenantId),
      code: `V-${id.slice(-6)}`,
      name: 'Toyota Vios',
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus,
      mainImageUrl: 'https://img.example/vios.jpg',
      weekdayPrice: '600000',
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

  const active = await seedTenant(TENANT_STATUS.ACTIVE);
  const draft = await seedTenant(TENANT_STATUS.DRAFT);
  const other = await seedTenant(TENANT_STATUS.ACTIVE);
  activeTenantId = active.id;
  activeSlug = active.slug;
  draftTenantId = draft.id;
  draftSlug = draft.slug;
  otherTenantId = other.id;

  // Shop active: 2 xe approved + 1 draft + 1 hidden (chỉ 2 approved được hiển thị).
  await seedVehicle(activeTenantId, VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC);
  await seedVehicle(activeTenantId, VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC);
  await seedVehicle(activeTenantId, VEHICLE_PUBLIC_STATUS.DRAFT);
  await seedVehicle(activeTenantId, VEHICLE_PUBLIC_STATUS.HIDDEN);
  // Shop khác: 1 xe approved — không được lọt vào danh sách của shop active.
  await seedVehicle(otherTenantId, VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC);

  // Reads đọc từ public_listings (ADR 0008) → sync mọi xe seed vào snapshot.
  const seeded = await prisma.vehicle.findMany({
    where: { tenantId: { in: [activeTenantId, draftTenantId, otherTenantId] } },
    select: { id: true },
  });
  for (const { id } of seeded) await listings.syncFromVehicle(id);
});

afterAll(async () => {
  if (dbAvailable) {
    const tenantIds = [activeTenantId, draftTenantId, otherTenantId];
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Public shop page (/shops/[slug])', () => {
  maybe('getShopBySlug shop active → hồ sơ công khai (rating string)', async () => {
    const shop = await service.getShopBySlug(activeSlug);
    expect(shop.slug).toBe(activeSlug);
    // Tên CHUẨN từ danh mục ('Hồ Chí Minh'), không phải chuỗi tự do kiểu 'TP. Hồ Chí Minh'.
    expect(shop.provinceName).toBe(PROV_NAME);
    expect(shop.ratingCount).toBe(3);
    // ADR 0007: tiền/decimal qua JSON là string (ResponseInterceptor ép ở tầng response;
    // ở service Decimal vẫn là Decimal nên so khớp giá trị).
    expect(String(shop.ratingAvg)).toBe('4.5');
  });

  maybe('getShopBySlug shop draft → 404', async () => {
    await expect(service.getShopBySlug(draftSlug)).rejects.toThrow(/không/i);
  });

  maybe('getShopBySlug slug không tồn tại → 404', async () => {
    await expect(service.getShopBySlug('khong-ton-tai-xyz')).rejects.toThrow(/không/i);
  });

  maybe('listShopVehicles chỉ trả xe approved của đúng shop', async () => {
    const res = await service.listShopVehicles(activeSlug, {});
    expect(res.meta.total).toBe(2); // 2 approved, bỏ draft + hidden
    expect(res.data).toHaveLength(2);
    expect(res.data.every((v) => v.shopSlug === activeSlug)).toBe(true);
  });

  maybe('listShopVehicles phân trang (limit 1 → hasNext)', async () => {
    const page1 = await service.listShopVehicles(activeSlug, { limit: 1, page: 1 });
    expect(page1.data).toHaveLength(1);
    expect(page1.meta.total).toBe(2);
    expect(page1.meta.hasNext).toBe(true);

    const page2 = await service.listShopVehicles(activeSlug, { limit: 1, page: 2 });
    expect(page2.data).toHaveLength(1);
    expect(page2.meta.hasNext).toBe(false);
    expect(page1.data[0]?.id).not.toBe(page2.data[0]?.id);
  });

  maybe('listShopVehicles shop draft → rỗng (trang shop đã 404 từ getShopBySlug)', async () => {
    const res = await service.listShopVehicles(draftSlug, {});
    expect(res.meta.total).toBe(0);
    expect(res.data).toHaveLength(0);
  });
});
