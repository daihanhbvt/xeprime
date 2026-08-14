import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  REVIEW_STATUS,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makePublicListingsService, seedBranch, seedProvince } from './helpers/service-factory';

/**
 * Dữ liệu trang chủ marketplace — "Địa điểm nổi bật", "Gian hàng nổi bật" và điểm đánh giá trên
 * thẻ xe. Chạy trên PostgreSQL THẬT; cô lập bằng provinceName duy nhất để không dính seed.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const service = makePublicListingsService(asService);
const listings = new ListingsService(asService);

const PROV_BIG = 'Z5';
const PROV_BIG_NAME = 'Zone Home Big';
const PROV_SMALL = 'Z6';
const PROV_SMALL_NAME = 'Zone Home Small';
const PROV_LOCKED = 'Z7';
const PROV_LOCKED_NAME = 'Zone Home Locked';
/** Tỉnh có gian hàng nhưng KHÔNG có xe — phải vắng mặt ở danh sách điểm đến. */
const PROV_EMPTY = 'Z8';
const PROV_EMPTY_NAME = 'Zone Home Empty';
const ALL_PROV = [PROV_BIG, PROV_SMALL, PROV_LOCKED, PROV_EMPTY];

let dbAvailable = false;
let ownerId: string;
let customerId: string;
let tenantBig: string;
let tenantSmall: string;
let tenantLocked: string;
let tenantEmpty: string;
let ratedVehicle: string;

/** Chi nhánh mặc định của mỗi tenant — nguồn tỉnh cho snapshot công khai. */
const branchByTenant = new Map<string, string>();

async function seedTenant(
  provinceCode: string,
  provinceName: string,
  status: string,
  rating: number,
): Promise<string> {
  const id = newId();
  await prisma.tenant.create({
    data: {
      id,
      code: `T-${id.slice(-8)}`,
      slug: `t-${id.toLowerCase().slice(-10)}`,
      name: `Shop ${provinceName}`,
      status,
      ownerUserId: ownerId,
      ratingAvg: rating.toFixed(2),
      ratingCount: rating > 0 ? 10 : 0,
    },
  });
  await prisma.tenantProfile.create({
    data: { tenantId: id, displayName: `Shop ${provinceName}`, provinceCode, provinceName },
  });
  branchByTenant.set(id, await seedBranch(asService, { tenantId: id, provinceCode }));
  return id;
}

