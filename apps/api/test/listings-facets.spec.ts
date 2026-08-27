import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  BODY_TYPE,
  COLLATERAL_MODE,
  FUEL_TYPE,
  OCCUPANCY_SOURCE_TYPE,
  REVIEW_STATUS,
  SERVICE_TYPE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { buildListingWhereSql } from '../src/modules/public-listings/listing-filter';
import type {
  ListingFacetsQueryDto,
  PublicListingQueryDto,
} from '../src/modules/public-listings/dto/public-listing.dto';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makePublicListingsService, seedBranch, seedProvince } from './helpers/service-factory';

/**
 * Bộ lọc facet marketplace trên PostgreSQL THẬT: đếm theo chiều với semantics chuẩn (mỗi chiều
 * bỏ chính filter của nó), filter CSV multi-select, bucket số chỗ, hasEvery tính năng, tiện ích,
 * biên giá, sort `recommended` từ rating denormalize. Cô lập bằng provinceName duy nhất.
 * Không có DB thì tự skip.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/api test -- test/listings-facets.spec.ts
 */
const prisma = createPrismaClient();
const service = makePublicListingsService(prisma as unknown as PrismaService);
const listings = new ListingsService(prisma as unknown as PrismaService);

const PROV = 'Z2';
const PROV_NAME = 'Zone Facet';

let dbAvailable = false;
let ownerId: string;
let customerId: string;
let tenantId: string;
let branchId: string;
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
      branchId,
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
      discountPercent: v.discount ?? null,
      mainImageUrl: 'https://img.example/x.jpg',
    },
  });
  /*
   * "Miễn thế chấp" từ 20/08 là HỆ QUẢ của chính sách thuê hiệu lực, không còn là cờ trên xe —
   * nên muốn xe có nhãn đó thì phải cho nó một bản ghi đè chính sách ở chế độ `none`.
   * Ghi đè theo XE (không phải mặc định gian hàng) để từng xe trong spec độc lập nhau.
   */
  if (v.noCollateral) {
    await prisma.rentalPolicy.create({
      data: {
        id: newId(),
        tenantId,
        vehicleId: id,
        collateralMode: COLLATERAL_MODE.NONE,
        collateralAssetTypes: [],
        depositAmount: '0',
      },
    });
  }
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
  ({ provinceCode: PROV, ...extra }) as ListingFacetsQueryDto;
const sq = (extra: Partial<PublicListingQueryDto> = {}): PublicListingQueryDto =>
  ({ provinceCode: PROV, limit: 48, ...extra }) as PublicListingQueryDto;

const countOf = (buckets: Array<{ key: string; count: number }>, key: string): number =>
  buckets.find((b) => b.key === key)?.count ?? 0;

/*
 * Facet được cache 60 giây trong service (xem `FACETS_CACHE_TTL_MS`). Spec seed một lần rồi hỏi
 * nhiều bộ lọc khác nhau nên gần như không đụng nhau, nhưng dọn trước mỗi test là cách để một
 * test thêm về sau không đỏ vì lý do chẳng liên quan gì tới thứ nó đang kiểm.
 */
beforeEach(() => {
  service.clearFacetsCache();
});

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
  await seedProvince(prisma as unknown as PrismaService, PROV, PROV_NAME);
  await prisma.tenantProfile.create({
    data: { tenantId, displayName: `Shop ${PROV}`, provinceCode: PROV, provinceName: PROV_NAME },
  });
  branchId = await seedBranch(prisma as unknown as PrismaService, { tenantId, provinceCode: PROV });

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
    await prisma.tenantBranch.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, customerId] } } });
    await prisma.province.deleteMany({ where: { code: PROV } });
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

/**
 * Bộ lọc marketplace có HAI hiện thực: `buildListingWhere` (Prisma, cho search + phần lớn facet)
 * và `buildListingWhereSql` (raw SQL, cho facet tính năng vì phải `unnest` mảng). Bản sao đó là
 * có chủ đích và được giải thích ở `listing-filter.ts` — nhưng bản sao nào cũng lệch được.
 *
 * Phép so khớp dưới đây là thứ khiến việc lệch KHÔNG âm thầm: cùng một bộ query chạy qua cả hai
 * đường và phải trả về đúng cùng một tập xe. Thiếu nó, một vế filter quên cập nhật ở bản SQL sẽ
 * biểu hiện thành "số đếm tính năng hơi sai" — thứ không ai nhìn ra khi review.
 *
 * Đi qua `service.search` (chứ không gọi thẳng hàm private) nên phía Prisma được kiểm đúng như
 * production dùng nó.
 */
