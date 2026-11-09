import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  BILLING_MODE,
  PLAN_PURCHASE_KIND,
  PLAN_VEHICLE_SCOPE,
  SUBSCRIPTION_CHANGE_TIMING,
  SUBSCRIPTION_STATUS,
} from '@xeprime/types';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeBillingService } from './helpers/service-factory';

/**
 * Gian hàng TỰ MUA gói — thời điểm áp dụng do server suy (ADR 0084), không do người mua chọn.
 *
 *  1. Cùng bậc ⇒ gia hạn nối tiếp, kể cả khi client gửi `timing: now` — kỳ đang chạy giữ nguyên.
 *  2. Trần xe cao hơn mọi kỳ còn hạn ⇒ nâng ngay khi tiền về, các kỳ cũ cùng loại xe kết thúc.
 *  3. Hạ bậc ⇒ nối tiếp sau kỳ cao.
 *  4. Hoá đơn cũ còn mang `timing: now` trong snapshot ⇒ lúc tiền về vẫn suy lại.
 *  5. Xem trước nói đúng loại lượt mua, kỳ dự kiến và các kỳ sẽ kết thúc.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const billing = makeBillingService(asService);

const RUN = newId().slice(-8).toLowerCase();

type CreatePlanInput = Parameters<typeof billing.createPlan>[1];

let dbAvailable = false;
let actorId: string;
let tenantId: string;
let car1: string;
let car5: string;
let moto1: string;
const planIds: string[] = [];

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
      displayName: 'Self-serve Spec',
      email: `self-serve-${RUN}@xeprime.test`,
    },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `SelfServeShop-${RUN}`,
      status: 'active',
      ownerUserId: actorId,
    },
  });
  const plan = async (key: string, scope: string, maxVehicles: number, price: number) => {
    const input: CreatePlanInput = {
      code: `self-${key}-${RUN}`,
      name: `Gói ${key} (spec)`,
      billingMode: BILLING_MODE.PACKAGE,
      vehicleScope: scope,
      limits: {
        maxVehicles,
        termPrices: [
          { months: 1, price: String(price) },
          { months: 3, price: String(price * 3) },
        ],
      },
    };
    const created = await billing.createPlan(actorId, input);
    planIds.push(created.id);
    return created.id;
  };
  car1 = await plan('car1', PLAN_VEHICLE_SCOPE.CAR, 1, 99_000);
  car5 = await plan('car5', PLAN_VEHICLE_SCOPE.CAR, 5, 299_000);
  moto1 = await plan('moto1', PLAN_VEHICLE_SCOPE.MOTORBIKE, 1, 49_000);
});

afterAll(async () => {
  if (dbAvailable) {
    await resetBilling();
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.plan.deleteMany({ where: { id: { in: planIds } } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: actorId } });
  }
  await prisma.$disconnect();
});

beforeEach(async () => {
  if (dbAvailable) await resetBilling();
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

/** Mua + trả đủ ⇒ id kỳ vừa bật. */
async function buyAndPay(
  planId: string,
  termMonths = 1,
  timing?: (typeof SUBSCRIPTION_CHANGE_TIMING)[keyof typeof SUBSCRIPTION_CHANGE_TIMING],
) {
  const invoice = await billing.purchase(tenantId, actorId, {
    planId,
    termMonths,
    ...(timing ? { timing } : {}),
  });
  const result = await prisma.$transaction((tx) =>
    billing.applyBankPaymentWithinTx(tx, {
      code: invoice.code,
      amount: new Prisma.Decimal(invoice.totalAmount),
      providerTxId: newId(),
    }),
  );
  if (result.outcome !== 'activated') throw new Error(`không kích hoạt: ${result.outcome}`);
  return result.subscriptionId;
}

function term(id: string) {
  return prisma.tenantSubscription.findUniqueOrThrow({
    where: { id },
    select: { status: true, startsAt: true, endsAt: true, planId: true },
  });
}

