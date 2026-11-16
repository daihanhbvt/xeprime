import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  INSURANCE_ELIGIBILITY_GAP,
  MIC_VCX_TRIP_DEFAULT_TIERS,
  SERVICE_TYPE,
  TENANT_STATUS,
  VEHICLE_DOCUMENT_TYPE,
  type InsurancePremiumTier,
} from '@xeprime/types';
import { InsuranceEligibilityService } from '../src/modules/insurance/insurance-eligibility.service';
import type { InsuranceOfferService } from '../src/modules/insurance/insurance-offer.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Điều kiện xe + báo giá bảo hiểm vật chất xe theo bậc (ADR 0088) đọc từ DỮ LIỆU XE THẬT. Cổng chào
 * bán là bản giả (`vehicleTripTiers`) để spec không phải đổi dòng `insurance_products` dùng chung.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
let tiers: InsurancePremiumTier[] | null = [...MIC_VCX_TRIP_DEFAULT_TIERS];
const offer = { vehicleTripTiers: async () => tiers } as unknown as InsuranceOfferService;
const eligibility = new InsuranceEligibilityService(asService, offer);

const RUN = newId().slice(-8).toLowerCase();
let dbAvailable = false;
let ownerId: string;
let tenantId: string;

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

const PICKUP = new Date('2027-01-10T02:00:00Z');
const RETURN_57H = new Date(PICKUP.getTime() + 57 * 3600_000);

async function car(
  opts: { insuredValue?: number | null; photos?: string[]; registration?: boolean } = {},
) {
  const id = newId();
  await prisma.vehicle.create({
    data: {
      id,
      tenantId,
      code: `XE${id.slice(-5)}`,
      name: 'Toyota Vios',
      vehicleType: 'car',
      brand: 'Toyota',
      model: 'Vios',
      manufactureYear: 2019,
      seatCount: 5,
      plateNumber: `51H-${id.slice(-5)}`,
      insuredValue:
        opts.insuredValue === null ? null : new Prisma.Decimal(opts.insuredValue ?? 340_000_000),
      createdBy: ownerId,
    },
  });
  const photos = opts.photos ?? ['front', 'rear', 'left', 'right', 'interior'];
  await prisma.vehicleImage.createMany({
    data: photos.map((type, i) => ({
      id: newId(),
      vehicleId: id,
      tenantId,
      imageUrl: `https://cdn.test/${id}/${type}.jpg`,
      imageType: type,
      sortOrder: i,
    })),
  });
  if (opts.registration !== false) {
    await prisma.vehicleDocument.create({
      data: {
        id: newId(),
        tenantId,
        vehicleId: id,
        type: VEHICLE_DOCUMENT_TYPE.REGISTRATION,
        chassisNumber: 'RL4100000VN0',
        holderName: 'Tran Quoc Bao',
      },
    });
  }
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
  tenantId = newId();
  await prisma.user.create({
    data: {
      realm: ACCOUNT_REALM.PARTNER,
      id: ownerId,
      displayName: 'Chủ',
      email: `elig-${RUN}@xeprime.test`,
    },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `EligShop-${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
});

afterEach(() => {
  tiers = [...MIC_VCX_TRIP_DEFAULT_TIERS];
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.vehicleDocument.deleteMany({ where: { tenantId } });
    await prisma.vehicleImage.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

describe('Bảo hiểm vật chất xe theo bậc (ADR 0088)', () => {
  maybe('xe đủ điều kiện, tự lái 57 giờ ⇒ bậc ≤5 ngày, 112.200đ, bắt buộc', async () => {
    const id = await car();
    expect(await eligibility.statusFor(id)).toEqual({ applies: true, eligible: true, gaps: [] });
    expect(
      await eligibility.tierQuoteFor({
        vehicleId: id,
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        pickupAt: PICKUP,
        returnAt: RETURN_57H,
      }),
    ).toEqual({ amount: '112200', insuredValue: '340000000', maxDays: 5, percent: '0.033' });
  });

  maybe(
    'xe thiếu giá trị / ảnh / cà vẹt ⇒ không bán kèm (null) và liệt kê việc còn thiếu',
    async () => {
      const id = await car({ insuredValue: null, photos: ['front', 'rear'], registration: false });
      const status = await eligibility.statusFor(id);
      expect(status.eligible).toBe(false);
      expect(status.gaps).toEqual([
        INSURANCE_ELIGIBILITY_GAP.INSURED_VALUE_MISSING,
        INSURANCE_ELIGIBILITY_GAP.PHOTOS_MISSING,
        INSURANCE_ELIGIBILITY_GAP.REGISTRATION_MISSING,
      ]);
      expect(
        await eligibility.tierQuoteFor({
          vehicleId: id,
          serviceType: SERVICE_TYPE.SELF_DRIVE,
          pickupAt: PICKUP,
          returnAt: RETURN_57H,
        }),
      ).toBeNull();
    },
  );

  maybe('cà vẹt đã lưu trữ không tính', async () => {
    const id = await car();
    await prisma.vehicleDocument.updateMany({
      where: { vehicleId: id },
      data: { archivedAt: new Date() },
    });
    expect((await eligibility.statusFor(id)).gaps).toEqual([
      INSURANCE_ELIGIBILITY_GAP.REGISTRATION_MISSING,
    ]);
  });

  maybe('có tài xế hoặc quá 30 ngày ⇒ không bán kèm', async () => {
    const id = await car();
    const base = { vehicleId: id, pickupAt: PICKUP };
    expect(
      await eligibility.tierQuoteFor({
        ...base,
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        returnAt: RETURN_57H,
      }),
    ).toBeNull();
    expect(
      await eligibility.tierQuoteFor({
        ...base,
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        returnAt: new Date(PICKUP.getTime() + 31 * 86400_000),
      }),
    ).toBeNull();
  });

  maybe(
    'sản phẩm đang tính theo NGÀY ⇒ undefined (đi đường cũ) và khối bảo hiểm của xe ẩn',
    async () => {
      tiers = null;
      const id = await car();
      expect(
        await eligibility.tierQuoteFor({
          vehicleId: id,
          serviceType: SERVICE_TYPE.SELF_DRIVE,
          pickupAt: PICKUP,
          returnAt: RETURN_57H,
        }),
      ).toBeUndefined();
      expect(await eligibility.statusFor(id)).toEqual({
        applies: false,
        eligible: false,
        gaps: [],
      });
    },
  );
});