async function seedVehicle(tenantId: string): Promise<string> {
  const id = newId();
  await prisma.vehicle.create({
    data: {
      id,
      tenantId,
      branchId: branchByTenant.get(tenantId),
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

  for (const [code, name] of [
    [PROV_BIG, PROV_BIG_NAME],
    [PROV_SMALL, PROV_SMALL_NAME],
    [PROV_LOCKED, PROV_LOCKED_NAME],
    [PROV_EMPTY, PROV_EMPTY_NAME],
  ] as const) {
    await seedProvince(asService, code, name);
  }

  tenantBig = await seedTenant(PROV_BIG, PROV_BIG_NAME, TENANT_STATUS.ACTIVE, 4.9);
  tenantSmall = await seedTenant(PROV_SMALL, PROV_SMALL_NAME, TENANT_STATUS.ACTIVE, 4.1);
  tenantLocked = await seedTenant(PROV_LOCKED, PROV_LOCKED_NAME, TENANT_STATUS.SUSPENDED, 5);
  tenantEmpty = await seedTenant(PROV_EMPTY, PROV_EMPTY_NAME, TENANT_STATUS.ACTIVE, 5);

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
  // Danh sách đọc cột rating denormalize trên public_listings — sync như production
  // (ReviewService gọi refreshRating sau khi tạo review).
  await listings.refreshRating(ratedVehicle);
});

afterAll(async () => {
  if (dbAvailable) {
    const tenantIds = [tenantBig, tenantSmall, tenantLocked, tenantEmpty];
    await prisma.review.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.publicListing.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, customerId] } } });
    await prisma.province.deleteMany({ where: { code: { in: ALL_PROV } } });
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
    const all = await service.listDestinations({ limit: 34 });
    // Khoá theo MÃ, không theo tên: mã là thứ đi vào URL và bộ lọc.
    const byCode = new Map(all.map((d) => [d.provinceCode, d]));

    expect(byCode.get(PROV_BIG)?.vehicleCount).toBe(3);
    expect(byCode.get(PROV_SMALL)?.vehicleCount).toBe(1);
    expect(byCode.get(PROV_BIG)?.imageUrl).toBe('https://img.example/vios.jpg');
    // Tên trả về là tên CHUẨN từ danh mục, không phải chuỗi tự do của gian hàng.
    expect(byCode.get(PROV_BIG)?.provinceName).toBe(PROV_BIG_NAME);

    // Shop bị khoá → xe không hiện trên marketplace, tỉnh đó cũng không được đếm (ADR 0008).
    expect(byCode.has(PROV_LOCKED)).toBe(false);
    // Tỉnh không có xe nào KHÔNG bao giờ xuất hiện ở bộ chọn địa điểm.
    expect(byCode.has(PROV_EMPTY)).toBe(false);
  });

  maybe('ẩn một tỉnh ở danh mục → tỉnh đó biến khỏi điểm đến và khỏi search', async () => {
    await prisma.province.update({
      where: { code: PROV_SMALL },
      data: { isPublicVisible: false },
    });
    try {
      const codes = (await service.listDestinations({ limit: 34 })).map((d) => d.provinceCode);
      expect(codes).not.toContain(PROV_SMALL);

      // Gõ tay mã tỉnh đã ẩn vào query cũng KHÔNG ra xe — ẩn không phải chỉ để trang trí.
      const res = await service.search({ provinceCode: PROV_SMALL, limit: 48 } as never);
      expect(res.data).toHaveLength(0);
    } finally {
      await prisma.province.update({
        where: { code: PROV_SMALL },
        data: { isPublicVisible: true },
      });
    }
  });

  maybe('địa điểm nổi bật: tôn trọng limit và sắp theo số xe giảm dần', async () => {
    const all = await service.listDestinations({ limit: 34 });
    const counts = all.map((d) => d.vehicleCount);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);

    const limited = await service.listDestinations({ limit: 1 });
    expect(limited).toHaveLength(1);
  });

  maybe('gian hàng nổi bật: chỉ shop có xe công khai, đếm xe đúng, sắp theo điểm', async () => {
    const res = await service.listShops({ limit: 48 });
    const slugs = res.data.map((s) => s.slug);

    const big = res.data.find((s) => s.name === `Shop ${PROV_BIG_NAME}`);
    expect(big?.vehicleCount).toBe(3);
    expect(big?.provinceName).toBe(PROV_BIG_NAME);

    // Shop không có xe / shop bị khoá đều không lọt vào danh sách.
    const emptySlug = (await prisma.tenant.findUniqueOrThrow({ where: { id: tenantEmpty } })).slug;
    const lockedSlug = (await prisma.tenant.findUniqueOrThrow({ where: { id: tenantLocked } })).slug;
    expect(slugs).not.toContain(emptySlug);
    expect(slugs).not.toContain(lockedSlug);

    const ratings = res.data.map((s) => Number(s.ratingAvg));
    expect([...ratings].sort((a, b) => b - a)).toEqual(ratings);
  });

  maybe('thẻ xe mang điểm đánh giá của XE, chỉ tính review published', async () => {
    const res = await service.search({ provinceCode: PROV_BIG, limit: 48 });
    const rated = res.data.find((v) => v.id === ratedVehicle);
    // (5 + 4) / 2 = 4.5 — review hidden bị loại.
    expect(rated?.ratingAvg).toBe('4.5');
    expect(rated?.ratingCount).toBe(2);

    const noReview = res.data.find((v) => v.id !== ratedVehicle);
    expect(noReview?.ratingAvg).toBeNull();
    expect(noReview?.ratingCount).toBe(0);
  });
});
