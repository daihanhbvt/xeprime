import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  BODY_TYPE,
  FUEL_TYPE,
  MOTORBIKE_CATEGORY,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { MARKET_PRICE_BASIS, MARKET_PRICE_MIN_SAMPLE } from '@xeprime/domain';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { MarketPriceService } from '../src/modules/public-listings/market-price.service';
import type { MarketPriceQueryDto } from '../src/modules/public-listings/dto/market-price.dto';
import type { PrismaService } from '../src/prisma/prisma.service';
import { seedBranch, seedProvince } from './helpers/service-factory';

/**
 * Gợi ý giá thuê trên PostgreSQL THẬT.
 *
 * Bốn thứ spec này giữ, theo thứ tự quan trọng:
 *
 *  1. **Đủ mẫu thì dùng số thật, thiếu mẫu thì nói rõ là mức khởi điểm.** `basis` sai nghĩa là
 *     giao diện trình bày một con số bịa như thể nó là số liệu thị trường.
 *  2. **Thang nới dần chạy đúng chiều**: hết tỉnh → toàn quốc → cùng loại xe → bảng khởi điểm.
 *  3. **Trung vị chứ không phải trung bình** — một chiếc xe đắt bất thường không được kéo gợi ý
 *     lên trên mức mà phần lớn xe trong nhóm đang treo.
 *  4. **Chỉ đếm xe khách nhìn thấy** — gian hàng bị khoá không được góp giá vào mặt bằng.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/api test -- test/market-price.spec.ts
 */
const prisma = createPrismaClient();
const listings = new ListingsService(prisma as unknown as PrismaService);

const PROV = 'Z7';
const PROV_NAME = 'Zone Price';
const OTHER_PROV = 'Z8';
const OTHER_PROV_NAME = 'Zone Price Khac';

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let suspendedTenantId: string;
let branchId: string;
let otherBranchId: string;
let suspendedBranchId: string;

/**
 * Service mới mỗi test: nó cache 5 phút trong tiến trình, và một kết quả của test trước trả lời
 * cho test sau là cách chắc chắn nhất để spec này xanh vì lý do sai.
 */
let service: MarketPriceService;

interface SeedVehicle {
  price: string;
  vehicleType?: string;
  bodyType?: string;
  seats?: number | null;
  motorbikeCategory?: string;
  branch?: string;
  tenant?: string;
}

async function seedVehicle(v: SeedVehicle): Promise<string> {
  const id = newId();
  const isMotorbike = v.vehicleType === VEHICLE_TYPE.MOTORBIKE;
  await prisma.vehicle.create({
    data: {
      id,
      tenantId: v.tenant ?? tenantId,
      branchId: v.branch ?? branchId,
      code: `V-${id.slice(-6)}`,
      name: `Xe ${id.slice(-4)}`,
      vehicleType: v.vehicleType ?? VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      bodyType: isMotorbike ? null : (v.bodyType ?? BODY_TYPE.SEDAN),
      motorbikeCategory: isMotorbike ? (v.motorbikeCategory ?? MOTORBIKE_CATEGORY.SCOOTER) : null,
      seatCount: isMotorbike ? null : (v.seats ?? 5),
      fuelType: FUEL_TYPE.GASOLINE,
      weekdayPrice: v.price,
      mainImageUrl: 'https://img.example/x.jpg',
    },
  });
  await listings.syncFromVehicle(id);
  return id;
}

const q = (extra: Partial<MarketPriceQueryDto> = {}): MarketPriceQueryDto =>
  ({ vehicleType: VEHICLE_TYPE.CAR, ...extra }) as MarketPriceQueryDto;

