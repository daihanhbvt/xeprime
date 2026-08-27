import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  OCCUPANCY_SOURCE_TYPE,
  SERVICE_TYPE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import type { PublicListingQueryDto } from '../src/modules/public-listings/dto/public-listing.dto';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makePublicListingsService, seedBranch, seedProvince } from './helpers/service-factory';

/**
 * Phase 3 Gap 2 — lọc marketplace theo giá + ngày rảnh + tỉnh, chạy trên PostgreSQL THẬT.
 * Cô lập bằng provinceName duy nhất để không dính dữ liệu seed. Không có DB thì tự skip.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/api test
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const service = makePublicListingsService(prisma as unknown as PrismaService);
const listings = new ListingsService(prisma as unknown as PrismaService);

// provinceName duy nhất cho lần chạy này (khỏi đụng xe seed thật).
const PROV_A = 'Z3';
const PROV_A_NAME = 'Zone Filter A';
const PROV_B = 'Z4';
const PROV_B_NAME = 'Zone Filter B';

// Cửa sổ bận của xe vBusy.
const BUSY_START = new Date('2027-01-10T00:00:00.000Z');
const BUSY_END = new Date('2027-01-15T00:00:00.000Z');

let dbAvailable = false;
let ownerId: string;
let tenantA: string;
let tenantB: string;
let vCheap: string;
let vMid: string;
let vHigh: string;
let vBusy: string;
let vProvB: string;
// Bộ xe theo loại dịch vụ (mảng năng lực — 17/08) — giá 400k (dưới sàn 500k của các test giá)
// để không lọt vào các assertion `toEqual` theo khoảng giá phía trên.
let vDriver: string;
let vBothSvc: string;
let vLongTerm: string;

/** Chi nhánh mặc định của mỗi tenant trong spec — xe lấy tỉnh từ đây. */
const branchByTenant = new Map<string, string>();

