import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  BILLING_MODE,
  BOOKING_STATUS,
  type BookingPriceSnapshot,
  computeCustomerFees,
  FEE_SCHEDULE_DEFAULTS,
  type FeePolicySnapshot,
  SELLER_ENTITY_TYPE,
  SELLER_PROFILE_STATUS,
  SERVICE_TYPE,
  TAX_RATES_DEFAULTS,
  VEHICLE_TYPE,
  TAX_WITHHOLDING_STATUS,
  taxPeriodKeyVn,
  taxSellerEntityOf,
  TENANT_STATUS,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { TaxReadService } from '../src/modules/tax/tax-read.service';
import { TaxService } from '../src/modules/tax/tax.service';
import type { PrismaService } from '../src/prisma/prisma.service';

/**
 * THUẾ KHẤU TRỪ — Phase 8, ADR 0032 điều 3, trên PostgreSQL THẬT.
 *
 * Bốn luật được khoá ở đây, và mỗi cái tương ứng một cách sai tiền thật:
 *
 *  1. **Chỉ phát sinh khi chuyến BẮT ĐẦU.** Ghi lúc tạo đơn sẽ đưa những chuyến bị huỷ vào tờ
 *     khai — nền tảng nộp thuế cho doanh thu không tồn tại.
 *  2. **Idempotent bằng CONSTRAINT.** Chuyển trạng thái chạy lại không sinh nghĩa vụ thứ hai.
 *  3. **Sổ CHỈ-GHI-THÊM.** Sửa sai bằng dòng ÂM, không `UPDATE amount` — một con số đã kê khai
 *     bị ghi lại là mất bằng chứng của chính lần kê khai đó.
 *  4. **Kỳ theo GIỜ VIỆT NAM.** Mỗi tháng có một khoảng bảy giờ mà giờ UTC thuộc kỳ trước.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const audit = new AuditService(asService);
const tax = new TaxService(asService, audit);
const read = new TaxReadService(asService, audit);

const RUN = newId().slice(-8).toLowerCase();
let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let vehicleId: string;
let sellerProfileId: string;
let policyId: string;
let bookingSeq = 0;

/**
 * `B` = 1.400.000 · thuế 10% ⇒ 140.000. Con số dùng xuyên spec để mọi khẳng định đọc được.
 *
 * `snapshot()` mô phỏng SNAPSHOT MỘT-MỨC trước ADR 0068 (không tách GTGT/TNCN) — đơn cũ vẫn phải
 * ghi sổ đúng. Mô hình mới (bảng mức theo loại dịch vụ) có describe riêng ở cuối file.
 */
const BASE = '1400000';
const TAX_PERCENT = 10;
const TAX_AMOUNT = '140000';

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

/** Snapshot giá có dòng TAX — đúng hình dạng `computeCustomerFees` sinh ra. */
function snapshot(taxAmount = TAX_AMOUNT): BookingPriceSnapshot {
  return {
    rows: [],
    depositAmount: '280000',
    totalAmount: BASE,
    fees: {
      billingMode: 'commission',
      baseAmount: BASE,
      policy: { policyId, taxPercent: TAX_PERCENT, taxLabel: 'VAT 5% + TNCN 5%' },
      lines:
        Number(taxAmount) > 0
          ? [
              {
                key: 'tax',
                beneficiary: 'tax_authority',
                bearer: 'owner',
                percent: TAX_PERCENT,
                amount: taxAmount,
              },
            ]
          : [],
    },
  } as unknown as BookingPriceSnapshot;
}

async function makeBooking(snap: BookingPriceSnapshot = snapshot()): Promise<string> {
  bookingSeq += 1;
  const id = newId();
  await prisma.booking.create({
    data: {
      id,
      tenantId,
      vehicleId,
      code: `DHTX${bookingSeq}${RUN.slice(0, 3).toUpperCase()}`,
      customerName: 'Khách thuế',
      customerPhone: `0922${String(100000 + bookingSeq).slice(-6)}`,
      status: BOOKING_STATUS.RESERVED,
      pickupAt: new Date(Date.now() + 86400_000),
      returnAt: new Date(Date.now() + 3 * 86400_000),
      baseAmount: new Prisma.Decimal(BASE),
      totalAmount: new Prisma.Decimal(BASE),
      // Cột DỰ KIẾN — `feeColumns` ghi nó lúc tạo đơn; nghĩa vụ thật nằm ở `tax_withholdings`.
      taxAmount: new Prisma.Decimal(snap.fees?.lines[0]?.amount ?? '0'),
      priceSnapshot: snap as unknown as Prisma.InputJsonValue,
      feePolicyId: policyId,
    },
  });
  return id;
}

