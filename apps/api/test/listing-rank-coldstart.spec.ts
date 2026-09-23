import { createPrismaClient, newId, refreshListingRankScore } from '@xeprime/prisma';
import {
  AUDIT_ACTOR_SCOPE,
  BOOKING_REQUEST_DECISION_SOURCE,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  CANCELLATION_PARTY,
  CANCELLATION_REASON_CATEGORY,
  CANCELLATION_STAGE,
  REVIEW_STATUS,
  TENANT_STATUS,
  VEHICLE_IMAGE_TYPE,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import type { PublicListingQueryDto } from '../src/modules/public-listings/dto/public-listing.dto';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makePublicListingsService, seedBranch, seedProvince } from './helpers/service-factory';

/**
 * KHỞI ĐỘNG NGUỘI và UY TÍN CHỦ XE trong xếp hạng chợ — ADR 0045 điều 4/5, PostgreSQL THẬT.
 *
 * Một sàn hai mặt không có cơ chế khám phá sẽ TỰ KHOÁ: người bán mới không có đơn nên không có
 * đánh giá, không có đánh giá nên không lên được trang đầu, không lên được trang đầu nên không
 * có đơn. Nó dừng nhận người bán mới trước khi có ai nhận ra — vì mọi con số trên bảng điều
 * khiển vẫn xanh.
 *
 * Bốn điều được khoá, và ba trong số đó là ranh giới chứ không phải một hướng:
 *
 *  1. Xe MỚI đủ hồ sơ không bị chôn dưới MỌI xe đã có đánh giá — nhưng vẫn dưới một xe tốt thật
 *     sự có lịch sử. Cơ hội, không phải ưu đãi.
 *  2. Chủ xe HUỶ LIÊN TỤC tụt hạng — và một chủ xe mới với 0–1 mẫu thì KHÔNG.
 *  3. Vế khám phá có TRẦN THỜI GIAN: qua cửa sổ là hết, dù có đơn hay không.
 *  4. Ba sort do KHÁCH chọn (giá tăng, giá giảm, mới nhất) không đổi một chữ.
 *
 * ## Vì sao spec này cô lập bằng một mã tỉnh riêng
 *
 * `search` là endpoint công khai và thấy cả listing của spec khác chạy song song. Mọi truy vấn
 * dưới đây lọc theo `provinceCode` của riêng spec, nên thứ tự đọc được là thứ tự giữa các xe
 * của chính nó.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/api test -- test/listing-rank-coldstart.spec.ts
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const service = makePublicListingsService(asService);
const listings = new ListingsService(asService);

const PROV = 'Z4';
const PROV_NAME = 'Zone ColdStart';
const DAY = 24 * 3600_000;

let dbAvailable = false;
let ownerId: string;
let customerId: string;
/** Chủ xe CÓ LỊCH SỬ và giữ chuyến đàng hoàng. */
let goodTenant: string;
/** Chủ xe huỷ chuyến liên tục sau khi đã nhận. */
let badTenant: string;
/** Chủ xe MỚI TINH — chưa có yêu cầu nào. */
let freshTenant: string;

/** Chủ tốt · 4,8 sao / 5 đánh giá · 6 chuyến — xe "đã chứng minh". */
let vProven: string;
/** Chủ tốt · 3,2 sao / 6 đánh giá · 2 chuyến — xe có đánh giá nhưng TẦM THƯỜNG. */
let vMediocre: string;
/** Chủ mới · chưa đánh giá, chưa chuyến, hồ sơ ĐẦY ĐỦ — đây là xe cần một cơ hội. */
let vFreshComplete: string;
/** Chủ mới · chưa đánh giá, hồ sơ THIẾU (1 ảnh, 1 tiện ích) — không được tặng cơ hội. */
let vFreshThin: string;
/** Chủ hay huỷ · hồ sơ y hệt `vFreshComplete`, chỉ khác người bán. */
let vBadHost: string;
/** Chủ tốt · hồ sơ đầy, nhưng lên sàn đã LÂU — cửa sổ khám phá đã đóng. */
let vOldComplete: string;

