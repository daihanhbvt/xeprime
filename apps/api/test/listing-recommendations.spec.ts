import { createPrismaClient, newId, RANK_SCORE_WEIGHTS } from '@xeprime/prisma';
import {
  BOOKING_STATUS,
  REVIEW_STATUS,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import type { RecommendedListingQueryDto } from '../src/modules/public-listings/dto/public-listing.dto';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makePublicListingsService, seedBranch } from './helpers/service-factory';

/**
 * Khối "Xe phù hợp với bạn" (`GET /public/listings/recommended`) trên PostgreSQL THẬT.
 *
 * Bốn luật, và cả bốn đều là thứ nhìn thấy trên trang chủ nếu hỏng:
 *
 *   1. Tỉnh là ƯU TIÊN, không phải bộ lọc — xe tỉnh khác vẫn được trả để khối không rỗng.
 *   2. Bậc địa lý: đúng tỉnh → cùng vùng → còn lại.
 *   3. Trong cùng một bậc, thứ tự là `rank_score` — chất lượng BAYES, nên xe 5,0 sao một đánh
 *      giá KHÔNG thắng xe 4,8 sao nhiều đánh giá. Đây đúng là chỗ thứ tự cũ sai.
 *   4. Mỗi gian hàng tối đa hai xe trong khối.
 *
 * ## Vì sao khẳng định theo DÃY CON
 *
 * Endpoint này công khai và KHÔNG lọc theo tỉnh, nên nó thấy cả listing của spec khác đang chạy
 * song song trong cùng database test. Thứ tự tương đối giữa các xe của CHÍNH spec này thì không
 * bị dữ liệu lạ làm đổi — nên mọi khẳng định ở đây đọc dãy con gồm đúng id của spec.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/api test -- test/listing-recommendations.spec.ts
 */
const prisma = createPrismaClient();
const service = makePublicListingsService(prisma as unknown as PrismaService);
const listings = new ListingsService(prisma as unknown as PrismaService);

/** Mã tỉnh THẬT — bậc "cùng vùng" đọc bản đồ vùng ở `@xeprime/types`, mã giả sẽ không có vùng. */
const HANOI = '01';
/** Cùng vùng Bắc với Hà Nội. */
const BAC_NINH = '24';
/** Khác vùng (Nam) — bậc thấp nhất. */
const HCM = '79';

let dbAvailable = false;
let ownerId: string;
let customerId: string;
/** Gian hàng chính — giữ 3 xe để kiểm trần 2 xe/gian hàng. */
let tenantId: string;
/** Gian hàng thứ hai — có mặt để trần của gian hàng trên có chỗ mà nhường. */
let otherTenantId: string;

/** Hà Nội · 4,8 sao / 5 đánh giá · 6 chuyến — điểm cao nhất trong nhóm Hà Nội. */
let vHanoiProven: string;
/** Hà Nội · 5,0 sao / 1 đánh giá · 0 chuyến — cái bẫy mà trung bình trần rơi vào. */
let vHanoiOneReview: string;
/** Hà Nội · chưa đánh giá · gian hàng chính, chiếc thứ ba nên vượt trần. */
let vHanoiThird: string;
/** Bắc Ninh · 5,0 sao / 4 đánh giá — mạnh hơn mọi xe Hà Nội, nhưng bậc địa lý thấp hơn. */
let vBacNinh: string;
/** TP.HCM · 5,0 sao / 4 đánh giá — khác vùng, luôn đứng sau Bắc Ninh khi khách ở Hà Nội. */
let vHcm: string;

/**
 * Chi nhánh dùng lại theo (gian hàng, tỉnh).
 *
 * Mỗi gian hàng chỉ được có MỘT chi nhánh mặc định (unique dưới DB), và một chi nhánh giữ được
 * nhiều xe — nên tạo chi nhánh mới cho từng xe vừa sai với sản phẩm vừa đụng chính ràng buộc đó.
 */
const branches = new Map<string, string>();

async function branchOf(tenant: string, provinceCode: string): Promise<string> {
  const key = `${tenant}:${provinceCode}`;
  const existing = branches.get(key);
  if (existing) return existing;
  const id = await seedBranch(prisma as unknown as PrismaService, {
    tenantId: tenant,
    provinceCode,
    isDefault: branches.size === 0 || ![...branches.keys()].some((k) => k.startsWith(`${tenant}:`)),
  });
  branches.set(key, id);
  return id;
}

