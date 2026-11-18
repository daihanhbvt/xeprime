import {
  createPrismaClient,
  MicMockInsurancePartner,
  newId,
  Prisma,
  type InsurancePartner,
  type PremiumQuoteResult,
} from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  INSURANCE_MODE,
  MIC_VCX_TRIP_DEFAULT_TIERS,
  SERVICE_TYPE,
  TENANT_STATUS,
  VEHICLE_DOCUMENT_TYPE,
  VEHICLE_TYPE,
  type InsurancePremiumTier,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { FeePoliciesService } from '../src/modules/fee-policies/fee-policies.service';
import { InsuranceEligibilityService } from '../src/modules/insurance/insurance-eligibility.service';
import type { InsuranceOfferService } from '../src/modules/insurance/insurance-offer.service';
import { InsurancePremiumQuoteService } from '../src/modules/insurance/insurance-premium-quote.service';
import { PricingService } from '../src/modules/pricing/pricing.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeDepositPolicyService } from './helpers/service-factory';

/**
 * ADR 0091 điều 1 — chủ xe chọn bảo hiểm vật chất xe Bắt buộc hay Tuỳ chọn, trên PostgreSQL THẬT:
 * lựa chọn đóng băng lúc gửi, xe Bắt buộc thiếu dữ liệu không nhận đặt tự lái, cờ chặn trên snapshot
 * chợ đi theo chính sách gian hàng và bản ghi đè theo xe. Cổng chào bán là bản giả (như
 * `insurance-eligibility.spec.ts`) để spec không đụng dòng `insurance_products` dùng chung.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
let tiers: InsurancePremiumTier[] | null = [...MIC_VCX_TRIP_DEFAULT_TIERS];
const offer = {
  vehicleTripTiers: async () => tiers,
  offeredByKind: async () => ({ vehicleProtection: tiers !== null, tripInsurance: false }),
} as unknown as InsuranceOfferService;
const listings = new ListingsService(asService);
const pricing = new PricingService(
  asService,
  new AuditService(asService),
  listings,
  makeDepositPolicyService(asService),
  new FeePoliciesService(asService, new AuditService(asService)),
  offer,
  new InsuranceEligibilityService(asService, offer),
  new InsurancePremiumQuoteService(
    new MicMockInsurancePartner(),
    new InsuranceEligibilityService(asService, offer),
  ),
);

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
const RETURN = new Date(PICKUP.getTime() + 57 * 3600_000);

/** Ô tô đủ điều kiện bảo hiểm, trừ khi bỏ giá trị xe. Có sẵn snapshot chợ để kiểm cờ chặn. */
async function car(opts: { insured?: boolean } = {}): Promise<string> {
  const id = newId();
  await prisma.vehicle.create({
    data: {
      id,
      tenantId,
      code: `XE${id.slice(-5)}`,
      name: `Vios ${id.slice(-4)}`,
      vehicleType: VEHICLE_TYPE.CAR,
      brand: 'Toyota',
      model: 'Vios',
      manufactureYear: 2019,
      seatCount: 5,
      plateNumber: `51H-${id.slice(-5)}`,
      insuredValue: opts.insured === false ? null : new Prisma.Decimal(340_000_000),
      createdBy: ownerId,
    },
  });
  await prisma.vehicleImage.createMany({
    data: ['front', 'rear', 'left', 'right', 'interior'].map((type, i) => ({
      id: newId(),
      vehicleId: id,
      tenantId,
      imageUrl: `https://cdn.test/${id}/${type}.jpg`,
      imageType: type,
      sortOrder: i,
    })),
  });
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
  await prisma.publicListing.create({
    data: {
      id: newId(),
      tenantId,
      vehicleId: id,
      shopSlug: `mode-${RUN}`,
      title: 'Vios',
      vehicleType: VEHICLE_TYPE.CAR,
    },
  });
  return id;
}

async function shopMode(mode: string) {
  await prisma.rentalPolicy.deleteMany({ where: { tenantId, vehicleId: null } });
  await prisma.rentalPolicy.create({
    data: {
      id: newId(),
      tenantId,
      vehicleType: VEHICLE_TYPE.CAR,
      collateralMode: 'none',
      insuranceMode: mode,
    },
  });
}