interface Fixture {
  tenant: string;
  ratings?: readonly number[];
  trips?: number;
  images?: number;
  features?: readonly string[];
  /** Số ngày TRƯỚC hiện tại mà xe lên sàn. Mặc định: hôm nay. */
  ageDays?: number;
}

const branches = new Map<string, string>();
async function branchOf(tenant: string): Promise<string> {
  const existing = branches.get(tenant);
  if (existing) return existing;
  const id = await seedBranch(asService, { tenantId: tenant, provinceCode: PROV });
  branches.set(tenant, id);
  return id;
}

async function seedVehicle(name: string, f: Fixture): Promise<string> {
  const id = newId();
  const createdAt = new Date(Date.now() - (f.ageDays ?? 0) * DAY);
  await prisma.vehicle.create({
    data: {
      id,
      tenantId: f.tenant,
      branchId: await branchOf(f.tenant),
      code: `V-${id.slice(-6)}`,
      name,
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      weekdayPrice: '600000',
      mainImageUrl: 'https://img.example/x.jpg',
      createdAt,
    },
  });

  for (let i = 0; i < (f.images ?? 0); i += 1) {
    await prisma.vehicleImage.create({
      data: {
        id: newId(),
        vehicleId: id,
        tenantId: f.tenant,
        imageUrl: `https://img.example/${id}-${i}.jpg`,
        imageType: VEHICLE_IMAGE_TYPE.FRONT,
        sortOrder: i,
      },
    });
  }
  for (const featureKey of f.features ?? []) {
    await prisma.vehicleFeature.create({ data: { id: newId(), vehicleId: id, featureKey } });
  }
  for (const rating of f.ratings ?? []) {
    await prisma.review.create({
      data: {
        id: newId(),
        tenantId: f.tenant,
        vehicleId: id,
        customerId,
        rating,
        status: REVIEW_STATUS.PUBLISHED,
      },
    });
  }
  for (let i = 0; i < (f.trips ?? 0); i += 1) {
    await prisma.booking.create({
      data: {
        id: newId(),
        tenantId: f.tenant,
        vehicleId: id,
        code: `B-${newId().slice(-8)}`,
        status: BOOKING_STATUS.COMPLETED,
        customerName: 'Khách cũ',
        customerPhone: '0900000000',
        pickupAt: new Date(Date.now() - (i + 2) * DAY),
        returnAt: new Date(Date.now() - (i + 1) * DAY),
        totalAmount: '600000',
      },
    });
  }

  /*
   * Đi qua ĐÚNG đường ghi của sản phẩm (ADR 0008). Spec KHÔNG tự `UPDATE rank_score` — làm thế
   * là nó chỉ đang kiểm chính câu SQL nó vừa viết ra.
   *
   * `created_at` của listing đặt lại sau `syncFromVehicle` vì snapshot lấy thời điểm ghi; cả vế
   * độ mới lẫn vế khám phá đều đọc cột đó, nên không đặt thì mọi xe đều "vừa lên sàn".
   */
  await listings.syncFromVehicle(id);
  if (f.ageDays) {
    await prisma.publicListing.updateMany({ where: { vehicleId: id }, data: { createdAt } });
  }
  return id;
}

let seq = 0;

/** Một yêu cầu thuê ĐÃ NGÃ NGŨ của một gian hàng — nguyên liệu của vế uy tín. */
async function seedDecidedRequest(
  tenant: string,
  vehicle: string,
  opts: { cancelledByHost?: boolean } = {},
): Promise<void> {
  seq += 1;
  const id = newId();
  const createdAt = new Date(Date.now() - 3 * DAY);
  await prisma.bookingRequest.create({
    data: {
      id,
      tenantId: tenant,
      vehicleId: vehicle,
      status: opts.cancelledByHost
        ? BOOKING_REQUEST_STATUS.CANCELLED_BY_HOST
        : BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
      customerName: `Khách ${seq}`,
      customerPhone: `0944${String(100000 + seq).slice(-6)}`,
      customerUserId: customerId,
      pickupAt: new Date(createdAt.getTime() + 5 * DAY),
      returnAt: new Date(createdAt.getTime() + 7 * DAY),
      respondBy: new Date(createdAt.getTime() + 3600_000),
      createdAt,
      decidedAt: new Date(createdAt.getTime() + 20 * 60_000),
      decisionSource: BOOKING_REQUEST_DECISION_SOURCE.HOST,
    },
  });
  if (opts.cancelledByHost) {
    await prisma.bookingCancellation.create({
      data: {
        id: newId(),
        tenantId: tenant,
        bookingRequestId: id,
        responsibleParty: CANCELLATION_PARTY.HOST,
        reasonCategory: CANCELLATION_REASON_CATEGORY.VEHICLE_UNAVAILABLE,
        stage: CANCELLATION_STAGE.AWAITING_HOLD,
        actorScope: AUDIT_ACTOR_SCOPE.TENANT,
        countsAgainstHost: true,
      },
    });
  }
}

