import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  FUEL_TYPE,
  PERMISSION,
  SUPPORT_CAPABILITY,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import 'reflect-metadata';
import {
  PERMISSIONS_KEY,
  PLAN_FEATURE_KEY,
  SUBSCRIPTION_TRACK_ONLY_KEY,
  SUPPORT_ACTION_KEY,
} from '../src/common/decorators';
import { buildListingWhereSql } from '../src/modules/public-listings/listing-filter';
import type { PublicListingQueryDto } from '../src/modules/public-listings/dto/public-listing.dto';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { TenantsController } from '../src/modules/tenants/tenants.controller';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makePublicListingsService,
  makeTenantsService,
  seedBranch,
  seedProvince,
} from './helpers/service-factory';
import { TEST_PROVINCE } from './helpers/test-provinces';

/**
 * ADR 0059 — "Có hỗ trợ xuất hoá đơn VAT" là thiết lập CẤP GIAN HÀNG, áp cho MỌI xe.
 *
 * Chạy qua service THẬT trên PostgreSQL thật. Điều cần khoá: cờ nằm đúng MỘT chỗ (`tenants`), chợ
 * đọc nó bằng JOIN (ADR 0008 §3) — bật một lần là cả đội xe vào bộ lọc, gian hàng khác không bị
 * kéo theo — và nó không chạm trục nào khác (xe, listing, kiểm duyệt).
 *
 * Cô lập bằng một MÃ TỈNH riêng, cùng cách với `listings-facets.spec`.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const tenants = makeTenantsService(asService);
const listings = new ListingsService(asService);
const publicListings = makePublicListingsService(asService);

const PROV = TEST_PROVINCE.TENANT_VAT_INVOICE.code;
const PROV_NAME = TEST_PROVINCE.TENANT_VAT_INVOICE.name;

let dbAvailable = false;
const userIds: string[] = [];
let shopA: string;
let shopB: string;
let ownerA: string;
let ownerB: string;
/** Gian hàng A: hai xe (xăng + điện). */
let a1: string;
let a2: string;
/** Gian hàng B: một xe xăng. */
let b1: string;

/** Chi nhánh mặc định của từng gian hàng — mỗi gian hàng đúng MỘT (partial unique ở DB). */
const branchOf = new Map<string, string>();

