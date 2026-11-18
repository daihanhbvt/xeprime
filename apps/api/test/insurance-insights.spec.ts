import { createInsurancePartner, createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  INSURANCE_ELIGIBILITY_GAP,
  INSURANCE_MODE,
  INSURANCE_POLICY_STATUS,
  INSURANCE_PRODUCT_KIND,
  INSURANCE_VEHICLE_ELIGIBILITY_FILTER,
  TENANT_STATUS,
  VEHICLE_DOCUMENT_TYPE,
  VEHICLE_TYPE,
  requiredVehicleImageTypes,
} from '@xeprime/types';
import { InsuranceEligibilityService } from '../src/modules/insurance/insurance-eligibility.service';
import { InsuranceFollowUpService } from '../src/modules/insurance/insurance-follow-up.service';
import { InsuranceInsightsService } from '../src/modules/insurance/insurance-insights.service';
import { InsuranceOfferService } from '../src/modules/insurance/insurance-offer.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { InsuranceProductsService } from '../src/modules/insurance/insurance-products.service';
import { InsurancePremiumQuoteService } from '../src/modules/insurance/insurance-premium-quote.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Số liệu quản trị bảo hiểm (ADR 0097) trên PostgreSQL thật.
 *
 * Tổng quan là toàn sàn ⇒ spec cô lập bằng một THÁNG ở tương lai xa (năm 2100-2199). KHÔNG dùng quá
 * khứ: spec bảng kê (năm 1900-1999) gom mọi hợp đồng cấp TRƯỚC hết tháng của nó, hợp đồng năm 18xx của
 * spec này sẽ lọt vào khi hai spec chạy song song. Danh sách xe cô lập bằng biển số riêng của lượt chạy.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const partner = createInsurancePartner('mic_mock', { appEnv: 'test' });
const offer = new InsuranceOfferService(partner, asService);
const eligibility = new InsuranceEligibilityService(asService, offer);
const service = new InsuranceInsightsService(
  asService,
  new InsuranceFollowUpService(asService),
  new InsurancePremiumQuoteService(
    partner,
    eligibility,
    new InsuranceProductsService(asService, new AuditService(asService), offer),
  ),
  partner,
);

const RUN = newId().slice(-8).toLowerCase();
const YEAR = 2100 + (parseInt(RUN.slice(-4), 36) % 100);
const MONTH = `${YEAR}-05`;
const IN_MONTH = new Date(Date.UTC(YEAR, 4, 15, 3, 0));
const NEXT_MONTH = new Date(Date.UTC(YEAR, 5, 2, 3, 0));
const PLATE = `INS${RUN.slice(0, 5).toUpperCase()}`;

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let vehicleId: string;
let seq = 0;

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