const sq = (extra: Partial<PublicListingQueryDto> = {}): PublicListingQueryDto =>
  ({ provinceCode: PROV, limit: 48, ...extra }) as PublicListingQueryDto;

/** Thứ hạng (0 = đầu danh sách) của một xe trong kết quả tìm kiếm của tỉnh này. */
async function rankOf(vehicleId: string, extra: Partial<PublicListingQueryDto> = {}) {
  const res = await service.search(sq(extra));
  return res.data.findIndex((row) => row.id === vehicleId);
}

async function scoreOf(vehicleId: string): Promise<number> {
  const row = await prisma.publicListing.findFirstOrThrow({
    where: { vehicleId },
    select: { rankScore: true },
  });
  return Number(row.rankScore);
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
      { id: ownerId, displayName: 'Chủ shop', email: `cs-own-${ownerId}@xeprime.test` },
      { id: customerId, displayName: 'Khách', email: `cs-cus-${customerId}@xeprime.test` },
    ],
  });
  await seedProvince(asService, PROV, PROV_NAME);

  goodTenant = newId();
  badTenant = newId();
  freshTenant = newId();
  for (const [id, name] of [
    [goodTenant, 'Chủ giữ chuyến'],
    [badTenant, 'Chủ hay huỷ'],
    [freshTenant, 'Chủ mới tinh'],
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
    await prisma.tenantProfile.create({
      data: { tenantId: id, displayName: name, provinceCode: PROV, provinceName: PROV_NAME },
    });
  }

  const FULL_FEATURES = ['bluetooth', 'gps', 'camera_360'] as const;

  vProven = await seedVehicle('Đã chứng minh', {
    tenant: goodTenant,
    ratings: [5, 5, 5, 5, 4],
    trips: 6,
    images: 5,
    features: FULL_FEATURES,
  });
  vMediocre = await seedVehicle('Có đánh giá nhưng tầm thường', {
    tenant: goodTenant,
    ratings: [3, 3, 3, 4, 3, 3],
    trips: 2,
    images: 5,
    features: FULL_FEATURES,
  });
  vFreshComplete = await seedVehicle('Mới, hồ sơ đầy', {
    tenant: freshTenant,
    images: 5,
    features: FULL_FEATURES,
  });
  vFreshThin = await seedVehicle('Mới, hồ sơ thiếu', {
    tenant: freshTenant,
    images: 1,
    features: ['bluetooth'],
  });
  vBadHost = await seedVehicle('Mới, chủ hay huỷ', {
    tenant: badTenant,
    images: 5,
    features: FULL_FEATURES,
  });
  vOldComplete = await seedVehicle('Hồ sơ đầy nhưng đã lâu', {
    tenant: goodTenant,
    images: 5,
    features: FULL_FEATURES,
    ageDays: 90,
  });

  // Lịch sử NGƯỜI BÁN: chủ tốt giữ 6/6; chủ hay huỷ rút lại 8/8 sau khi đã nhận.
  for (let i = 0; i < 6; i += 1) await seedDecidedRequest(goodTenant, vProven);
  for (let i = 0; i < 8; i += 1)
    await seedDecidedRequest(badTenant, vBadHost, { cancelledByHost: true });

  // Uy tín là dữ liệu của GIAN HÀNG, nên nó chỉ vào điểm ở lượt tính lại tiếp theo.
  await refreshListingRankScore(prisma);
});

