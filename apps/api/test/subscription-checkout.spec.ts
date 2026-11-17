import { ConfigService } from '@nestjs/config';
import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BANK_MATCH_STATUS,
  BANK_MATCH_TARGET_TYPE,
  BILLING_MODE,
  PLAN_VEHICLE_SCOPE,
  SUBSCRIPTION_INVOICE_STATUS,
  SUBSCRIPTION_STATUS,
} from '@xeprime/types';
import { SepayService } from '../src/modules/sepay/sepay.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeBankTransactionsService,
  makeBillingService,
  makeBookingExtensionsService,
  makeBookingHoldsService,
} from './helpers/service-factory';

/**
 * Phiếu thanh toán GỘP (ADR 0083) - gói ô tô + gói xe máy trong MỘT lần chuyển khoản.
 *
 * Bất biến khoá ở đây:
 *  1. Phiếu = hai hoá đơn (mỗi loại xe một hoá đơn), tổng phiếu = tổng hai hoá đơn.
 *  2. Tiền đi qua PHIẾU: thiếu ⇒ cả cụm `partially_paid`; đủ ⇒ cả hai gói bật cùng transaction.
 *     Tiền về theo mã của chính hoá đơn con cũng được chuyển sang phiếu.
 *  3. Void một hoá đơn con (mua lại cùng loại xe) kéo cả phiếu và hoá đơn anh em.
 *  4. Hai khoản đủ tiền song song: đúng MỘT lượt kích hoạt (hai thuê bao), không bao giờ bốn.
 *
 * Chạy trên PostgreSQL THẬT: `FOR UPDATE` và advisory lock là thứ không mock được.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const billing = makeBillingService(asService);
const sepay = new SepayService(
  asService,
  billing,
  makeBookingHoldsService(asService),
  { get: () => undefined } as unknown as ConfigService,
  makeBookingExtensionsService(asService),
);
const bankAdmin = makeBankTransactionsService(asService, billing);
/** `bank_transactions` là bảng toàn sàn - mọi dòng của spec này mang tiền tố riêng để dọn. */
const TX_PREFIX = 'checkout-spec-';

const RUN = newId().slice(-8).toLowerCase();

type CreatePlanInput = Parameters<typeof billing.createPlan>[1];

let dbAvailable = false;
let actorId: string;
let tenantId: string;
let carPlanId: string;
let motoPlanId: string;
const planIds: string[] = [];

const CAR_PRICE = 249_000;
const MOTO_PRICE = 149_000;

beforeAll(async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    console.warn('\n[skip] Không kết nối được PostgreSQL. Chạy `pnpm db:up` trước.\n');
    return;
  }

  actorId = newId();
  tenantId = newId();
  await prisma.user.create({
    data: {
      realm: ACCOUNT_REALM.PARTNER,
      id: actorId,
      displayName: 'Checkout Spec',
      email: `checkout-${RUN}@xeprime.test`,
    },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `CheckoutShop-${RUN}`,
      status: 'active',
      ownerUserId: actorId,
    },
  });
  const plan = async (scope: string, price: number) => {
    const input: CreatePlanInput = {
      code: `checkout-${scope}-${RUN}`,
      name: `Gói ${scope} (spec)`,
      billingMode: BILLING_MODE.PACKAGE,
      vehicleScope: scope,
      limits: { maxVehicles: 5, termPrices: [{ months: 1, price: String(price) }] },
    };
    const created = await billing.createPlan(actorId, input);
    planIds.push(created.id);
    return created.id;
  };
  carPlanId = await plan(PLAN_VEHICLE_SCOPE.CAR, CAR_PRICE);
  motoPlanId = await plan(PLAN_VEHICLE_SCOPE.MOTORBIKE, MOTO_PRICE);
});