async function policy(input: {
  status: string;
  premium: number;
  partnerPremium?: number;
  serviceFee?: number;
  issuedAt?: Date | null;
  createdAt?: Date;
  refundedAt?: Date;
  source?: 'partner' | 'formula';
  reason?: string;
  isTest?: boolean;
}): Promise<void> {
  seq += 1;
  const bookingId = newId();
  await prisma.booking.create({
    data: {
      id: bookingId,
      tenantId,
      vehicleId,
      code: `DHINSI${seq}${RUN.slice(0, 3).toUpperCase()}`,
      customerName: 'Khách tổng quan',
      status: 'completed',
      pickupAt: new Date(Date.UTC(YEAR, 4, 10)),
      returnAt: new Date(Date.UTC(YEAR, 4, 12)),
      baseAmount: new Prisma.Decimal(1_000_000),
      totalAmount: new Prisma.Decimal(1_000_000),
    },
  });
  const issued = input.issuedAt != null;
  await prisma.bookingInsurancePolicy.create({
    data: {
      id: newId(),
      bookingId,
      tenantId,
      productKind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
      status: input.status,
      premiumAmount: new Prisma.Decimal(input.premium),
      serviceFeeAmount: new Prisma.Decimal(input.serviceFee ?? 0),
      partnerName: 'MIC',
      idempotencyKey: `${bookingId}:vehicle_trip`,
      issuedAt: input.issuedAt ?? null,
      createdAt: input.createdAt ?? IN_MONTH,
      isTest: input.isTest ?? false,
      ...(issued
        ? {
            certificateNumber: `${input.isTest ? 'TEST-' : ''}CERT-${seq}-${RUN}`,
            coverageFrom: new Date(Date.UTC(YEAR, 4, 10)),
            coverageTo: new Date(Date.UTC(YEAR, 4, 12)),
          }
        : {}),
      ...(input.partnerPremium != null
        ? { partnerPremiumAmount: new Prisma.Decimal(input.partnerPremium) }
        : {}),
      ...(input.refundedAt ? { refundedAt: input.refundedAt, cancelledAt: input.refundedAt } : {}),
      ...(input.source
        ? {
            premiumSource: input.source,
            formulaPremiumAmount: new Prisma.Decimal(input.premium),
            premiumQuoteFallbackReason: input.reason ?? null,
          }
        : {}),
    },
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
  vehicleId = newId();
  await prisma.user.create({
    data: {
      realm: ACCOUNT_REALM.PARTNER,
      id: ownerId,
      displayName: 'Chủ tổng quan',
      email: `insi-${RUN}@xeprime.test`,
    },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `InsInsights-${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  // Xe dùng cho hợp đồng — thiếu mọi dữ liệu bảo hiểm.
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: `XE${vehicleId.slice(-5)}`,
      name: 'Xe thiếu dữ liệu',
      vehicleType: VEHICLE_TYPE.CAR,
      plateNumber: `${PLATE}-1`,
      createdBy: ownerId,
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.bookingInsurancePolicy.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.rentalPolicy.deleteMany({ where: { tenantId } });
    await prisma.vehicleImage.deleteMany({ where: { tenantId } });
    await prisma.vehicleDocument.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

describe('Tổng quan bảo hiểm theo tháng (ADR 0097)', () => {
  maybe(
    'tiền hợp đồng cấp trong tháng, nguồn phí, hoàn tiền - đúng tháng giờ Việt Nam',
    async () => {
      // Cấp trong tháng: hãng báo 110.000 (khách trả 112.200) và một hợp đồng hãng không trả phí.
      await policy({
        status: INSURANCE_POLICY_STATUS.ISSUED,
        premium: 112200,
        partnerPremium: 110000,
        serviceFee: 11220,
        issuedAt: IN_MONTH,
        source: 'partner',
      });
      await policy({
        status: INSURANCE_POLICY_STATUS.ISSUED,
        premium: 44200,
        serviceFee: 4420,
        issuedAt: IN_MONTH,
        source: 'formula',
        reason: 'timeout',
        isTest: true,
      });
      // Cấp tháng sau — không tính vào tháng này (nhưng TẠO trong tháng ⇒ có trong nguồn phí).
      await policy({
        status: INSURANCE_POLICY_STATUS.ISSUED,
        premium: 680000,
        partnerPremium: 680000,
        issuedAt: NEXT_MONTH,
        source: 'formula',
        reason: 'timeout',
      });
      // Không cấp được, đã tự hoàn trong tháng.
      await policy({
        status: INSURANCE_POLICY_STATUS.CANCELLED,
        premium: 50000,
        serviceFee: 5000,
        refundedAt: IN_MONTH,
      });

      const r = await service.overview(MONTH);
      expect(r.month).toBe(MONTH);
      expect(r.issued).toMatchObject({
        count: 2,
        testCount: 1,
        collectedPremium: '156400',
        payablePremium: '154200',
        partnerPremiumMissingCount: 1,
        premiumDifference: '2200',
        serviceFee: '15640',
      });
      // Hệ thức giữa các ô — % hoa hồng là cấu hình dùng chung của database test.
      const commission = BigInt(r.issued.agencyCommission);
      expect(BigInt(r.issued.netPayable)).toBe(BigInt(154200) - commission);
      expect(BigInt(r.issued.platformEarnings)).toBe(BigInt(15640) + commission + BigInt(2200));

      expect(r.sources).toMatchObject({ partner: 1, formula: 2, unrecorded: 1 });
      expect(r.sources.fallbacks).toEqual([{ reason: 'timeout', count: 2 }]);
      expect(r.refunds).toEqual({ count: 1, amount: '55000' });
    },
  );

  maybe('tháng không có gì ⇒ số 0, không lỗi', async () => {
    const r = await service.overview(`${YEAR}-01`);
    expect(r.issued).toMatchObject({ count: 0, collectedPremium: '0', platformEarnings: '0' });
    expect(r.sources).toMatchObject({ partner: 0, formula: 0, unrecorded: 0, fallbacks: [] });
  });
});

describe('Danh sách ô tô và điều kiện bảo hiểm (ADR 0097)', () => {
  maybe('lọc đủ / chưa đủ điều kiện ở DB, kèm việc còn thiếu và chế độ chủ xe', async () => {
    const readyId = newId();
    await prisma.vehicle.create({
      data: {
        id: readyId,
        tenantId,
        code: `XE${readyId.slice(-5)}`,
        name: 'Xe đủ điều kiện',
        vehicleType: VEHICLE_TYPE.CAR,
        plateNumber: `${PLATE}-2`,
        brand: 'Toyota',
        model: 'Vios',
        manufactureYear: 2019,
        seatCount: 5,
        insuredValue: new Prisma.Decimal(340_000_000),
        createdBy: ownerId,
      },
    });
    await prisma.vehicleImage.createMany({
      data: requiredVehicleImageTypes(VEHICLE_TYPE.CAR).map((imageType, i) => ({
        id: newId(),
        vehicleId: readyId,
        tenantId,
        imageUrl: `https://img.test/${imageType}.jpg`,
        imageType,
        sortOrder: i,
      })),
    });
    await prisma.vehicleDocument.create({
      data: {
        id: newId(),
        tenantId,
        vehicleId: readyId,
        type: VEHICLE_DOCUMENT_TYPE.REGISTRATION,
        chassisNumber: 'RL4100000VN0',
        holderName: 'Tran Quoc Bao',
      },
    });
    await prisma.rentalPolicy.create({
      data: {
        id: newId(),
        tenantId,
        vehicleId: readyId,
        collateralMode: 'none',
        insuranceMode: INSURANCE_MODE.REQUIRED,
      },
    });

    const all = await service.vehicles({ q: PLATE });
    expect(all.meta.total).toBe(2);

    const eligible = await service.vehicles({
      q: PLATE,
      eligibility: INSURANCE_VEHICLE_ELIGIBILITY_FILTER.ELIGIBLE,
    });
    expect(eligible.data.map((v) => v.vehicleId)).toEqual([readyId]);
    expect(eligible.data[0]).toMatchObject({
      eligible: true,
      gaps: [],
      insuredValue: '340000000',
      insuranceMode: INSURANCE_MODE.REQUIRED,
    });

    const missing = await service.vehicles({
      q: PLATE,
      eligibility: INSURANCE_VEHICLE_ELIGIBILITY_FILTER.MISSING,
    });
    expect(missing.data.map((v) => v.vehicleId)).toEqual([vehicleId]);
    expect(missing.data[0]!.gaps).toEqual(
      expect.arrayContaining([
        INSURANCE_ELIGIBILITY_GAP.INSURED_VALUE_MISSING,
        INSURANCE_ELIGIBILITY_GAP.PHOTOS_MISSING,
        INSURANCE_ELIGIBILITY_GAP.REGISTRATION_MISSING,
      ]),
    );
    expect(missing.data[0]!.insuranceMode).toBe(INSURANCE_MODE.OPTIONAL);
    expect(missing.data[0]!.tiers).toEqual([]);
  });
});
