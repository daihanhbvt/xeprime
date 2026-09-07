import { ConfigService } from '@nestjs/config';
import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BANK_MATCH_STATUS,
  BILLING_MODE,
  PLAN_STATUS,
  SUBSCRIPTION_INVOICE_STATUS,
  TENANT_STATUS,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { BankTransactionsService } from '../src/modules/sepay/bank-transactions.service';
import { SepayService } from '../src/modules/sepay/sepay.service';
import type { BillingService } from '../src/modules/billing/billing.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeBillingService } from './helpers/service-factory';

/**
 * Hàng đợi đối soát + KHỚP TAY của admin (R2 mục 4, ADR 0022 điều 4) — PostgreSQL THẬT.
 *
 * Đây là đường duy nhất để tiền "về mà không ghi mã" trở thành một gói được mở mà admin KHÔNG
 * phải sửa database — tức là chính điều kiện của gate R2. Bốn thứ được khoá:
 *
 *  1. **Không bao giờ tự khớp**: gợi ý có sắp xếp, nhưng số tiền trùng khớp cũng không tự gán.
 *  2. **Khớp tay đi CHUNG đường tiền với webhook** — cùng `applyBankPaymentWithinTx`, nên
 *     thiếu/đủ/thừa hành xử y hệt và gói mở đúng một lần.
 *  3. **Hai admin bấm cùng lúc: đúng một người thắng**, không cộng tiền hai lần.
 *  4. **Mọi dòng `manual`/`ignored` đều có người và lý do** — audit ghi lại được.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const billing: BillingService = makeBillingService(asService);
const admin = new BankTransactionsService(asService, new AuditService(asService), billing);

const sepay = new SepayService(asService, billing, {
  get: () => 'test-key-0123456789abcdef',
} as unknown as ConfigService);

let dbAvailable = false;
let ownerId: string;
let adminId: string;
let tenantId: string;
let planId: string;
let txCounter = 0;

/**
 * Tiền tố mã giao dịch RIÊNG của spec này.
 *
 * `bank_transactions` là bảng TOÀN SÀN — không có `tenant_id` để lọc (ADR 0022 điều 2). Jest
 * chạy 4 worker song song (`jest.config.js`) và `sepay-webhook.spec.ts` cũng ghi vào đúng bảng
 * này, nên mọi khẳng định kiểu "cả bảng có N dòng" là một lời nói dối phụ thuộc lịch xếp worker.
 * Ở đây xoá theo tiền tố, và khẳng định theo TƯ CÁCH THÀNH VIÊN của đúng dòng đang xét
 * (`toContain(tx.id)`) thay vì theo độ dài danh sách — vốn cũng là điều mỗi test thật sự muốn nói.
 */
const TX_PREFIX = 'adm-';

/** Chỉ những dòng do spec này tạo ra. */
const ownRows = { providerTxId: { startsWith: TX_PREFIX } } as const;

function payload(over: Record<string, unknown> = {}): Record<string, unknown> {
  txCounter += 1;
  return {
    id: `${TX_PREFIX}${txCounter}-${newId().slice(-6)}`,
    transferType: 'in',
    transferAmount: 300_000,
    content: 'chuyen tien khong ghi ma',
    transactionDate: '2026-09-04 09:00:00',
    ...over,
  };
}

const issueInvoice = () =>
  billing.purchase(tenantId, ownerId, {
    planId,
    termMonths: 3,
    slots: { car: 1, motorbike: 0 },
  });

/** Giao dịch KHÔNG rút được mã — đúng ca mà hàng đợi admin sinh ra để giải. */
async function unmatchedTx(amount: number) {
  const body = payload({ transferAmount: amount });
  await sepay.ingest(body);
  // Tra theo ĐÚNG mã vừa gửi, không phải "dòng mới nhất": dòng mới nhất của cả bảng có thể là
  // của spec khác đang chạy song song (xem docblock của `TX_PREFIX`).
  return prisma.bankTransaction.findFirstOrThrow({
    where: { providerTxId: String(body['id']) },
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
  adminId = newId();
  tenantId = newId();
  planId = newId();

  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
  });
  await prisma.user.create({
    data: { id: adminId, displayName: 'Nhân viên tài chính', email: `fin-${adminId}@xeprime.test` },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: 'Shop Đối Soát',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: 'shop_owner',
      status: 'active',
      joinedAt: new Date(),
    },
  });
  await prisma.plan.create({
    data: {
      id: planId,
      code: `adm-test-${planId.slice(-6).toLowerCase()}`,
      name: 'Gói test đối soát',
      billingMode: BILLING_MODE.PACKAGE,
      basePriceMonthly: new Prisma.Decimal(0),
      status: PLAN_STATUS.ACTIVE,
      price: 0,
      durationDays: 30,
      limitsJson: {
        perVehiclePrice: { car: '100000', motorbike: '40000' },
        includedCars: 0,
        includedMotorbikes: 0,
        maxCars: null,
        maxMotorbikes: null,
        maxMembers: null,
        maxBranches: null,
        terms: [{ months: 3, discountPercent: 0 }],
        graceDays: 7,
        features: [],
      } as unknown as Prisma.InputJsonValue,
    },
  });
});

