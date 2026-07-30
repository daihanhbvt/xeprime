import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  BODY_TYPE,
  FUEL_TYPE,
  REVIEW_STATUS,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { PublicListingsService } from '../src/modules/public-listings/public-listings.service';
import type {
  ListingFacetsQueryDto,
  PublicListingQueryDto,
} from '../src/modules/public-listings/dto/public-listing.dto';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Bộ lọc facet marketplace trên PostgreSQL THẬT: đếm theo chiều với semantics chuẩn (mỗi chiều
 * bỏ chính filter của nó), filter CSV multi-select, bucket số chỗ, hasEvery tính năng, tiện ích,
 * biên giá, sort `recommended` từ rating denormalize. Cô lập bằng provinceName duy nhất.
 * Không có DB thì tự skip.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/api test -- test/listings-facets.spec.ts
 */
const prisma = createPrismaClient();
const service = new PublicListingsService(prisma as unknown as PrismaService);
const listings = new ListingsService(prisma as unknown as PrismaService);

const PROV = `ZZ-Facet-${newId().slice(-6)}`;

let dbAvailable = false;
let ownerId: string;
let customerId: string;
let tenantId: string;
/** sedan Toyota 5 chỗ xăng, bluetooth+gps, thuê giờ, giảm 10%, 600k, rating 5.00 (1 review). */
let vSedan: string;
/** suv Mazda 7 chỗ dầu, bluetooth+camera_360+sunroof, giao tận nơi, 1.2tr, rating 4.00. */
let vSuv: string;
/** mini Kia 4 chỗ xăng, không tính năng, miễn thế chấp + thuê giờ, 400k, chưa có review. */
let vMini: string;
/** cuv VinFast 5 chỗ điện, gps+screen, giao tận nơi + miễn thế chấp + giảm 5%, 900k, rating 5.00 (2 review). */
let vCuv: string;

interface FacetVehicle {
  brand: string;
  body: string;
  seats: number;
  fuel: string;
  price: string;
  features?: readonly string[];
  hourly?: string;
  delivery?: boolean;
  noCollateral?: boolean;
  discount?: number;
  ratings?: readonly number[];
}

async function seedFacetVehicle(v: FacetVehicle): Promise<string> {
  const id = newId();
  await prisma.vehicle.create({
    data: {
      id,
      tenantId,
      code: `V-${id.slice(-6)}`,
      name: `${v.brand} test`,
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      brand: v.brand,
      bodyType: v.body,
      seatCount: v.seats,
      fuelType: v.fuel,
      weekdayPrice: v.price,
      hourlyPrice: v.hourly ?? null,
      deliveryEnabled: v.delivery ?? false,
      noCollateral: v.noCollateral ?? false,
      discountPercent: v.discount ?? null,
      mainImageUrl: 'https://img.example/x.jpg',
    },
  });
  if (v.features?.length) {
    await prisma.vehicleFeature.createMany({
      data: v.features.map((featureKey) => ({ id: newId(), vehicleId: id, featureKey })),
    });
  }
  // Review không cần booking (bookingId nullable) — đủ để nuôi rating denormalize.
  for (const rating of v.ratings ?? []) {
    await prisma.review.create({
      data: {
        id: newId(),
        tenantId,
        vehicleId: id,
        customerId,
        rating,
        status: REVIEW_STATUS.PUBLISHED,
      },
    });
  }
  await listings.syncFromVehicle(id);
  return id;
}

const fq = (extra: Partial<ListingFacetsQueryDto> = {}): ListingFacetsQueryDto =>
  ({ province: PROV, ...extra }) as ListingFacetsQueryDto;
const sq = (extra: Partial<PublicListingQueryDto> = {}): PublicListingQueryDto =>
  ({ province: PROV, limit: 48, ...extra }) as PublicListingQueryDto;

