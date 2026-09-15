import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  BOOKING_STATUS,
  SELLER_ENTITY_TYPE,
  TAX_WITHHOLDING_STATUS,
  TENANT_STATUS,
  taxPeriodKeyVn,
  type BookingPriceSnapshot,
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
const read = new TaxReadService(asService);

const RUN = newId().slice(-8).toLowerCase();
let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let vehicleId: string;
let sellerProfileId: string;
let policyId: string;
let bookingSeq = 0;

/** `B` = 1.400.000 · thuế 10% ⇒ 140.000. Con số dùng xuyên spec để mọi khẳng định đọc được. */
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
          ? [{ key: 'tax', beneficiary: 'tax_authority', bearer: 'owner', percent: TAX_PERCENT, amount: taxAmount }]
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
    tax.accrueForBookingWithinTx(tx, { bookingId, tenantId, actorUserId: ownerId, ...(now ? { now } : {}) }),
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
    data: { id: ownerId, displayName: 'Chủ thuế', email: `tax-${RUN}@xeprime.test` },
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
    expect(
      (await prisma.taxWithholding.findUniqueOrThrow({ where: { id: row.id } })).status,
    ).toBe(TAX_WITHHOLDING_STATUS.DECLARED);

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

    const skipped = await tax.advancePeriod(row.periodKey, TAX_WITHHOLDING_STATUS.REMITTED, ownerId);
    expect(skipped.updated).toBe(0);
    expect(
      (await prisma.taxWithholding.findUniqueOrThrow({ where: { id: row.id } })).status,
    ).toBe(TAX_WITHHOLDING_STATUS.ACCRUED);
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

    const csv = await read.periodCsv(row.periodKey);
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