beforeEach(() => {
  service = new MarketPriceService(prisma as unknown as PrismaService);
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
  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
  });

  tenantId = newId();
  suspendedTenantId = newId();
  for (const [id, status] of [
    [tenantId, TENANT_STATUS.ACTIVE],
    [suspendedTenantId, TENANT_STATUS.SUSPENDED],
  ] as const) {
    await prisma.tenant.create({
      data: {
        id,
        code: `T-${id.slice(-8)}`,
        slug: `t-${id.toLowerCase().slice(-10)}`,
        name: `Shop ${id.slice(-4)}`,
        status,
        ownerUserId: ownerId,
      },
    });
    await prisma.tenantProfile.create({
      data: {
        tenantId: id,
        displayName: `Shop ${id.slice(-4)}`,
        provinceCode: PROV,
        provinceName: PROV_NAME,
      },
    });
  }

  await seedProvince(prisma as unknown as PrismaService, PROV, PROV_NAME);
  await seedProvince(prisma as unknown as PrismaService, OTHER_PROV, OTHER_PROV_NAME);
  branchId = await seedBranch(prisma as unknown as PrismaService, { tenantId, provinceCode: PROV });
  // Chỉ MỘT chi nhánh mặc định mỗi gian hàng (unique bộ phận ở DB) — chi nhánh thứ hai phải tắt cờ.
  otherBranchId = await seedBranch(prisma as unknown as PrismaService, {
    tenantId,
    provinceCode: OTHER_PROV,
    isDefault: false,
  });
  suspendedBranchId = await seedBranch(prisma as unknown as PrismaService, {
    tenantId: suspendedTenantId,
    provinceCode: PROV,
  });

  /*
   * Sedan tại PROV: năm chiếc 400k–800k, cộng MỘT chiếc 9 triệu.
   *
   * Chiếc 9 triệu là bài kiểm của chính phép thống kê: trung bình của bộ này là ~1,9 triệu — một
   * con số không chiếc nào trong nhóm đang treo. Trung vị phải phớt lờ nó.
   */
  for (const price of ['400000', '500000', '600000', '700000', '800000', '9000000']) {
    await seedVehicle({ price, bodyType: BODY_TYPE.SEDAN });
  }

  // SUV 7 chỗ tại PROV: đủ mẫu, dùng cho phép so theo SỐ CHỖ.
  for (const price of ['1500000', '1600000', '1700000', '1800000', '1900000']) {
    await seedVehicle({ price, bodyType: BODY_TYPE.SUV, seats: 7 });
  }

  /*
   * Nhóm dùng để kiểm THANG NỚI DẦN: 2 chiếc ở PROV (dưới ngưỡng) + 5 chiếc ở tỉnh khác.
   *
   * Cố tình chọn `cargo` — spec khác trong cùng DB test seed sedan/SUV/CUV, nên một phân khúc
   * không ai đụng tới là cách để phép đếm toàn quốc ở đây không phụ thuộc vào việc jest chạy song
   * song những file nào. Số chỗ để 3 để chúng không lọt vào nhóm "5 chỗ" của bài test bên dưới.
   */
  for (const price of ['1500000', '1700000']) {
    await seedVehicle({ price, bodyType: BODY_TYPE.CARGO, seats: 3 });
  }
  for (const price of ['1000000', '1100000', '1200000', '1300000', '1400000']) {
    await seedVehicle({ price, bodyType: BODY_TYPE.CARGO, seats: 3, branch: otherBranchId });
  }

  // Gian hàng BỊ KHOÁ: giá cực cao, không được lọt vào bất kỳ phép tính nào.
  for (const price of ['50000000', '60000000', '70000000', '80000000', '90000000']) {
    await seedVehicle({
      price,
      bodyType: BODY_TYPE.MPV,
      tenant: suspendedTenantId,
      branch: suspendedBranchId,
    });
  }
});

