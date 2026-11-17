import { createPrismaClient, newId, NoopInsurancePartner, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  BOOKING_HOLD_OUTCOME,
  BOOKING_HOLD_STATUS,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  FEE_POLICY_STATUS,
  INSURANCE_ISSUE_ERROR,
  INSURANCE_POLICY_STATUS,
  INSURANCE_PRODUCT_KIND,
  TENANT_STATUS,
  VEHICLE_TYPE,
  WALLET_ENTRY_KIND,
  WALLET_ENTRY_SOURCE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { custodiedPolicyWhere } from '../src/modules/insurance/insurance-read.service';
import { InsuranceRefundService } from '../src/modules/insurance/insurance-refund.service';
import { InsuranceService } from '../src/modules/insurance/insurance.service';
import type {
  InsurancePartner,
  IssuePolicyRequest,
  IssuePolicyResult,
} from '../src/modules/insurance/partner/insurance-partner.port';
import { WalletService } from '../src/modules/wallet/wallet.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { customerAccountFor } from './helpers/customer-account';
import { makeBookingHoldsService } from './helpers/service-factory';

/**
 * ADR 0091 điều 7 — quá giờ trả mà hợp đồng bảo hiểm chưa cấp được ⇒ tra cứu lần cuối, không có
 * thì hoàn \`IV\` + phí thu hộ \`X\` vào Ví điểm của TÀI KHOẢN KHÁCH, trên PostgreSQL THẬT. Dựng thẳng
 * bằng Prisma một chuyến đã giao xe, đã quyết toán: bài kiểm là lượt hoàn, không phải vòng đời hold.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const wallet = new WalletService(asService);

/** Đối tác giả — trả đúng kết quả đặt sẵn cho lượt tra cứu lần cuối. */
class FinalCheckPartner implements InsurancePartner {
  readonly partnerName = 'Đối tác giả (test)';
  readonly configured = true;
  constructor(private readonly result: IssuePolicyResult) {}
  issue(_request: IssuePolicyRequest): Promise<IssuePolicyResult> {
    return Promise.resolve(this.result);
  }
}

const refundsWith = (partner: InsurancePartner) =>
  new InsuranceRefundService(
    asService,
    new InsuranceService(asService, audit, partner),
    wallet,
    audit,
  );

const IV = 224_400;
const X = 22_440;
const S = 50_000;
const D = 3_160;
const AMOUNT = IV + X + S + D;

const RUN = newId().slice(-8).toLowerCase();
let dbAvailable = false;
let ownerId: string;
let customerId: string;
let tenantId: string;
let vehicleId: string;
let feePolicyId: string;
let seq = 0;

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

/** Một chuyến đã giao xe, đã trả xe (quá giờ), khoản giữ chỗ ĐÃ quyết toán, hợp đồng còn chờ cấp. */
async function settledTripWithPendingPolicy(
  opts: {
    holdOutcome?: string | null;
    /** Ghi đè cột của hợp đồng — dựng hợp đồng `issued` cho các ca thu hồi (ADR 0093). */
    policy?: Partial<Prisma.BookingInsurancePolicyUncheckedCreateInput>;
  } = {},
): Promise<{ policyId: string; bookingId: string; holdId: string }> {
  seq += 1;
  const requestId = newId();
  const holdId = newId();
  const bookingId = newId();
  const policyId = newId();
  const returnAt = new Date(Date.now() - 3 * 3600_000);
  const pickupAt = new Date(returnAt.getTime() - 2 * 86_400_000);
  await prisma.bookingRequest.create({
    data: {
      id: requestId,
      tenantId,
      vehicleId,
      customerUserId: customerId,
      customerName: 'Khách hoàn bảo hiểm',
      customerPhone: '0912000111',
      status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
      respondBy: new Date(pickupAt.getTime() - 86_400_000),
      decidedAt: new Date(pickupAt.getTime() - 86_400_000),
      pickupAt,
      returnAt,
    },
  });
  await prisma.booking.create({
    data: {
      id: bookingId,
      tenantId,
      vehicleId,
      code: `DHREF${seq}${RUN.slice(0, 3).toUpperCase()}`,
      customerName: 'Khách hoàn bảo hiểm',
      customerPhone: '0912000111',
      status: BOOKING_STATUS.COMPLETED,
      pickupAt,
      returnAt,
      actualPickupAt: pickupAt,
      baseAmount: new Prisma.Decimal(1_400_000),
      totalAmount: new Prisma.Decimal(1_400_000),
    },
  });
  const outcome = opts.holdOutcome === undefined ? BOOKING_HOLD_OUTCOME.SETTLED : opts.holdOutcome;
  await prisma.bookingHold.create({
    data: {
      id: holdId,
      code: `XPH${holdId.slice(-8)}`,
      tenantId,
      bookingRequestId: requestId,
      bookingId,
      customerUserId: customerId,
      vehicleId,
      depositRequired: true,
      status: BOOKING_HOLD_STATUS.PAID,
      amount: new Prisma.Decimal(AMOUNT),
      paidAmount: new Prisma.Decimal(AMOUNT),
      paidAt: pickupAt,
      freeCancelUntil: pickupAt,
      depositAmount: new Prisma.Decimal(D),
      serviceFeeAmount: new Prisma.Decimal(S),
      vehicleInsuranceAmount: new Prisma.Decimal(IV),
      insuranceServiceFeeAmount: new Prisma.Decimal(X),
      ...(outcome
        ? {
            outcome,
            releasedAt: returnAt,
            settledOwnerAmount: new Prisma.Decimal(D),
            settledPlatformAmount: new Prisma.Decimal(S + X),
            settledInsurerAmount: new Prisma.Decimal(IV),
          }
        : {}),
      feePolicyId,
      allocationJson: [],
      priceSnapshotJson: {},
      scheduleJson: {},
      expiresAt: pickupAt,
    },
  });
  await prisma.bookingInsurancePolicy.create({
    data: {
      id: policyId,
      bookingId,
      tenantId,
      holdId,
      productKind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
      status: INSURANCE_POLICY_STATUS.FAILED,
      premiumAmount: new Prisma.Decimal(IV),
      serviceFeeAmount: new Prisma.Decimal(X),
      partnerName: 'MIC',
      idempotencyKey: `${bookingId}:vehicle_trip`,
      lastErrorCode: INSURANCE_ISSUE_ERROR.PARTNER_REJECTED,
      ...opts.policy,
    },
  });
  return { policyId, bookingId, holdId };
}

async function refundEntries(policyId: string) {
  return prisma.walletEntry.findMany({
    where: {
      kind: WALLET_ENTRY_KIND.INSURANCE_REFUND,
      sourceType: WALLET_ENTRY_SOURCE.BOOKING_INSURANCE_POLICY,
      sourceRefId: policyId,
    },
    select: { amount: true, wallet: { select: { ownerUserId: true } } },
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
  feePolicyId = newId();
  await prisma.user.create({
    data: {
      realm: ACCOUNT_REALM.PARTNER,
      id: ownerId,
      displayName: 'Chủ',
      email: `ins-refund-${RUN}@xeprime.test`,
    },
  });
  customerId = await customerAccountFor(
    asService,
    `0913${RUN.slice(-6).replace(/\D/g, '1')}`,
    'Khách',
  );
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `RefundShop-${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: `XE${vehicleId.slice(-5)}`,
      name: 'Xe hoàn bảo hiểm',
      vehicleType: VEHICLE_TYPE.CAR,
      createdBy: ownerId,
    },
  });
  await prisma.feePolicy.create({
    data: {
      id: feePolicyId,
      version: 900 + Math.floor(Math.random() * 90),
      status: FEE_POLICY_STATUS.ARCHIVED,
      name: `Policy refund ${feePolicyId.slice(-6)}`,
      serviceFeePercent: new Prisma.Decimal(0),
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    const wallets = await prisma.wallet.findMany({
      where: { ownerUserId: customerId },
      select: { id: true },
    });
    await prisma.walletEntry.deleteMany({ where: { walletId: { in: wallets.map((w) => w.id) } } });
    await prisma.wallet.deleteMany({ where: { id: { in: wallets.map((w) => w.id) } } });
    await prisma.bookingInsurancePolicy.deleteMany({ where: { tenantId } });
    await prisma.bookingHold.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
    await prisma.bookingRequest.deleteMany({ where: { tenantId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.feePolicy.deleteMany({ where: { id: feePolicyId } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: ownerId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, customerId] } } });
  }
  await prisma.$disconnect();
});

describe('Tự hoàn bảo hiểm khi quá giờ trả chưa cấp (ADR 0091 điều 7)', () => {
  maybe('không có hợp đồng ⇒ huỷ + hoàn IV + X vào ví TÀI KHOẢN KHÁCH, đúng một lần', async () => {
    const { policyId } = await settledTripWithPendingPolicy();
    const refunds = refundsWith(new NoopInsurancePartner());

    const first = await refunds.refundOverdue();
    expect(first.refunded).toBeGreaterThanOrEqual(1);
    const policy = await prisma.bookingInsurancePolicy.findUniqueOrThrow({
      where: { id: policyId },
    });
    expect(policy.status).toBe(INSURANCE_POLICY_STATUS.CANCELLED);
    expect(policy.refundedAt).not.toBeNull();
    const entries = await refundEntries(policyId);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.amount.toFixed(0)).toBe(String(IV + X));
    expect(entries[0]!.wallet.ownerUserId).toBe(customerId);

    // Chạy lại: không hoàn lần hai.
    await refunds.refundOverdue();
    expect(await refundEntries(policyId)).toHaveLength(1);
  });

  maybe('tra cứu lần cuối thấy đối tác ĐÃ cấp ⇒ ghi nhận issued, không hoàn', async () => {
    const { policyId } = await settledTripWithPendingPolicy();
    const refunds = refundsWith(
      new FinalCheckPartner({ ok: true, certificateNumber: `CERT-${RUN}`, isTest: false, raw: {} }),
    );
    await refunds.refundOverdue();
    const policy = await prisma.bookingInsurancePolicy.findUniqueOrThrow({
      where: { id: policyId },
    });
    expect(policy.status).toBe(INSURANCE_POLICY_STATUS.ISSUED);
    expect(await refundEntries(policyId)).toHaveLength(0);
  });

  maybe(
    'đối tác lỗi tạm thời ⇒ để vòng sau, không hoàn trên một câu trả lời chưa chắc',
    async () => {
      const { policyId } = await settledTripWithPendingPolicy();
      const refunds = refundsWith(
        new FinalCheckPartner({
          ok: false,
          code: INSURANCE_ISSUE_ERROR.PARTNER_UNAVAILABLE,
          message: 'timeout',
          retryable: true,
        }),
      );
      const result = await refunds.refundOverdue();
      expect(result.deferred).toBeGreaterThanOrEqual(1);
      const policy = await prisma.bookingInsurancePolicy.findUniqueOrThrow({
        where: { id: policyId },
      });
      expect(policy.status).toBe(INSURANCE_POLICY_STATUS.FAILED);
      expect(await refundEntries(policyId)).toHaveLength(0);
    },
  );

  maybe('khoản giữ chỗ chưa quyết toán ⇒ chờ, không hoàn trước quyết toán', async () => {
    const { policyId } = await settledTripWithPendingPolicy({ holdOutcome: null });
    await refundsWith(new NoopInsurancePartner()).refundOverdue();
    const policy = await prisma.bookingInsurancePolicy.findUniqueOrThrow({
      where: { id: policyId },
    });
    expect(policy.status).toBe(INSURANCE_POLICY_STATUS.FAILED);
    expect(await refundEntries(policyId)).toHaveLength(0);
  });

  maybe('đối soát: phí thu hộ đã hoàn rời vế nền tảng', async () => {
    const holds = makeBookingHoldsService(asService);
    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const before = await holds.dailyReconciliation(today);
    const { policyId } = await settledTripWithPendingPolicy();
    await refundsWith(new NoopInsurancePartner()).refundOverdue();
    expect((await refundEntries(policyId)).length).toBe(1);
    const after = await holds.dailyReconciliation(today);
    expect(
      Number(after.platform.insuranceServiceFeeRefunded) -
        Number(before.platform.insuranceServiceFeeRefunded),
    ).toBe(-X);
  });
});

/*
 * ADR 0093 — admin THU HỒI hợp đồng. Hai nhánh theo hiệu lực; nhánh chưa từng có hiệu lực hoàn phí + phí
 * thu hộ vào Ví điểm khách đúng MỘT lần, theo nhịp chốt của khoản giữ chỗ.
 */
describe('Thu hồi hợp đồng bảo hiểm (ADR 0093)', () => {
  const refunds = () => refundsWith(new NoopInsurancePartner());
  const isCustodied = async (policyId: string) =>
    (await prisma.bookingInsurancePolicy.count({
      where: { AND: [custodiedPolicyWhere(new Date(Date.now() + 60_000)), { id: policyId }] },
    })) === 1;
  const issuedAt = new Date(Date.now() - 4 * 86_400_000);

  maybe(
    'lỗi vĩnh viễn + hold đã chốt ⇒ huỷ, hoàn IV + X NGAY, chạy lại không hoàn đôi',
    async () => {
      const { policyId } = await settledTripWithPendingPolicy();
      const result = await refunds().voidPolicy(policyId, ownerId, {
        reason: 'MIC từ chối vĩnh viễn - sai số khung',
      });
      expect(result).toMatchObject({
        branch: 'cancel_refund',
        status: INSURANCE_POLICY_STATUS.CANCELLED,
        refundTiming: 'now',
        refundedAmount: String(IV + X),
      });
      const policy = await prisma.bookingInsurancePolicy.findUniqueOrThrow({
        where: { id: policyId },
      });
      expect(policy.refundedAt).not.toBeNull();
      expect(policy.voidReason).toBe('MIC từ chối vĩnh viễn - sai số khung');
      const entries = await refundEntries(policyId);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.amount.toFixed(0)).toBe(String(IV + X));
      expect(entries[0]!.wallet.ownerUserId).toBe(customerId);
      // Đã về ví ⇒ không còn nằm ở vế giữ hộ.
      expect(await isCustodied(policyId)).toBe(false);

      // Bấm lại: hợp đồng đã huỷ không thu hồi được nữa; vòng quét cũng không hoàn thêm.
      await expect(
        refunds().voidPolicy(policyId, ownerId, { reason: 'bấm lại lần hai' }),
      ).rejects.toMatchObject({ response: { code: 'INVALID_STATUS_TRANSITION' } });
      await refunds().refundOverdue();
      expect(await refundEntries(policyId)).toHaveLength(1);
    },
  );

  maybe(
    'hold CHƯA chốt ⇒ chỉ huỷ; vòng quét hoàn sau khi hold chốt settled, đúng một lần',
    async () => {
      const { policyId, holdId } = await settledTripWithPendingPolicy({ holdOutcome: null });
      const result = await refunds().voidPolicy(policyId, ownerId, {
        reason: 'MIC từ chối vĩnh viễn - xe ngoài danh mục',
      });
      expect(result).toMatchObject({ refundTiming: 'after_settlement', refundedAmount: null });
      expect(await refundEntries(policyId)).toHaveLength(0);
      // Hold còn mở: tiền vẫn nằm trong hold, vòng quét không đụng.
      await refunds().refundOverdue();
      expect(await refundEntries(policyId)).toHaveLength(0);
      expect(await isCustodied(policyId)).toBe(false);

      // Hold chốt `settled`: phí rời hold sang "phải trả hãng" ⇒ đang giữ hộ, chờ vòng quét.
      await prisma.bookingHold.update({
        where: { id: holdId },
        data: {
          outcome: BOOKING_HOLD_OUTCOME.SETTLED,
          releasedAt: new Date(),
          settledOwnerAmount: new Prisma.Decimal(D),
          settledPlatformAmount: new Prisma.Decimal(S + X),
          settledInsurerAmount: new Prisma.Decimal(IV),
        },
      });
      expect(await isCustodied(policyId)).toBe(true);
      await refunds().refundOverdue();
      await refunds().refundOverdue();
      const entries = await refundEntries(policyId);
      expect(entries).toHaveLength(1);
      expect(entries[0]!.amount.toFixed(0)).toBe(String(IV + X));
      expect(await isCustodied(policyId)).toBe(false);
    },
  );

  maybe('hold chốt kết cục hoàn khách ⇒ huỷ, KHÔNG hoàn thêm (phí đã về qua hold)', async () => {
    const { policyId, holdId } = await settledTripWithPendingPolicy({ holdOutcome: null });
    // Kết cục hoàn: toàn bộ về khách qua hold, không phần nào cho hãng.
    await prisma.bookingHold.update({
      where: { id: holdId },
      data: {
        outcome: BOOKING_HOLD_OUTCOME.REFUNDED,
        releasedAt: new Date(),
        settledCustomerAmount: new Prisma.Decimal(AMOUNT),
      },
    });
    const result = await refunds().voidPolicy(policyId, ownerId, {
      reason: 'Chuyến đã hoàn khách',
    });
    expect(result).toMatchObject({ refundTiming: 'via_hold', refundedAmount: null });
    await refunds().refundOverdue();
    expect(await refundEntries(policyId)).toHaveLength(0);
    expect(await isCustodied(policyId)).toBe(false);
  });

  maybe('đã cấp nhưng CHƯA tới giờ hiệu lực ⇒ bắt buộc mã đối chiếu, rồi huỷ + hoàn', async () => {
    const { policyId } = await settledTripWithPendingPolicy({
      policy: {
        status: INSURANCE_POLICY_STATUS.ISSUED,
        issuedAt,
        certificateNumber: `GCN-${RUN}-A`,
        coverageFrom: new Date(Date.now() + 86_400_000),
        lastErrorCode: null,
      },
    });
    await expect(
      refunds().voidPolicy(policyId, ownerId, { reason: 'Khách đổi xe trước giờ nhận' }),
    ).rejects.toMatchObject({ response: { code: 'INSURANCE_VOID_REFERENCE_REQUIRED' } });
    const result = await refunds().voidPolicy(policyId, ownerId, {
      reason: 'Khách đổi xe trước giờ nhận',
      partnerReference: 'BB-DOICHIEU-01',
    });
    expect(result).toMatchObject({ branch: 'cancel_refund', refundedAmount: String(IV + X) });
    expect(await refundEntries(policyId)).toHaveLength(1);
  });

  maybe('đã cấp, đã nằm trong bảng kê ⇒ không huỷ-hoàn được', async () => {
    const remittanceId = newId();
    await prisma.insurancePremiumRemittance.create({
      data: {
        id: remittanceId,
        provider: 'mic',
        periodMonth: new Date(Date.UTC(1990 + Math.floor(Math.random() * 30), seq % 12, 1)),
        policyCount: 0,
        grossPremium: 0,
        commissionPercent: 0,
        commissionAmount: 0,
        payableAmount: 0,
      },
    });
    const { policyId } = await settledTripWithPendingPolicy({
      policy: {
        status: INSURANCE_POLICY_STATUS.ISSUED,
        issuedAt,
        certificateNumber: `GCN-${RUN}-B`,
        coverageFrom: new Date(Date.now() + 86_400_000),
        remittanceId,
        lastErrorCode: null,
      },
    });
    try {
      await expect(
        refunds().voidPolicy(policyId, ownerId, {
          reason: 'Thu hồi sau khi đã kê',
          partnerReference: 'BB-02',
        }),
      ).rejects.toMatchObject({ response: { code: 'INSURANCE_POLICY_REMITTED' } });
      expect(await refundEntries(policyId)).toHaveLength(0);
    } finally {
      await prisma.bookingInsurancePolicy.update({
        where: { id: policyId },
        data: { remittanceId: null },
      });
      await prisma.insurancePremiumRemittance.delete({ where: { id: remittanceId } });
    }
  });

  maybe(
    'ĐÃ có hiệu lực ⇒ thu hồi, không hoàn, vẫn ở vế giữ hộ và vẫn chờ kê trả hãng',
    async () => {
      const { policyId } = await settledTripWithPendingPolicy({
        policy: {
          status: INSURANCE_POLICY_STATUS.ISSUED,
          issuedAt,
          certificateNumber: `GCN-${RUN}-C`,
          coverageFrom: new Date(Date.now() - 2 * 86_400_000),
          lastErrorCode: null,
        },
      });
      const result = await refunds().voidPolicy(policyId, ownerId, {
        reason: 'Xe gặp sự cố, hai bên thống nhất huỷ',
        partnerReference: 'MIC-HUY-778',
      });
      expect(result).toMatchObject({
        branch: 'void_keep_payable',
        status: INSURANCE_POLICY_STATUS.VOIDED,
        refundTiming: 'none',
        refundedAmount: null,
      });
      await refunds().refundOverdue();
      expect(await refundEntries(policyId)).toHaveLength(0);
      expect(await isCustodied(policyId)).toBe(true);
      // DB chặn thu hồi hợp đồng đã cấp mà thiếu mã đối chiếu.
      await expect(
        prisma.bookingInsurancePolicy.update({
          where: { id: policyId },
          data: { voidPartnerReference: null },
        }),
      ).rejects.toThrow();
    },
  );
});
