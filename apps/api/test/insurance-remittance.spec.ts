import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  INSURANCE_POLICY_STATUS,
  INSURANCE_PRODUCT_KIND,
  INSURANCE_REMITTANCE_STATUS,
  TENANT_STATUS,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { InsuranceRemittanceService } from '../src/modules/insurance/insurance-remittance.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * Bảng kê trả phí bảo hiểm cho hãng — ADR 0088 điều 6, trên PostgreSQL thật.
 *
 * Bảng kê là toàn sàn (không theo gian hàng), nên spec cô lập bằng KỲ KÊ ở quá khứ xa: hợp đồng của
 * spec cấp vào năm `YEAR`, bảng kê lập cho tháng đó chỉ gom hợp đồng cấp trước hết tháng — hợp đồng
 * của spec khác (cấp gần đây) không bao giờ lọt vào.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const service = new InsuranceRemittanceService(asService, new AuditService(asService));

const RUN = newId().slice(-8).toLowerCase();
// Một năm riêng cho mỗi lượt chạy: 1900-1999 — không đụng dữ liệu thật hay lượt chạy khác.
const YEAR = 1900 + (parseInt(RUN.slice(-4), 36) % 100);
const MONTH = `${YEAR}-03`;
const ISSUED_IN_MONTH = new Date(Date.UTC(YEAR, 2, 15, 3, 0));
const ISSUED_NEXT_MONTH = new Date(Date.UTC(YEAR, 3, 2, 3, 0));

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
  issuedAt: Date | null;
  partnerPremium?: number;
  code?: string;
}): Promise<string> {
  seq += 1;
  const bookingId = newId();
  await prisma.booking.create({
    data: {
      id: bookingId,
      tenantId,
      vehicleId,
      code: input.code ?? `DHREM${seq}${RUN.slice(0, 3).toUpperCase()}`,
      customerName: 'Khách bảng kê',
      status: 'completed',
      pickupAt: new Date(Date.UTC(YEAR, 2, 10)),
      returnAt: new Date(Date.UTC(YEAR, 2, 12)),
      baseAmount: new Prisma.Decimal(1_000_000),
      totalAmount: new Prisma.Decimal(1_000_000),
    },
  });
  const id = newId();
  const issued =
    input.status === INSURANCE_POLICY_STATUS.ISSUED ||
    input.status === INSURANCE_POLICY_STATUS.CLAIM;
  await prisma.bookingInsurancePolicy.create({
    data: {
      id,
      bookingId,
      tenantId,
      productKind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
      status: input.status,
      premiumAmount: new Prisma.Decimal(input.premium),
      partnerName: 'MIC',
      idempotencyKey: `${bookingId}:vehicle_trip`,
      issuedAt: input.issuedAt,
      ...(issued
        ? {
            certificateNumber: `CERT-${seq}-${RUN}`,
            partnerContractNumber: `2026${seq}`,
            coverageFrom: new Date(Date.UTC(YEAR, 2, 10)),
            coverageTo: new Date(Date.UTC(YEAR, 2, 12)),
          }
        : {}),
      ...(input.partnerPremium != null
        ? { partnerPremiumAmount: new Prisma.Decimal(input.partnerPremium) }
        : {}),
    },
  });
  return id;
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ response: { code } });
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
      displayName: 'Chủ bảng kê',
      email: `rem-${RUN}@xeprime.test`,
    },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `RemShop-${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: `XE${vehicleId.slice(-5)}`,
      name: 'Xe bảng kê',
      vehicleType: 'car',
      plateNumber: `51K-${RUN.slice(0, 5)}`,
      createdBy: ownerId,
    },
  });
});

afterEach(async () => {
  if (!dbAvailable) return;
  const remittanceIds = (
    await prisma.bookingInsurancePolicy.findMany({
      where: { tenantId, remittanceId: { not: null } },
      select: { remittanceId: true },
    })
  ).map((p) => p.remittanceId!);
  await prisma.bookingInsurancePolicy.deleteMany({ where: { tenantId } });
  await prisma.insurancePremiumRemittance.deleteMany({
    where: { OR: [{ id: { in: remittanceIds } }, { periodMonth: new Date(Date.UTC(YEAR, 2, 1)) }] },
  });
  await prisma.booking.deleteMany({ where: { tenantId } });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

describe('Lập bảng kê tháng (ADR 0088 điều 6)', () => {
  maybe('gom ĐÚNG hợp đồng đã cấp, chưa kê, cấp trước hết tháng; trừ hoa hồng đại lý', async () => {
    const a = await policy({
      status: INSURANCE_POLICY_STATUS.ISSUED,
      premium: 112200,
      issuedAt: ISSUED_IN_MONTH,
      partnerPremium: 112200,
    });
    const b = await policy({
      status: INSURANCE_POLICY_STATUS.CLAIM,
      premium: 44200,
      issuedAt: ISSUED_IN_MONTH,
      partnerPremium: 46000,
    });
    const later = await policy({
      status: INSURANCE_POLICY_STATUS.ISSUED,
      premium: 680000,
      issuedAt: ISSUED_NEXT_MONTH,
    });
    const reserved = await policy({
      status: INSURANCE_POLICY_STATUS.RESERVED,
      premium: 50000,
      issuedAt: null,
    });

    const r = await service.create({ periodMonth: MONTH, commissionPercent: '10' }, ownerId);
    // Phải trả theo số HÃNG tính lúc cấp (ADR 0097): 112.200 + 46.000, không theo khách trả.
    expect(r).toMatchObject({
      periodMonth: MONTH,
      status: INSURANCE_REMITTANCE_STATUS.DRAFT,
      policyCount: 2,
      grossPremium: '158200',
      commissionPercent: '10.00',
      commissionAmount: '15820',
      payableAmount: '142380',
      partnerPremiumTotal: '158200',
      collectedPremiumTotal: '156400',
      partnerPremiumMissingCount: 0,
    });
    const rows = await prisma.bookingInsurancePolicy.findMany({
      where: { id: { in: [a, b, later, reserved] } },
      select: { id: true, remittanceId: true },
    });
    const byId = new Map(rows.map((x) => [x.id, x.remittanceId]));
    expect(byId.get(a)).toBe(r.id);
    expect(byId.get(b)).toBe(r.id);
    expect(byId.get(later)).toBeNull();
    expect(byId.get(reserved)).toBeNull();

    const lines = await service.lines(r.id, {});
    expect(lines.meta.total).toBe(2);
  });

  maybe(
    'hợp đồng hãng không trả phí lúc cấp ⇒ kê theo phí khách trả, đếm riêng (ADR 0097)',
    async () => {
      await policy({
        status: INSURANCE_POLICY_STATUS.ISSUED,
        premium: 112200,
        issuedAt: ISSUED_IN_MONTH,
        partnerPremium: 110000,
      });
      await policy({
        status: INSURANCE_POLICY_STATUS.ISSUED,
        premium: 44200,
        issuedAt: ISSUED_IN_MONTH,
      });

      const pending = await service.pending();
      expect(Number(pending.grossPremium)).toBeGreaterThanOrEqual(154200);

      const r = await service.create({ periodMonth: MONTH, commissionPercent: '0' }, ownerId);
      expect(r).toMatchObject({
        policyCount: 2,
        grossPremium: '154200',
        payableAmount: '154200',
        partnerPremiumTotal: '110000',
        collectedPremiumTotal: '156400',
        partnerPremiumMissingCount: 1,
      });
    },
  );

  maybe('một tháng một bảng kê — lập trùng (kể cả song song) ⇒ đúng một bảng thắng', async () => {
    await policy({
      status: INSURANCE_POLICY_STATUS.ISSUED,
      premium: 44200,
      issuedAt: ISSUED_IN_MONTH,
    });
    const results = await Promise.allSettled([
      service.create({ periodMonth: MONTH, commissionPercent: '0' }, ownerId),
      service.create({ periodMonth: MONTH, commissionPercent: '0' }, ownerId),
    ]);
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(
      await prisma.insurancePremiumRemittance.count({
        where: { periodMonth: new Date(Date.UTC(YEAR, 2, 1)) },
      }),
    ).toBe(1);
  });

  maybe(
    'không có gì để kê, hoặc tháng chưa kết thúc ⇒ INSURANCE_REMITTANCE_EMPTY, không để lại bảng rỗng',
    async () => {
      await expectCode(
        service.create({ periodMonth: MONTH, commissionPercent: '0' }, ownerId),
        API_ERROR_CODE.INSURANCE_REMITTANCE_EMPTY,
      );
      expect(
        await prisma.insurancePremiumRemittance.count({
          where: { periodMonth: new Date(Date.UTC(YEAR, 2, 1)) },
        }),
      ).toBe(0);
      const now = new Date();
      const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      await expectCode(
        service.create({ periodMonth: thisMonth, commissionPercent: '0' }, ownerId),
        API_ERROR_CODE.INSURANCE_REMITTANCE_EMPTY,
      );
    },
  );

  maybe(
    'vòng đời: nháp → chốt → đã trả; sai trạng thái ⇒ INSURANCE_REMITTANCE_STATE_INVALID',
    async () => {
      await policy({
        status: INSURANCE_POLICY_STATUS.ISSUED,
        premium: 224400,
        issuedAt: ISSUED_IN_MONTH,
      });
      const draft = await service.create({ periodMonth: MONTH, commissionPercent: '0' }, ownerId);
      const pay = {
        paidAmount: '224400',
        paidAt: new Date().toISOString(),
        bankReference: 'FT26001',
      };

      await expectCode(
        service.pay(draft.id, pay, ownerId),
        API_ERROR_CODE.INSURANCE_REMITTANCE_STATE_INVALID,
      );
      const finalized = await service.finalize(draft.id, ownerId);
      expect(finalized.status).toBe(INSURANCE_REMITTANCE_STATUS.FINALIZED);
      await expectCode(
        service.finalize(draft.id, ownerId),
        API_ERROR_CODE.INSURANCE_REMITTANCE_STATE_INVALID,
      );
      await expectCode(
        service.remove(draft.id, ownerId),
        API_ERROR_CODE.INSURANCE_REMITTANCE_STATE_INVALID,
      );

      const paid = await service.pay(draft.id, pay, ownerId);
      expect(paid).toMatchObject({
        status: INSURANCE_REMITTANCE_STATUS.PAID,
        paidAmount: '224400',
        bankReference: 'FT26001',
      });
      expect(
        await prisma.auditLog.count({
          where: { targetType: 'insurance_remittance', targetId: draft.id },
        }),
      ).toBe(3);
    },
  );

  maybe('xoá bảng NHÁP nhả hợp đồng về "chưa kê"', async () => {
    const id = await policy({
      status: INSURANCE_POLICY_STATUS.ISSUED,
      premium: 44200,
      issuedAt: ISSUED_IN_MONTH,
    });
    const draft = await service.create({ periodMonth: MONTH, commissionPercent: '0' }, ownerId);
    await service.remove(draft.id, ownerId);
    const row = await prisma.bookingInsurancePolicy.findUniqueOrThrow({ where: { id } });
    expect(row.remittanceId).toBeNull();
  });

  maybe('CSV: có BOM, đủ dòng, chặn công thức Excel trong ô chữ', async () => {
    await policy({
      status: INSURANCE_POLICY_STATUS.ISSUED,
      premium: 44200,
      issuedAt: ISSUED_IN_MONTH,
      code: `=HYPERLINK${RUN}`,
    });
    const draft = await service.create({ periodMonth: MONTH, commissionPercent: '0' }, ownerId);
    const csv = await service.exportCsv(draft.id);
    expect([...csv.file.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = csv.file.subarray(3).toString('utf8');
    expect(text).toContain(`"'=HYPERLINK${RUN}"`);
    expect(text).toContain('"Phải trả","44200"');
    expect(csv.fileName).toBe(`bang-ke-bao-hiem-mic-${MONTH}.csv`);
  });
});
