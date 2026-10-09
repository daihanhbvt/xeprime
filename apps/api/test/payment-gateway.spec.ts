import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BILLING_MODE,
  PAYMENT_ORDER_APPLY_OUTCOME,
  PAYMENT_ORDER_REQUERY_OUTCOME,
  PAYMENT_ORDER_RESULT_SOURCE,
  PAYMENT_ORDER_REVIEW_REASON,
  PAYMENT_ORDER_REVIEW_STATUS,
  PAYMENT_ORDER_STATUS,
  PAYMENT_ORDER_TARGET,
  PAYMENT_ORDER_VIEW_STATE,
  PLAN_STATUS,
  SUBSCRIPTION_INVOICE_STATUS,
  SUBSCRIPTION_STATUS,
  TENANT_STATUS,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { PaymentGatewaySweeper } from '../src/modules/payment-gateway/payment-gateway.sweeper';
import { PlatformPaymentOrdersService } from '../src/modules/payment-gateway/platform-payment-orders.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  buildGateway,
  gatewayEnv,
  momoIpn,
  nextTransId,
  paidQueryResult,
  SPEC_WEB,
  vnpayIpn,
} from './helpers/payment-gateway-fixture';

/**
 * Đường tiền MoMo/VNPAY → hoá đơn gói → kích hoạt — chạy trên PostgreSQL THẬT (ADR 0058).
 *
 * Cổng là bên ngoài nên adapter được thay ĐÚNG hai chỗ chạm mạng (mở phiên MoMo, truy vấn); phần
 * xác minh IPN dùng adapter thật với khoá thử. Điều được khoá ở đây toàn là điều sai thì sai thành TIỀN:
 *
 *  1. số tiền gửi sang cổng đọc từ DB; phiên còn hạn được DÙNG LẠI; đang ghi nhận thì không mở phiên mới;
 *  2. IPN gửi lại / chạy song song: gói bật đúng MỘT lần; mỗi kết quả để lại một dòng nhật ký;
 *  3. sai chữ ký, lệch số tiền: không đồng nào được áp;
 *  4. hoá đơn đã đóng, hay đã đủ từ trước (trả trùng): không bật gói lần nữa, vào hàng đợi;
 *  5. người trực đã ĐÓNG lượt thì máy không bao giờ tự áp — chỉ người, có audit;
 *  6. áp hỏng ⇒ hàng đợi; bộ quét áp lại khi lỗi đã qua;
 *  7. IPN VNPAY trả đúng mã tài liệu quy định.
 *
 * Đường tiền giữ chỗ (tạo đơn thuê) ở `payment-gateway-hold.spec.ts`.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

/** Giá kỳ hạn 3 tháng của gói test — cũng là số tiền gửi sang cổng. */
const PRICE = 300000;

const { service, momo, config, billing } = buildGateway(asService, gatewayEnv);
const admin = new PlatformPaymentOrdersService(asService, new AuditService(asService), service);
const sweeper = new PaymentGatewaySweeper(asService, config, service);

let dbAvailable = false;
let ownerId: string;
let otherOwnerId: string;
let tenantId: string;
let otherTenantId: string;
let planId: string;

const request = (provider: 'momo' | 'vnpay' = 'momo') => ({
  provider,
  client: 'web' as const,
  locale: 'vi' as const,
  clientIp: '127.0.0.1',
  actorUserId: ownerId,
});

async function issueInvoice(forTenant: string = tenantId, by: string = ownerId) {
  return billing.purchase(forTenant, by, { planId, termMonths: 3 });
}

async function activeSubscriptions(forTenant: string = tenantId): Promise<number> {
  return prisma.tenantSubscription.count({
    where: { tenantId: forTenant, status: SUBSCRIPTION_STATUS.ACTIVE, planId },
  });
}