async function seedActiveTenant(provinceCode: string, provinceName: string): Promise<string> {
  const id = newId();
  await prisma.tenant.create({
    data: {
      id,
      code: `T-${id.slice(-8)}`,
      slug: `t-${id.toLowerCase().slice(-10)}`,
      name: `Shop ${provinceName}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantProfile.create({
    data: { tenantId: id, displayName: `Shop ${provinceName}`, provinceCode, provinceName },
  });
  branchByTenant.set(id, await seedBranch(asService, { tenantId: id, provinceCode }));
  return id;
}

async function seedVehicle(
  tenantId: string,
  price: string,
  serviceTypes?: string[],
): Promise<string> {
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
      weekdayPrice: price,
      ...(serviceTypes ? { serviceTypes: [...serviceTypes].sort() } : {}),
    },
  });
  return id;
}

const q = (extra: Partial<PublicListingQueryDto>): PublicListingQueryDto =>
  ({ limit: 48, ...extra }) as PublicListingQueryDto;

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

  await seedProvince(asService, PROV_A, PROV_A_NAME);
  await seedProvince(asService, PROV_B, PROV_B_NAME);
  tenantA = await seedActiveTenant(PROV_A, PROV_A_NAME);
  tenantB = await seedActiveTenant(PROV_B, PROV_B_NAME);

  vCheap = await seedVehicle(tenantA, '400000');
  vMid = await seedVehicle(tenantA, '600000');
  vHigh = await seedVehicle(tenantA, '1500000');
  vBusy = await seedVehicle(tenantA, '600000');
  vProvB = await seedVehicle(tenantB, '700000');
  vDriver = await seedVehicle(tenantA, '400000', [SERVICE_TYPE.WITH_DRIVER]);
  vBothSvc = await seedVehicle(tenantA, '400000', [
    SERVICE_TYPE.SELF_DRIVE,
    SERVICE_TYPE.WITH_DRIVER,
  ]);
  vLongTerm = await seedVehicle(tenantA, '400000', [SERVICE_TYPE.LONG_TERM]);

  await prisma.vehicleOccupancy.create({
    data: {
      id: newId(),
      tenantId: tenantA,
      vehicleId: vBusy,
      sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING,
      sourceId: newId(),
      startAt: BUSY_START,
      endAt: BUSY_END,
    },
  });

  // Reads đọc từ public_listings (ADR 0008) → sync mọi xe seed vào snapshot.
  for (const id of [vCheap, vMid, vHigh, vBusy, vProvB, vDriver, vBothSvc, vLongTerm])
    await listings.syncFromVehicle(id);
});

afterAll(async () => {
  if (dbAvailable) {
    const tenantIds = [tenantA, tenantB];
    await prisma.vehicleOccupancy.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.province.deleteMany({ where: { code: { in: [PROV_A, PROV_B] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Marketplace filter (giá / ngày rảnh / tỉnh)', () => {
  maybe('lọc khoảng giá 500k–800k → chỉ xe trong khoảng', async () => {
    const res = await service.search(q({ provinceCode: PROV_A, priceMin: 500000, priceMax: 800000 }));
    const ids = res.data.map((v) => v.id);
    expect(ids).toContain(vMid);
    expect(ids).toContain(vBusy); // 600k, chưa lọc ngày
    expect(ids).not.toContain(vCheap); // 400k
    expect(ids).not.toContain(vHigh); // 1.5tr
  });

  maybe('priceMax mở (chỉ min) — trên 1.2tr', async () => {
    const res = await service.search(q({ provinceCode: PROV_A, priceMin: 1200000 }));
    const ids = res.data.map((v) => v.id);
    expect(ids).toEqual([vHigh]);
  });

  maybe('ngày rảnh: xe bận trong khoảng bị loại, xe rảnh vẫn hiện', async () => {
    const res = await service.search(
      q({
        provinceCode: PROV_A,
        pickupAt: '2027-01-12T00:00:00.000Z',
        returnAt: '2027-01-14T00:00:00.000Z',
      }),
    );
    const ids = res.data.map((v) => v.id);
    expect(ids).not.toContain(vBusy);
    expect(ids).toContain(vMid);
    expect(ids).toContain(vCheap);
  });

  maybe('ngày không chồng lấn: xe bận hiện lại', async () => {
    const res = await service.search(
      q({
        provinceCode: PROV_A,
        pickupAt: '2027-02-01T00:00:00.000Z',
        returnAt: '2027-02-03T00:00:00.000Z',
      }),
    );
    expect(res.data.map((v) => v.id)).toContain(vBusy);
  });

  maybe('lọc tỉnh chỉ trả xe của tỉnh đó', async () => {
    const res = await service.search(q({ provinceCode: PROV_B }));
    const ids = res.data.map((v) => v.id);
    expect(ids).toEqual([vProvB]);
  });

  maybe('giá + ngày rảnh kết hợp: 500–800k rảnh giữa cửa sổ bận', async () => {
    const res = await service.search(
      q({
        provinceCode: PROV_A,
        priceMin: 500000,
        priceMax: 800000,
        pickupAt: '2027-01-12T00:00:00.000Z',
        returnAt: '2027-01-14T00:00:00.000Z',
      }),
    );
    const ids = res.data.map((v) => v.id);
    expect(ids).toEqual([vMid]); // vBusy cùng giá nhưng bận → loại
  });
});

describe('Marketplace filter (loại dịch vụ — mảng năng lực, tab tự lái / có tài xế / dài hạn)', () => {
  maybe('self_drive gồm cả xe đăng NHIỀU dịch vụ — lọc theo năng lực (has)', async () => {
    const res = await service.search(
      q({ provinceCode: PROV_A, serviceType: SERVICE_TYPE.SELF_DRIVE }),
    );
    const ids = res.data.map((v) => v.id);
    expect(ids).toContain(vCheap); // default ['self_drive']
    expect(ids).toContain(vBothSvc); // đăng cả tự lái lẫn có tài xế
    expect(ids).not.toContain(vDriver); // chỉ có tài xế
    expect(ids).not.toContain(vLongTerm);
  });

  maybe('with_driver gồm cả xe đăng nhiều dịch vụ', async () => {
    const res = await service.search(
      q({ provinceCode: PROV_A, serviceType: SERVICE_TYPE.WITH_DRIVER }),
    );
    const ids = res.data.map((v) => v.id);
    expect(ids).toContain(vDriver);
    expect(ids).toContain(vBothSvc);
    expect(ids).not.toContain(vCheap);
    expect(ids).not.toContain(vLongTerm);
  });

  maybe('long_term chỉ trả xe có đăng dài hạn', async () => {
    const res = await service.search(
      q({ provinceCode: PROV_A, serviceType: SERVICE_TYPE.LONG_TERM }),
    );
    expect(res.data.map((v) => v.id)).toEqual([vLongTerm]);
  });
});