afterAll(async () => {
  if (dbAvailable) {
    const tenants = [goodTenant, badTenant, freshTenant];
    await prisma.bookingCancellation.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.bookingRequest.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.booking.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.review.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
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

describe('Xe mới có cơ hội — nhưng là CƠ HỘI, không phải ưu đãi', () => {
  /*
   * Đây là lỗi mà sort cũ (`rating_avg DESC NULLS LAST`) mắc phải theo đúng định nghĩa: xe chưa
   * ai chấm xếp SAU mọi xe đã có đánh giá, kể cả một xe 3,2 sao. Một người bán mới vì thế không
   * bao giờ có chuyến đầu tiên.
   */
  maybe('xe MỚI đủ hồ sơ đứng TRÊN một xe có đánh giá tầm thường', async () => {
    expect(await scoreOf(vFreshComplete)).toBeGreaterThan(await scoreOf(vMediocre));

    const fresh = await rankOf(vFreshComplete);
    const mediocre = await rankOf(vMediocre);
    expect(fresh).toBeGreaterThanOrEqual(0);
    expect(fresh).toBeLessThan(mediocre);
  });

  /*
   * Ranh giới bên kia. Nếu xe mới thắng cả một xe tốt thật sự có lịch sử thì đây không còn là
   * khám phá mà là một sàn nói dối về chất lượng.
   */
  maybe('nhưng vẫn ĐỨNG SAU một xe tốt thật sự có lịch sử', async () => {
    expect(await scoreOf(vFreshComplete)).toBeLessThan(await scoreOf(vProven));
  });

  /*
   * Khám phá KHÔNG phải một kênh đẩy hồ sơ rỗng lên trang đầu. Cùng một chủ xe mới, cùng zero
   * lịch sử — khác biệt duy nhất là có chịu khai hồ sơ hay không.
   */
  maybe('hồ sơ THIẾU không được tặng cơ hội, dù cũng mới tinh', async () => {
    expect(await scoreOf(vFreshThin)).toBeLessThan(await scoreOf(vFreshComplete));
  });

  /** Cửa sổ khám phá có trần THỜI GIAN — qua nó là hết, dù xe vẫn chưa có chuyến nào. */
  maybe('xe đủ hồ sơ nhưng đã lên sàn lâu thì cửa sổ đã đóng', async () => {
    expect(await scoreOf(vOldComplete)).toBeLessThan(await scoreOf(vFreshComplete));
  });
});

describe('Uy tín chủ xe vào điểm — có trần, và có mức nền', () => {
  /*
   * Hai chiếc xe có hồ sơ GIỐNG HỆT nhau, cùng zero lịch sử của chính xe. Khác biệt duy nhất là
   * người bán: một người chưa có mẫu nào, một người đã rút lại 8 chuyến sau khi nhận.
   */
  maybe('chủ HUỶ LIÊN TỤC tụt dưới một chủ xe mới có hồ sơ y hệt', async () => {
    expect(await scoreOf(vBadHost)).toBeLessThan(await scoreOf(vFreshComplete));
    expect(await rankOf(vBadHost)).toBeGreaterThan(await rankOf(vFreshComplete));
  });

  /*
   * Chủ xe MỚI không bị phạt: làm mượt Bayes cho họ mức nền trung tính, không phải 0. Đây là vế
   * quan trọng nhất của việc làm mượt — thiếu nó, mọi người bán mới bắt đầu ở đáy bảng.
   */
  maybe('chủ xe MỚI (0 mẫu) không bị phạt — chênh với chủ tốt nằm trong trần của vế uy tín', async () => {
    const fresh = await scoreOf(vFreshComplete);
    const bad = await scoreOf(vBadHost);
    /*
     * Vế uy tín có trần 0,07, nên khoảng cách giữa "chưa biết gì" và "huỷ mọi chuyến" phải NHỎ
     * — đủ đổi thứ tự trong một nhóm ngang tài, không đủ chôn ai. Đây là con số quan trọng
     * nhất trong cả spec: nới nó lên là biến một tín hiệu điều chỉnh thành một bản án.
     */
    expect(fresh - bad).toBeLessThanOrEqual(0.07);
    expect(fresh - bad).toBeGreaterThan(0);
  });

  /*
   * Xe MỚI của một chủ xe ĐÃ CÓ LỊCH SỬ thừa hưởng uy tín của người bán, nhưng phần CHẤT LƯỢNG
   * của chính chiếc xe vẫn là prior trung tính — hai câu hỏi khác nhau, hai phép làm mượt khác
   * nhau (ADR 0045 điều 5).
   */
  maybe('xe mới của chủ xe CŨ hưởng uy tín người bán, không hưởng đánh giá của xe khác', async () => {
    const newCarOfGoodHost = await seedVehicle('Xe mới của chủ tốt', {
      tenant: goodTenant,
      images: 5,
      features: ['bluetooth', 'gps', 'camera_360'],
    });
    await refreshListingRankScore(prisma);

    // Hưởng uy tín ⇒ trên chiếc y hệt của chủ hay huỷ.
    expect(await scoreOf(newCarOfGoodHost)).toBeGreaterThan(await scoreOf(vBadHost));
    // Nhưng KHÔNG hưởng 4,8 sao của `vProven` — chất lượng vẫn là prior trung tính.
    expect(await scoreOf(newCarOfGoodHost)).toBeLessThan(await scoreOf(vProven));

    await prisma.vehicle.deleteMany({ where: { id: newCarOfGoodHost } });
  });
});

describe('Sort do KHÁCH chọn không đổi một chữ (ADR 0045 điều 4)', () => {
  /*
   * Khách bấm "giá thấp nhất" thì họ muốn giá thấp nhất, không phải "giá thấp nhất theo ý chúng
   * tôi". Điểm xếp hạng chỉ có tiếng nói ở sort MẶC ĐỊNH.
   */
  maybe('giá tăng dần là giá tăng dần, không trộn điểm', async () => {
    await prisma.publicListing.updateMany({
      where: { vehicleId: vFreshComplete },
      data: { weekdayPrice: '2000000' },
    });

    const res = await service.search(sq({ sort: 'price_asc' }));
    const prices = res.data.map((row) => Number(row.weekdayPrice));
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    // Xe đắt nhất phải ở CUỐI, dù nó là chiếc đang được vế khám phá nâng lên.
    expect(res.data[res.data.length - 1]!.id).toBe(vFreshComplete);

    await prisma.publicListing.updateMany({
      where: { vehicleId: vFreshComplete },
      data: { weekdayPrice: '600000' },
    });
  });

  maybe('mới nhất là mới nhất — xe lên sàn lâu nhất phải ở cuối', async () => {
    const res = await service.search(sq({ sort: 'newest' }));
    const ids = res.data.map((row) => row.id);
    expect(ids).toContain(vOldComplete);
    expect(ids[ids.length - 1]).toBe(vOldComplete);
  });

  /** Bộ lọc vẫn là bộ lọc: sort mặc định đổi THỨ TỰ, không đổi TẬP kết quả. */
  maybe('lọc theo tỉnh/loại xe vẫn đúng dưới sort mặc định', async () => {
    const all = await service.search(sq());
    expect(all.data.length).toBeGreaterThanOrEqual(6);

    const motorbikes = await service.search(sq({ vehicleType: VEHICLE_TYPE.MOTORBIKE }));
    expect(motorbikes.data).toHaveLength(0);

    const elsewhere = await service.search(sq({ provinceCode: '01' }));
    expect(elsewhere.data.map((r) => r.id)).not.toContain(vProven);
  });

  /*
   * PHÂN TRANG ỔN ĐỊNH. Vế khám phá nằm TRONG `rank_score` chứ không phải một bước trộn lúc
   * đọc, nên thứ tự là toàn cục — không xe nào xuất hiện ở hai trang.
   */
  maybe('phân trang không trả trùng xe giữa hai trang', async () => {
    const page1 = await service.search(sq({ limit: 3, page: 1 }));
    const page2 = await service.search(sq({ limit: 3, page: 2 }));
    const ids1 = page1.data.map((r) => r.id);
    const ids2 = page2.data.map((r) => r.id);
    expect(ids1.filter((id) => ids2.includes(id))).toHaveLength(0);
  });
});
