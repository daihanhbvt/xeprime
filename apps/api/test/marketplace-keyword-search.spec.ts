import { foldSearchText, searchFoldTranslateTable } from '@xeprime/domain';
import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  BILLING_MODE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { buildListingWhereSql } from '../src/modules/public-listings/listing-filter';
import { resolveKeyword } from '../src/modules/public-listings/keyword-match';
import type { PublicListingQueryDto } from '../src/modules/public-listings/dto/public-listing.dto';
import type { PrismaService } from '../src/prisma/prisma.service';
import { giveTenantPlan } from './helpers/billing-fixture';
import { makePublicListingsService, seedBranch, seedProvince } from './helpers/service-factory';
import { TEST_PROVINCE } from './helpers/test-provinces';

/**
 * Ô từ khoá ở `/search` trên PostgreSQL THẬT — migration `20261009170000_marketplace_keyword_search`.
 *
 * Ba điều được khoá ở đây:
 *
 *   1. Hàm gấp SQL (`xeprime_search_fold`) và bản TS (`foldSearchText`) cho CÙNG một chuỗi trên
 *      mọi mẫu — dữ liệu gấp bằng SQL, từ khoá gấp bằng TS, lệch một ký tự là một chữ không bao
 *      giờ tìm ra.
 *   2. Khớp đúng TÊN CÔNG KHAI theo tuyến (ADR 0054): gian hàng tuyến gói tìm được bằng tên gian
 *      hàng, KHÔNG bằng họ tên người đứng tên; chủ xe tuyến hoa hồng tìm được bằng họ tên tài
 *      khoản, KHÔNG bằng tên gian hàng đang nằm yên — và tuyến chấm LÚC ĐỌC, nên đổi gói là
 *      đổi tên khớp ngay, không chờ cột `public_listings.billing_mode` (không ai đồng bộ nó).
 *   3. Bản SQL của bộ lọc (facet) cho cùng tập xe với bản Prisma (danh sách).
 *
 * Chạy: pnpm --filter @xeprime/api test -- test/marketplace-keyword-search.spec.ts
 */
const prisma = createPrismaClient();
const service = makePublicListingsService(prisma as unknown as PrismaService);
const listings = new ListingsService(prisma as unknown as PrismaService);

const PROV = TEST_PROVINCE.MARKETPLACE_KEYWORD.code;
const PROV_NAME = TEST_PROVINCE.MARKETPLACE_KEYWORD.name;

let dbAvailable = false;
const userIds: string[] = [];
const tenantIds: string[] = [];

/** Tuyến GÓI: gian hàng "Sài Gòn Car", người đứng tên "Trần Thị Bích". */
let shopTenantId: string;
let vVinfast: string;
let vVios: string;
/** Tuyến HOA HỒNG: chủ xe "Nguyễn Văn Tuấn", tên gian hàng (không công khai) "Kho Cũ Hà Đông". */
let ownerUserId: string;
let ownerTenantId: string;
let vMazda: string;
let vMorning: string;

async function seedHost(input: {
  ownerName: string;
  shopName: string;
  billingMode: typeof BILLING_MODE.PACKAGE | typeof BILLING_MODE.COMMISSION;
}): Promise<{ tenantId: string; userId: string; branchId: string }> {
  const userId = newId();
  await prisma.user.create({
    data: {
      id: userId,
      realm: ACCOUNT_REALM.PARTNER,
      displayName: input.ownerName,
      email: `kw-${userId}@xeprime.test`,
    },
  });
  userIds.push(userId);

  const tenantId = newId();
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `kw-${tenantId.toLowerCase().slice(-10)}`,
      name: input.shopName,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: userId,
    },
  });
  tenantIds.push(tenantId);
  await giveTenantPlan(prisma, tenantId, { billingMode: input.billingMode });
  await prisma.tenantProfile.create({
    data: { tenantId, provinceCode: PROV, provinceName: PROV_NAME },
  });
  const branchId = await seedBranch(prisma as unknown as PrismaService, {
    tenantId,
    provinceCode: PROV,
  });
  return { tenantId, userId, branchId };
}