describe('selfServePurchaseTiming — server suy thời điểm (ADR 0084)', () => {
  maybe(
    'cùng bậc + client gửi timing=now ⇒ vẫn GIA HẠN nối tiếp, kỳ đang chạy giữ nguyên',
    async () => {
      const first = await buyAndPay(car1);
      const renewed = await buyAndPay(car1, 1, SUBSCRIPTION_CHANGE_TIMING.NOW);

      const running = await term(first);
      const next = await term(renewed);
      expect(running.status).toBe(SUBSCRIPTION_STATUS.ACTIVE);
      expect(next.startsAt.getTime()).toBe(running.endsAt.getTime());

      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { tenantId, targetId: renewed, action: 'subscription.activate_from_payment' },
        select: { afterJson: true },
      });
      expect((audit.afterJson as { purchaseKind?: string }).purchaseKind).toBe(
        PLAN_PURCHASE_KIND.RENEW,
      );
    },
  );

  maybe(
    'nâng bậc ⇒ áp dụng NGAY, kỳ đang chạy + kỳ đã gia hạn trước cùng loại xe kết thúc',
    async () => {
      const motoTerm = await buyAndPay(moto1);
      const running = await buyAndPay(car1);
      const prepaid = await buyAndPay(car1);
      const before = Date.now();
      const upgraded = await buyAndPay(car5);

      const up = await term(upgraded);
      expect(up.startsAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect((await term(running)).status).toBe(SUBSCRIPTION_STATUS.CANCELLED);
      expect((await term(prepaid)).status).toBe(SUBSCRIPTION_STATUS.CANCELLED);
      // Loại xe khác không bị đụng tới.
      expect((await term(motoTerm)).status).toBe(SUBSCRIPTION_STATUS.ACTIVE);
    },
  );

  maybe('hạ bậc ⇒ nối tiếp sau kỳ cao, không huỷ', async () => {
    const high = await buyAndPay(car5);
    const low = await buyAndPay(car1);
    const highTerm = await term(high);
    expect(highTerm.status).toBe(SUBSCRIPTION_STATUS.ACTIVE);
    expect((await term(low)).startsAt.getTime()).toBe(highTerm.endsAt.getTime());
  });

  maybe('hoá đơn cũ còn ghi timing=now ⇒ lúc tiền về vẫn suy lại thành gia hạn', async () => {
    const first = await buyAndPay(car1);
    const invoice = await billing.purchase(tenantId, actorId, { planId: car1, termMonths: 1 });
    const row = await prisma.subscriptionInvoice.findUniqueOrThrow({
      where: { id: invoice.id },
      select: { linesJson: true },
    });
    await prisma.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: {
        linesJson: {
          ...(row.linesJson as Prisma.JsonObject),
          timing: SUBSCRIPTION_CHANGE_TIMING.NOW,
        },
      },
    });
    const result = await prisma.$transaction((tx) =>
      billing.applyBankPaymentWithinTx(tx, {
        code: invoice.code,
        amount: new Prisma.Decimal(invoice.totalAmount),
        providerTxId: newId(),
      }),
    );
    expect(result.outcome).toBe('activated');
    const running = await term(first);
    expect(running.status).toBe(SUBSCRIPTION_STATUS.ACTIVE);
    if (result.outcome === 'activated') {
      expect((await term(result.subscriptionId)).startsAt.getTime()).toBe(running.endsAt.getTime());
    }
  });
});

describe('previewPurchase', () => {
  maybe('nói đúng loại lượt mua, kỳ dự kiến và các kỳ sẽ kết thúc — không ghi gì', async () => {
    const running = await buyAndPay(car1);
    const runningTerm = await term(running);

    const renew = await billing.previewPurchase(tenantId, {
      items: [
        { planId: car1, termMonths: 3 },
        { planId: moto1, termMonths: 3 },
      ],
    });
    // Thứ tự hiển thị loại xe chuẩn (xe máy trước), không theo thứ tự client gửi.
    expect(renew.items.map((item) => item.planId)).toEqual([moto1, car1]);
    const [motoItem, carItem] = renew.items;
    expect(motoItem!.kind).toBe(PLAN_PURCHASE_KIND.NEW);
    expect(carItem!.kind).toBe(PLAN_PURCHASE_KIND.RENEW);
    expect(carItem!.startsAt).toBe(runningTerm.endsAt.toISOString());
    expect(carItem!.replacedTerms).toEqual([]);
    expect(renew.total).toBe(String((99_000 + 49_000) * 3));

    const upgrade = await billing.previewPurchase(tenantId, {
      items: [{ planId: car5, termMonths: 1 }],
    });
    expect(upgrade.items[0]!.kind).toBe(PLAN_PURCHASE_KIND.UPGRADE);
    expect(upgrade.items[0]!.maxVehicles).toBe(5);
    expect(upgrade.items[0]!.replacedTerms).toHaveLength(1);
    expect(upgrade.items[0]!.replacedTerms[0]!.endsAt).toBe(runningTerm.endsAt.toISOString());

    // Xem trước không phát hành hoá đơn nào, không đụng kỳ nào.
    expect(await prisma.subscriptionInvoice.count({ where: { tenantId, status: 'issued' } })).toBe(
      0,
    );
    expect((await term(running)).status).toBe(SUBSCRIPTION_STATUS.ACTIVE);
  });

  maybe('hai gói cùng loại xe ⇒ từ chối như phiếu gộp', async () => {
    await expect(
      billing.previewPurchase(tenantId, {
        items: [
          { planId: car1, termMonths: 1 },
          { planId: car5, termMonths: 1 },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
  });
});
