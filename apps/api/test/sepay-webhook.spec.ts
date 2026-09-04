import { ConfigService } from '@nestjs/config';
import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BANK_MATCH_STATUS,
  BILLING_MODE,
  PLAN_STATUS,
  SUBSCRIPTION_INVOICE_STATUS,
  SUBSCRIPTION_STATUS,
  TENANT_STATUS,
} from '@xeprime/types';
import { SepayService } from '../src/modules/sepay/sepay.service';
import type { BillingService } from '../src/modules/billing/billing.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeBillingService } from './helpers/service-factory';

/**
 * Đường tiền SePay → hoá đơn gói → kích hoạt — chạy trên PostgreSQL THẬT (R2, ADR 0016/0022).
 *
 * Đây là endpoint công khai DUY NHẤT có quyền ghi tiền, nên thứ được khoá ở đây toàn là những
 * điều mà hỏng thì hỏng thành TIỀN:
 *
 *  1. **Webhook bắn lại không cộng tiền hai lần** — unique DB là người gác, không phải check app.
 *  2. **Thiếu tiền thì KHÔNG mở gói**, mã giữ nguyên để chuyển bù; đủ rồi mới mở, và mở đúng MỘT lần
 *     kể cả khi hai giao dịch đủ-tiền chạy song song.
 *  3. **Không rút được mã / mã chết thì KHÔNG đoán** — nằm ở hàng đợi chưa khớp cho admin.
 *  4. **Sai khoá là đứng ngoài cửa**, và chưa cấu hình là 503 fail-closed.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const billing: BillingService = makeBillingService(asService);

const API_KEY = 'test-sepay-key-0123456789abcdef';
const config = {
  get: (key: string) => (key === 'SEPAY_API_KEY' ? API_KEY : undefined),
} as unknown as ConfigService;
const sepay = new SepayService(asService, billing, config);

/** Bản không cấu hình — kiểm fail-closed. */
const sepayUnconfigured = new SepayService(asService, billing, {
  get: () => undefined,
} as unknown as ConfigService);

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let planId: string;

let txCounter = 0;

/** Payload đúng định dạng SePay gửi; mỗi lượt gọi một mã giao dịch mới trừ khi ép trùng. */
function payload(over: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  txCounter += 1;
  return {
    id: `sepay-${txCounter}-${newId().slice(-6)}`,
    gateway: 'MBBank',
    transactionDate: '2026-09-03 10:15:00',
    accountNumber: '0000111122',
    content: 'thanh toan goi',
    transferType: 'in',
    transferAmount: 100_000,
    accumulated: 0,
    referenceCode: 'FT123',
    ...over,
  };
}

/** Mua gói cho tenant test — trả về hoá đơn `issued` + mã XPG thật. */
async function issueInvoice(termMonths = 3) {
  return billing.purchase(tenantId, ownerId, {
    planId,
    termMonths,
    slots: { car: 5, motorbike: 0 },
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
  planId = newId();

  await prisma.user.create({
    data: { id: ownerId, displayName: 'Chủ shop', email: `own-${ownerId}@xeprime.test` },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: 'Shop SePay',
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  // Chủ shop là thành viên active — thiếu thì thông báo kích hoạt không có ai để nhận,
  // và tenant không membership là một fixture không có thật.
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
      code: `sepay-test-${planId.slice(-6).toLowerCase()}`,
      name: 'Gói test SePay',
      billingMode: BILLING_MODE.PACKAGE,
      basePriceMonthly: new Prisma.Decimal(1_000_000),
      status: PLAN_STATUS.ACTIVE,
      price: 0,
      durationDays: 30,
      limitsJson: {
        perVehiclePrice: { car: '100000', motorbike: '40000' },
        includedCars: 5,
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
  await prisma.bankTransaction.deleteMany({});
  await prisma.subscriptionInvoice.deleteMany({ where: { tenantId } });
  await prisma.tenantSubscription.deleteMany({ where: { tenantId } });
  await prisma.notification.deleteMany({ where: { tenantId } });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.bankTransaction.deleteMany({});
    await prisma.subscriptionInvoice.deleteMany({ where: { tenantId } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId } });
    await prisma.notification.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.plan.deleteMany({ where: { id: planId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
  }
  await prisma.$disconnect();
});

describe('Khoá webhook', () => {
  it('chưa cấu hình: 503 fail-closed, không nhận tiền mù', () => {
    expect(() => sepayUnconfigured.assertApiKey(`Apikey ${API_KEY}`)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({ code: API_ERROR_CODE.SEPAY_NOT_CONFIGURED }),
      }),
    );
  });

  it('sai khoá / thiếu header: 401, không kèm chi tiết', () => {
    for (const bad of [undefined, 'Apikey sai-khoa-nhung-du-dai-16-ky-tu', `Bearer ${API_KEY}`]) {
      expect(() => sepay.assertApiKey(bad)).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({ code: API_ERROR_CODE.SEPAY_SIGNATURE_INVALID }),
        }),
      );
    }
  });

  it('đúng khoá: đi qua (không phân biệt hoa thường ở chữ Apikey)', () => {
    expect(() => sepay.assertApiKey(`Apikey ${API_KEY}`)).not.toThrow();
    expect(() => sepay.assertApiKey(`apikey ${API_KEY}`)).not.toThrow();
  });
});