async function cleanTenant(tId: string): Promise<void> {
  // RESTRICT: nhật ký và lượt cổng phải đi TRƯỚC hoá đơn/gian hàng.
  await prisma.paymentGatewayOrderEvent.deleteMany({ where: { order: { tenantId: tId } } });
  await prisma.paymentGatewayOrder.deleteMany({ where: { tenantId: tId } });
  await prisma.subscriptionInvoice.deleteMany({ where: { tenantId: tId } });
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
  planId = newId();

  for (const [userId, tId, name] of [
    [ownerId, tenantId, 'Shop cổng thanh toán'],
    [otherOwnerId, otherTenantId, 'Shop khác'],
  ] as const) {
    await prisma.user.create({
      data: {
        realm: ACCOUNT_REALM.PARTNER,
        id: userId,
        displayName: name,
        email: `pgw-${userId}@xeprime.test`,
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
    await prisma.tenantMembership.create({
      data: {
        id: newId(),
        tenantId: tId,
        userId,
        roleKey: 'shop_owner',
        status: 'active',
        joinedAt: new Date(),
      },
    });
  }
  await prisma.plan.create({
    data: {
      id: planId,
      code: `pgw-test-${planId.slice(-6).toLowerCase()}`,
      name: 'Gói test cổng',
      billingMode: BILLING_MODE.PACKAGE,
      basePriceMonthly: new Prisma.Decimal(1_000_000),
      status: PLAN_STATUS.ACTIVE,
      limitsJson: {
        maxVehicles: null,
        maxMembers: null,
        maxBranches: null,
        termPrices: [{ months: 3, price: String(PRICE) }],
        graceDays: 7,
        features: [],
      } as unknown as Prisma.InputJsonValue,
    },
  });
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
      await prisma.tenantMembership.deleteMany({ where: { tenantId: tId } });
    }
    await prisma.plan.deleteMany({ where: { id: planId } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantId, otherTenantId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, otherOwnerId] } } });
  }
  await prisma.$disconnect();
});

describe('Mở phiên', () => {
  it('số tiền là phần còn thiếu ĐỌC TỪ DB; bấm lại thì DÙNG LẠI phiên còn hạn', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();

    const first = await service.startInvoiceCheckout(tenantId, invoice.id, request());
    expect(first.amount).toBe(String(PRICE));
    expect(first.viewState).toBe(PAYMENT_ORDER_VIEW_STATE.AWAITING);
    expect(first.checkoutUrl).toBe(`https://momo.spec.test/pay/${first.id}`);
    expect(momo.created).toHaveLength(1);
    expect(momo.created[0]!.amount).toBe(PRICE);
    // Trang quay về là site PARTNER, mang đúng ID của lượt — không mang kết quả gì.
    expect(momo.created[0]!.returnUrl).toBe(
      `${SPEC_WEB.partner}/payment-return?order=${first.id}`,
    );

    const again = await service.startInvoiceCheckout(tenantId, invoice.id, request());
    expect(again.id).toBe(first.id);
    expect(momo.created).toHaveLength(1);
  });

  it('hoá đơn của gian hàng KHÁC: không tồn tại với người gọi', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    await expect(
      service.startInvoiceCheckout(otherTenantId, invoice.id, request()),
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: API_ERROR_CODE.NOT_FOUND }) });
  });

  it('luồng chưa bật: 503, không gọi cổng, không ghi lượt nào', async () => {
    if (!dbAvailable) return;
    const off = buildGateway(asService, { ...gatewayEnv, PAYMENT_GATEWAY_SUBSCRIPTION: 'off' });
    expect(off.service.methods(PAYMENT_ORDER_TARGET.SUBSCRIPTION_INVOICE).methods).toEqual([]);
    const invoice = await issueInvoice();
    await expect(
      off.service.startInvoiceCheckout(tenantId, invoice.id, request()),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: API_ERROR_CODE.PAYMENT_GATEWAY_UNAVAILABLE }),
    });
    expect(off.momo.created).toHaveLength(0);
    expect(await prisma.paymentGatewayOrder.count({ where: { tenantId } })).toBe(0);
  });

  it('hoá đơn đã trả đủ: không mở phiên', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    await prisma.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: { status: SUBSCRIPTION_INVOICE_STATUS.PAID, paidAmount: invoice.totalAmount, paidAt: new Date() },
    });
    await expect(
      service.startInvoiceCheckout(tenantId, invoice.id, request()),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: API_ERROR_CODE.PAYMENT_TARGET_NOT_PAYABLE }),
    });
  });

  it('một khoản cổng ĐÃ THU mà chưa ghi nhận xong: không mở phiên mới (chống trả lần hai)', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const order = await service.startInvoiceCheckout(tenantId, invoice.id, request());
    await prisma.paymentGatewayOrder.update({
      where: { id: order.id },
      data: {
        status: PAYMENT_ORDER_STATUS.SUCCEEDED,
        providerTxId: String(nextTransId()),
        paidAmount: new Prisma.Decimal(PRICE),
        resultSource: PAYMENT_ORDER_RESULT_SOURCE.IPN,
        resultAt: new Date(),
      },
    });
    await expect(
      service.startInvoiceCheckout(tenantId, invoice.id, request('vnpay')),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: API_ERROR_CODE.PAYMENT_ORDER_IN_PROGRESS }),
    });
  });
});