interface Fixture {
  tenant: 'main' | 'other';
  provinceCode: string;
  ratings?: readonly number[];
  completedTrips?: number;
}

async function seedVehicle(name: string, f: Fixture): Promise<string> {
  const tenant = f.tenant === 'main' ? tenantId : otherTenantId;
  const branchId = await branchOf(tenant, f.provinceCode);
  const id = newId();
  await prisma.vehicle.create({
    data: {
      id,
      tenantId: tenant,
      branchId,
      code: `V-${id.slice(-6)}`,
      name,
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      weekdayPrice: '600000',
      mainImageUrl: 'https://img.example/x.jpg',
    },
  });

  for (const rating of f.ratings ?? []) {
    await prisma.review.create({
      data: {
        id: newId(),
        tenantId: tenant,
        vehicleId: id,
        customerId,
        rating,
        status: REVIEW_STATUS.PUBLISHED,
      },
    });
  }

  for (let i = 0; i < (f.completedTrips ?? 0); i += 1) {
    await prisma.booking.create({
      data: {
        id: newId(),
        tenantId: tenant,
        vehicleId: id,
        code: `B-${newId().slice(-8)}`,
        status: BOOKING_STATUS.COMPLETED,
        customerName: 'Khách cũ',
        customerPhone: '0900000000',
        pickupAt: new Date(Date.now() - (i + 2) * 86_400_000),
        returnAt: new Date(Date.now() - (i + 1) * 86_400_000),
        totalAmount: '600000',
      },
    });
  }

  // Snapshot + điểm xếp hạng đi qua cùng đường ghi như sản phẩm (ADR 0008). Spec KHÔNG tự
  // UPDATE rank_score — làm thế là nó chỉ đang kiểm chính câu SQL mà nó vừa viết ra.
  await listings.syncFromVehicle(id);
  return id;
}

const query = (extra: Partial<RecommendedListingQueryDto> = {}): RecommendedListingQueryDto =>
  ({ limit: 24, ...extra }) as RecommendedListingQueryDto;

/** Dãy con gồm đúng các xe của spec này, theo thứ tự endpoint trả về. */
async function rankedMine(extra: Partial<RecommendedListingQueryDto> = {}): Promise<string[]> {
  const mine = new Set([vHanoiProven, vHanoiOneReview, vHanoiThird, vBacNinh, vHcm]);
  const res = await service.recommended(query(extra));
  return res.data.map((row) => row.id).filter((id) => mine.has(id));
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
  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
      { id: customerId, displayName: 'Khách', email: `cus-${customerId}@xeprime.test` },
    ],
  });

  tenantId = newId();
  otherTenantId = newId();
  for (const [id, name] of [
    [tenantId, 'Shop gợi ý A'],
    [otherTenantId, 'Shop gợi ý B'],
  ] as const) {
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
  }

  vHanoiProven = await seedVehicle('Hà Nội đã chạy', {
    tenant: 'main',
    provinceCode: HANOI,
    ratings: [5, 5, 5, 5, 4],
    completedTrips: 6,
  });
  vHanoiOneReview = await seedVehicle('Hà Nội một đánh giá', {
    tenant: 'main',
    provinceCode: HANOI,
    ratings: [5],
  });
  vHanoiThird = await seedVehicle('Hà Nội chiếc thứ ba', {
    tenant: 'main',
    provinceCode: HANOI,
  });
  vBacNinh = await seedVehicle('Bắc Ninh mạnh', {
    tenant: 'other',
    provinceCode: BAC_NINH,
    ratings: [5, 5, 5, 5],
    completedTrips: 8,
  });
  vHcm = await seedVehicle('Sài Gòn mạnh', {
    tenant: 'other',
    provinceCode: HCM,
    ratings: [5, 5, 5, 5],
    completedTrips: 8,
  });
});