describe('Ghi thô và idempotency', () => {
  it('giao dịch không rút được mã: nằm ở hàng đợi chưa khớp, KHÔNG đoán theo số tiền', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();

    // Số tiền TRÙNG KHỚP hoá đơn duy nhất đang chờ — cám dỗ đoán lớn nhất, và vẫn phải đứng im.
    const result = await sepay.ingest(
      payload({ content: 'chuyen tien khong ghi ma', transferAmount: Number(invoice.totalAmount) }),
    );
    expect(result).toMatchObject({ received: true, duplicate: false, matched: false });

    const row = await prisma.bankTransaction.findFirstOrThrow({});
    expect(row.matchStatus).toBe(BANK_MATCH_STATUS.UNMATCHED);
    expect(row.referenceCode).toBeNull();

    const after = await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.status).toBe(SUBSCRIPTION_INVOICE_STATUS.ISSUED);
    expect(after.paidAmount.toString()).toBe('0');
  });

  it('webhook bắn LẠI cùng mã giao dịch: 200 duplicate, tiền không cộng hai lần', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const body = payload({
      content: `Thanh toan ${invoice.code}`,
      transferAmount: Number(invoice.totalAmount),
    });

    const first = await sepay.ingest(body);
    const second = await sepay.ingest(body);

    expect(first).toMatchObject({ duplicate: false, matched: true, note: 'activated' });
    expect(second).toMatchObject({ duplicate: true, matched: false });

    expect(await prisma.bankTransaction.count()).toBe(1);
    const after = await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.paidAmount.toString()).toBe(after.totalAmount.toString());
    expect(await prisma.tenantSubscription.count({ where: { tenantId } })).toBe(1);
  });

  it('hai webhook CÙNG mã giao dịch chạy song song: đúng một dòng, đúng một gói', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const body = payload({
      content: invoice.code,
      transferAmount: Number(invoice.totalAmount),
    });

    const results = await Promise.all([sepay.ingest(body), sepay.ingest(body)]);
    expect(results.filter((r) => r.duplicate)).toHaveLength(1);
    expect(await prisma.bankTransaction.count()).toBe(1);
    expect(await prisma.tenantSubscription.count({ where: { tenantId } })).toBe(1);
  });

  it('payload hỏng / tiền chiều RA: 200 kèm cờ bỏ qua, không 5xx cho SePay retry mãi', async () => {
    if (!dbAvailable) return;
    expect(await sepay.ingest(null)).toMatchObject({ received: true, matched: false });
    expect(await sepay.ingest(payload({ transferType: 'out' }))).toMatchObject({
      received: true,
      matched: false,
      note: 'transfer_out_ignored',
    });
    expect(await sepay.ingest(payload({ transferAmount: -5000 }))).toMatchObject({
      received: true,
      note: 'invalid_amount',
    });
    expect(await prisma.bankTransaction.count()).toBe(0);
  });
});