afterEach(async () => {
  if (!dbAvailable) return;
  await prisma.bankTransaction.deleteMany({ where: ownRows });
  await prisma.auditLog.deleteMany({ where: { targetType: 'bank_transaction' } });
  await prisma.subscriptionInvoice.deleteMany({ where: { tenantId } });
  await prisma.tenantSubscription.deleteMany({ where: { tenantId } });
  await prisma.notification.deleteMany({ where: { tenantId } });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.bankTransaction.deleteMany({ where: ownRows });
    await prisma.auditLog.deleteMany({ where: { targetType: 'bank_transaction' } });
    await prisma.subscriptionInvoice.deleteMany({ where: { tenantId } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId } });
    await prisma.notification.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.plan.deleteMany({ where: { id: planId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, adminId] } } });
  }
  await prisma.$disconnect();
});

describe('Hàng đợi', () => {
  it('mặc định chỉ trả giao dịch CHƯA KHỚP, mới nhất trước', async () => {
    if (!dbAvailable) return;
    const older = await unmatchedTx(300_000);
    const newer = await unmatchedTx(500_000);

    const page = await admin.list({});
    // Lọc về dòng của spec này rồi mới xét thứ tự: khẳng định trên toàn bảng sẽ vỡ khi
    // `sepay-webhook.spec.ts` chạy song song (xem docblock của `TX_PREFIX`).
    const mine = page.data.filter((r) => r.providerTxId.startsWith(TX_PREFIX));
    expect(mine.map((r) => r.id)).toEqual([newer.id, older.id]);
    expect(page.data.every((r) => r.matchStatus === BANK_MATCH_STATUS.UNMATCHED)).toBe(true);
    expect(mine[0]!.amountIn).toBe('500000');
    // Danh sách KHÔNG mang payload gốc — nó chỉ mở ở màn chi tiết.
    expect(mine[0]).not.toHaveProperty('rawJson');
  });

  it('gợi ý sắp hoá đơn khớp số tiền lên đầu — nhưng KHÔNG tự khớp (ADR 0022 điều 4)', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const tx = await unmatchedTx(Number(invoice.totalAmount));

    const detail = await admin.getOne(tx.id);
    expect(detail.suggestions[0]!.code).toBe(invoice.code);
    expect(detail.suggestions[0]!.amountMatches).toBe(true);
    expect(detail.rawJson).toBeTruthy();

    // Số tiền trùng khớp tuyệt đối và chỉ có MỘT hoá đơn chờ — vẫn phải đứng im.
    expect(detail.matchStatus).toBe(BANK_MATCH_STATUS.UNMATCHED);
    const after = await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.paidAmount.toString()).toBe('0');
    expect(await prisma.tenantSubscription.count({ where: { tenantId } })).toBe(0);
  });
});