describe('IPN MoMo', () => {
  it('thành công: hoá đơn paid, gói bật MỘT lần; IPN gửi lại không bật lần hai; mỗi lần một dòng nhật ký', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const order = await service.startInvoiceCheckout(tenantId, invoice.id, request());
    const ipn = momoIpn(order.id, PRICE);

    expect(await service.handleMomoIpn(ipn)).toBe('succeeded');
    expect(await service.handleMomoIpn(ipn)).toBe('already_succeeded');

    const after = await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.status).toBe(SUBSCRIPTION_INVOICE_STATUS.PAID);
    expect(after.paidAmount.toString()).toBe(String(PRICE));
    expect(await activeSubscriptions()).toBe(1);
    expect(await prisma.paymentGatewayOrderEvent.count({ where: { orderId: order.id } })).toBe(2);

    const view = await service.orderForTenant(tenantId, order.id);
    expect(view.viewState).toBe(PAYMENT_ORDER_VIEW_STATE.COMPLETED);
    expect(view.applyOutcome).toBe(PAYMENT_ORDER_APPLY_OUTCOME.ACTIVATED);
    expect(view.checkoutUrl).toBeNull();
  });

  it('hai IPN thành công CHẠY SONG SONG: đúng một lượt áp tiền', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const order = await service.startInvoiceCheckout(tenantId, invoice.id, request());
    const ipn = momoIpn(order.id, PRICE);

    const outcomes = await Promise.all([service.handleMomoIpn(ipn), service.handleMomoIpn(ipn)]);
    expect(outcomes.sort()).toEqual(['already_succeeded', 'succeeded']);
    expect(await activeSubscriptions()).toBe(1);
    const after = await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.paidAmount.toString()).toBe(String(PRICE));
  });

  it('sai chữ ký: từ chối, không đồng nào được ghi', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const order = await service.startInvoiceCheckout(tenantId, invoice.id, request());
    const forged = { ...momoIpn(order.id, PRICE), signature: 'f'.repeat(64) };

    expect(await service.handleMomoIpn(forged)).toBe('invalid');
    const row = await prisma.paymentGatewayOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(PAYMENT_ORDER_STATUS.PENDING);
    expect(await activeSubscriptions()).toBe(0);
  });

  it('lệch số tiền (chữ ký đúng): KHÔNG áp, vào hàng đợi người xử lý', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const order = await service.startInvoiceCheckout(tenantId, invoice.id, request());

    expect(await service.handleMomoIpn(momoIpn(order.id, 1000))).toBe('amount_mismatch');
    const row = await prisma.paymentGatewayOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(PAYMENT_ORDER_STATUS.PENDING);
    expect(row.reviewStatus).toBe(PAYMENT_ORDER_REVIEW_STATUS.OPEN);
    expect(row.reviewReason).toBe(PAYMENT_ORDER_REVIEW_REASON.AMOUNT_MISMATCH);
    const after = await prisma.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.paidAmount.toString()).toBe('0');
    expect(await activeSubscriptions()).toBe(0);
  });

  it('khách huỷ rồi thành công tới sau: thành công thắng — tiền về là tiền về', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const order = await service.startInvoiceCheckout(tenantId, invoice.id, request());

    expect(await service.handleMomoIpn(momoIpn(order.id, PRICE, { resultCode: 1006, transId: 0 }))).toBe(
      'recorded_failure',
    );
    expect(
      (await prisma.paymentGatewayOrder.findUniqueOrThrow({ where: { id: order.id } })).status,
    ).toBe(PAYMENT_ORDER_STATUS.CANCELLED);

    expect(await service.handleMomoIpn(momoIpn(order.id, PRICE))).toBe('succeeded');
    expect(await activeSubscriptions()).toBe(1);
  });

  it('hoá đơn bị void trước khi tiền về: KHÔNG bật gói, vào hàng đợi (tiền về muộn)', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const order = await service.startInvoiceCheckout(tenantId, invoice.id, request());
    await prisma.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: { status: SUBSCRIPTION_INVOICE_STATUS.VOID },
    });

    expect(await service.handleMomoIpn(momoIpn(order.id, PRICE))).toBe('succeeded');
    const row = await prisma.paymentGatewayOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(PAYMENT_ORDER_STATUS.SUCCEEDED);
    expect(row.applyOutcome).toBe(PAYMENT_ORDER_APPLY_OUTCOME.TARGET_CLOSED);
    expect(row.reviewStatus).toBe(PAYMENT_ORDER_REVIEW_STATUS.OPEN);
    expect(row.reviewReason).toBe(PAYMENT_ORDER_REVIEW_REASON.TARGET_CLOSED);
    expect(await activeSubscriptions()).toBe(0);

    const view = await service.orderForTenant(tenantId, order.id);
    expect(view.viewState).toBe(PAYMENT_ORDER_VIEW_STATE.NEEDS_SUPPORT);
  });

  it('hoá đơn đã đủ bằng chuyển khoản rồi cổng mới báo thu: TIỀN TRẢ TRÙNG vào hàng đợi, không bật gói lần hai', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const order = await service.startInvoiceCheckout(tenantId, invoice.id, request());
    // Khách chuyển khoản đủ qua SePay trước — cùng hàm áp tiền mà webhook gọi.
    await prisma.$transaction((tx) =>
      billing.applyBankPaymentWithinTx(tx, {
        code: invoice.code,
        amount: new Prisma.Decimal(PRICE),
        providerTxId: `sepay-spec-${newId()}`,
      }),
    );
    expect(await activeSubscriptions()).toBe(1);

    expect(await service.handleMomoIpn(momoIpn(order.id, PRICE))).toBe('succeeded');
    const row = await prisma.paymentGatewayOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.applyOutcome).toBe(PAYMENT_ORDER_APPLY_OUTCOME.ALREADY_PAID);
    expect(row.reviewStatus).toBe(PAYMENT_ORDER_REVIEW_STATUS.OPEN);
    expect(row.reviewReason).toBe(PAYMENT_ORDER_REVIEW_REASON.OVERPAID);
    expect(await activeSubscriptions()).toBe(1);

    const view = await service.orderForTenant(tenantId, order.id);
    expect(view.viewState).toBe(PAYMENT_ORDER_VIEW_STATE.NEEDS_SUPPORT);
  });

  it('cùng mã giao dịch của cổng trên một lượt KHÁC: không áp, vào hàng đợi', async () => {
    if (!dbAvailable) return;
    const mine = await issueInvoice();
    const theirs = await issueInvoice(otherTenantId, otherOwnerId);
    const orderA = await service.startInvoiceCheckout(tenantId, mine.id, request());
    const orderB = await service.startInvoiceCheckout(otherTenantId, theirs.id, {
      ...request(),
      actorUserId: otherOwnerId,
    });
    const transId = nextTransId();

    expect(await service.handleMomoIpn(momoIpn(orderA.id, PRICE, { transId }))).toBe('succeeded');
    expect(await service.handleMomoIpn(momoIpn(orderB.id, PRICE, { transId }))).toBe('duplicate_provider_tx');
    const rowB = await prisma.paymentGatewayOrder.findUniqueOrThrow({ where: { id: orderB.id } });
    expect(rowB.status).toBe(PAYMENT_ORDER_STATUS.PENDING);
    expect(rowB.reviewReason).toBe(PAYMENT_ORDER_REVIEW_REASON.DUPLICATE_PROVIDER_TX);
    expect(await activeSubscriptions(otherTenantId)).toBe(0);
  });
});