describe('Thiếu / đủ / thừa tiền (ADR 0016 điều 6)', () => {
  it('chuyển THIẾU: partially_paid, KHÔNG mở gói, mã còn sống để chuyển bù', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const half = Math.floor(Number(invoice.totalAmount) / 2);

    const result = await sepay.ingest(payload({ content: invoice.code, transferAmount: half }));
    expect(result).toMatchObject({ matched: true, note: 'partial' });

    const after = await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.status).toBe(SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID);
    expect(after.paidAmount.toString()).toBe(String(half));
    // Hoá đơn đã có tiền thật thì job lật `void` phải THÔI đụng vào — hạn bị xoá.
    expect(after.expiresAt).toBeNull();
    expect(await prisma.tenantSubscription.count({ where: { tenantId } })).toBe(0);
  });

  it('chuyển bù đủ: gói mở, kỳ THẬT chốt lúc kích hoạt, hoá đơn nối vào gói', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice(3);
    const total = Number(invoice.totalAmount);
    const part = 70_000;

    await sepay.ingest(payload({ content: invoice.code, transferAmount: part }));
    const second = await sepay.ingest(
      payload({ content: `bu them ${invoice.code}`, transferAmount: total - part }),
    );
    expect(second).toMatchObject({ matched: true, note: 'activated' });

    const after = await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.status).toBe(SUBSCRIPTION_INVOICE_STATUS.PAID);
    expect(after.paidAt).not.toBeNull();

    const sub = await prisma.tenantSubscription.findFirstOrThrow({ where: { tenantId } });
    expect(sub.status).toBe(SUBSCRIPTION_STATUS.ACTIVE);
    expect(sub.termMonths).toBe(3);
    expect(sub.planId).toBe(planId);
    expect(sub.price.toString()).toBe(after.totalAmount.toString());
    expect(sub.billingMode).toBe(BILLING_MODE.PACKAGE);
    // Kỳ thật của hoá đơn = kỳ của gói nó mở (docblock activateFromInvoiceWithinTx).
    expect(after.subscriptionId).toBe(sub.id);
    expect(after.periodFrom.toISOString()).toBe(sub.startsAt.toISOString());
    expect(after.periodTo.toISOString()).toBe(sub.endsAt.toISOString());

    // Gian hàng được BÁO — kích hoạt do webhook, người dùng có thể không quay lại trang.
    const notified = await prisma.notification.count({
      where: { tenantId, type: 'subscription_activated' },
    });
    expect(notified).toBeGreaterThan(0);
  });

  it('chuyển THỪA một lần: gói vẫn mở đúng một lần, phần dư nằm lại làm bằng chứng', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const over = Number(invoice.totalAmount) + 50_000;

    const result = await sepay.ingest(payload({ content: invoice.code, transferAmount: over }));
    expect(result).toMatchObject({ matched: true, note: 'activated' });

    const after = await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.paidAmount.toString()).toBe(String(over));
    expect(after.status).toBe(SUBSCRIPTION_INVOICE_STATUS.PAID);
    expect(await prisma.tenantSubscription.count({ where: { tenantId } })).toBe(1);
  });

  it('tiền về cho hoá đơn ĐÃ TRẢ ĐỦ: ghi nhận overpaid, không mở gói thứ hai', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const total = Number(invoice.totalAmount);

    await sepay.ingest(payload({ content: invoice.code, transferAmount: total }));
    const extra = await sepay.ingest(payload({ content: invoice.code, transferAmount: 30_000 }));
    expect(extra).toMatchObject({ matched: true, note: 'already_paid' });

    const rows = await prisma.bankTransaction.findMany({ orderBy: { createdAt: 'asc' } });
    expect(rows[1]!.matchNote).toBe('overpaid');
    expect(await prisma.tenantSubscription.count({ where: { tenantId } })).toBe(1);
  });

  it('hai giao dịch ĐỦ TIỀN chạy song song: đúng MỘT gói được mở', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const total = Number(invoice.totalAmount);

    const results = await Promise.all([
      sepay.ingest(payload({ content: invoice.code, transferAmount: total })),
      sepay.ingest(payload({ content: invoice.code, transferAmount: total })),
    ]);
    // Một bên activated; bên kia partial-rồi-thấy-đã-trả hoặc already_paid tuỳ thứ tự khoá hàng.
    expect(results.filter((r) => r.note === 'activated')).toHaveLength(1);
    expect(await prisma.tenantSubscription.count({ where: { tenantId } })).toBe(1);
  });
});

describe('Mã chết và mã lạ', () => {
  it('mã đúng định dạng nhưng không có hoá đơn: chưa khớp, note invoice_not_found', async () => {
    if (!dbAvailable) return;
    const result = await sepay.ingest(payload({ content: 'XPG23456789' }));
    expect(result).toMatchObject({ matched: false, note: 'invoice_not_found' });

    const row = await prisma.bankTransaction.findFirstOrThrow({});
    expect(row.matchStatus).toBe(BANK_MATCH_STATUS.UNMATCHED);
    expect(row.referenceCode).toBe('XPG23456789');
  });

  it('tiền về cho hoá đơn đã VOID: đứng im chờ admin, không tự cộng vào đâu', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    await prisma.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: { status: SUBSCRIPTION_INVOICE_STATUS.VOID },
    });

    const result = await sepay.ingest(
      payload({ content: invoice.code, transferAmount: Number(invoice.totalAmount) }),
    );
    expect(result).toMatchObject({ matched: false, note: 'invoice_void' });

    const after = await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.paidAmount.toString()).toBe('0');
    expect(await prisma.tenantSubscription.count({ where: { tenantId } })).toBe(0);
  });

  it('rút mã từ nội dung bị ngân hàng bọc thêm: viết liền, chữ thường, có tiền tố rác', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();

    const result = await sepay.ingest(
      payload({
        content: `MBVCB.1234567.${invoice.code.toLowerCase()}.CT tu 0123 toi 9999`,
        transferAmount: Number(invoice.totalAmount),
      }),
    );
    expect(result).toMatchObject({ matched: true, note: 'activated' });
  });
});
