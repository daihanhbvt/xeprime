import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  REVIEW_STATUS,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { PublicListingsService } from '../src/modules/public-listings/public-listings.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Dữ liệu trang chủ marketplace — "Địa điểm nổi bật", "Gian hàng nổi bật" và điểm đánh giá trên
 * thẻ xe. Chạy trên PostgreSQL THẬT; cô lập bằng provinceName duy nhất để không dính seed.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const service = new PublicListingsService(asService);
const listings = new ListingsService(asService);

const RUN = newId().slice(-6);
const PROV_BIG = `ZZ-Big-${RUN}`;
const PROV_SMALL = `ZZ-Small-${RUN}`;
const PROV_LOCKED = `ZZ-Locked-${RUN}`;

let dbAvailable = false;
let ownerId: string;
let customerId: string;
let tenantBig: string;
let tenantSmall: string;
let tenantLocked: string;
let tenantEmpty: string;
let ratedVehicle: string;

async function seedTenant(province: string, status: string, rating: number): Promise<string> {
  const id = newId();
  await prisma.tenant.create({
    data: {
      id,
      code: `T-${id.slice(-8)}`,
      slug: `t-${id.toLowerCase().slice(-10)}`,
      name: `Shop ${province}`,
      status,
      ownerUserId: ownerId,
      ratingAvg: rating.toFixed(2),
      ratingCount: rating > 0 ? 10 : 0,
    },
  });
  await prisma.tenantProfile.create({
    data: { tenantId: id, displayName: `Shop ${province}`, provinceName: province },
  });
  return id;
}

async function seedVehicle(tenantId: string): Promise<string> {
  const id = newId();
  await prisma.vehicle.create({
    data: {
      id,
      tenantId,
      code: `V-${id.slice(-6)}`,
      name: 'Toyota Vios',
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      mainImageUrl: 'https://img.example/vios.jpg',
      weekdayPrice: '600000',
    },
  });
  await listings.syncFromVehicle(id);
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
  customerId = newId();
  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
  });
  await prisma.user.create({
    data: { id: customerId, displayName: 'Khách', email: `cus-${customerId}@xeprime.test` },
  });

  tenantBig = await seedTenant(PROV_BIG, TENANT_STATUS.ACTIVE, 4.9);
  tenantSmall = await seedTenant(PROV_SMALL, TENANT_STATUS.ACTIVE, 4.1);
  tenantLocked = await seedTenant(PROV_LOCKED, TENANT_STATUS.SUSPENDED, 5);
  tenantEmpty = await seedTenant(`ZZ-Empty-${RUN}`, TENANT_STATUS.ACTIVE, 5);

  // Big: 3 xe · Small: 1 xe · Locked: 1 xe (shop bị khoá) · Empty: không xe.
  ratedVehicle = await seedVehicle(tenantBig);
  await seedVehicle(tenantBig);
  await seedVehicle(tenantBig);
  await seedVehicle(tenantSmall);
  await seedVehicle(tenantLocked);

  // 2 review published (5 + 4 = 4.5) + 1 hidden (không được tính).
  for (const [rating, status] of [
    [5, REVIEW_STATUS.PUBLISHED],
    [4, REVIEW_STATUS.PUBLISHED],
    [1, REVIEW_STATUS.HIDDEN],
  ] as const) {
    await prisma.review.create({
      data: {
        id: newId(),
        tenantId: tenantBig,
        vehicleId: ratedVehicle,
        customerId,
        rating,
        status,
      },
    });
  }
});

afterAll(async () => {
  if (dbAvailable) {
    const tenantIds = [tenantBig, tenantSmall, tenantLocked, tenantEmpty];
    await prisma.review.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.publicListing.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, customerId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Dữ liệu trang chủ marketplace', () => {
  maybe('địa điểm nổi bật: đếm đúng số xe, có ảnh, loại tỉnh của shop bị khoá', async () => {
    const all = await service.listDestinations({ limit: 63 });
    const byName = new Map(all.map((d) => [d.provinceName, d]));

    expect(byName.get(PROV_BIG)?.vehicleCount).toBe(3);
    expect(byName.get(PROV_SMALL)?.vehicleCount).toBe(1);
    expect(byName.get(PROV_BIG)?.imageUrl).toBe('https://img.example/vios.jpg');

    // Shop bị khoá → xe không hiện trên marketplace, tỉnh đó cũng không được đếm (ADR 0008).
    expect(byName.has(PROV_LOCKED)).toBe(false);
  });

  maybe('địa điểm nổi bật: tôn trọng limit và sắp theo số xe giảm dần', async () => {
    const all = await service.listDestinations({ limit: 63 });
    const counts = all.map((d) => d.vehicleCount);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);

    const limited = await service.listDestinations({ limit: 1 });
    expect(limited).toHaveLength(1);
  });

  maybe('gian hàng nổi bật: chỉ shop có xe công khai, đếm xe đúng, sắp theo điểm', async () => {
    const res = await service.listShops({ limit: 48 });
    const slugs = res.data.map((s) => s.slug);

    const big = res.data.find((s) => s.name === `Shop ${PROV_BIG}`);
    expect(big?.vehicleCount).toBe(3);
    expect(big?.provinceName).toBe(PROV_BIG);

    // Shop không có xe / shop bị khoá đều không lọt vào danh sách.
    const emptySlug = (await prisma.tenant.findUniqueOrThrow({ where: { id: tenantEmpty } })).slug;
    const lockedSlug = (await prisma.tenant.findUniqueOrThrow({ where: { id: tenantLocked } })).slug;
    expect(slugs).not.toContain(emptySlug);
    expect(slugs).not.toContain(lockedSlug);

    const ratings = res.data.map((s) => Number(s.ratingAvg));
    expect([...ratings].sort((a, b) => b - a)).toEqual(ratings);
  });

  maybe('thẻ xe mang điểm đánh giá của XE, chỉ tính review published', async () => {
    const res = await service.search({ province: PROV_BIG, limit: 48 });
    const rated = res.data.find((v) => v.id === ratedVehicle);
    // (5 + 4) / 2 = 4.5 — review hidden bị loại.
    expect(rated?.ratingAvg).toBe('4.5');
    expect(rated?.ratingCount).toBe(2);

    const noReview = res.data.find((v) => v.id !== ratedVehicle);
    expect(noReview?.ratingAvg).toBeNull();
    expect(noReview?.ratingCount).toBe(0);
  });
});