describe('IPN VNPAY — mã phản hồi theo tài liệu', () => {
  it('00 lần đầu · 02 khi gửi lại · 97 sai chữ ký · 01 không có đơn · 04 sai số tiền · 99 chưa xong', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const order = await service.startInvoiceCheckout(tenantId, invoice.id, request('vnpay'));
    expect(order.checkoutUrl).toContain('https://vnpay.spec.test/paymentv2/vpcpay.html?');

    expect((await service.handleVnpayIpn(vnpayIpn(order.id, 1))).RspCode).toBe('04');
    expect(
      (await service.handleVnpayIpn(vnpayIpn(order.id, PRICE, { vnp_TransactionStatus: '01' }))).RspCode,
    ).toBe('99');
    expect(
      (await service.handleVnpayIpn({ ...vnpayIpn(order.id, PRICE), vnp_SecureHash: 'ab'.repeat(64) })).RspCode,
    ).toBe('97');
    expect((await service.handleVnpayIpn(vnpayIpn('01JNOTANORDER0000000000000', PRICE))).RspCode).toBe('01');

    const paid = vnpayIpn(order.id, PRICE);
    expect((await service.handleVnpayIpn(paid)).RspCode).toBe('00');
    expect((await service.handleVnpayIpn(paid)).RspCode).toBe('02');
    expect(await activeSubscriptions()).toBe(1);
  });
});

