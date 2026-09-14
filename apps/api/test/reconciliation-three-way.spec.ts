import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  BANK_DIRECTION,
  BANK_MATCH_STATUS,
  BANK_MATCH_TARGET_TYPE,
  BOOKING_HOLD_OUTCOME,
  BOOKING_HOLD_PURPOSE,
  BOOKING_HOLD_STATUS,
  REFERENCE_CODE_PREFIX,
  SUBSCRIPTION_INVOICE_STATUS,
  TENANT_STATUS,
  WALLET_ENTRY_KIND,
  WALLET_ENTRY_SOURCE,
  WALLET_OWNER_TYPE,
  WITHDRAWAL_STATUS,
  referenceCodeTarget,
  resolveHoldAllocation,
} from '@xeprime/types';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeBookingHoldsService } from './helpers/service-factory';

/**
 * ĐỐI SOÁT BA VẾ — Phase 9, ADR 0025 điều 6, trên PostgreSQL THẬT.
 *
 * ## Phép chứng minh
 *
 * Spec dựng MỘT ngày có đủ năm loại giao dịch rồi khẳng định phương trình đóng:
 *
 * ```text
 *   Số dư ngân hàng cuối ngày = Tiền CỦA NỀN TẢNG + Tiền GIỮ HỘ   (variance = 0)
 * ```
 *
 * Vì database dùng chung với spec khác, mọi khẳng định viết theo **ĐỘ LỆCH** (sau − trước) chứ
 * không theo số tuyệt đối. Một spec tài chính khẳng định vào số tuyệt đối trên sổ dùng chung là
 * một spec sẽ đỏ vì lý do không liên quan tới thứ nó kiểm.
 *
 * ## Ba thứ được khoá ở đây
 *
 * 1. **Doanh thu nền tảng ở nhánh HUỶ MUỘN.** Công thức trong kế hoạch gốc
 *    (`SUM(service_fee_amount)`) sai đúng ở đây: `D + S` chia đôi nên phần nền tảng là
 *    `ceil((D+S)/2)`, không phải `S`. Tuyến GÓI có `S = 0` mà vẫn sinh doanh thu.
 * 2. **Không cộng đôi khoản đã chuyển từ hold sang ví.** Hold chốt xong rời vế giữ hộ của nó và
 *    xuất hiện ở ví — tổng nghĩa vụ không được nhảy lên.
 * 3. **Chưa nhập số dư ⇒ `null`, không phải 0.**
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const holds = makeBookingHoldsService(asService);

const RUN = newId().slice(-8).toLowerCase();
const TX_PREFIX = `recon-${RUN}-`;
const ownTx = { providerTxId: { startsWith: TX_PREFIX } } as const;

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let vehicleId: string;
let policyId: string;
let walletId: string;
let txCounter = 0;

/**
 * Một ngày CỐ ĐỊNH trong quá khứ — KHÔNG phải "hôm nay".
 *
 * Đối soát cộng dồn tới hết ngày hỏi, nên nếu spec này chạy trên ngày hôm nay thì mọi spec khác
 * đang chạy song song (jest dùng nhiều worker) sẽ chèn hold/giao dịch của chúng vào đúng khoảng
 * giữa hai lần chụp "trước" và "sau" — và spec đỏ vì lý do không liên quan gì tới thứ nó kiểm.
 *
 * Chọn một ngày xa trong quá khứ và ghim MỌI mốc thời gian của spec vào đó: dòng của spec khác
 * sinh ra "bây giờ" đều nằm SAU mốc cuối ngày nên bị loại khỏi phép cộng. Phép kiểm trở thành
 * xác định, không phụ thuộc ai đang chạy cùng.
 */