afterAll(async () => {
  if (dbAvailable) {
    const tenants = [tenantId, suspendedTenantId];
    await prisma.vehicle.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.tenantProfile.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId: { in: tenants } } });
    await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.province.deleteMany({ where: { code: { in: [PROV, OTHER_PROV] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Gợi ý giá thuê theo phân khúc', () => {
  maybe('đủ mẫu cùng tỉnh: trung vị của nhóm, KHÔNG phải trung bình', async () => {
    const res = await service.suggest(q({ bodyType: BODY_TYPE.SEDAN, provinceCode: PROV }));

    expect(res.basis).toBe(MARKET_PRICE_BASIS.PROVINCE_SEGMENT);
    expect(res.sampleSize).toBe(6);
    // Trung vị của [400,500,600,700,800,9000]k ở chỉ số floor(0.5 × 5) = 2 → 600k.
    expect(res.median).toBe('600000');
    // Trung bình là ~1.983.333đ — chiếc 9 triệu không được kéo gợi ý lên đó.
    expect(Number(res.median)).toBeLessThan(1_000_000);
    expect(Number(res.low)).toBeLessThanOrEqual(Number(res.median));
    expect(Number(res.median)).toBeLessThanOrEqual(Number(res.high));
  });

  maybe('thiếu mẫu trong tỉnh thì nới ra toàn quốc, và NÓI RA điều đó', async () => {
    const res = await service.suggest(q({ bodyType: BODY_TYPE.CARGO, provinceCode: PROV }));

    // 2 chiếc ở PROV không đủ; cả nước có 7 chiếc cùng phân khúc → bậc thứ hai.
    expect(res.basis).toBe(MARKET_PRICE_BASIS.SEGMENT);
    expect(res.sampleSize).toBeGreaterThanOrEqual(7);
  });

  maybe('không có xe nào cùng loại: trả MỨC KHỞI ĐIỂM, sampleSize = 0', async () => {
    const res = await service.suggest(
      q({ vehicleType: VEHICLE_TYPE.MOTORBIKE, motorbikeCategory: MOTORBIKE_CATEGORY.SCOOTER }),
    );

    expect(res.basis).toBe(MARKET_PRICE_BASIS.BASELINE);
    expect(res.sampleSize).toBe(0);
    expect(Number(res.median)).toBeGreaterThan(0);
  });

  maybe('gian hàng bị khoá KHÔNG góp giá vào mặt bằng', async () => {
    const res = await service.suggest(q({ bodyType: BODY_TYPE.MPV, provinceCode: PROV }));

    // 5 chiếc MPV duy nhất đều thuộc gian hàng `suspended` → phải rơi xuống bậc rộng hơn.
    expect(res.basis).not.toBe(MARKET_PRICE_BASIS.PROVINCE_SEGMENT);
    expect(Number(res.median)).toBeLessThan(10_000_000);
  });

  maybe('chưa khai kiểu dáng thì so theo SỐ CHỖ, không bỏ qua phân khúc', async () => {
    // Cả hai đều bó trong PROV (sedan 5 chỗ 400–800k · SUV 7 chỗ 1,5–1,9tr), nên kết quả không
    // phụ thuộc vào việc jest đang chạy song song spec nào khác trên cùng DB test.
    const five = await service.suggest(q({ seatCount: 5, provinceCode: PROV }));
    const seven = await service.suggest(q({ seatCount: 7, provinceCode: PROV }));

    expect(five.basis).toBe(MARKET_PRICE_BASIS.PROVINCE_SEGMENT);
    expect(seven.basis).toBe(MARKET_PRICE_BASIS.PROVINCE_SEGMENT);
    expect(five.sampleSize).toBeGreaterThanOrEqual(MARKET_PRICE_MIN_SAMPLE);
    expect(seven.sampleSize).toBeGreaterThanOrEqual(MARKET_PRICE_MIN_SAMPLE);
    expect(Number(seven.median)).toBeGreaterThan(Number(five.median));
  });

  maybe('tiền ra ngoài luôn là CHUỖI (ADR 0007)', async () => {
    const res = await service.suggest(q({ bodyType: BODY_TYPE.SEDAN, provinceCode: PROV }));
    for (const value of [res.low, res.median, res.high]) {
      expect(typeof value).toBe('string');
      expect(Number.isInteger(Number(value))).toBe(true);
    }
  });
});