describe('Truy vấn phía server và bộ quét', () => {
  it('cổng nói đã thu qua truy vấn: áp tiền như IPN', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const order = await service.startInvoiceCheckout(tenantId, invoice.id, request());
    momo.queryResult = paidQueryResult(order.id, PRICE);

    expect(await service.settle(order.id, { force: true })).toBe('recorded');
    const view = await service.orderForTenant(tenantId, order.id);
    expect(view.viewState).toBe(PAYMENT_ORDER_VIEW_STATE.COMPLETED);
    expect(await activeSubscriptions()).toBe(1);
  });

  it('truy vấn không xác minh được (null): giữ nguyên, không bao giờ coi là thất bại', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const order = await service.startInvoiceCheckout(tenantId, invoice.id, request());
    momo.queryResult = null;
    expect(await service.settle(order.id, { force: true })).toBe('unreachable');
    const row = await prisma.paymentGatewayOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(PAYMENT_ORDER_STATUS.PENDING);
    expect(row.lastQueriedAt).not.toBeNull();
  });

  it('IPN không tới và người trả không quay lại: BỘ QUÉT hỏi cổng và ghi nhận', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const order = await service.startInvoiceCheckout(tenantId, invoice.id, request());
    // Lượt đã đủ cũ để bộ quét để ý tới.
    await prisma.paymentGatewayOrder.update({
      where: { id: order.id },
      data: { createdAt: new Date(Date.now() - 10 * 60_000) },
    });
    momo.queryResult = paidQueryResult(order.id, PRICE);

    const report = await sweeper.sweep();
    expect(report.queried).toBeGreaterThanOrEqual(1);
    expect(await activeSubscriptions()).toBe(1);
  });

  it('áp tiền HỎNG: tiền đã ghi nhận, vào hàng đợi; lỗi qua rồi thì bộ quét áp lại', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const order = await service.startInvoiceCheckout(tenantId, invoice.id, request());
    // Snapshot hỏng ⇒ kích hoạt gói ném — đúng loại lỗi làm lượt áp quay đầu.
    const original = await prisma.subscriptionInvoice.findUniqueOrThrow({
      where: { id: invoice.id },
      select: { linesJson: true },
    });
    await prisma.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: { linesJson: { broken: true } as Prisma.InputJsonValue },
    });

    expect(await service.handleMomoIpn(momoIpn(order.id, PRICE))).toBe('succeeded');
    let row = await prisma.paymentGatewayOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(PAYMENT_ORDER_STATUS.SUCCEEDED);
    expect(row.appliedAt).toBeNull();
    expect(row.reviewReason).toBe(PAYMENT_ORDER_REVIEW_REASON.APPLY_FAILED);
    expect(row.applyError).toBeTruthy();
    expect(await activeSubscriptions()).toBe(0);

    await prisma.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: { linesJson: original.linesJson as Prisma.InputJsonValue },
    });
    const report = await sweeper.sweep();
    expect(report.reapplied).toBeGreaterThanOrEqual(1);
    row = await prisma.paymentGatewayOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.applyOutcome).toBe(PAYMENT_ORDER_APPLY_OUTCOME.ACTIVATED);
    expect(row.reviewStatus).toBe(PAYMENT_ORDER_REVIEW_STATUS.NONE);
    expect(await activeSubscriptions()).toBe(1);
  });
});