afterAll(async () => {
  if (dbAvailable) {
    await resetBilling();
    await prisma.bankTransaction.deleteMany({ where: { providerTxId: { startsWith: TX_PREFIX } } });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.plan.deleteMany({ where: { id: { in: planIds } } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: actorId } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

async function resetBilling() {
  await prisma.subscriptionInvoice.deleteMany({ where: { tenantId } });
  await prisma.subscriptionCheckout.deleteMany({ where: { tenantId } });
  await prisma.tenantSubscription.deleteMany({ where: { tenantId } });
}

function checkout() {
  return billing.createCheckout(tenantId, actorId, {
    items: [
      { planId: motoPlanId, termMonths: 1 },
      { planId: carPlanId, termMonths: 1 },
    ],
  });
}

function pay(code: string, amount: number) {
  return prisma.$transaction((tx) =>
    billing.applyCheckoutPaymentWithinTx(tx, {
      code,
      amount: new Prisma.Decimal(amount),
      providerTxId: newId(),
    }),
  );
}

function liveSubscriptions() {
  return prisma.tenantSubscription.findMany({
    where: { tenantId, status: SUBSCRIPTION_STATUS.ACTIVE },
    select: { id: true, vehicleScope: true },
  });
}

describe('createCheckout - một phiếu, mỗi loại xe một hoá đơn', () => {
  maybe(
    'tổng phiếu = tổng hai hoá đơn; hoá đơn con mang mã phiếu, theo thứ tự hiển thị loại xe',
    async () => {
      await resetBilling();
      const created = await checkout();

      expect(created.code.startsWith('XPC')).toBe(true);
      expect(created.status).toBe(SUBSCRIPTION_INVOICE_STATUS.ISSUED);
      expect(Number(created.totalAmount)).toBe(CAR_PRICE + MOTO_PRICE);
      expect(created.invoices.map((i) => i.vehicleScope)).toEqual([
        PLAN_VEHICLE_SCOPE.MOTORBIKE,
        PLAN_VEHICLE_SCOPE.CAR,
      ]);
      for (const invoice of created.invoices) {
        expect(invoice.checkoutId).toBe(created.id);
        expect(invoice.checkoutCode).toBe(created.code);
      }
      const pending = await billing.pendingInvoiceForTenant(tenantId);
      expect(pending.invoices.every((i) => i.checkoutCode === created.code)).toBe(true);
    },
  );

  maybe('hai phần tử cùng loại xe bị từ chối, không sinh hoá đơn nào', async () => {
    await resetBilling();
    await expect(
      billing.createCheckout(tenantId, actorId, {
        items: [
          { planId: carPlanId, termMonths: 1 },
          { planId: carPlanId, termMonths: 1 },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
    expect(await prisma.subscriptionInvoice.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.subscriptionCheckout.count({ where: { tenantId } })).toBe(0);
  });

  maybe('mua lại riêng gói ô tô: void cả phiếu và hoá đơn xe máy anh em', async () => {
    await resetBilling();
    const created = await checkout();
    await billing.purchase(tenantId, actorId, { planId: carPlanId, termMonths: 1 });

    const row = await prisma.subscriptionCheckout.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe(SUBSCRIPTION_INVOICE_STATUS.VOID);
    const members = await prisma.subscriptionInvoice.findMany({
      where: { checkoutId: created.id },
    });
    expect(members.every((m) => m.status === SUBSCRIPTION_INVOICE_STATUS.VOID)).toBe(true);
  });
});

describe('applyCheckoutPaymentWithinTx - tiền đi qua phiếu', () => {
  maybe('thiếu ⇒ cả cụm partially_paid, mua lại bị chặn bằng MÃ PHIẾU', async () => {
    await resetBilling();
    const created = await checkout();
    const applied = await pay(created.code, 100_000);
    expect(applied.outcome).toBe('partial');

    const members = await prisma.subscriptionInvoice.findMany({
      where: { checkoutId: created.id },
    });
    expect(members.every((m) => m.status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID)).toBe(
      true,
    );
    expect(members.every((m) => m.expiresAt === null)).toBe(true);
    await expect(
      billing.purchase(tenantId, actorId, { planId: carPlanId, termMonths: 1 }),
    ).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.SUBSCRIPTION_INVOICE_PARTIALLY_PAID,
        details: { code: created.code },
      },
    });
    expect(await liveSubscriptions()).toHaveLength(0);
  });

  maybe('đủ ⇒ phiếu paid, mỗi hoá đơn con paid đúng tổng của nó, bật HAI gói', async () => {
    await resetBilling();
    const created = await checkout();
    await pay(created.code, 100_000);
    const applied = await pay(created.code, CAR_PRICE + MOTO_PRICE - 100_000);
    expect(applied.outcome).toBe('activated');

    const row = await prisma.subscriptionCheckout.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.status).toBe(SUBSCRIPTION_INVOICE_STATUS.PAID);
    const members = await prisma.subscriptionInvoice.findMany({
      where: { checkoutId: created.id },
    });
    for (const member of members) {
      expect(member.status).toBe(SUBSCRIPTION_INVOICE_STATUS.PAID);
      expect(member.paidAmount.toString()).toBe(member.totalAmount.toString());
      expect(member.subscriptionId).not.toBeNull();
    }
    const subs = await liveSubscriptions();
    expect(subs.map((s) => s.vehicleScope).sort()).toEqual(
      [PLAN_VEHICLE_SCOPE.CAR, PLAN_VEHICLE_SCOPE.MOTORBIKE].sort(),
    );

    // Tiền về lần nữa: bằng chứng chênh lệch trên PHIẾU, không bật thêm gì.
    expect((await pay(created.code, 5_000)).outcome).toBe('already_paid');
    expect(await liveSubscriptions()).toHaveLength(2);
  });

  maybe('tiền về theo mã của HOÁ ĐƠN CON được chuyển sang phiếu', async () => {
    await resetBilling();
    const created = await checkout();
    const member = created.invoices[0]!;
    const applied = await prisma.$transaction((tx) =>
      billing.applyBankPaymentWithinTx(tx, {
        code: member.code,
        amount: new Prisma.Decimal(CAR_PRICE + MOTO_PRICE),
        providerTxId: newId(),
      }),
    );
    expect(applied.outcome).toBe('activated');
    expect(await liveSubscriptions()).toHaveLength(2);
  });

  maybe('phiếu đã void không nhận tiền', async () => {
    await resetBilling();
    const created = await checkout();
    await billing.purchase(tenantId, actorId, { planId: motoPlanId, termMonths: 1 });
    const applied = await pay(created.code, CAR_PRICE + MOTO_PRICE);
    expect(applied).toMatchObject({
      outcome: 'checkout_closed',
      status: SUBSCRIPTION_INVOICE_STATUS.VOID,
    });
    expect(await liveSubscriptions()).toHaveLength(0);
  });

  maybe('hai khoản đủ tiền song song: đúng một lượt kích hoạt', async () => {
    await resetBilling();
    const created = await checkout();
    const results = await Promise.all([
      pay(created.code, CAR_PRICE + MOTO_PRICE),
      pay(created.code, CAR_PRICE + MOTO_PRICE),
    ]);
    expect(results.map((r) => r.outcome).sort()).toEqual(['activated', 'already_paid']);
    expect(await liveSubscriptions()).toHaveLength(2);
  });
});

/**
 * ĐƯỜNG WEBHOOK SePay với mã của HOÁ ĐƠN CON (ADR 0083). Khách nhìn nhầm thẻ, chuyển từng khoản theo
 * mã `XPG` của từng gói: tiền phải dồn vào PHIẾU (không bật lẻ một gói khi khách mua hai), đủ tổng
 * thì cả hai bật, và sổ ngân hàng của admin nói "đã khớp vào" mã PHIẾU - nơi tiền thật sự nằm.
 */
describe('webhook SePay - chuyển theo mã hoá đơn con', () => {
  maybe('hai khoản theo hai mã con: khoản đầu dồn vào phiếu (chưa bật gì), khoản sau đủ ⇒ bật cả hai', async () => {
    await resetBilling();
    const created = await checkout();
    const car = created.invoices.find((i) => i.vehicleScope === PLAN_VEHICLE_SCOPE.CAR)!;
    const moto = created.invoices.find((i) => i.vehicleScope === PLAN_VEHICLE_SCOPE.MOTORBIKE)!;
    const ingest = (code: string, amount: number) =>
      sepay.ingest({
        id: `${TX_PREFIX}${newId()}`,
        gateway: 'MBBank',
        transactionDate: '2026-11-09 10:15:00',
        accountNumber: '0000111122',
        content: `CK ${code} thanh toan`,
        transferType: 'in',
        transferAmount: amount,
        accumulated: 0,
        referenceCode: 'FT123',
      });

    const first = await ingest(car.code, CAR_PRICE);
    expect(first).toMatchObject({ matched: true, note: 'partial' });
    expect(await liveSubscriptions()).toHaveLength(0);
    const partial = await prisma.subscriptionCheckout.findUniqueOrThrow({ where: { id: created.id } });
    expect(partial.status).toBe(SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID);
    expect(partial.paidAmount.toNumber()).toBe(CAR_PRICE);
    // Hoá đơn con chỉ đổi trạng thái - số đã nhận nằm ở PHIẾU (thẻ chờ phía web đọc từ phiếu).
    const carRow = await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: car.id } });
    expect(carRow.paidAmount.toNumber()).toBe(0);

    const second = await ingest(moto.code, MOTO_PRICE);
    expect(second).toMatchObject({ matched: true, note: 'activated' });
    expect(await liveSubscriptions()).toHaveLength(2);

    const rows = await prisma.bankTransaction.findMany({
      where: { providerTxId: { startsWith: TX_PREFIX } },
      select: { id: true, matchStatus: true, matchedType: true, referenceCode: true },
    });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.matchStatus).toBe(BANK_MATCH_STATUS.MATCHED);
      expect(row.matchedType).toBe(BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_INVOICE);
      // Sổ admin: mã khách gõ giữ nguyên, "đã khớp vào" là mã PHIẾU.
      const detail = await bankAdmin.getOne(row.id);
      expect([car.code, moto.code]).toContain(detail.referenceCode);
      expect(detail.matchedInvoiceCode).toBe(created.code);
    }
  });
});