async function blockedOf(vehicleId: string): Promise<boolean | undefined> {
  const row = await prisma.publicListing.findUnique({
    where: { vehicleId },
    select: { selfDriveInsuranceBlocked: true },
  });
  return row?.selfDriveInsuranceBlocked;
}

function choice(vehicleId: string, overrides: { serviceType?: string; selected?: boolean } = {}) {
  return pricing.vehicleProtectionChoice({
    tenantId,
    vehicleId,
    serviceType: overrides.serviceType ?? SERVICE_TYPE.SELF_DRIVE,
    pickupAt: PICKUP,
    returnAt: RETURN,
    customerSelected: overrides.selected ?? false,
  });
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
      email: `mode-${RUN}@xeprime.test`,
    },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `mode-${RUN}`,
      name: `ModeShop-${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
});

afterEach(async () => {
  tiers = [...MIC_VCX_TRIP_DEFAULT_TIERS];
  if (dbAvailable) await prisma.rentalPolicy.deleteMany({ where: { tenantId } });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.publicListing.deleteMany({ where: { tenantId } });
    await prisma.vehicleDocument.deleteMany({ where: { tenantId } });
    await prisma.vehicleImage.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

describe('Lựa chọn bảo hiểm đóng băng lúc gửi (ADR 0091 điều 1)', () => {
  maybe('chưa có chính sách ⇒ Tuỳ chọn: đúng lựa chọn của khách', async () => {
    const id = await car();
    expect(await choice(id)).toEqual({ required: false, selected: false, blocked: false });
    expect(await choice(id, { selected: true })).toEqual({
      required: false,
      selected: true,
      blocked: false,
    });
  });

  maybe('gian hàng đặt Bắt buộc ⇒ server tự đặt "khách mua" bất kể payload', async () => {
    await shopMode(INSURANCE_MODE.REQUIRED);
    const id = await car();
    expect(await choice(id)).toEqual({ required: true, selected: true, blocked: false });
  });

  maybe('bản ghi đè của xe thắng chính sách gian hàng', async () => {
    await shopMode(INSURANCE_MODE.REQUIRED);
    const id = await car();
    await prisma.rentalPolicy.create({
      data: {
        id: newId(),
        tenantId,
        vehicleId: id,
        collateralMode: 'none',
        insuranceMode: INSURANCE_MODE.OPTIONAL,
      },
    });
    expect(await choice(id)).toEqual({ required: false, selected: false, blocked: false });
  });

  maybe('Bắt buộc + xe thiếu giá trị xe ⇒ chặn tự lái, có tài xế vẫn đi', async () => {
    await shopMode(INSURANCE_MODE.REQUIRED);
    const id = await car({ insured: false });
    expect(await choice(id, { selected: true })).toEqual({
      required: false,
      selected: false,
      blocked: true,
    });
    expect(await choice(id, { serviceType: SERVICE_TYPE.WITH_DRIVER })).toEqual({
      required: false,
      selected: false,
      blocked: false,
    });
  });

  maybe('nền tảng không bán theo bậc ⇒ không chặn, đi đường cũ', async () => {
    await shopMode(INSURANCE_MODE.REQUIRED);
    tiers = null;
    const id = await car({ insured: false });
    expect(await choice(id, { selected: true })).toEqual({
      required: false,
      selected: true,
      blocked: false,
    });
  });
});

describe('Cờ chặn tự lái trên snapshot chợ (ADR 0091 điều 1)', () => {
  maybe('đổi chính sách gian hàng ⇒ chỉ xe KẾ THỪA mà thiếu dữ liệu bị chặn', async () => {
    const ready = await car();
    const missing = await car({ insured: false });
    const overridden = await car({ insured: false });
    await prisma.rentalPolicy.create({
      data: {
        id: newId(),
        tenantId,
        vehicleId: overridden,
        collateralMode: 'none',
        insuranceMode: INSURANCE_MODE.OPTIONAL,
      },
    });

    await shopMode(INSURANCE_MODE.REQUIRED);
    await listings.syncInsuranceBlockForTenant(tenantId);
    expect(await blockedOf(ready)).toBe(false);
    expect(await blockedOf(missing)).toBe(true);
    expect(await blockedOf(overridden)).toBe(false);

    await shopMode(INSURANCE_MODE.OPTIONAL);
    await listings.syncInsuranceBlockForTenant(tenantId);
    expect(await blockedOf(missing)).toBe(false);
  });

  maybe('bổ sung dữ liệu xe ⇒ đồng bộ theo xe mở lại tự lái', async () => {
    await shopMode(INSURANCE_MODE.REQUIRED);
    const id = await car({ insured: false });
    await listings.syncInsuranceBlockForVehicle(id);
    expect(await blockedOf(id)).toBe(true);

    await prisma.vehicle.update({
      where: { id },
      data: { insuredValue: new Prisma.Decimal(340_000_000) },
    });
    await listings.syncInsuranceBlockForVehicle(id);
    expect(await blockedOf(id)).toBe(false);
  });

  maybe('cảnh báo đổi chế độ liệt kê xe kế thừa thiếu dữ liệu', async () => {
    const missing = await car({ insured: false });
    const impact = await pricing.shopInsuranceImpact(tenantId, VEHICLE_TYPE.CAR);
    expect(impact.applies).toBe(true);
    expect(impact.vehicles.map((v) => v.id)).toContain(missing);
    expect(impact.vehicles.find((v) => v.id === missing)?.gaps).toEqual(['insured_value_missing']);
  });
});

describe('Phí bảo hiểm của lượt duyệt hỏi MIC, công thức là dự phòng (ADR 0097)', () => {
  /** Máy giá với một đối tác giả trả lời theo `quote` — mọi thứ khác như máy giá của spec. */
  function pricingWith(quote: () => Promise<PremiumQuoteResult>, calls: { n: number }) {
    const partner: InsurancePartner = {
      partnerName: 'MIC thử',
      configured: true,
      issue: () => Promise.reject(new Error('không dùng')),
      quotePremium: () => {
        calls.n += 1;
        return quote();
      },
    };
    const eligibility = new InsuranceEligibilityService(asService, offer);
    return new PricingService(
      asService,
      new AuditService(asService),
      listings,
      makeDepositPolicyService(asService),
      new FeePoliciesService(asService, new AuditService(asService)),
      offer,
      eligibility,
      new InsurancePremiumQuoteService(partner, eligibility),
    );
  }
  const trip = (vehicleId: string) =>
    ({
      vehicleType: VEHICLE_TYPE.CAR,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      vehicleId,
      schedule: { pickupAt: PICKUP, returnAt: RETURN },
    }) as unknown as Parameters<PricingService['approvalVehicleProtectionTier']>[0];

  maybe('MIC báo phí hợp lệ ⇒ chốt số MIC, giữ phí công thức để so', async () => {
    const id = await car();
    const calls = { n: 0 };
    const p = pricingWith(async () => ({ ok: true, amount: '118000' }), calls);
    const { value } = await p.approvalVehicleProtectionTier(trip(id), {
      selected: false,
      required: true,
    });
    expect(calls.n).toBe(1);
    // 57 giờ ⇒ bậc tới 5 ngày: 340.000.000 × 0,033% = 112.200 theo bảng.
    expect(value).toMatchObject({
      amount: '118000',
      formulaAmount: '112200',
      source: 'partner',
      maxDays: 5,
    });
  });

  maybe('MIC lỗi ⇒ công thức bậc kèm lý do, lượt duyệt không hỏng', async () => {
    const id = await car();
    const p = pricingWith(() => Promise.reject(new Error('down')), { n: 0 });
    const { value } = await p.approvalVehicleProtectionTier(trip(id), {
      selected: true,
      required: false,
    });
    expect(value).toMatchObject({
      amount: '112200',
      source: 'formula',
      fallbackReason: 'unavailable',
    });
  });

  maybe('chuyến không mua IV (Tuỳ chọn, khách không tích) ⇒ không gọi MIC', async () => {
    const id = await car();
    const calls = { n: 0 };
    const p = pricingWith(async () => ({ ok: true, amount: '118000' }), calls);
    const { value } = await p.approvalVehicleProtectionTier(trip(id), {
      selected: false,
      required: false,
    });
    expect(calls.n).toBe(0);
    expect(value).toMatchObject({ amount: '112200' });
    expect(value).not.toHaveProperty('source');
  });
});
