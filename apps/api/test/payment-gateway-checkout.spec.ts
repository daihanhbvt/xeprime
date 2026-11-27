import { createPrismaClient, newId } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BILLING_MODE,
  PAYMENT_ORDER_APPLY_OUTCOME,
  PAYMENT_ORDER_REVIEW_REASON,
  PAYMENT_ORDER_REVIEW_STATUS,
  PAYMENT_ORDER_TARGET,
  PAYMENT_ORDER_VIEW_STATE,
  PLAN_VEHICLE_SCOPE,
  SUBSCRIPTION_INVOICE_STATUS,
  SUBSCRIPTION_STATUS,
  TENANT_STATUS,
} from '@xeprime/types';
import type { PrismaService } from '../src/prisma/prisma.service';
import { buildGateway, gatewayEnv, momoIpn, SPEC_WEB } from './helpers/payment-gateway-fixture';

/**
 * Cổng MoMo/VNPAY cho PHIẾU GỘP nhiều gói `XPC…` — ADR 0083 điều 6 (sửa 27/11/2026).
 *
 * QC 27/11 (#22): mua ô tô + xe máy một lần thì trang thanh toán chỉ có VietQR. Phiếu giờ là đích
 * cổng thứ ba; bất biến khoá ở đây:
 *  1. số tiền gửi sang cổng = phần còn thiếu của CẢ phiếu, đọc từ DB; quay về trang của phiếu;
 *  2. IPN thành công ⇒ phiếu `paid`, CẢ HAI gói bật trong một lượt — qua đúng hàm SePay dùng cho `XPC…`;
 *  3. hoá đơn con của phiếu KHÔNG mở phiên riêng (trả nửa lượt mua);
 *  4. phiếu của gian hàng khác không tồn tại; luồng gói tắt thì phiếu cũng tắt;
 *  5. phiếu đã void khi tiền về ⇒ không bật gì, vào hàng đợi người xử lý.
 *
 * Chạy trên PostgreSQL THẬT (`TEST_DATABASE_URL`).
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const { service, momo, billing } = buildGateway(asService, gatewayEnv);

const RUN = newId().slice(-8).toLowerCase();
const CAR_PRICE = 249_000;
const MOTO_PRICE = 149_000;
const TOTAL = CAR_PRICE + MOTO_PRICE;

type CreatePlanInput = Parameters<typeof billing.createPlan>[1];

let dbAvailable = false;
let ownerId: string;
let otherOwnerId: string;
let tenantId: string;
let otherTenantId: string;
let carPlanId: string;
let motoPlanId: string;
const planIds: string[] = [];

const request = (provider: 'momo' | 'vnpay' = 'momo') => ({
  provider,
  client: 'web' as const,
  locale: 'vi' as const,
  clientIp: '127.0.0.1',
  actorUserId: ownerId,
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

function issueCheckout(forTenant: string = tenantId) {
  return billing.createCheckout(forTenant, ownerId, {
    items: [
      { planId: motoPlanId, termMonths: 1 },
      { planId: carPlanId, termMonths: 1 },
    ],
  });
}

async function cleanTenant(tId: string): Promise<void> {
  // RESTRICT: nhật ký và lượt cổng phải đi TRƯỚC phiếu / hoá đơn.
  await prisma.paymentGatewayOrderEvent.deleteMany({ where: { order: { tenantId: tId } } });
  await prisma.paymentGatewayOrder.deleteMany({ where: { tenantId: tId } });
  await prisma.subscriptionInvoice.deleteMany({ where: { tenantId: tId } });
  await prisma.subscriptionCheckout.deleteMany({ where: { tenantId: tId } });
  await prisma.tenantSubscription.deleteMany({ where: { tenantId: tId } });
  await prisma.notification.deleteMany({ where: { tenantId: tId } });
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
  otherOwnerId = newId();
  tenantId = newId();
  otherTenantId = newId();
  for (const [userId, tId, name] of [
    [ownerId, tenantId, `Shop phiếu gộp ${RUN}`],
    [otherOwnerId, otherTenantId, `Shop khác ${RUN}`],
  ] as const) {
    await prisma.user.create({
      data: {
        realm: ACCOUNT_REALM.PARTNER,
        id: userId,
        displayName: name,
        email: `pgw-checkout-${userId}@xeprime.test`,
      },
    });
    await prisma.tenant.create({
      data: {
        id: tId,
        code: `T-${tId.slice(-8)}`,
        slug: `t-${tId.toLowerCase().slice(-10)}`,
        name,
        status: TENANT_STATUS.ACTIVE,
        ownerUserId: userId,
      },
    });
  }
  const plan = async (scope: string, price: number) => {
    const input: CreatePlanInput = {
      code: `pgw-checkout-${scope}-${RUN}`,
      name: `Gói ${scope} (spec cổng)`,
      billingMode: BILLING_MODE.PACKAGE,
      vehicleScope: scope,
      limits: { maxVehicles: 5, termPrices: [{ months: 1, price: String(price) }] },
    };
    const created = await billing.createPlan(ownerId, input);
    planIds.push(created.id);
    return created.id;
  };
  carPlanId = await plan(PLAN_VEHICLE_SCOPE.CAR, CAR_PRICE);
  motoPlanId = await plan(PLAN_VEHICLE_SCOPE.MOTORBIKE, MOTO_PRICE);
});

afterEach(async () => {
  if (!dbAvailable) return;
  momo.created = [];
  momo.queryResult = null;
  await cleanTenant(tenantId);
  await cleanTenant(otherTenantId);
});

afterAll(async () => {
  if (dbAvailable) {
    for (const tId of [tenantId, otherTenantId]) {
      await cleanTenant(tId);
      await prisma.auditLog.deleteMany({ where: { tenantId: tId } });
    }
    await prisma.plan.deleteMany({ where: { id: { in: planIds } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherOwnerId] } } });
  }
  await prisma.$disconnect();
});

describe('Cổng ví điện tử cho phiếu gộp nhiều gói', () => {
  maybe('mở phiên: số tiền là TỔNG còn thiếu của phiếu, quay về trang của phiếu; bấm lại thì dùng lại', async () => {
    const checkout = await issueCheckout();

    const first = await service.startSubscriptionCheckoutPayment(tenantId, checkout.id, request());
    expect(first.targetType).toBe(PAYMENT_ORDER_TARGET.SUBSCRIPTION_CHECKOUT);
    expect(first.targetCode).toBe(checkout.code);
    expect(first.checkoutId).toBe(checkout.id);
    expect(first.invoiceId).toBeNull();
    expect(first.amount).toBe(String(TOTAL));
    expect(momo.created).toHaveLength(1);
    expect(momo.created[0]!.amount).toBe(TOTAL);
    expect(momo.created[0]!.returnUrl).toBe(
      `${SPEC_WEB.partner}/payment/checkout/${checkout.id}?order=${first.id}`,
    );

    const again = await service.startSubscriptionCheckoutPayment(tenantId, checkout.id, request());
    expect(again.id).toBe(first.id);
    expect(momo.created).toHaveLength(1);
  });

  maybe('IPN thành công: phiếu paid, CẢ HAI gói bật một lượt; IPN gửi lại không bật thêm', async () => {
    const checkout = await issueCheckout();
    const order = await service.startSubscriptionCheckoutPayment(tenantId, checkout.id, request());
    const ipn = momoIpn(order.id, TOTAL);

    expect(await service.handleMomoIpn(ipn)).toBe('succeeded');
    expect(await service.handleMomoIpn(ipn)).toBe('already_succeeded');

    const after = await prisma.subscriptionCheckout.findUniqueOrThrow({
      where: { id: checkout.id },
      include: { invoices: { select: { status: true } } },
    });
    expect(after.status).toBe(SUBSCRIPTION_INVOICE_STATUS.PAID);
    expect(after.paidAmount.toString()).toBe(String(TOTAL));
    expect(after.invoices.map((invoice) => invoice.status)).toEqual([
      SUBSCRIPTION_INVOICE_STATUS.PAID,
      SUBSCRIPTION_INVOICE_STATUS.PAID,
    ]);
    const live = await prisma.tenantSubscription.findMany({
      where: { tenantId, status: SUBSCRIPTION_STATUS.ACTIVE },
      select: { vehicleScope: true },
    });
    expect(live.map((row) => row.vehicleScope).sort()).toEqual(
      [PLAN_VEHICLE_SCOPE.CAR, PLAN_VEHICLE_SCOPE.MOTORBIKE].sort(),
    );

    const view = await service.orderForTenant(tenantId, order.id);
    expect(view.viewState).toBe(PAYMENT_ORDER_VIEW_STATE.COMPLETED);
    expect(view.applyOutcome).toBe(PAYMENT_ORDER_APPLY_OUTCOME.ACTIVATED);
  });

  maybe('hoá đơn CON của phiếu: không mở phiên riêng (trả nửa lượt mua)', async () => {
    const checkout = await issueCheckout();
    const [child] = checkout.invoices;
    await expect(
      service.startInvoiceCheckout(tenantId, child!.id, request()),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: API_ERROR_CODE.PAYMENT_TARGET_NOT_PAYABLE }),
    });
    expect(momo.created).toHaveLength(0);
  });

  maybe('phiếu của gian hàng KHÁC: không tồn tại với người gọi, kể cả khi đọc lượt', async () => {
    const checkout = await issueCheckout();
    await expect(
      service.startSubscriptionCheckoutPayment(otherTenantId, checkout.id, request()),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: API_ERROR_CODE.NOT_FOUND }) });

    const order = await service.startSubscriptionCheckoutPayment(tenantId, checkout.id, request());
    await expect(service.orderForTenant(otherTenantId, order.id)).rejects.toMatchObject({
      response: expect.objectContaining({ code: API_ERROR_CODE.NOT_FOUND }),
    });
  });

  maybe('luồng gói TẮT ⇒ phiếu cũng không có cổng (một công tắc)', async () => {
    const off = buildGateway(asService, { ...gatewayEnv, PAYMENT_GATEWAY_SUBSCRIPTION: 'off' });
    expect(off.config.providersFor(PAYMENT_ORDER_TARGET.SUBSCRIPTION_CHECKOUT)).toEqual([]);
    const checkout = await issueCheckout();
    await expect(
      off.service.startSubscriptionCheckoutPayment(tenantId, checkout.id, request()),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: API_ERROR_CODE.PAYMENT_GATEWAY_UNAVAILABLE }),
    });
    expect(off.momo.created).toHaveLength(0);
  });

  maybe('phiếu đã void khi tiền về ⇒ không bật gói nào, lượt vào hàng đợi người xử lý', async () => {
    const checkout = await issueCheckout();
    const order = await service.startSubscriptionCheckoutPayment(tenantId, checkout.id, request());
    await prisma.subscriptionCheckout.update({
      where: { id: checkout.id },
      data: { status: SUBSCRIPTION_INVOICE_STATUS.VOID },
    });
    await prisma.subscriptionInvoice.updateMany({
      where: { checkoutId: checkout.id },
      data: { status: SUBSCRIPTION_INVOICE_STATUS.VOID },
    });

    expect(await service.handleMomoIpn(momoIpn(order.id, TOTAL))).toBe('succeeded');
    const row = await prisma.paymentGatewayOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.applyOutcome).toBe(PAYMENT_ORDER_APPLY_OUTCOME.TARGET_CLOSED);
    expect(row.reviewStatus).toBe(PAYMENT_ORDER_REVIEW_STATUS.OPEN);
    expect(row.reviewReason).toBe(PAYMENT_ORDER_REVIEW_REASON.TARGET_CLOSED);
    expect(
      await prisma.tenantSubscription.count({
        where: { tenantId, status: SUBSCRIPTION_STATUS.ACTIVE },
      }),
    ).toBe(0);
  });
});