const RECON_DAY = '2019-06-15';
/** Một mốc nằm giữa ngày đó theo giờ VN — dùng cho mọi `createdAt`/`paidAt`/`releasedAt`. */
const AT = new Date('2019-06-15T05:00:00+07:00');

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
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
  tenantId = newId();
  vehicleId = newId();
  policyId = newId();
  walletId = newId();

  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ đối soát', email: `recon-${RUN}@xeprime.test` },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `ReconShop-${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: `XE${vehicleId.slice(-5)}`,
      name: 'Xe đối soát',
      vehicleType: 'car',
      weekdayPrice: new Prisma.Decimal(700_000),
      createdBy: ownerId,
    },
  });
  await prisma.feePolicy.create({
    data: {
      id: policyId,
      version: 800 + Math.floor(Math.random() * 90),
      status: 'archived', // không đụng bản `active` toàn sàn
      name: `Policy recon ${RUN}`,
      serviceFeePercent: new Prisma.Decimal(10),
      holdMinAmount: new Prisma.Decimal(20_000),
      holdPaymentWindowMinutes: 120,
      freeCancelHours: 4,
    },
  });
  await prisma.wallet.create({
    data: { id: walletId, ownerType: WALLET_OWNER_TYPE.TENANT, ownerTenantId: tenantId },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.bankTransaction.deleteMany({ where: ownTx });
    await prisma.platformBankBalance.deleteMany({ where: { note: { contains: RUN } } });
    await prisma.withdrawalRequest.deleteMany({ where: { walletId } });
    await prisma.walletEntry.deleteMany({ where: { walletId } });
    await prisma.wallet.deleteMany({ where: { id: walletId } });
    await prisma.holdRefund.deleteMany({ where: { tenantId } });
    await prisma.bookingHold.deleteMany({ where: { tenantId } });
    await prisma.bookingRequest.deleteMany({ where: { tenantId } });
    await prisma.subscriptionInvoice.deleteMany({ where: { tenantId } });
    await prisma.feePolicy.deleteMany({ where: { id: policyId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

/** Một hold ĐÃ TRẢ ĐỦ, chưa chốt kết cục. `D` và `S` truyền vào để dựng từng ca của bảng ADR. */
async function paidHold(deposit: number, serviceFee: number): Promise<string> {
  const requestId = newId();
  const holdId = newId();
  const amount = deposit + serviceFee;

  await prisma.bookingRequest.create({
    data: {
      id: requestId,
      tenantId,
      vehicleId,
      customerName: 'Khách đối soát',
      customerPhone: `0900${String(100000 + ++txCounter).slice(-6)}`,
      status: 'awaiting_hold',
      pickupAt: new Date(AT.getTime() + 5 * 86400_000),
      returnAt: new Date(AT.getTime() + 7 * 86400_000),
      respondBy: new Date(AT.getTime() + 3600_000),
      createdAt: AT,
    },
  });
  await prisma.bookingHold.create({
    data: {
      id: holdId,
      code: `${REFERENCE_CODE_PREFIX[BANK_MATCH_TARGET_TYPE.BOOKING_HOLD]}${RUN.toUpperCase()}${txCounter}`,
      tenantId,
      bookingRequestId: requestId,
      vehicleId,
      purpose: BOOKING_HOLD_PURPOSE.COMMISSION,
      status: BOOKING_HOLD_STATUS.PAID,
      amount: new Prisma.Decimal(amount),
      paidAmount: new Prisma.Decimal(amount),
      depositAmount: new Prisma.Decimal(deposit),
      serviceFeeAmount: new Prisma.Decimal(serviceFee),
      feePolicyId: policyId,
      allocationJson: [] as unknown as Prisma.InputJsonValue,
      priceSnapshotJson: {} as unknown as Prisma.InputJsonValue,
      scheduleJson: {} as unknown as Prisma.InputJsonValue,
      freeCancelUntil: new Date(AT.getTime() + 4 * 3600_000),
      expiresAt: new Date(AT.getTime() + 2 * 3600_000),
      paidAt: AT,
      createdAt: AT,
    },
  });
  return holdId;
}

/** Chốt kết cục THẲNG vào DB bằng đúng luật của `resolveHoldAllocation` — không qua service. */
async function settle(holdId: string, outcome: 'settled' | 'split_late_cancel') {
  const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
  const allocation = resolveHoldAllocation(
    {
      deposit: hold.depositAmount.toFixed(0),
      serviceFee: hold.serviceFeeAmount.toFixed(0),
      vehicleInsurance: '0',
      personalInsurance: '0',
    },
    outcome === 'settled' ? 'settled' : 'split_late_cancel',
  );
  const at = (target: string) =>
    allocation.filter((l) => l.target === target).reduce((t, l) => t + Number(l.amount), 0);

  await prisma.bookingHold.update({
    where: { id: holdId },
    data: {
      outcome:
        outcome === 'settled'
          ? BOOKING_HOLD_OUTCOME.SETTLED
          : BOOKING_HOLD_OUTCOME.SPLIT_LATE_CANCEL,
      status: BOOKING_HOLD_STATUS.RELEASED,
      releasedAt: AT,
      settledCustomerAmount: new Prisma.Decimal(at('customer_balance')),
      settledOwnerAmount: new Prisma.Decimal(at('owner_balance')),
      settledPlatformAmount: new Prisma.Decimal(at('platform_revenue')),
      settledInsurerAmount: new Prisma.Decimal(at('insurer_payable')),
      settledTaxAmount: new Prisma.Decimal(at('tax_ledger')),
    },
  });

  // Phần về chủ xe biến thành nghĩa vụ ví — đúng cách `allocateWithinTx` làm.
  const toOwner = at('owner_balance');
  if (toOwner > 0) {
    const wallet = await prisma.wallet.update({
      where: { id: walletId },
      data: { balance: { increment: toOwner } },
    });
    await prisma.walletEntry.create({
      data: {
        id: newId(),
        walletId,
        kind:
          outcome === 'settled'
            ? WALLET_ENTRY_KIND.HOLD_RELEASE
            : WALLET_ENTRY_KIND.HOLD_FORFEIT,
        sourceType: WALLET_ENTRY_SOURCE.BOOKING_HOLD,
        sourceRefId: holdId,
        amount: new Prisma.Decimal(toOwner),
        balanceAfter: wallet.balance,
        createdAt: AT,
      },
    });
  }
  return { platform: at('platform_revenue'), owner: toOwner };
}

async function bankIn(amount: number, matched: 'subscription' | 'hold' | null) {
  txCounter += 1;
  await prisma.bankTransaction.create({
    data: {
      id: newId(),
      providerTxId: `${TX_PREFIX}${txCounter}`,
      direction: BANK_DIRECTION.IN,
      amountIn: new Prisma.Decimal(amount),
      content: `recon ${txCounter}`,
      bankTime: AT,
      createdAt: AT,
      matchStatus: matched ? BANK_MATCH_STATUS.MATCHED : BANK_MATCH_STATUS.UNMATCHED,
      matchedType: matched
        ? matched === 'subscription'
          ? BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_INVOICE
          : BANK_MATCH_TARGET_TYPE.BOOKING_HOLD
        : null,
      rawJson: {} as unknown as Prisma.InputJsonValue,
    },
  });
}

describe('Công thức ba vế đóng trên một ngày có đủ năm loại giao dịch', () => {
  maybe('platform + custodied = bankBalanceEod ⇒ variance = 0', async () => {
    const before = await holds.dailyReconciliation(RECON_DAY);

    // ── 1. Tiền gói vào: của NỀN TẢNG ngay khi thu ────────────────────────
    const invoiceId = newId();
    await prisma.subscriptionInvoice.create({
      data: {
        id: invoiceId,
        tenantId,
        code: `${REFERENCE_CODE_PREFIX[BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_INVOICE]}${RUN.toUpperCase()}`,
        periodFrom: AT,
        periodTo: new Date(AT.getTime() + 30 * 86400_000),
        linesJson: [] as unknown as Prisma.InputJsonValue,
        subtotal: new Prisma.Decimal(300_000),
        totalAmount: new Prisma.Decimal(300_000),
        paidAmount: new Prisma.Decimal(300_000),
        status: SUBSCRIPTION_INVOICE_STATUS.PAID,
        paidAt: AT,
        createdAt: AT,
      },
    });
    await bankIn(300_000, 'subscription');

    // ── 2. Cọc mới vào, CHƯA chốt: toàn bộ là GIỮ HỘ ─────────────────────
    await paidHold(280_000, 140_000);
    await bankIn(420_000, 'hold');

    // ── 3. Chuyến HOÀN THÀNH: 280k về ví chủ xe, 140k thành doanh thu ─────
    const completed = await paidHold(280_000, 140_000);
    await bankIn(420_000, 'hold');
    const settledSplit = await settle(completed, 'settled');
    expect(settledSplit).toEqual({ platform: 140_000, owner: 280_000 });

    // ── 4. HUỶ MUỘN: chia đôi — đây là ca công thức cũ tính SAI ───────────
    const lateCancel = await paidHold(280_000, 140_000);
    await bankIn(420_000, 'hold');
    const splitResult = await settle(lateCancel, 'split_late_cancel');
    expect(splitResult).toEqual({ platform: 210_000, owner: 210_000 });
    // `service_fee_amount` chỉ là 140.000 — lệch 70.000 nếu đọc nhầm cột.
    expect(splitResult.platform).not.toBe(140_000);

    // ── 5. Tiền vào CHƯA KHỚP: vẫn trong tài khoản, vẫn là tiền của ai đó ─
    await bankIn(50_000, null);

    const after = await holds.dailyReconciliation(RECON_DAY);

    const d = (a: string, b: string) => Number(a) - Number(b);
    // Nền tảng tăng: 300.000 (gói) + 140.000 (hoàn thành) + 210.000 (huỷ muộn).
    expect(d(after.platform.total, before.platform.total)).toBe(650_000);
    expect(d(after.platform.subscriptionsCollected, before.platform.subscriptionsCollected)).toBe(
      300_000,
    );
    expect(d(after.platform.serviceFeeRecognized, before.platform.serviceFeeRecognized)).toBe(
      350_000,
    );

    /*
     * Giữ hộ tăng: 420.000 (hold chưa chốt) + 490.000 (ví: 280.000 + 210.000) + 50.000 (chưa
     * khớp). Hai hold ĐÃ CHỐT không còn ở `holdsUnsettled` — phần của chúng nằm ở ví và ở
     * doanh thu. Cộng cả hai là nhân đôi nghĩa vụ, và con số này khoá đúng điều đó.
     */
    expect(d(after.custodied.holdsUnsettled, before.custodied.holdsUnsettled)).toBe(420_000);
    expect(d(after.custodied.walletTotal, before.custodied.walletTotal)).toBe(490_000);
    expect(d(after.custodied.unmatchedIn, before.custodied.unmatchedIn)).toBe(50_000);
    expect(d(after.custodied.total, before.custodied.total)).toBe(960_000);

    // Tổng nghĩa vụ + doanh thu tăng đúng bằng tiền thật đã vào ngân hàng: 300k + 420k×3 + 50k.
    expect(
      d(after.platform.total, before.platform.total) +
        d(after.custodied.total, before.custodied.total),
    ).toBe(1_610_000);

    // ── Nhập số dư ngân hàng khớp ⇒ chênh lệch bằng 0 ────────────────────
    const eod = Number(after.platform.total) + Number(after.custodied.total);
    const withBalance = await holds.saveBankBalance(
      { date: RECON_DAY, balance: String(eod), note: `spec ${RUN}` },
      ownerId,
    );
    expect(withBalance.bankBalanceEod).toBe(String(eod));
    expect(withBalance.variance).toBe('0');
    expect(withBalance.walletDrift.wallets).toBe(0);
  });
});

describe('Chưa nhập số dư ⇒ CHƯA TÍNH ĐƯỢC, không phải bằng 0', () => {
  maybe('bankBalanceEod và variance đều null cho một ngày chưa ai nhập', async () => {
    // Một ngày khác RECON_DAY và chắc chắn chưa ai nhập số dư cho nó.
    const rec = await holds.dailyReconciliation('2019-06-14');
    expect(rec.bankBalanceEod).toBeNull();
    expect(rec.variance).toBeNull();
  });

  maybe('nhập lại cùng ngày là SỬA, không phải thêm dòng thứ hai', async () => {
    await holds.saveBankBalance({ date: RECON_DAY, balance: '111', note: `spec ${RUN}` }, ownerId);
    const second = await holds.saveBankBalance(
      { date: RECON_DAY, balance: '222', note: `spec ${RUN}` },
      ownerId,
    );
    expect(second.bankBalanceEod).toBe('222');
    expect(await prisma.platformBankBalance.count({ where: { note: `spec ${RUN}` } })).toBe(1);
  });
});

describe('walletDrift — phép kiểm ADR 0023 điều 6', () => {
  maybe('sửa tay wallets.balance bằng SQL thì đối soát BẮT ĐƯỢC', async () => {
    const clean = await holds.dailyReconciliation(RECON_DAY);
    const driftBefore = clean.walletDrift.wallets;

    // Đúng thứ phép này tồn tại để bắt: một đường ghi KHÔNG đi qua `WalletService`.
    await prisma.$executeRaw`UPDATE wallets SET balance = balance + 12345 WHERE id = ${walletId}`;

    const dirty = await holds.dailyReconciliation(RECON_DAY);
    expect(dirty.walletDrift.wallets).toBe(driftBefore + 1);
    expect(Number(dirty.walletDrift.amount)).toBeGreaterThanOrEqual(12345);

    await prisma.$executeRaw`UPDATE wallets SET balance = balance - 12345 WHERE id = ${walletId}`;
    const healed = await holds.dailyReconciliation(RECON_DAY);
    expect(healed.walletDrift.wallets).toBe(driftBefore);
  });
});

describe('Chiều RA: mã XPW nằm cùng không gian tên với XPG/XPH', () => {
  maybe('referenceCodeTarget nhận ra lệnh rút — không còn là tiền tố cục bộ', () => {
    expect(referenceCodeTarget('XPW23456789')).toBe(BANK_MATCH_TARGET_TYPE.WITHDRAWAL_REQUEST);
    expect(referenceCodeTarget('XPH23456789')).toBe(BANK_MATCH_TARGET_TYPE.BOOKING_HOLD);
    expect(referenceCodeTarget('XPG23456789')).toBe(BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_INVOICE);
    return Promise.resolve();
  });

  maybe('lệnh rút ĐÃ CHUYỂN trong ngày nằm ở vế CHI, không trừ vào nghĩa vụ hai lần', async () => {
    const before = await holds.dailyReconciliation(RECON_DAY);

    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
    const amount = new Prisma.Decimal(100_000);
    const withdrawalId = newId();
    await prisma.withdrawalRequest.create({
      data: {
        id: withdrawalId,
        code: `XPW${RUN.toUpperCase()}1`,
        walletId,
        amount,
        status: WITHDRAWAL_STATUS.PAID,
        bankCode: 'VCB',
        bankAccountNumber: '0123456789',
        bankAccountName: 'NGUYEN VAN A',
        requestedByUserId: ownerId,
        paidAt: AT,
        createdAt: AT,
        bankReference: `REF-${RUN}`,
      },
    });
    // Tiền rời ví: bút toán ÂM + giảm số dư, y như `recordWithdrawalPaidWithinTx`.
    await prisma.wallet.update({
      where: { id: walletId },
      data: { balance: { decrement: amount } },
    });
    await prisma.walletEntry.create({
      data: {
        id: newId(),
        walletId,
        kind: WALLET_ENTRY_KIND.WITHDRAWAL,
        sourceType: WALLET_ENTRY_SOURCE.WITHDRAWAL_REQUEST,
        sourceRefId: withdrawalId,
        amount: amount.negated(),
        balanceAfter: wallet.balance.sub(amount),
        createdAt: AT,
      },
    });

    const after = await holds.dailyReconciliation(RECON_DAY);
    // Nghĩa vụ ví giảm đúng 100.000 — tiền đã rời tài khoản nên không còn phải trả ai.
    expect(Number(before.custodied.walletTotal) - Number(after.custodied.walletTotal)).toBe(100_000);
    // Và nó xuất hiện ở vế CHI của ngày.
    expect(
      Number(after.outflow.withdrawalsPaid) - Number(before.outflow.withdrawalsPaid),
    ).toBe(100_000);
    expect(after.walletDrift.wallets).toBe(0);
  });
});

describe('BẤT BIẾN: không nơi nào đọc `purpose` để tách quỹ (ADR 0033 điều 4)', () => {
  it('`dailyReconciliation` không nhắc tới `purpose` ở bất kỳ đâu', () => {
    /*
     * Lệnh cấm ở CLAUDE.md là về một lỗi CỤ THỂ: một hold nay chứa tiền của nhiều người, nên
     * `purpose` (`commission` | `escrow`) không còn trả lời được "phần nào là tiền giữ hộ".
     * Ai đó thêm `FILTER (WHERE purpose = 'commission')` vào phép cộng sẽ làm đối soát im lặng
     * bỏ qua toàn bộ hold tuyến gói. Test đọc CHÍNH mã nguồn của method vì đó là thứ duy nhất
     * chứng minh được một phép cộng KHÔNG dùng tới một cột.
     */
    const source = readFileSync(
      join(__dirname, '../src/modules/holds/booking-holds.service.ts'),
      'utf8',
    );
    const start = source.indexOf('async dailyReconciliation(');
    const end = source.indexOf('async saveBankBalance(');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const body = source.slice(start, end);
    expect(body).not.toMatch(/purpose/i);
    // Và nó PHẢI đọc cột phân bổ đã đóng băng, không phải `service_fee_amount`.
    expect(body).toMatch(/settledPlatformAmount/);
    expect(body).not.toMatch(/serviceFeeAmount/);
  });
});