async function seedTenant(name: string): Promise<{ tenantId: string; ownerId: string }> {
  const ownerId = newId();
  const tenantId = newId();
  userIds.push(ownerId);
  await prisma.user.create({
    data: {
      realm: ACCOUNT_REALM.PARTNER,
      id: ownerId,
      displayName: name,
      email: `vat-${ownerId}@xeprime.test`,
    },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantProfile.create({
    data: { tenantId, provinceCode: PROV, provinceName: PROV_NAME },
  });
  branchOf.set(tenantId, await seedBranch(asService, { tenantId, provinceCode: PROV }));
  return { tenantId, ownerId };
}

/** Xe đã ở chợ — fixture ghi thẳng như `listings-facets.spec`; snapshot đi qua writer thật. */
async function seedListedVehicle(tenantId: string, fuel: string): Promise<string> {
  const branchId = branchOf.get(tenantId)!;
  const id = newId();
  await prisma.vehicle.create({
    data: {
      id,
      tenantId,
      branchId,
      code: `V-${id.slice(-6)}`,
      name: `Xe ${id.slice(-4)}`,
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      brand: 'Toyota',
      bodyType: 'sedan',
      seatCount: 5,
      fuelType: fuel,
      weekdayPrice: '700000',
      mainImageUrl: 'https://img.example/x.jpg',
    },
  });
  await listings.syncFromVehicle(id);
  return id;
}

const sq = (extra: Partial<PublicListingQueryDto> = {}): PublicListingQueryDto =>
  ({ provinceCode: PROV, limit: 48, ...extra }) as PublicListingQueryDto;

const vatIds = async (extra: Partial<PublicListingQueryDto> = {}): Promise<string[]> =>
  (await publicListings.search(sq({ vatInvoice: true, ...extra }))).data.map((v) => v.id).sort();

const vatAudits = (tenantId: string): Promise<number> =>
  prisma.auditLog.count({ where: { tenantId, action: 'tenant.vat_invoice.update' } });

beforeEach(() => {
  publicListings.clearFacetsCache();
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

  await seedProvince(asService, PROV, PROV_NAME);
  ({ tenantId: shopA, ownerId: ownerA } = await seedTenant('Shop VAT A'));
  ({ tenantId: shopB, ownerId: ownerB } = await seedTenant('Shop VAT B'));
  a1 = await seedListedVehicle(shopA, FUEL_TYPE.GASOLINE);
  a2 = await seedListedVehicle(shopA, FUEL_TYPE.ELECTRIC);
  b1 = await seedListedVehicle(shopB, FUEL_TYPE.GASOLINE);
});

afterAll(async () => {
  if (dbAvailable) {
    const tenantIds = [shopA, shopB];
    await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.publicListing.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId: { in: tenantIds } } });
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

/* ─── Cổng ở controller: quyền + phạm vi, KHÔNG theo tuyến ─────────────────── */

describe('ADR 0059 — cổng của /tenants/current/vat-invoice', () => {
  const meta = (handler: unknown, key: string): unknown =>
    Reflect.getMetadata(key, handler as object);
  const read = TenantsController.prototype.vatInvoiceSetting;
  const write = TenantsController.prototype.setVatInvoiceSupport;

  it('GET: `tenants.view`, phiên hỗ trợ XEM được', () => {
    expect(meta(read, PERMISSIONS_KEY)).toEqual([PERMISSION.TENANT_VIEW]);
    expect(meta(read, SUPPORT_ACTION_KEY)).toBe(SUPPORT_CAPABILITY.TENANT_PROFILE_VIEW);
  });

  it('PATCH: `tenants.update`, áp như nhau hai tuyến, phiên hỗ trợ không bật/tắt thay', () => {
    expect(meta(write, PERMISSIONS_KEY)).toEqual([PERMISSION.TENANT_UPDATE]);
    expect(meta(write, SUBSCRIPTION_TRACK_ONLY_KEY)).toBeUndefined();
    expect(meta(write, PLAN_FEATURE_KEY)).toBeUndefined();
    expect(meta(write, SUPPORT_ACTION_KEY)).toBeUndefined();
  });
});

/* ─── Dữ liệu + chợ ───────────────────────────────────────────────────────── */

describe('ADR 0059 — một thiết lập cho cả đội xe', () => {
  maybe('mặc định KHÔNG hỗ trợ — không suy ra một cam kết chưa có', async () => {
    expect(await tenants.getVatInvoiceSetting(shopA)).toEqual({ vatInvoiceSupported: false });
    expect(await vatIds()).toEqual([]);
    const all = await publicListings.search(sq());
    expect(all.data.every((v) => v.vatInvoiceSupported === false)).toBe(true);
  });

  maybe('bật ở gian hàng A → MỌI xe của A vào bộ lọc, xe của B thì không', async () => {
    const res = await tenants.setVatInvoiceSupport(shopA, ownerA, true);
    expect(res).toEqual({ vatInvoiceSupported: true });

    expect(await vatIds()).toEqual([a1, a2].sort());
    const page = await publicListings.search(sq({ vatInvoice: true, limit: 1 }));
    // Lọc ở DB trước phân trang: `total` và `hasNext` nói về cả tập, không phải trang đầu.
    expect(page.meta).toMatchObject({ total: 2, hasNext: true });

    // AND với chiều khác: xe điện + VAT chỉ còn a2.
    expect(await vatIds({ fuelType: [FUEL_TYPE.ELECTRIC] })).toEqual([a2]);

    // Thẻ + chi tiết đọc cùng cột qua join.
    const cards = (await publicListings.search(sq())).data;
    expect(cards.find((v) => v.id === a1)?.vatInvoiceSupported).toBe(true);
    expect(cards.find((v) => v.id === b1)?.vatInvoiceSupported).toBe(false);
    expect((await publicListings.getById(a2)).vatInvoiceSupported).toBe(true);
    expect((await publicListings.getById(b1)).vatInvoiceSupported).toBe(false);

    // Facet bỏ chính chiều của nó: vẫn đếm hai xe hỗ trợ trên toàn tập.
    const f = await publicListings.facets(sq({ vatInvoice: true }));
    expect(f.total).toBe(2);
    expect(f.amenities.vatInvoice).toBe(2);

    expect(await vatAudits(shopA)).toBe(1);
    expect(await vatAudits(shopB)).toBe(0);

    await tenants.setVatInvoiceSupport(shopA, ownerA, false);
  });

  maybe('hai bản dựng điều kiện (Prisma · SQL) cho cùng một tập', async () => {
    await tenants.setVatInvoiceSupport(shopB, ownerB, true);
    const rows = await prisma.$queryRaw<Array<{ vehicle_id: string }>>`
      SELECT pl."vehicle_id" FROM "public_listings" pl
      WHERE ${buildListingWhereSql(sq({ vatInvoice: true }))}
    `;
    expect(rows.map((r) => r.vehicle_id.trim()).sort()).toEqual(await vatIds());
    expect(await vatIds()).toEqual([b1]);
    await tenants.setVatInvoiceSupport(shopB, ownerB, false);
  });

  maybe('không chạm xe hay snapshot: kiểm duyệt, hiển thị, giá, listing giữ nguyên', async () => {
    const snapshot = () =>
      Promise.all([
        prisma.vehicle.findMany({
          where: { tenantId: shopA },
          select: { id: true, publicStatus: true, marketplaceEnabled: true, weekdayPrice: true, updatedAt: true },
          orderBy: { id: 'asc' },
        }),
        prisma.publicListing.findMany({
          where: { tenantId: shopA },
          select: { vehicleId: true, status: true, updatedAt: true },
          orderBy: { vehicleId: 'asc' },
        }),
      ]);
    const before = await snapshot();
    await tenants.setVatInvoiceSupport(shopA, ownerA, true);
    expect(await snapshot()).toEqual(before);
    await tenants.setVatInvoiceSupport(shopA, ownerA, false);
  });

  maybe('gửi lại đúng giá trị là no-op; hai lượt song song chỉ một lượt ghi', async () => {
    const start = await vatAudits(shopB);
    await tenants.setVatInvoiceSupport(shopB, ownerB, false); // đang false → no-op
    expect(await vatAudits(shopB)).toBe(start);

    await Promise.all([
      tenants.setVatInvoiceSupport(shopB, ownerB, true),
      tenants.setVatInvoiceSupport(shopB, ownerB, true),
    ]);
    expect(await vatAudits(shopB)).toBe(start + 1);
    expect(await tenants.getVatInvoiceSetting(shopB)).toEqual({ vatInvoiceSupported: true });
    await tenants.setVatInvoiceSupport(shopB, ownerB, false);
  });

  maybe('gian hàng đã xoá: NOT_FOUND', async () => {
    await expect(tenants.setVatInvoiceSupport(newId(), ownerA, true)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.NOT_FOUND },
    });
  });
});