describe('Khớp tay', () => {
  it('đủ tiền: gói MỞ, dòng thành `manual` kèm người và lý do, audit ghi lại', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const tx = await unmatchedTx(Number(invoice.totalAmount));

    const result = await admin.match(tx.id, adminId, {
      invoiceId: invoice.id,
      note: 'Khách quên ghi mã, đã gọi xác nhận',
    });

    expect(result.matchStatus).toBe(BANK_MATCH_STATUS.MANUAL);
    expect(result.matchedByName).toBe('Nhân viên tài chính');
    expect(result.matchNote).toContain('quên ghi mã');
    expect(result.matchedInvoiceCode).toBe(invoice.code);

    const after = await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.status).toBe(SUBSCRIPTION_INVOICE_STATUS.PAID);
    expect(await prisma.tenantSubscription.count({ where: { tenantId } })).toBe(1);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { targetType: 'bank_transaction', targetId: tx.id },
    });
    expect(audit.action).toBe('bank_transaction.match_manual');
    expect(audit.actorUserId).toBe(adminId);
    expect(audit.actorScope).toBe('platform');
  });

  /** Khớp tay và webhook dùng CHUNG `applyBankPaymentWithinTx`, nên luật thiếu tiền phải y hệt. */
  it('thiếu tiền: hoá đơn `partially_paid`, KHÔNG mở gói', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const tx = await unmatchedTx(Math.floor(Number(invoice.totalAmount) / 2));

    await admin.match(tx.id, adminId, { invoiceId: invoice.id, note: 'chuyển thiếu' });

    const after = await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.status).toBe(SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID);
    expect(await prisma.tenantSubscription.count({ where: { tenantId } })).toBe(0);
  });

  it('hai admin bấm cùng lúc: đúng MỘT người thắng, không cộng tiền hai lần', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const tx = await unmatchedTx(Number(invoice.totalAmount));

    const results = await Promise.allSettled([
      admin.match(tx.id, adminId, { invoiceId: invoice.id, note: 'A' }),
      admin.match(tx.id, ownerId, { invoiceId: invoice.id, note: 'B' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

    const after = await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.paidAmount.toString()).toBe(after.totalAmount.toString());
    expect(await prisma.tenantSubscription.count({ where: { tenantId } })).toBe(1);
  });

  it('giao dịch đã xử lý rồi thì không khớp lại được', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const tx = await unmatchedTx(Number(invoice.totalAmount));
    await admin.match(tx.id, adminId, { invoiceId: invoice.id, note: 'lần đầu' });

    await expect(
      admin.match(tx.id, adminId, { invoiceId: invoice.id, note: 'lần hai' }),
    ).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.BANK_TX_ALREADY_HANDLED },
    });
  });

  it('hoá đơn đã VOID: từ chối, không mở lại hoá đơn chết', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const tx = await unmatchedTx(Number(invoice.totalAmount));
    await prisma.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: { status: SUBSCRIPTION_INVOICE_STATUS.VOID },
    });

    await expect(
      admin.match(tx.id, adminId, { invoiceId: invoice.id, note: 'thử khớp vào hoá đơn chết' }),
    ).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.BANK_TX_TARGET_NOT_PAYABLE,
        details: { invoiceStatus: SUBSCRIPTION_INVOICE_STATUS.VOID },
      },
    });
    // Và giao dịch vẫn còn trong hàng đợi để xử lý cách khác.
    const still = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(still.matchStatus).toBe(BANK_MATCH_STATUS.UNMATCHED);
  });

  it('hoá đơn không tồn tại: 404, giao dịch không bị đánh dấu', async () => {
    if (!dbAvailable) return;
    const tx = await unmatchedTx(300_000);
    await expect(
      admin.match(tx.id, adminId, { invoiceId: newId(), note: 'sai id' }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.NOT_FOUND } });

    const still = await prisma.bankTransaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(still.matchStatus).toBe(BANK_MATCH_STATUS.UNMATCHED);
  });
});

describe('Bỏ qua', () => {
  it('giữ nguyên dòng, ghi người + lý do, và rời khỏi hàng đợi mặc định', async () => {
    if (!dbAvailable) return;
    const tx = await unmatchedTx(77_000);

    const result = await admin.ignore(tx.id, adminId, { note: 'Tiền chuyển nhầm, đã hoàn tay' });
    expect(result.matchStatus).toBe(BANK_MATCH_STATUS.IGNORED);
    expect(result.matchedByName).toBe('Nhân viên tài chính');

    // Dòng KHÔNG bị xoá — sổ ngân hàng là bằng chứng.
    expect(await prisma.bankTransaction.count({ where: ownRows })).toBe(1);
    // Rời hàng đợi mặc định, nhưng vẫn tra được bằng bộ lọc `ignored`.
    expect((await admin.list({})).data.map((r) => r.id)).not.toContain(tx.id);
    expect(
      (await admin.list({ matchStatus: BANK_MATCH_STATUS.IGNORED })).data.map((r) => r.id),
    ).toContain(tx.id);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { targetType: 'bank_transaction', targetId: tx.id },
    });
    expect(audit.action).toBe('bank_transaction.ignore');
  });
});
