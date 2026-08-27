import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  COLLATERAL_ASSET_TYPE,
  COLLATERAL_MODE,
  LISTING_STATUS,
  MEMBERSHIP_STATUS,
  POLICY_SOURCE,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import type { SaveRentalPolicyDto } from '../src/modules/pricing/dto/pricing.dto';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeVehiclesService, vehicleCreator } from './helpers/service-factory';

/**
 * Chuẩn hoá chính sách BẢO ĐẢM (gap C-04, 20/08) trên PostgreSQL THẬT.
 *
 * Ba thứ spec này giữ, đều là chỗ dễ hồi quy nhất của đợt:
 *  1. CHECK ở DB từ chối mọi tổ hợp bảo đảm mâu thuẫn — chốt chặn thật, không phải kiểm ở app;
 *  2. GIÁ theo xe tách khỏi ghi đè chính sách (đặt giá riêng KHÔNG tạo bản ghi đè);
 *  3. `noCollateral` trên sàn suy từ chính sách hiệu lực — xe kế thừa đổi theo gian hàng, xe
 *     đang ghi đè thì KHÔNG.
 *
 * Không có DB thì tự skip.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const listings = new ListingsService(asService);
const pricing = new PricingService(asService, audit, listings);
const vehicles = makeVehiclesService(asService);
const createVehicle = vehicleCreator(vehicles, asService);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
/** Xe KẾ THỪA chính sách gian hàng. */
let vInherit: string;
/** Xe có bản ghi đè riêng. */
let vOverride: string;

function policyDto(over: Partial<SaveRentalPolicyDto> = {}): SaveRentalPolicyDto {
  return {
    collateralMode: COLLATERAL_MODE.CASH,
    collateralAssetTypes: [],
    depositAmount: '5000000',
    deliveryEnabled: false,
    deliveryTiers: [],
    overtimeFeePerHour: null,
    overtimeGraceMinutes: null,
    overtimeRoundingMinutes: null,
    discountEnabled: false,
    discountTiers: [],
    ...over,
  };
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
  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
  });
  tenantId = newId();
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: 'Shop Collateral',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
    },
  });

  vInherit = (
    await createVehicle(tenantId, ownerId, {
      code: 'COL-1',
      name: 'Xe ke thua',
      vehicleType: VEHICLE_TYPE.CAR,
      weekdayPrice: '800000',
    })
  ).id;
  vOverride = (
    await createVehicle(tenantId, ownerId, {
      code: 'COL-2',
      name: 'Xe ghi de',
      vehicleType: VEHICLE_TYPE.CAR,
      weekdayPrice: '900000',
    })
  ).id;
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.rentalPolicy.deleteMany({ where: { tenantId } });
    await prisma.publicListing.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Chính sách bảo đảm — CHECK ở DB là chốt chặn thật', () => {
  /*
   * Ghi THẲNG qua Prisma, cố ý đi vòng qua `validatePolicy`: điều cần chứng minh là DB tự từ
   * chối, chứ không phải service nhớ kiểm. Hai request đua nhau chỉ có ràng buộc này chặn được.
   * Dùng hàng mặc định loại `motorbike` để không đụng hàng `car` của các test bên dưới.
   */
  const writeRaw = (data: Record<string, unknown>) =>
    prisma.rentalPolicy.create({
      data: { id: newId(), tenantId, vehicleId: null, vehicleType: 'motorbike', ...data } as never,
    });

  maybe('cash mà cọc = 0 thì bị từ chối', async () => {
    await expect(
      writeRaw({ collateralMode: 'cash', depositAmount: '0', collateralAssetTypes: [] }),
    ).rejects.toThrow();
  });

  maybe('asset mà không chọn loại tài sản thì bị từ chối', async () => {
    await expect(
      writeRaw({ collateralMode: 'asset', depositAmount: '0', collateralAssetTypes: [] }),
    ).rejects.toThrow();
  });

  maybe('asset mà vẫn giữ tiền cọc thì bị từ chối (hai hình thức loại trừ nhau)', async () => {
    await expect(
      writeRaw({
        collateralMode: 'asset',
        depositAmount: '500000',
        collateralAssetTypes: [COLLATERAL_ASSET_TYPE.MOTORBIKE],
      }),
    ).rejects.toThrow();
  });

  maybe('none mà còn cọc thì bị từ chối', async () => {
    await expect(
      writeRaw({ collateralMode: 'none', depositAmount: '500000', collateralAssetTypes: [] }),
    ).rejects.toThrow();
  });

  maybe('loại tài sản ngoài danh mục thì bị từ chối', async () => {
    await expect(
      writeRaw({ collateralMode: 'asset', depositAmount: '0', collateralAssetTypes: ['ho_khau'] }),
    ).rejects.toThrow();
  });

  maybe('service báo lỗi CÓ CHỮ trước khi chạm DB', async () => {
    await expect(
      pricing.saveShopPolicy(
        tenantId,
        ownerId,
        policyDto({ collateralMode: COLLATERAL_MODE.ASSET, depositAmount: '0' }),
        VEHICLE_TYPE.CAR,
      ),
    ).rejects.toThrow(/ít nhất một loại tài sản/);
  });
});