const countOf = (buckets: Array<{ key: string; count: number }>, key: string): number =>
  buckets.find((b) => b.key === key)?.count ?? 0;

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
  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
      { id: customerId, displayName: 'Khách', email: `cus-${customerId}@xeprime.test` },
    ],
  });

  tenantId = newId();
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `Shop ${PROV}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantProfile.create({
    data: { tenantId, displayName: `Shop ${PROV}`, provinceName: PROV },
  });

  vSedan = await seedFacetVehicle({
    brand: 'Toyota', body: BODY_TYPE.SEDAN, seats: 5, fuel: FUEL_TYPE.GASOLINE, price: '600000',
    features: ['bluetooth', 'gps'], hourly: '90000', discount: 10, ratings: [5],
  });
  vSuv = await seedFacetVehicle({
    brand: 'Mazda', body: BODY_TYPE.SUV, seats: 7, fuel: FUEL_TYPE.DIESEL, price: '1200000',
    features: ['bluetooth', 'camera_360', 'sunroof'], delivery: true, ratings: [4],
  });
  vMini = await seedFacetVehicle({
    brand: 'Kia', body: BODY_TYPE.MINI, seats: 4, fuel: FUEL_TYPE.GASOLINE, price: '400000',
    hourly: '60000', noCollateral: true,
  });
  vCuv = await seedFacetVehicle({
    brand: 'VinFast', body: BODY_TYPE.CUV, seats: 5, fuel: FUEL_TYPE.ELECTRIC, price: '900000',
    features: ['gps', 'screen'], delivery: true, noCollateral: true, discount: 5, ratings: [5, 5],
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.review.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, customerId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Facets marketplace (đếm theo chiều + filter CSV)', () => {
  maybe('không filter: total + đếm đúng từng chiều', async () => {
    const f = await service.facets(fq());
    expect(f.total).toBe(4);
    expect(countOf(f.bodyType, BODY_TYPE.SEDAN)).toBe(1);
    expect(countOf(f.bodyType, BODY_TYPE.SUV)).toBe(1);
    expect(countOf(f.brand, 'VinFast')).toBe(1);
    expect(countOf(f.seats, '4')).toBe(1);
    expect(countOf(f.seats, '5')).toBe(2);
    expect(countOf(f.seats, '7')).toBe(1);
    expect(countOf(f.fuelType, FUEL_TYPE.GASOLINE)).toBe(2);
    expect(countOf(f.features, 'bluetooth')).toBe(2);
    expect(countOf(f.features, 'gps')).toBe(2);
    expect(f.amenities).toEqual({ hourly: 2, delivery: 2, noCollateral: 2, discount: 2 });
    // Gọi service trực tiếp thì Decimal chưa qua ResponseInterceptor → so sánh qua String().
    expect(String(f.price.min)).toBe('400000');
    expect(String(f.price.max)).toBe('1200000');
  });

  maybe('chọn 1 chiều: chiều đó vẫn đếm đủ option, chiều khác bị thu hẹp', async () => {
    const f = await service.facets(fq({ bodyType: [BODY_TYPE.SUV] }));
    expect(f.total).toBe(1);
    // bodyType bỏ qua chính nó → sedan/mini/cuv vẫn thấy còn xe nếu đổi lựa chọn.
    expect(countOf(f.bodyType, BODY_TYPE.SEDAN)).toBe(1);
    expect(countOf(f.bodyType, BODY_TYPE.SUV)).toBe(1);
    // brand đếm TRONG tập SUV → chỉ còn Mazda.
    expect(f.brand.map((b) => b.key)).toEqual(['Mazda']);
  });

  maybe('features là AND (hasEvery)', async () => {
    const both = await service.facets(fq({ features: ['bluetooth', 'camera_360'] }));
    expect(both.total).toBe(1); // chỉ vSuv có đủ cả hai

    const res = await service.search(sq({ features: ['bluetooth', 'camera_360'] }));
    expect(res.data.map((v) => v.id)).toEqual([vSuv]);
  });

  maybe('bucket số chỗ multi-select (4 hoặc 7)', async () => {
    const res = await service.search(sq({ seats: ['4', '7'] }));
    const ids = res.data.map((v) => v.id);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(vMini);
    expect(ids).toContain(vSuv);
  });

  maybe('biên giá bỏ qua chính filter giá (slider không tự co)', async () => {
    const f = await service.facets(fq({ priceMin: 1_000_000 }));
    expect(f.total).toBe(1); // chỉ vSuv ≥ 1tr
    expect(String(f.price.min)).toBe('400000'); // biên vẫn tính trên toàn tập (trừ filter giá)
    expect(String(f.price.max)).toBe('1200000');
  });

  maybe('toggle tiện ích lọc đúng + đếm chéo trong tập đã lọc', async () => {
    const f = await service.facets(fq({ delivery: true }));
    expect(f.total).toBe(2); // vSuv + vCuv
    expect(f.amenities.delivery).toBe(2); // bỏ chính nó → vẫn 2
    expect(f.amenities.noCollateral).toBe(1); // trong tập delivery chỉ vCuv miễn thế chấp
  });

  maybe('multi-brand CSV', async () => {
    const res = await service.search(sq({ brand: ['Toyota', 'Kia'] }));
    const ids = res.data.map((v) => v.id);
    expect(ids).toHaveLength(2);
    expect(ids).toContain(vSedan);
    expect(ids).toContain(vMini);
  });

  maybe('sort recommended: rating cao trước, đồng hạng thì nhiều review trước, null cuối', async () => {
    const res = await service.search(sq({ sort: 'recommended' }));
    expect(res.data.map((v) => v.id)).toEqual([vCuv, vSedan, vSuv, vMini]);
    // Card mang rating từ snapshot (1 chữ số thập phân) + field tiện ích mới.
    const cuv = res.data[0]!;
    expect(cuv.ratingAvg).toBe('5.0');
    expect(cuv.ratingCount).toBe(2);
    expect(cuv.deliveryEnabled).toBe(true);
    expect(cuv.noCollateral).toBe(true);
    expect(cuv.discountPercent).toBe(5);
    expect(cuv.bodyType).toBe(BODY_TYPE.CUV);
  });

  maybe('refreshRating cập nhật snapshot; xe chưa có listing thì no-op', async () => {
    // Thêm review 1★ cho vMini rồi refresh — snapshot phải có rating mới.
    await prisma.review.create({
      data: {
        id: newId(),
        tenantId,
        vehicleId: vMini,
        customerId,
        rating: 1,
        status: REVIEW_STATUS.PUBLISHED,
      },
    });
    await listings.refreshRating(vMini);
    const row = await prisma.publicListing.findUnique({
      where: { vehicleId: vMini },
      select: { ratingAvg: true, ratingCount: true },
    });
    expect(String(row?.ratingAvg)).toBe('1');
    expect(row?.ratingCount).toBe(1);

    // Xe không tồn tại/không có listing → không nổ.
    await expect(listings.refreshRating(newId())).resolves.toBeUndefined();
  });
});