describe('Hàng đợi người xử lý', () => {
  it('đóng lượt: đúng một người thắng, có audit; lần hai nhận ALREADY_HANDLED', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const order = await service.startInvoiceCheckout(tenantId, invoice.id, request());
    await service.handleMomoIpn(momoIpn(order.id, 1000));

    const resolved = await admin.resolve(order.id, ownerId, {
      note: 'Đã đối chiếu portal MoMo, hoàn tay cho gian hàng',
      refundReference: 'MOMO-REFUND-001',
    });
    expect(resolved.reviewStatus).toBe(PAYMENT_ORDER_REVIEW_STATUS.RESOLVED);
    expect(resolved.refundReference).toBe('MOMO-REFUND-001');
    expect(
      await prisma.auditLog.count({
        where: { targetId: order.id, action: 'payment_gateway_order.resolve' },
      }),
    ).toBe(1);

    await expect(admin.resolve(order.id, ownerId, { note: 'Bấm lần hai' })).rejects.toMatchObject({
      response: expect.objectContaining({ code: API_ERROR_CODE.PAYMENT_ORDER_ALREADY_HANDLED }),
    });
  });

  it('đã ĐÓNG (có thể đã hoàn tay) rồi cổng mới báo thu đúng số: KHÔNG tự áp — mở lại hàng đợi; người trực ghi nhận tay', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const order = await service.startInvoiceCheckout(tenantId, invoice.id, request());
    await service.handleMomoIpn(momoIpn(order.id, 1000));
    await admin.resolve(order.id, ownerId, { note: 'Đã hoàn tay qua portal', refundReference: 'R-1' });

    // Trang quay về / bộ quét: lượt đã đóng thì không hỏi cổng, không áp.
    expect(await service.settle(order.id, { force: true })).toBe('skipped');

    expect(await service.handleMomoIpn(momoIpn(order.id, PRICE))).toBe('succeeded');
    expect(await activeSubscriptions()).toBe(0);
    const reopened = await prisma.paymentGatewayOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(reopened.status).toBe(PAYMENT_ORDER_STATUS.SUCCEEDED);
    expect(reopened.appliedAt).toBeNull();
    expect(reopened.reviewStatus).toBe(PAYMENT_ORDER_REVIEW_STATUS.OPEN);
    expect(reopened.reviewReason).toBe(PAYMENT_ORDER_REVIEW_REASON.RESULT_AFTER_RESOLUTION);
    // Ghi chú và mã hoàn của lần đóng trước còn nguyên để người trực thấy mình đã làm gì.
    expect(reopened.refundReference).toBe('R-1');

    // Bộ quét cũng không đụng tới lượt người trực đang giữ.
    await sweeper.sweep();
    expect(await activeSubscriptions()).toBe(0);

    const detail = await admin.getOne(order.id);
    expect(detail.canApply).toBe(true);
    const applied = await admin.apply(order.id, ownerId, 'Đối chiếu MoMo: khoản đúng, chưa hoàn');
    expect(applied.applyOutcome).toBe(PAYMENT_ORDER_APPLY_OUTCOME.ACTIVATED);
    expect(applied.reviewStatus).toBe(PAYMENT_ORDER_REVIEW_STATUS.RESOLVED);
    expect(await activeSubscriptions()).toBe(1);
    // Mã hoàn của lần đóng trước không còn đứng cạnh kết luận "đã ghi nhận" — nó sống ở audit.
    expect(applied.refundReference).toBeNull();
    expect(applied.reviewNote).toBe('Đối chiếu MoMo: khoản đúng, chưa hoàn');
    const trail = await prisma.auditLog.findMany({
      where: { targetId: order.id, action: 'payment_gateway_order.apply' },
      select: { beforeJson: true },
    });
    expect(trail).toHaveLength(1);
    expect(trail[0]!.beforeJson).toMatchObject({
      refundReference: 'R-1',
      reviewNote: 'Đã hoàn tay qua portal',
    });
  });

  it('hỏi lại cổng: trả kèm KẾT QUẢ, không luôn báo thành công', async () => {
    if (!dbAvailable) return;
    const invoice = await issueInvoice();
    const order = await service.startInvoiceCheckout(tenantId, invoice.id, request());

    momo.queryResult = null;
    expect((await admin.requery(order.id, ownerId)).outcome).toBe(
      PAYMENT_ORDER_REQUERY_OUTCOME.UNREACHABLE,
    );
    momo.queryResult = paidQueryResult(order.id, PRICE);
    const changed = await admin.requery(order.id, ownerId);
    expect(changed.outcome).toBe(PAYMENT_ORDER_REQUERY_OUTCOME.CHANGED);
    expect(changed.order.applyOutcome).toBe(PAYMENT_ORDER_APPLY_OUTCOME.ACTIVATED);
  });
});