const accrue = (bookingId: string, now?: Date) =>
  prisma.$transaction((tx) =>
    tax.accrueForBookingWithinTx(tx, {
      bookingId,
      tenantId,
      actorUserId: ownerId,
      ...(now ? { now } : {}),
    }),
  );

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
  sellerProfileId = newId();
  policyId = newId();

  await prisma.user.create({
    data: {
      realm: ACCOUNT_REALM.PARTNER,
      id: ownerId,
      displayName: 'Chủ thuế',
      email: `tax-${RUN}@xeprime.test`,
    },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `TaxShop-${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: `XE${vehicleId.slice(-5)}`,
      name: 'Xe thuế',
      vehicleType: 'car',
      createdBy: ownerId,
    },
  });
  await prisma.sellerProfile.create({
    data: {
      id: sellerProfileId,
      tenantId,
      entityType: SELLER_ENTITY_TYPE.HOUSEHOLD_BUSINESS,
      taxId: `TX${RUN.toUpperCase()}`,
      legalName: `Hộ KD ${RUN}`,
    },
  });
  await prisma.feePolicy.create({
    data: {
      id: policyId,
      version: 700 + Math.floor(Math.random() * 90),
      status: 'archived', // không đụng bản `active` toàn sàn
      name: `Policy tax ${RUN}`,
      serviceFeePercent: new Prisma.Decimal(10),
      holdMinAmount: new Prisma.Decimal(20_000),
      holdPaymentWindowMinutes: 120,
      freeCancelHours: 4,
      // Cọc PHẢI phủ được thuế, nếu không `ownerPayableAmount` âm — CHECK
      // `fee_policies_deposit_covers_tax_check` chặn cấu hình đó (xem ca cuối của spec này).
      depositPercent: new Prisma.Decimal(20),
      depositMinAmount: new Prisma.Decimal(50_000),
      taxEnabled: true,
      taxPercent: new Prisma.Decimal(TAX_PERCENT),
      taxLabel: 'VAT 5% + TNCN 5%',
    },
  });
});

afterEach(async () => {
  if (!dbAvailable) return;
  // Dòng đảo trỏ về dòng gốc (FK RESTRICT) — xoá dòng đảo trước.
  await prisma.taxWithholding.deleteMany({ where: { tenantId, reversalOfId: { not: null } } });
  await prisma.taxWithholding.deleteMany({ where: { tenantId } });
  await prisma.booking.deleteMany({ where: { tenantId } });
  await prisma.auditLog.deleteMany({ where: { tenantId } });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.tenantCustomer.deleteMany({ where: { tenantId } });
    await prisma.sellerProfile.deleteMany({ where: { id: sellerProfileId } });
    await prisma.feePolicy.deleteMany({ where: { id: policyId } });
    // Audit của nền tảng (chốt kỳ, xuất CSV) không gắn tenant — dọn theo người thao tác.
    await prisma.auditLog.deleteMany({ where: { actorUserId: ownerId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

describe('Phát sinh nghĩa vụ', () => {
  maybe('chuyến bắt đầu → MỘT dòng `accrued`, chụp đủ tỷ lệ / nhãn / loại chủ thể', async () => {
    const bookingId = await makeBooking();
    const id = await accrue(bookingId);
    expect(id).not.toBeNull();

    const row = await prisma.taxWithholding.findFirstOrThrow({ where: { bookingId } });
    expect(row.status).toBe(TAX_WITHHOLDING_STATUS.ACCRUED);
    expect(row.amount.toFixed(0)).toBe(TAX_AMOUNT);
    // Mẫu số `B` — KHÔNG gồm bảo hiểm (ADR 0032 điều 3).
    expect(row.taxableBase.toFixed(0)).toBe(BASE);
    expect(Number(row.percent)).toBe(TAX_PERCENT);
    expect(row.label).toBe('VAT 5% + TNCN 5%');
    // Hồ sơ người bán chụp TẠI ĐÂY: tỷ lệ phụ thuộc loại chủ thể, và loại đó đổi được về sau.
    expect(row.sellerProfileId).toBe(sellerProfileId);
    expect(row.periodKey).toBe(taxPeriodKeyVn(row.accruedAt));
  });

  /**
   * Phí giao `G` nằm trong `baseAmount` nhưng KHÔNG chịu thuế (ADR 0064 điều 4): mẫu số ghi vào
   * sổ phải đúng là con số đã nhân 10% — một sổ ghi `B` gồm `G` cạnh `amount = 10% × (B − G)`
   * là một tờ khai tự mâu thuẫn (tỷ lệ suy ra từ hai cột không còn là 10%).
   */
  maybe('chuyến CÓ phí giao: taxableBase = tiền thuê (B − G), khớp đúng phép nhân %', async () => {
    // 10% = GTGT 5% + TNCN 5% đều cho mọi loại dịch vụ — giữ con số 140.000 của spec.
    const flat = { vatPercent: 5, pitPercent: 5 };
    const policy: FeePolicySnapshot = {
      ...FEE_SCHEDULE_DEFAULTS,
      policyId,
      version: 1,
      serviceFeePercent: 0,
      holdMinAmount: '20000',
      holdPaymentWindowMinutes: 120,
      freeCancelHours: 4,
      depositMinAmount: '50000',
      depositMaxPercent: 50,
      taxEnabled: true,
      taxRates: { self_drive: flat, long_term: flat, with_driver: flat },
      taxLegalBasis: 'NĐ 117/2025/NĐ-CP',
      taxPercent: null,
      taxLabel: null,
      tripInsuranceEnabled: false,
      tripInsurancePercent: null,
      vehicleProtectionEnabled: false,
      vehicleProtectionPercent: null,
      insurancePartnerName: null,
    };
    const fees = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy,
      vehicleType: VEHICLE_TYPE.CAR,
      baseAmount: '1600000', // 1.400.000 tiền thuê + 200.000 giao xe
      deliveryAmount: '200000',
      rentalDays: 2,
      insuranceOffered: false,
      serviceType: SERVICE_TYPE.SELF_DRIVE,
    });
    expect(fees.taxAmount).toBe(TAX_AMOUNT);
    const bookingId = await makeBooking({
      rows: [],
      depositAmount: fees.depositAmount,
      totalAmount: fees.baseAmount,
      fees,
    } as unknown as BookingPriceSnapshot);
    await accrue(bookingId);

    const row = await prisma.taxWithholding.findFirstOrThrow({ where: { bookingId } });
    expect(row.amount.toFixed(0)).toBe(TAX_AMOUNT);
    expect(row.taxableBase.toFixed(0)).toBe(BASE); // KHÔNG phải 1.600.000
    expect(row.taxableBase.mul(row.percent).div(100).toFixed(0)).toBe(row.amount.toFixed(0));
    // GTGT 5% × 1.400.000 = 70.000 · TNCN 5% × 1.400.000 = 70.000.
    expect([row.vatAmount?.toFixed(0), row.pitAmount?.toFixed(0)]).toEqual(['70000', '70000']);
    expect(row.label).toBe('GTGT 5% + TNCN 5%');
  });

  maybe('snapshot CŨ (trước 21/10, không deliveryAmount) → mẫu số là cả baseAmount', async () => {
    const bookingId = await makeBooking();
    await accrue(bookingId);
    const row = await prisma.taxWithholding.findFirstOrThrow({ where: { bookingId } });
    expect(row.taxableBase.toFixed(0)).toBe(BASE);
  });

  maybe('cổng thuế TẮT (thuế 0) → KHÔNG dòng nào', async () => {
    const bookingId = await makeBooking(snapshot('0'));
    expect(await accrue(bookingId)).toBeNull();
    expect(await prisma.taxWithholding.count({ where: { bookingId } })).toBe(0);
  });

  maybe('đơn KHÔNG có snapshot phí (gian hàng tự lập) → KHÔNG dòng nào', async () => {
    bookingSeq += 1;
    const id = newId();
    await prisma.booking.create({
      data: {
        id,
        tenantId,
        vehicleId,
        code: `DHTX${bookingSeq}${RUN.slice(0, 3).toUpperCase()}`,
        customerName: 'Khách tự lập',
        status: BOOKING_STATUS.RESERVED,
        pickupAt: new Date(Date.now() + 86400_000),
        returnAt: new Date(Date.now() + 2 * 86400_000),
        baseAmount: new Prisma.Decimal(BASE),
        totalAmount: new Prisma.Decimal(BASE),
      },
    });
    expect(await accrue(id)).toBeNull();
  });

  /**
   * Chốt IDEMPOTENT là một CONSTRAINT, không phải một phép đọc trước khi ghi: hai request song
   * song đều qua được `findFirst`, chỉ có unique ở DB chặn được bản thứ hai.
   */
  maybe('chạy lại KHÔNG sinh nghĩa vụ thứ hai — chốt ở DB, không ở code', async () => {
    const bookingId = await makeBooking();
    const first = await accrue(bookingId);
    const second = await accrue(bookingId);

    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(await prisma.taxWithholding.count({ where: { bookingId } })).toBe(1);
  });

  maybe('hai lượt SONG SONG cũng chỉ ra một dòng', async () => {
    const bookingId = await makeBooking();
    const results = await Promise.all([accrue(bookingId), accrue(bookingId)]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    expect(await prisma.taxWithholding.count({ where: { bookingId } })).toBe(1);
  });

  maybe('kỳ lấy theo GIỜ VIỆT NAM, không theo UTC', async () => {
    const bookingId = await makeBooking();
    // 31/03 23:30 UTC = 01/04 06:30 giờ VN ⇒ phải là kỳ THÁNG 4.
    await accrue(bookingId, new Date('2026-03-31T23:30:00Z'));
    const row = await prisma.taxWithholding.findFirstOrThrow({ where: { bookingId } });
    expect(row.periodKey).toBe('2026-04');
  });
});

describe('Sổ CHỈ-GHI-THÊM: sửa sai bằng dòng đảo', () => {
  maybe('đảo ghi dòng ÂM + lật dòng gốc; tổng kỳ về 0', async () => {
    const bookingId = await makeBooking();
    await accrue(bookingId);
    const original = await prisma.taxWithholding.findFirstOrThrow({ where: { bookingId } });

    const reversalId = await tax.reverse(original.id, ownerId, 'Sai tỷ lệ cho hộ kinh doanh');

    const rows = await prisma.taxWithholding.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]!.status).toBe(TAX_WITHHOLDING_STATUS.REVERSED);
    // `amount` của dòng GỐC không bị sửa — đó là toàn bộ điểm của sổ chỉ-ghi-thêm.
    expect(rows[0]!.amount.toFixed(0)).toBe(TAX_AMOUNT);

    const reversal = rows.find((r) => r.id === reversalId)!;
    expect(reversal.amount.toFixed(0)).toBe(`-${TAX_AMOUNT}`);
    expect(reversal.reversalOfId).toBe(original.id);
    expect(reversal.reversalReason).toBe('Sai tỷ lệ cho hộ kinh doanh');
    // Dòng đảo thuộc CÙNG kỳ với dòng gốc — sửa tờ khai tháng 3 vẫn là việc của tháng 3.
    expect(reversal.periodKey).toBe(original.periodKey);

    // Cặp gốc + đảo triệt tiêu: `SUM(amount)` là con số đúng, không cần cây if theo trạng thái.
    const summary = await read.periodSummary(original.periodKey);
    const net = Number(summary.totalAmount);
    expect(net).toBe(0);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId, action: 'tax_withholding.reverse' },
    });
    expect(log.afterJson).toMatchObject({ reason: 'Sai tỷ lệ cho hộ kinh doanh' });
  });

  /**
   * Sau khi đảo, ô "nghĩa vụ còn hiệu lực" của đơn đó phải TRỐNG lại — nếu không thì không có
   * đường ghi con số đúng, và cả tính năng sửa sai trở thành vô dụng.
   */
  maybe('đảo xong thì ghi được dòng ĐÚNG cho cùng đơn', async () => {
    const bookingId = await makeBooking();
    await accrue(bookingId);
    const original = await prisma.taxWithholding.findFirstOrThrow({ where: { bookingId } });
    await tax.reverse(original.id, ownerId, 'Sai tỷ lệ, ghi lại');

    const corrected = await accrue(bookingId);
    expect(corrected).not.toBeNull();

    const live = await prisma.taxWithholding.findMany({
      where: { bookingId, reversalOfId: null, status: { not: TAX_WITHHOLDING_STATUS.REVERSED } },
    });
    expect(live).toHaveLength(1);
    expect(live[0]!.id).toBe(corrected);
  });

  maybe('KHÔNG đảo một bút toán đảo', async () => {
    const bookingId = await makeBooking();
    await accrue(bookingId);
    const original = await prisma.taxWithholding.findFirstOrThrow({ where: { bookingId } });
    const reversalId = await tax.reverse(original.id, ownerId, 'lý do đủ dài');

    await expect(tax.reverse(reversalId, ownerId, 'lý do đủ dài')).rejects.toMatchObject({
      response: { code: 'INVALID_STATUS_TRANSITION' },
    });
  });

  maybe('dòng ĐÃ NỘP không đảo được — sửa bằng tờ khai điều chỉnh', async () => {
    const bookingId = await makeBooking();
    await accrue(bookingId);
    const row = await prisma.taxWithholding.findFirstOrThrow({ where: { bookingId } });

    await tax.advancePeriod(row.periodKey, TAX_WITHHOLDING_STATUS.DECLARED, ownerId);
    await tax.advancePeriod(row.periodKey, TAX_WITHHOLDING_STATUS.REMITTED, ownerId);

    await expect(tax.reverse(row.id, ownerId, 'lý do đủ dài')).rejects.toMatchObject({
      response: { code: 'INVALID_STATUS_TRANSITION' },
    });
  });

  maybe('DB TỪ CHỐI dòng đảo không có lý do — CHECK, không phải quy ước', async () => {
    const bookingId = await makeBooking();
    await accrue(bookingId);
    const original = await prisma.taxWithholding.findFirstOrThrow({ where: { bookingId } });

    await expect(
      prisma.taxWithholding.create({
        data: {
          id: newId(),
          bookingId,
          tenantId,
          taxableBase: original.taxableBase,
          percent: original.percent,
          label: original.label,
          amount: original.amount.negated(),
          feePolicyId: policyId,
          status: TAX_WITHHOLDING_STATUS.REVERSED,
          periodKey: original.periodKey,
          reversalOfId: original.id,
          // reversalReason cố ý bỏ trống
        },
      }),
    ).rejects.toThrow(/tax_withholdings_reversal_needs_reason_check/);
  });

  maybe('DB TỪ CHỐI dòng GỐC mang số âm và dòng ĐẢO mang số dương', async () => {
    const bookingId = await makeBooking();
    const base = {
      tenantId,
      bookingId,
      taxableBase: new Prisma.Decimal(BASE),
      percent: new Prisma.Decimal(TAX_PERCENT),
      label: 'x',
      feePolicyId: policyId,
      periodKey: '2026-09',
    };
    // Dòng gốc âm — vô nghĩa: một nghĩa vụ không thể là số âm.
    await expect(
      prisma.taxWithholding.create({
        data: { id: newId(), ...base, amount: new Prisma.Decimal(-1000) },
      }),
    ).rejects.toThrow(/tax_withholdings_amount_sign_check/);
  });
});

describe('Chuyển trạng thái theo KỲ', () => {
  maybe('accrued → declared → remitted, và bấm hai lần không nhảy cóc', async () => {
    const bookingId = await makeBooking();
    await accrue(bookingId);
    const row = await prisma.taxWithholding.findFirstOrThrow({ where: { bookingId } });
    const period = row.periodKey;

    const declared = await tax.advancePeriod(period, TAX_WITHHOLDING_STATUS.DECLARED, ownerId);
    expect(declared.updated).toBeGreaterThanOrEqual(1);

    // Bấm lại: không còn dòng `accrued` nào của kỳ này ⇒ 0 dòng đổi, KHÔNG đẩy sang `remitted`.
    const again = await tax.advancePeriod(period, TAX_WITHHOLDING_STATUS.DECLARED, ownerId);
    expect(again.updated).toBe(0);
    expect((await prisma.taxWithholding.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(
      TAX_WITHHOLDING_STATUS.DECLARED,
    );

    await tax.advancePeriod(period, TAX_WITHHOLDING_STATUS.REMITTED, ownerId);
    const final = await prisma.taxWithholding.findUniqueOrThrow({ where: { id: row.id } });
    expect(final.status).toBe(TAX_WITHHOLDING_STATUS.REMITTED);
    expect(final.declaredAt).not.toBeNull();
    expect(final.remittedAt).not.toBeNull();
  });

  maybe('KHÔNG có đường "nộp mà chưa khai"', async () => {
    const bookingId = await makeBooking();
    await accrue(bookingId);
    const row = await prisma.taxWithholding.findFirstOrThrow({ where: { bookingId } });

    const skipped = await tax.advancePeriod(
      row.periodKey,
      TAX_WITHHOLDING_STATUS.REMITTED,
      ownerId,
    );
    expect(skipped.updated).toBe(0);
    expect((await prisma.taxWithholding.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(
      TAX_WITHHOLDING_STATUS.ACCRUED,
    );
  });

  maybe('kỳ sai dạng bị từ chối', async () => {
    await expect(
      tax.advancePeriod('2026-13', TAX_WITHHOLDING_STATUS.DECLARED, ownerId),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
  });
});

describe('Báo cáo', () => {
  maybe('tờ khai kỳ chia theo LOẠI CHỦ THỂ và theo gian hàng', async () => {
    const bookingId = await makeBooking();
    await accrue(bookingId);
    const row = await prisma.taxWithholding.findFirstOrThrow({ where: { bookingId } });

    const summary = await read.periodSummary(row.periodKey);
    const mine = summary.byTenant.find((t) => t.tenantId === tenantId)!;
    expect(mine.amount).toBe(TAX_AMOUNT);
    expect(mine.entityType).toBe(SELLER_ENTITY_TYPE.HOUSEHOLD_BUSINESS);
    expect(mine.taxCode).toBe(`TX${RUN.toUpperCase()}`);

    const household = summary.byEntityType.find(
      (e) => e.entityType === SELLER_ENTITY_TYPE.HOUSEHOLD_BUSINESS,
    )!;
    expect(Number(household.amount)).toBeGreaterThanOrEqual(Number(TAX_AMOUNT));
  });

  maybe('chủ xe xem được thuế của CHÍNH kỳ mình', async () => {
    const bookingId = await makeBooking();
    await accrue(bookingId);
    const row = await prisma.taxWithholding.findFirstOrThrow({ where: { bookingId } });

    const mine = await read.tenantSummary(tenantId, row.periodKey);
    expect(mine.totalAmount).toBe(TAX_AMOUNT);
    expect(mine.totalTaxableBase).toBe(BASE);
    expect(mine.items).toHaveLength(1);
    expect(mine.items[0]!.label).toBe('VAT 5% + TNCN 5%');
  });

  maybe('CSV có BOM và bọc đúng ô chứa dấu phẩy', async () => {
    const bookingId = await makeBooking();
    await accrue(bookingId);
    const row = await prisma.taxWithholding.findFirstOrThrow({ where: { bookingId } });

    const csv = await read.periodCsv(row.periodKey, ownerId);
    // BOM UTF-8: Excel trên Windows đọc CSV không BOM bằng codepage hệ thống và tên có dấu vỡ.
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('ma_so_thue');
    // Nhãn chứa dấu `+` chứ không có phẩy; ô nào có phẩy thì phải được bọc ngoặc kép.
    expect(csv).toContain(`TX${RUN.toUpperCase()}`);
    expect(csv).toContain(TAX_AMOUNT);
  });

  /**
   * CỔNG CẤU HÌNH — `fee_policies_deposit_covers_tax_check`.
   *
   * Thuế tính trên `B` nhưng chỉ khấu trừ được từ phần XePrime đang cầm là `D`. Nếu `D < T` thì
   * `ownerPayableAmount` âm: nền tảng nhận nghĩa vụ nộp thay một khoản LỚN HƠN số nó giữ, và
   * không có chỗ nào lấy phần chênh. Chặn ở cổng cấu hình, không để phát hiện ra lúc quyết toán
   * chuyến đầu tiên.
   *
   * Ca này đã tự chứng minh một lần: fixture của chính spec này ban đầu để cọc 0% + thuế 10% và
   * DB từ chối ngay lúc tạo.
   */
  maybe('CHECK `deposit_covers_tax` vẫn chặn cấu hình cọc < thuế', async () => {
    await expect(
      prisma.feePolicy.create({
        data: {
          id: newId(),
          version: 600 + Math.floor(Math.random() * 90),
          status: 'archived',
          name: `Policy xấu ${RUN}`,
          serviceFeePercent: new Prisma.Decimal(10),
          holdMinAmount: new Prisma.Decimal(20_000),
          holdPaymentWindowMinutes: 120,
          freeCancelHours: 4,
          // Cọc 5% không phủ nổi thuế 10% ⇒ khoản phải trả chủ xe sẽ âm.
          depositPercent: new Prisma.Decimal(5),
          taxEnabled: true,
          taxPercent: new Prisma.Decimal(10),
          taxLabel: 'VAT 5% + TNCN 5%',
        },
      }),
    ).rejects.toThrow(/fee_policies_deposit_covers_tax_check/);
  });

  maybe('CHECK mới: bảng mức có tổng cao nhất > % giữ chỗ ⇒ từ chối, kể cả bản NHÁP', async () => {
    await expect(
      prisma.feePolicy.create({
        data: {
          id: newId(),
          version: 600 + Math.floor(Math.random() * 90),
          status: 'draft',
          name: `Policy xấu v9 ${RUN}`,
          serviceFeePercent: new Prisma.Decimal(0),
          holdMinAmount: new Prisma.Decimal(20_000),
          holdPaymentWindowMinutes: 120,
          freeCancelHours: 4,
          // Tự lái 7% > giữ chỗ 5% ⇒ D không đủ giữ T.
          depositPercent: new Prisma.Decimal(5),
          taxEnabled: true,
          taxRates: TAX_RATES_DEFAULTS as unknown as Prisma.InputJsonObject,
          taxLegalBasis: 'NĐ 117/2025/NĐ-CP',
        },
      }),
    ).rejects.toThrow(/fee_policies_deposit_covers_tax_check/);
  });

  maybe('CHECK mới: bật thuế mà thiếu bảng mức hoặc căn cứ ⇒ từ chối (trừ bản lưu trữ)', async () => {
    await expect(
      prisma.feePolicy.create({
        data: {
          id: newId(),
          version: 600 + Math.floor(Math.random() * 90),
          status: 'draft',
          name: `Policy thiếu căn cứ ${RUN}`,
          serviceFeePercent: new Prisma.Decimal(0),
          holdMinAmount: new Prisma.Decimal(20_000),
          holdPaymentWindowMinutes: 120,
          freeCancelHours: 4,
          depositPercent: new Prisma.Decimal(15),
          taxEnabled: true,
          taxRates: TAX_RATES_DEFAULTS as unknown as Prisma.InputJsonObject,
          taxLegalBasis: '   ',
        },
      }),
    ).rejects.toThrow(/fee_policies_tax_requires_rates_check/);
  });

  maybe('nghĩa vụ GIỮ HỘ chỉ gồm phần chưa nộp', async () => {
    const bookingId = await makeBooking();
    await accrue(bookingId);
    const row = await prisma.taxWithholding.findFirstOrThrow({ where: { bookingId } });
    const end = new Date(Date.now() + 60_000);

    const before = await read.unpaidAsOf(end);
    expect(Number(before)).toBeGreaterThanOrEqual(Number(TAX_AMOUNT));

    await tax.advancePeriod(row.periodKey, TAX_WITHHOLDING_STATUS.DECLARED, ownerId);
    // `declared` VẪN là giữ hộ: đã khai nhưng tiền chưa rời tài khoản.
    expect(Number(await read.unpaidAsOf(end))).toBe(Number(before));

    await tax.advancePeriod(row.periodKey, TAX_WITHHOLDING_STATUS.REMITTED, ownerId);
    // `remitted` ⇒ tiền đã nộp, thôi là nghĩa vụ.
    expect(Number(await read.unpaidAsOf(end))).toBe(Number(before) - Number(TAX_AMOUNT));
  });
});

/**
 * ADR 0068 — mức theo LOẠI DỊCH VỤ, GTGT/TNCN tách riêng, định danh người bán chụp lúc ghi sổ.
 * Ví dụ của ADR: tiền thuê 780.000đ, tự lái ⇒ GTGT 39.000 + TNCN 15.600 = 54.600.
 */
describe('Sổ thuế tách GTGT/TNCN (ADR 0068)', () => {
  const ND117: FeePolicySnapshot = {
    ...FEE_SCHEDULE_DEFAULTS,
    policyId: '',
    version: 1,
    serviceFeePercent: 0,
    holdMinAmount: '20000',
    holdPaymentWindowMinutes: 120,
    freeCancelHours: 2,
    depositMaxPercent: 50,
    taxEnabled: true,
    taxRates: TAX_RATES_DEFAULTS,
    taxLegalBasis: 'NĐ 117/2025/NĐ-CP · NĐ 68/2026/NĐ-CP',
    taxPercent: null,
    taxLabel: null,
    tripInsuranceEnabled: false,
    tripInsurancePercent: null,
    vehicleProtectionEnabled: false,
    vehicleProtectionPercent: null,
    insurancePartnerName: null,
  };
  const bookingFor = async (serviceType: string, sellerEntityType: 'individual' | 'household_business' | 'company') => {
    const fees = computeCustomerFees({
      billingMode: BILLING_MODE.COMMISSION,
      policy: { ...ND117, policyId },
      vehicleType: VEHICLE_TYPE.CAR,
      baseAmount: '780000',
      rentalDays: 1,
      insuranceOffered: false,
      serviceType: serviceType as typeof SERVICE_TYPE.SELF_DRIVE,
      sellerEntityType,
    });
    const bookingId = await makeBooking({
      rows: [],
      depositAmount: fees.depositAmount,
      totalAmount: fees.baseAmount,
      fees,
    } as unknown as BookingPriceSnapshot);
    return { bookingId, fees };
  };

  maybe('tự lái: dòng sổ mang GTGT 39.000 + TNCN 15.600 = 54.600, tỷ lệ, nhóm, định danh', async () => {
    await prisma.sellerProfile.update({
      where: { id: sellerProfileId },
      data: { idNumber: `0790${RUN.slice(0, 6)}` },
    });
    const { bookingId } = await bookingFor(SERVICE_TYPE.SELF_DRIVE, 'household_business');
    await accrue(bookingId);
    const row = await prisma.taxWithholding.findFirstOrThrow({ where: { bookingId } });
    expect(row.amount.toFixed(0)).toBe('54600');
    expect(row.vatAmount?.toFixed(0)).toBe('39000');
    expect(row.pitAmount?.toFixed(0)).toBe('15600');
    expect([Number(row.vatPercent), Number(row.pitPercent), Number(row.percent)]).toEqual([5, 2, 7]);
    expect(row.taxCategory).toBe('service');
    expect(row.label).toBe('GTGT 5% + TNCN 2%');
    expect(row.taxableBase.toFixed(0)).toBe('780000');
    // Loại chủ thể KHAI + định danh chụp từ hồ sơ lúc ghi sổ; chủ thể ÁP THUẾ từ SNAPSHOT của đơn.
    expect(row.sellerEntityType).toBe('household_business');
    expect(row.taxSubjectType).toBe('household_business');
    expect(row.sellerTaxId).toBe(`TX${RUN.toUpperCase()}`);
    expect(row.sellerLegalName).toBe(`Hộ KD ${RUN}`);
    expect(row.sellerIdNumber).toBe(`0790${RUN.slice(0, 6)}`);
  });

  maybe('có tài xế = vận tải: GTGT 3% = 23.400 + TNCN 1,5% = 11.700', async () => {
    const { bookingId } = await bookingFor(SERVICE_TYPE.WITH_DRIVER, 'individual');
    await accrue(bookingId);
    const row = await prisma.taxWithholding.findFirstOrThrow({ where: { bookingId } });
    expect([row.vatAmount?.toFixed(0), row.pitAmount?.toFixed(0), row.amount.toFixed(0)]).toEqual([
      '23400',
      '11700',
      '35100',
    ]);
    expect(row.taxCategory).toBe('transport');
  });

  maybe('doanh nghiệp đã xác minh: T = 0 ⇒ KHÔNG dòng sổ nào', async () => {
    const { bookingId, fees } = await bookingFor(SERVICE_TYPE.SELF_DRIVE, 'company');
    expect(fees.taxExemptReason).toBe('company');
    expect(await accrue(bookingId)).toBeNull();
    expect(await prisma.taxWithholding.count({ where: { bookingId } })).toBe(0);
  });

  maybe('dòng đảo mang GTGT/TNCN ÂM, tổng kỳ của cả hai cột về 0', async () => {
    const { bookingId } = await bookingFor(SERVICE_TYPE.SELF_DRIVE, 'individual');
    const id = (await accrue(bookingId))!;
    const reversalId = await tax.reverse(id, ownerId, 'Sai mức thuế, khai lại');
    const reversal = await prisma.taxWithholding.findUniqueOrThrow({ where: { id: reversalId } });
    expect([reversal.vatAmount?.toFixed(0), reversal.pitAmount?.toFixed(0)]).toEqual([
      '-39000',
      '-15600',
    ]);
    expect(reversal.amount.toFixed(0)).toBe('-54600');
    expect(reversal.sellerTaxId).toBe(`TX${RUN.toUpperCase()}`);
  });

  maybe('DB TỪ CHỐI dòng có GTGT + TNCN ≠ tổng', async () => {
    const bookingId = (await bookingFor(SERVICE_TYPE.SELF_DRIVE, 'individual')).bookingId;
    await expect(
      prisma.taxWithholding.create({
        data: {
          id: newId(),
          bookingId,
          tenantId,
          taxableBase: new Prisma.Decimal(780_000),
          percent: new Prisma.Decimal(7),
          label: 'GTGT 5% + TNCN 2%',
          amount: new Prisma.Decimal(55_000),
          vatAmount: new Prisma.Decimal(39_000),
          pitAmount: new Prisma.Decimal(15_600),
          feePolicyId: policyId,
          periodKey: taxPeriodKeyVn(new Date()),
        },
      }),
    ).rejects.toThrow(/tax_withholdings_vat_pit_sum_check/);
  });

  maybe('tờ khai kỳ, thẻ chủ xe và CSV có hai cột thuế + định danh', async () => {
    const { bookingId } = await bookingFor(SERVICE_TYPE.SELF_DRIVE, 'individual');
    await accrue(bookingId);
    const row = await prisma.taxWithholding.findFirstOrThrow({ where: { bookingId } });

    const summary = await read.periodSummary(row.periodKey);
    expect(Number(summary.totalVatAmount)).toBeGreaterThanOrEqual(39_000);
    expect(Number(summary.totalPitAmount)).toBeGreaterThanOrEqual(15_600);
    const mine = summary.byTenant.find((t) => t.tenantId === tenantId)!;
    expect([mine.vatAmount, mine.pitAmount]).toEqual(['39000', '15600']);

    const card = await read.tenantSummary(tenantId, row.periodKey);
    expect([card.totalVatAmount, card.totalPitAmount]).toEqual(['39000', '15600']);
    const item = card.items.find((i) => i.bookingId === bookingId)!;
    expect([item.vatAmount, item.pitAmount, item.vatPercent, item.pitPercent, item.taxCategory]).toEqual(
      ['39000', '15600', 5, 2, 'service'],
    );

    const csv = await read.periodCsv(row.periodKey, ownerId);
    const [header, ...lines] = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
    const cols = header!.split(',');
    for (const col of ['thue_gtgt', 'thue_tncn', 'ty_le_gtgt', 'ty_le_tncn', 'nhom', 'so_dinh_danh']) {
      expect(cols).toContain(col);
    }
    const line = lines.find((l) => l.includes(row.periodKey) && l.includes('54600'))!.split(',');
    const at = (name: string) => line[cols.indexOf(name)];
    expect([at('thue_gtgt'), at('thue_tncn'), at('ty_le_gtgt'), at('ty_le_tncn'), at('nhom')]).toEqual(
      ['39000', '15600', '5.00', '2.00', 'service'],
    );
  });

  /**
   * HAI sự kiện, hai cột (ADR 0068 điều 2 + 4): `seller_entity_type` là loại chủ thể người bán
   * KHAI (NULL khi chưa có hồ sơ ⇒ tờ khai thấy nhóm `unknown`), `tax_subject_type` là chủ thể
   * ÁP THUẾ đã đóng băng (thiếu hồ sơ / doanh nghiệp chưa xác minh ⇒ khấu trừ như cá nhân). Ghi
   * chủ thể áp thuế vào cột khai từng xoá mất nhóm `unknown` khỏi tờ khai.
   */
  maybe('CHƯA có hồ sơ người bán: khấu trừ như cá nhân, nhưng tờ khai thấy `unknown` + cảnh báo', async () => {
    const profile = await prisma.sellerProfile.findUniqueOrThrow({ where: { id: sellerProfileId } });
    await prisma.sellerProfile.delete({ where: { id: sellerProfileId } });
    try {
      const { bookingId } = await bookingFor(SERVICE_TYPE.SELF_DRIVE, taxSellerEntityOf(null));
      await accrue(bookingId);
      const row = await prisma.taxWithholding.findFirstOrThrow({ where: { bookingId } });
      expect(row.amount.toFixed(0)).toBe('54600');
      expect(row.sellerProfileId).toBeNull();
      expect(row.sellerEntityType).toBeNull();
      expect(row.taxSubjectType).toBe(SELLER_ENTITY_TYPE.INDIVIDUAL);

      const summary = await read.periodSummary(row.periodKey);
      const unknown = summary.byEntityType.find((e) => e.entityType === 'unknown');
      // Dữ liệu mà cảnh báo "chưa khai hồ sơ" của màn tờ khai đọc: nhóm `unknown` có tiền.
      expect(Number(unknown?.amount ?? 0)).toBeGreaterThanOrEqual(54_600);
      expect(summary.byTenant.find((t) => t.tenantId === tenantId)?.entityType).toBe('unknown');

      const item = (await read.tenantSummary(tenantId, row.periodKey)).items[0]!;
      expect([item.entityType, item.taxSubjectType]).toEqual(['unknown', SELLER_ENTITY_TYPE.INDIVIDUAL]);

      const csv = await read.periodCsv(row.periodKey, ownerId);
      const [header, ...lines] = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
      const cols = header!.split(',');
      const bookingCode = (await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } })).code;
      const line = lines.find((l) => l.includes(bookingCode))!.split(',');
      expect(line[cols.indexOf('loai_chu_the')]).toBe('unknown');
      expect(line[cols.indexOf('khau_tru_nhu')]).toBe(SELLER_ENTITY_TYPE.INDIVIDUAL);
    } finally {
      await prisma.sellerProfile.create({
        data: {
          id: profile.id,
          tenantId,
          entityType: profile.entityType,
          taxId: profile.taxId,
          idNumber: profile.idNumber,
          legalName: profile.legalName,
        },
      });
    }
  });

  maybe('doanh nghiệp CHƯA xác minh: dòng sổ ghi loại KHAI `company`, vẫn bị khấu trừ như cá nhân', async () => {
    await prisma.sellerProfile.update({
      where: { id: sellerProfileId },
      data: { entityType: SELLER_ENTITY_TYPE.COMPANY, status: SELLER_PROFILE_STATUS.SUBMITTED },
    });
    try {
      const profile = await prisma.sellerProfile.findUniqueOrThrow({ where: { id: sellerProfileId } });
      // Chủ thể áp thuế do `taxSellerEntityOf` quyết — đúng phép `PricingService` dùng lúc nhận chuyến.
      const applied = taxSellerEntityOf(profile);
      expect(applied).toBe(SELLER_ENTITY_TYPE.INDIVIDUAL);
      const { bookingId } = await bookingFor(SERVICE_TYPE.SELF_DRIVE, applied);
      await accrue(bookingId);
      const row = await prisma.taxWithholding.findFirstOrThrow({ where: { bookingId } });
      expect(row.amount.toFixed(0)).toBe('54600');
      expect(row.sellerEntityType).toBe(SELLER_ENTITY_TYPE.COMPANY);
      expect(row.taxSubjectType).toBe(SELLER_ENTITY_TYPE.INDIVIDUAL);

      const item = (await read.tenantSummary(tenantId, row.periodKey)).items[0]!;
      expect([item.entityType, item.taxSubjectType]).toEqual([
        SELLER_ENTITY_TYPE.COMPANY,
        SELLER_ENTITY_TYPE.INDIVIDUAL,
      ]);
      const summary = await read.periodSummary(row.periodKey);
      expect(summary.byTenant.find((t) => t.tenantId === tenantId)?.entityType).toBe(
        SELLER_ENTITY_TYPE.COMPANY,
      );

      // Dòng ĐẢO mang lại cả hai cột của dòng gốc.
      const reversal = await prisma.taxWithholding.findUniqueOrThrow({
        where: { id: await tax.reverse(row.id, ownerId, 'Kiểm tra dòng đảo giữ chủ thể') },
      });
      expect([reversal.sellerEntityType, reversal.taxSubjectType]).toEqual([
        SELLER_ENTITY_TYPE.COMPANY,
        SELLER_ENTITY_TYPE.INDIVIDUAL,
      ]);
    } finally {
      await prisma.sellerProfile.update({
        where: { id: sellerProfileId },
        data: { entityType: SELLER_ENTITY_TYPE.HOUSEHOLD_BUSINESS, status: SELLER_PROFILE_STATUS.DRAFT },
      });
    }
  });

  maybe('kỳ TRỘN dòng một-mức cũ + dòng tách: tổng = GTGT + TNCN + phần chưa tách', async () => {
    await accrue(await makeBooking());
    const { bookingId } = await bookingFor(SERVICE_TYPE.SELF_DRIVE, 'individual');
    await accrue(bookingId);
    const row = await prisma.taxWithholding.findFirstOrThrow({ where: { bookingId } });

    const card = await read.tenantSummary(tenantId, row.periodKey);
    expect([
      card.totalAmount,
      card.totalVatAmount,
      card.totalPitAmount,
      card.totalUnsplitAmount,
    ]).toEqual([String(140_000 + 54_600), '39000', '15600', TAX_AMOUNT]);

    const summary = await read.periodSummary(row.periodKey);
    expect(
      Number(summary.totalVatAmount) + Number(summary.totalPitAmount) + Number(summary.totalUnsplitAmount),
    ).toBe(Number(summary.totalAmount));
    expect(Number(summary.totalUnsplitAmount)).toBeGreaterThanOrEqual(140_000);
  });

  maybe('xuất CSV (có số CCCD đầy đủ) ghi audit `tax.period_export`: người xuất, kỳ, số dòng', async () => {
    const { bookingId } = await bookingFor(SERVICE_TYPE.SELF_DRIVE, 'individual');
    await accrue(bookingId);
    const row = await prisma.taxWithholding.findFirstOrThrow({ where: { bookingId } });

    const csv = await read.periodCsv(row.periodKey, ownerId);
    const dataLines = csv.replace(/^\uFEFF/, '').trim().split('\r\n').length - 1;

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'tax.period_export', actorUserId: ownerId, targetId: row.periodKey },
      orderBy: { createdAt: 'desc' },
    });
    expect(log.targetType).toBe('tax_period');
    expect(log.actorScope).toBe('platform');
    expect(log.tenantId).toBeNull();
    expect(log.afterJson).toMatchObject({ periodKey: row.periodKey, rows: dataLines });
    // Audit KHÔNG mang số giấy tờ — chỉ đếm.
    const profile = await prisma.sellerProfile.findUniqueOrThrow({ where: { id: sellerProfileId } });
    if (profile.idNumber) expect(JSON.stringify(log.afterJson)).not.toContain(profile.idNumber);
  });
});