describe('buildListingWhereSql khớp buildListingWhere (chống lệch hai bản)', () => {
  /** vehicle_id khớp bộ lọc, đi đường raw SQL. */
  async function idsViaSql(query: PublicListingQueryDto): Promise<string[]> {
    const rows = await prisma.$queryRaw<Array<{ vehicle_id: string }>>`
      SELECT pl."vehicle_id" FROM "public_listings" pl
      WHERE ${buildListingWhereSql(query)}
    `;
    return rows.map((r) => r.vehicle_id.trim()).sort();
  }

  /** vehicle_id khớp bộ lọc, đi đường Prisma (chính là đường `search` dùng). */
  async function idsViaPrisma(query: PublicListingQueryDto): Promise<string[]> {
    const res = await service.search(query);
    return res.data.map((v) => v.id).sort();
  }

  const CASES: Array<[string, PublicListingQueryDto]> = [
    ['không filter', sq()],
    ['bodyType', sq({ bodyType: [BODY_TYPE.SUV, BODY_TYPE.SEDAN] })],
    ['brand (khác hoa thường)', sq({ brand: ['toyota', 'MAZDA'] })],
    ['fuelType', sq({ fuelType: [FUEL_TYPE.GASOLINE] })],
    ['seats nhiều bucket', sq({ seats: ['4', '7'] })],
    ['minSeats', sq({ minSeats: 5 })],
    ['features hasEvery', sq({ features: ['bluetooth', 'camera_360'] })],
    ['features một cái', sq({ features: ['gps'] })],
    ['khoảng giá', sq({ priceMin: 500_000, priceMax: 1_000_000 })],
    ['tiện ích: theo giờ', sq({ hourly: true })],
    ['tiện ích: giao xe', sq({ delivery: true })],
    ['tiện ích: miễn thế chấp', sq({ noCollateral: true })],
    ['tiện ích: đang giảm giá', sq({ discount: true })],
    ['tìm chữ (q)', sq({ q: 'VinFast' })],
    ['tìm chữ không khớp gì', sq({ q: 'khong-ton-tai-xyz' })],
    ['vehicleType', sq({ vehicleType: VEHICLE_TYPE.CAR })],
    ['serviceType', sq({ serviceType: SERVICE_TYPE.SELF_DRIVE })],
    ['tỉnh không tồn tại', sq({ provinceCode: '00' })],
    [
      'gộp nhiều chiều',
      sq({
        bodyType: [BODY_TYPE.SUV, BODY_TYPE.CUV],
        fuelType: [FUEL_TYPE.DIESEL, FUEL_TYPE.ELECTRIC],
        priceMin: 800_000,
        delivery: true,
      }),
    ],
  ];

  for (const [name, query] of CASES) {
    maybe(name, async () => {
      const [viaSql, viaPrisma] = await Promise.all([idsViaSql(query), idsViaPrisma(query)]);
      expect(viaSql).toEqual(viaPrisma);
    });
  }

  maybe('lọc rảnh theo khoảng thời gian (occupancy)', async () => {
    // Chiếm vSuv trong một khoảng rồi hỏi đúng khoảng đó — cả hai bản phải cùng loại nó ra.
    const occupancyId = newId();
    const startAt = new Date('2027-03-01T02:00:00.000Z');
    const endAt = new Date('2027-03-05T02:00:00.000Z');
    await prisma.vehicleOccupancy.create({
      data: {
        id: occupancyId,
        tenantId,
        vehicleId: vSuv,
        sourceType: OCCUPANCY_SOURCE_TYPE.BLOCKED_RANGE,
        sourceId: occupancyId,
        startAt,
        endAt,
      },
    });
    try {
      const query = sq({
        pickupAt: '2027-03-02T02:00:00.000Z',
        returnAt: '2027-03-03T02:00:00.000Z',
      });
      const [viaSql, viaPrisma] = await Promise.all([idsViaSql(query), idsViaPrisma(query)]);
      expect(viaPrisma).not.toContain(vSuv);
      expect(viaSql).toEqual(viaPrisma);
    } finally {
      await prisma.vehicleOccupancy.deleteMany({ where: { id: occupancyId } });
    }
  });

  maybe('gian hàng bị tạm ngưng thì cả hai bản cùng loại xe khỏi chợ', async () => {
    await prisma.tenant.update({ where: { id: tenantId }, data: { status: TENANT_STATUS.SUSPENDED } });
    try {
      const [viaSql, viaPrisma] = await Promise.all([idsViaSql(sq()), idsViaPrisma(sq())]);
      expect(viaPrisma).toEqual([]);
      expect(viaSql).toEqual([]);
    } finally {
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { status: TENANT_STATUS.ACTIVE },
      });
    }
  });

  maybe('tỉnh bị ẩn công khai thì cả hai bản cùng loại xe khỏi chợ', async () => {
    await prisma.province.update({ where: { code: PROV }, data: { isPublicVisible: false } });
    try {
      const [viaSql, viaPrisma] = await Promise.all([idsViaSql(sq()), idsViaPrisma(sq())]);
      expect(viaPrisma).toEqual([]);
      expect(viaSql).toEqual([]);
    } finally {
      await prisma.province.update({ where: { code: PROV }, data: { isPublicVisible: true } });
    }
  });
});