async function seedVehicle(
  host: { tenantId: string; branchId: string },
  v: { name: string; brand: string; model: string },
): Promise<string> {
  const id = newId();
  await prisma.vehicle.create({
    data: {
      id,
      tenantId: host.tenantId,
      branchId: host.branchId,
      code: `V-${id.slice(-6)}`,
      name: v.name,
      brand: v.brand,
      model: v.model,
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      seatCount: 5,
      weekdayPrice: '700000',
      mainImageUrl: 'https://img.example/x.jpg',
    },
  });
  await listings.syncFromVehicle(id);
  return id;
}

const sq = (q: string): PublicListingQueryDto =>
  ({ provinceCode: PROV, limit: 48, q }) as PublicListingQueryDto;

async function idsFor(q: string): Promise<string[]> {
  const res = await service.search(sq(q));
  return res.data.map((v) => v.id).sort();
}

const sorted = (...ids: string[]) => [...ids].sort();

async function namesFor(q: string) {
  const res = await service.listShops({ q, limit: 10 });
  // Database test dùng chung giữa các spec — chỉ nhìn gian hàng của spec này.
  return res.data
    .filter((s) => s.slug.startsWith('kw-'))
    .map((s) => ({ name: s.name, verified: s.verified }));
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

  await seedProvince(prisma as unknown as PrismaService, PROV, PROV_NAME);

  const shop = await seedHost({
    ownerName: 'Trần Thị Bích',
    shopName: 'Sài Gòn Car',
    billingMode: BILLING_MODE.PACKAGE,
  });
  shopTenantId = shop.tenantId;
  vVinfast = await seedVehicle(shop, { name: 'VinFast VF8 Plus', brand: 'VinFast', model: 'VF8' });
  vVios = await seedVehicle(shop, { name: 'Toyota Vios 2020', brand: 'Toyota', model: 'Vios' });

  const owner = await seedHost({
    ownerName: 'Nguyễn Văn Tuấn',
    shopName: 'Kho Cũ Hà Đông',
    billingMode: BILLING_MODE.COMMISSION,
  });
  ownerUserId = owner.userId;
  ownerTenantId = owner.tenantId;
  vMazda = await seedVehicle(owner, { name: 'Mazda CX-5 2.0', brand: 'Mazda', model: 'CX-5' });
  vMorning = await seedVehicle(owner, { name: 'Kia Morning', brand: 'Kia', model: 'Morning' });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.province.deleteMany({ where: { code: PROV } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('xeprime_search_fold khớp foldSearchText (chống lệch hai bản)', () => {
  const SAMPLES = [
    'Nguyễn Văn Tuấn',
    'ĐÀ NẴNG — Auto',
    'VinFast VF8 Plus',
    'Mazda CX-5 2.0 Premium',
    'Hyundai Grand i10',
    'Nguyễn', // tổ hợp (NFD) — bộ gõ phát ra kiểu này
    'Ưng Ý   Ơi!!',
    'İstanbul Ölçü ß',
    '%_\\ \'"',
    'a1b2c3',
    '',
  ];

  maybe('TRỌN bảng ký tự của translate() — một chữ gõ sai ở migration không lọt qua', async () => {
    // Mỗi ký tự nguồn đứng riêng một từ: lệch ở đúng một vị trí là lệch đúng một từ.
    const everyChar = [...searchFoldTranslateTable()[0]].join(' ');
    const [row] = await prisma.$queryRaw<Array<{ folded: string }>>`
      SELECT xeprime_search_fold(${everyChar}) AS folded
    `;
    expect(row?.folded).toBe(foldSearchText(everyChar));
  });

  maybe('mọi mẫu ra cùng một chuỗi', async () => {
    for (const sample of SAMPLES) {
      const [row] = await prisma.$queryRaw<Array<{ folded: string }>>`
        SELECT xeprime_search_fold(${sample}) AS folded
      `;
      expect({ sample, folded: row?.folded }).toEqual({ sample, folded: foldSearchText(sample) });
    }
  });
});

describe('Từ khoá — tên xe / hãng / model', () => {
  maybe('không dấu, không phân biệt hoa thường', async () => {
    expect(await idsFor('vinfast')).toEqual([vVinfast]);
    expect(await idsFor('TOYOTA vios')).toEqual([vVios]);
  });

  maybe('chữ ↔ số tách hay dính đều ra cùng xe', async () => {
    expect(await idsFor('vf8')).toEqual([vVinfast]);
    expect(await idsFor('VF 8')).toEqual([vVinfast]);
    expect(await idsFor('cx5')).toEqual([vMazda]);
    expect(await idsFor('CX-5')).toEqual([vMazda]);
  });

  maybe('khớp ĐẦU TỪ, không khớp giữa từ', async () => {
    expect(await idsFor('vio')).toEqual([vVios]);
    // "an" nằm giữa "Tuấn" — không được kéo xe của anh Tuấn ra.
    expect(await idsFor('an')).toEqual([]);
  });

  maybe('từ khoá toàn dấu câu không lọc gì', async () => {
    expect(await idsFor('!!!')).toEqual(sorted(vVinfast, vVios, vMazda, vMorning));
  });
});

describe('Từ khoá — tên công khai của chủ xe theo tuyến (ADR 0054)', () => {
  maybe('chủ xe tuyến hoa hồng: tìm bằng họ tên tài khoản', async () => {
    expect(await idsFor('tuan')).toEqual(sorted(vMazda, vMorning));
    expect(await idsFor('Nguyễn Tuấn')).toEqual(sorted(vMazda, vMorning));
  });

  maybe('chủ xe tuyến hoa hồng: tên gian hàng đang nằm yên KHÔNG tìm được', async () => {
    expect(await idsFor('kho cu ha dong')).toEqual([]);
  });

  maybe('gian hàng tuyến gói: tìm bằng tên gian hàng, kể cả viết liền', async () => {
    expect(await idsFor('sài gòn')).toEqual(sorted(vVinfast, vVios));
    expect(await idsFor('saigon')).toEqual(sorted(vVinfast, vVios));
  });

  maybe('gian hàng tuyến gói: họ tên người đứng tên KHÔNG tìm được', async () => {
    expect(await idsFor('bich')).toEqual([]);
  });

  maybe('nhiều từ: AND qua các trường, không cần đúng thứ tự', async () => {
    expect(await idsFor('mazda tuan')).toEqual([vMazda]);
    expect(await idsFor('tuan mazda')).toEqual([vMazda]);
    expect(await idsFor('mazda saigon')).toEqual([]);
  });

  maybe('đổi tuyến là đổi tên khớp NGAY — không đọc billing_mode của snapshot', async () => {
    // Chủ xe hoa hồng lên gói: mặt tiền thành "Kho Cũ Hà Đông" (gian hàng). `public_listings`
    // vẫn mang billing_mode cũ — chính tình huống mà một bộ lọc đọc cột đó sẽ lộ họ tên chủ.
    const far = new Date(Date.now() + 730 * 24 * 3600 * 1000);
    const { subscriptionId } = await giveTenantPlan(prisma, ownerTenantId, {
      billingMode: BILLING_MODE.PACKAGE,
      endsAt: far,
    });
    try {
      expect(await idsFor('tuan')).toEqual([]);
      expect(await idsFor('kho cu ha dong')).toEqual(sorted(vMazda, vMorning));
      expect(await namesFor('tuan')).toEqual([]);
      expect(await namesFor('kho cu')).toEqual([{ name: 'Kho Cũ Hà Đông', verified: true }]);
    } finally {
      await prisma.tenantSubscription.delete({ where: { id: subscriptionId } });
    }
    expect(await idsFor('tuan')).toEqual(sorted(vMazda, vMorning));
  });

  maybe('họ tên không có chữ Latin vẫn là tên đang hiện — KHÔNG rơi về tên gian hàng', async () => {
    await prisma.user.update({ where: { id: ownerUserId }, data: { displayName: '李明' } });
    try {
      expect(await idsFor('kho cu')).toEqual([]);
      // Chỉ tên TRẮNG mới rơi về tên gian hàng — đúng phép `storefrontIdentity`.
      await prisma.user.update({ where: { id: ownerUserId }, data: { displayName: '   ' } });
      expect(await idsFor('kho cu')).toEqual(sorted(vMazda, vMorning));
    } finally {
      await prisma.user.update({
        where: { id: ownerUserId },
        data: { displayName: 'Nguyễn Văn Tuấn' },
      });
    }
  });

  maybe('dạng viết liền của từ kề nhau cũng khớp (quyết định có chủ đích)', async () => {
    // "saigon" ↔ "Sài Gòn" là lý do; cái giá là vài trận khớp chéo ranh giới từ như
    // "nguyenvan" — chấp nhận, và không tô đậm (highlightSearchMatch chỉ tô đầu từ thật).
    expect(await idsFor('nguyenvan')).toEqual(sorted(vMazda, vMorning));
  });

  maybe('trigger theo kịp đổi tên — không cần job đồng bộ nào', async () => {
    await prisma.tenant.update({ where: { id: shopTenantId }, data: { name: 'Đà Nẵng Auto' } });
    await prisma.user.update({ where: { id: ownerUserId }, data: { displayName: 'Lê Minh' } });
    try {
      expect(await idsFor('danang')).toEqual(sorted(vVinfast, vVios));
      expect(await idsFor('saigon')).toEqual([]);
      expect(await idsFor('le minh')).toEqual(sorted(vMazda, vMorning));
      expect(await idsFor('tuan')).toEqual([]);
    } finally {
      await prisma.tenant.update({ where: { id: shopTenantId }, data: { name: 'Sài Gòn Car' } });
      await prisma.user.update({
        where: { id: ownerUserId },
        data: { displayName: 'Nguyễn Văn Tuấn' },
      });
    }
  });

  maybe('cột dẫn xuất không ghi đè được từ ứng dụng', async () => {
    await prisma.tenant.update({ where: { id: shopTenantId }, data: { searchName: ' bich' } });
    const row = await prisma.tenant.findUniqueOrThrow({
      where: { id: shopTenantId },
      select: { searchName: true },
    });
    expect(row.searchName.startsWith(' sai gon car')).toBe(true);
  });
});

describe('Gợi ý chủ xe — GET /public/shops?q=', () => {

  maybe('cùng luật tên công khai với lưới kết quả', async () => {
    expect(await namesFor('tuan')).toEqual([{ name: 'Nguyễn Văn Tuấn', verified: false }]);
    expect(await namesFor('sai gon')).toEqual([{ name: 'Sài Gòn Car', verified: true }]);
    expect(await namesFor('bich')).toEqual([]);
    expect(await namesFor('kho cu')).toEqual([]);
  });

  maybe('không có q ⇒ không lọc theo tên (danh sách nổi bật như cũ)', async () => {
    const all = await service.listShops({ limit: 48 });
    const filtered = await service.listShops({ q: 'tuan', limit: 48 });
    expect(all.meta.total).toBeGreaterThanOrEqual(2);
    expect(filtered.meta.total).toBeLessThan(all.meta.total);
    expect(all.data.every((s) => typeof s.verified === 'boolean')).toBe(true);
  });
});

describe('buildListingWhereSql khớp buildListingWhere cho từ khoá', () => {
  async function idsViaSql(q: string): Promise<string[]> {
    const keyword = await resolveKeyword(prisma as unknown as PrismaService, q, new Date());
    const rows = await prisma.$queryRaw<Array<{ vehicle_id: string }>>`
      SELECT pl."vehicle_id" FROM "public_listings" pl
      WHERE ${buildListingWhereSql({ ...sq(q), keyword })}
    `;
    return rows.map((r) => r.vehicle_id.trim()).sort();
  }

  for (const q of ['vinfast', 'vf 8', 'tuan', 'kho cu', 'saigon', 'bich', 'mazda tuan', 'an', '!!!']) {
    maybe(`q = "${q}"`, async () => {
      expect(await idsViaSql(q)).toEqual(await idsFor(q));
    });
  }
});