describe('Giá theo xe TÁCH khỏi ghi đè chính sách (20/08)', () => {
  maybe('đặt giá riêng với source=shop: giá ghi được, KHÔNG sinh bản ghi đè', async () => {
    await pricing.saveShopPolicy(tenantId, ownerId, policyDto(), VEHICLE_TYPE.CAR);

    await vehicles.savePricing(tenantId, vInherit, ownerId, {
      source: POLICY_SOURCE.SHOP,
      weekdayPrice: '850000',
    });

    const vehicle = await prisma.vehicle.findUniqueOrThrow({
      where: { id: vInherit },
      select: { weekdayPrice: true },
    });
    expect(String(vehicle.weekdayPrice)).toBe('850000');

    // Không có hàng ghi đè nào được tạo — đây là chỗ trước 20/08 luôn sinh ra một bản sao.
    const override = await prisma.rentalPolicy.findUnique({ where: { vehicleId: vInherit } });
    expect(override).toBeNull();

    // Và xe vẫn ĐANG KẾ THỪA, nên sửa chính sách gian hàng về sau vẫn áp cho nó.
    const effective = await pricing.effectivePolicy(tenantId, vInherit);
    expect(effective?.source).toBe(POLICY_SOURCE.SHOP);
    expect(effective?.values.depositAmount).toBe('5000000');
  });

  maybe('ghi đè riêng: chính sách của xe thắng, giá vẫn của xe', async () => {
    await vehicles.savePricing(tenantId, vOverride, ownerId, {
      source: POLICY_SOURCE.VEHICLE,
      weekdayPrice: '950000',
      policy: policyDto({
        collateralMode: COLLATERAL_MODE.ASSET,
        depositAmount: '0',
        collateralAssetTypes: [COLLATERAL_ASSET_TYPE.VEHICLE_REGISTRATION],
      }),
    });

    const effective = await pricing.effectivePolicy(tenantId, vOverride);
    expect(effective?.source).toBe(POLICY_SOURCE.VEHICLE);
    expect(effective?.values.collateralMode).toBe(COLLATERAL_MODE.ASSET);
    expect(effective?.values.collateralAssetTypes).toEqual([
      COLLATERAL_ASSET_TYPE.VEHICLE_REGISTRATION,
    ]);
  });
});

describe('Nhãn "Miễn thế chấp" trên sàn suy từ chính sách hiệu lực', () => {
  maybe(
    'đổi chính sách gian hàng sang none: xe KẾ THỪA đổi theo, xe GHI ĐÈ thì không',
    async () => {
      // Hai xe chưa duyệt public nên chưa có snapshot — dựng tay để quan sát đúng một cột.
      await prisma.publicListing.createMany({
        data: [vInherit, vOverride].map((vehicleId) => ({
          id: newId(),
          tenantId,
          vehicleId,
          shopSlug: `t-${tenantId.toLowerCase().slice(-10)}`,
          title: 'x',
          status: LISTING_STATUS.HIDDEN,
          vehicleType: VEHICLE_TYPE.CAR,
          noCollateral: false,
        })),
        skipDuplicates: true,
      });

      await pricing.saveShopPolicy(
        tenantId,
        ownerId,
        policyDto({ collateralMode: COLLATERAL_MODE.NONE, depositAmount: '0' }),
        VEHICLE_TYPE.CAR,
      );

      const rows = await prisma.publicListing.findMany({
        where: { tenantId },
        select: { vehicleId: true, noCollateral: true },
      });
      const byVehicle = new Map(rows.map((r) => [r.vehicleId, r.noCollateral]));
      expect(byVehicle.get(vInherit)).toBe(true);
      // Xe có chính sách riêng KHÔNG chịu ảnh hưởng — gian hàng không nói gì về nó.
      expect(byVehicle.get(vOverride)).toBe(false);
    },
  );
});