afterAll(async () => {
  if (dbAvailable) {
    const tenants = [tenantId, otherTenantId];
    await prisma.booking.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.review.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, customerId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Công thức điểm xếp hạng', () => {
  it('bốn trọng số cộng lại đúng bằng 1', () => {
    const sum = Object.values(RANK_SCORE_WEIGHTS).reduce((acc, w) => acc + w, 0);
    // Thang [0,1] là thứ ADR 0043, giao diện và hai index đang giả định; tổng khác 1 phá cả ba
    // trong im lặng vì điểm vẫn "trông hợp lý" khi đọc một dòng đơn lẻ.
    expect(sum).toBeCloseTo(1, 10);
  });

  maybe('điểm của mọi listing đang hiển thị nằm trong [0,1]', async () => {
    const rows = await prisma.publicListing.findMany({
      where: { status: 'active' },
      select: { rankScore: true },
    });
    for (const row of rows) {
      expect(row.rankScore).toBeGreaterThanOrEqual(0);
      expect(row.rankScore).toBeLessThanOrEqual(1);
    }
  });
});

describe('Xe phù hợp với bạn — xếp hạng gợi ý trang chủ', () => {
  maybe('tỉnh là ƯU TIÊN chứ không phải bộ lọc: xe tỉnh khác vẫn có mặt', async () => {
    const ids = await rankedMine({ nearProvinceCode: HANOI });

    expect(ids).toContain(vBacNinh);
    expect(ids).toContain(vHcm);
  });

  maybe('bậc địa lý: đúng tỉnh trước, rồi cùng vùng, rồi còn lại', async () => {
    const ids = await rankedMine({ nearProvinceCode: HANOI });

    // Bắc Ninh mạnh hơn MỌI xe Hà Nội về điểm — nó lên trước nghĩa là bậc địa lý mất tác dụng.
    expect(ids.indexOf(vHanoiProven)).toBeLessThan(ids.indexOf(vBacNinh));
    expect(ids.indexOf(vBacNinh)).toBeLessThan(ids.indexOf(vHcm));
  });

  maybe('trong cùng một bậc: nhiều đánh giá và đã chạy thắng 5,0 sao một đánh giá', async () => {
    const ids = await rankedMine({ nearProvinceCode: HANOI });

    expect(ids.indexOf(vHanoiProven)).toBeLessThan(ids.indexOf(vHanoiOneReview));
  });

  maybe('trần 2 xe/gian hàng: chiếc thứ ba bị đẩy xuống sau xe của gian hàng khác', async () => {
    const ids = await rankedMine({ nearProvinceCode: HANOI });

    expect(ids.indexOf(vHanoiThird)).toBeGreaterThan(ids.indexOf(vBacNinh));
    expect(ids.indexOf(vHanoiThird)).toBeGreaterThan(ids.indexOf(vHcm));
  });

  maybe('trần là khoá SẮP XẾP chứ không phải bộ lọc — chiếc thứ ba vẫn được trả về', async () => {
    const ids = await rankedMine({ nearProvinceCode: HANOI });

    expect(ids).toContain(vHanoiThird);
  });

  maybe('không có tỉnh ưu tiên: xếp thuần theo điểm, không bậc địa lý nào', async () => {
    const ids = await rankedMine();

    // Bắc Ninh và Sài Gòn có điểm cao nhất; xe Hà Nội một đánh giá phải đứng sau cả hai.
    expect(ids.indexOf(vBacNinh)).toBeLessThan(ids.indexOf(vHanoiOneReview));
    expect(ids.indexOf(vHcm)).toBeLessThan(ids.indexOf(vHanoiOneReview));
  });

  maybe('meta nói thật về ngữ cảnh đã dùng để xếp', async () => {
    const res = await service.recommended(query({ nearProvinceCode: HANOI }));

    expect(res.meta.nearProvinceCode).toBe(HANOI);
    expect(res.meta.count).toBe(res.data.length);
    expect(res.meta.total).toBeGreaterThanOrEqual(res.data.length);
    // Khối có xe Bắc Ninh/Sài Gòn nên nó BẮT BUỘC phải thừa nhận là đang lẫn tỉnh khác.
    expect(res.meta.mixedProvinces).toBe(true);
  });

  maybe('limit được tôn trọng', async () => {
    const res = await service.recommended(query({ nearProvinceCode: HANOI, limit: 2 }));

    expect(res.data).toHaveLength(2);
    expect(res.meta.count).toBe(2);
  });
});
