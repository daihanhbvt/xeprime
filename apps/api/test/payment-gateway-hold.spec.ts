import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BILLING_MODE,
  BOOKING_HOLD_STATUS,
  BOOKING_REQUEST_STATUS,
  type BookingPriceSnapshot,
  FEE_POLICY_STATUS,
  HOLD_REFUND_REASON,
  PAYMENT_GATEWAY_EXPIRY_MARGIN_MINUTES,
  PAYMENT_ORDER_APPLY_OUTCOME,
  PAYMENT_ORDER_REVIEW_REASON,
  PAYMENT_ORDER_REVIEW_STATUS,
  PAYMENT_ORDER_STATUS,
  PAYMENT_ORDER_TARGET,
  PAYMENT_ORDER_VIEW_STATE,
  PLAN_STATUS,
  SUBSCRIPTION_STATUS,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
} from '@xeprime/types';
import type { PrismaService } from '../src/prisma/prisma.service';
import { buildGateway, gatewayEnv, momoIpn, SPEC_WEB } from './helpers/payment-gateway-fixture';
import { releaseWalletObligations } from './helpers/wallet-cleanup';

/**
 * Đường tiền MoMo/VNPAY → TIỀN GIỮ CHỖ → đơn thuê — chạy trên PostgreSQL THẬT (ADR 0058 · ADR 0044).
 *
 * Cổng chỉ là một đường tiền vào khác: đơn thuê vẫn ra đời DUY NHẤT trong transaction áp tiền của
 * `BookingHoldsService` (cùng hàm webhook SePay gọi), không bao giờ vì khách quay về từ cổng. Khoá ở đây:
 *
 *  1. số tiền gửi sang cổng là phần CÒN THIẾU của hold, đọc từ DB; khách khác không chạm được hold;
 *  2. phiên cổng kết thúc TRƯỚC hạn giữ chỗ; cửa sổ còn quá ngắn thì không mở phiên;
 *  3. tiền về đủ ⇒ đúng MỘT đơn, kể cả khi IPN gửi lại;
 *  4. hold đã quá hạn khi tiền về ⇒ KHÔNG tạo đơn (chỗ có thể đã thuộc người khác), vào hàng đợi;
 *  5. hold đã đủ từ trước ⇒ yêu cầu hoàn phần thừa của hold là chủ DUY NHẤT của khoản trùng —
 *     không mở thêm hàng đợi cổng (một đồng, một hàng đợi, không hoàn hai lần);
 *  6. …trừ khi hold KHÔNG ghi được yêu cầu hoàn (đã có khoản hoàn đóng từ trước) — khi đó khoản trùng
 *     vào hàng đợi cổng: tiền không bao giờ nằm ngoài mọi hàng đợi.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const { service, momo, holds } = buildGateway(asService, gatewayEnv);

const RUN = newId().slice(-8).toLowerCase();
/** Giá thuê 1.000.000đ ⇒ phí dịch vụ 10% = 100.000đ — toàn bộ khoản giữ chỗ (cọc = 0). */
const BASE = '1000000';
const HOLD_AMOUNT = 100000;

let dbAvailable = false;
let ownerId: string;
let customerId: string;
let otherCustomerId: string;
let tenantId: string;
let vehicleId: string;
let branchId: string;
let planId: string;
let policyId: string;

const request = (client: 'web' | 'native' = 'web') => ({
  provider: 'momo' as const,
  client,
  locale: 'vi' as const,
  clientIp: '127.0.0.1',
  actorUserId: customerId,
});

/** Snapshot giá giống hệt thứ `PricingService.buildSnapshot` dựng lúc duyệt — xem booking-hold-lifecycle.spec. */
function snapshotOf(): BookingPriceSnapshot {
  const hold = String(HOLD_AMOUNT);
  return {
    calculatedAt: new Date().toISOString(),
    source: 'quote',
    currency: 'VND',
    days: 2,
    rows: [{ key: 'base', label: 'Tiền thuê', amount: BASE }],
    totalAmount: BASE,
    depositAmount: '0',
    policy: null,
    fees: {
      billingMode: BILLING_MODE.COMMISSION,
      policy: {
        policyId,
        version: 1,
        serviceFeePercent: 10,
        holdMinAmount: '20000',
        holdPaymentWindowMinutes: 1440,
        freeCancelHours: 4,
        depositPercent: 0,
        depositMinAmount: '0',
        depositMaxPercent: 30,
        taxEnabled: false,
        taxPercent: null,
        taxLabel: null,
        tripInsuranceEnabled: false,
        tripInsurancePercent: null,
        vehicleProtectionEnabled: false,
        vehicleProtectionPercent: null,
        insurancePartnerName: null,
      },
      baseAmount: BASE,
      lines: [
        { key: 'service_fee', beneficiary: 'platform', bearer: 'customer', percent: 10, amount: hold },
      ],
      customerFeeTotal: hold,
      customerTotalAmount: '1100000',
      depositAmount: '0',
      grossOnlineAmount: hold,
      promoDiscountAmount: '0',
      promo: null,
      onlineAmount: hold,
      payAtPickupAmount: BASE,
      taxAmount: '0',
      ownerPayableAmount: '0',
      ownerNetAmount: BASE,
      holdAmount: hold,
    },
  };
}

/** Một yêu cầu ĐÃ DUYỆT + hold `pending` — dựng đúng hình `approveWithHold` dùng thật. */
async function makeHold(): Promise<{ requestId: string; holdId: string; code: string }> {
  const requestId = newId();
  const pickupAt = new Date(Date.now() + 10 * 24 * 3600_000);
  const returnAt = new Date(pickupAt.getTime() + 2 * 24 * 3600_000);
  await prisma.bookingRequest.create({
    data: {
      id: requestId,
      tenantId,
      vehicleId,
      status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
      customerName: 'Khách Test',
      customerPhone: `090${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
      customerUserId: customerId,
      pickupAt,
      returnAt,
      respondBy: new Date(Date.now() + 3600_000),
      decidedBy: ownerId,
    },
  });
  const acceptedAt = new Date();
  const created = await prisma.$transaction((tx) =>
    holds.createForApprovedRequestWithinTx(tx, {
      tenantId,
      requestId,
      vehicleId,
      vehicleName: 'Xe test',
      customerUserId: customerId,
      schedule: { pickupAt, returnAt, packageMonths: null },
      snapshot: snapshotOf(),
      acceptedAt,
      actorUserId: ownerId,
    }),
  );
  await prisma.bookingRequest.update({
    where: { id: requestId },
    data: { status: BOOKING_REQUEST_STATUS.AWAITING_HOLD, decidedAt: acceptedAt },
  });
  return { requestId, holdId: created.id, code: created.code };
}

/** Chuyển khoản SePay — cùng hàm áp tiền webhook gọi, không qua bảng giao dịch ngân hàng. */
async function payByBank(code: string, amount: number): Promise<void> {
  await prisma.$transaction((tx) =>
    holds.applyBankPaymentWithinTx(tx, {
      code,
      amount: new Prisma.Decimal(amount),
      providerTxId: `pgw-hold-${RUN}-${newId()}`,
    }),
  );
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
  customerId = newId();
  otherCustomerId = newId();
  tenantId = newId();
  vehicleId = newId();
  branchId = newId();
  planId = newId();
  policyId = newId();

  await prisma.user.createMany({
    data: [
      {
        realm: ACCOUNT_REALM.PARTNER,
        id: ownerId,
        displayName: 'Chủ xe',
        email: `pgwh-own-${RUN}@xeprime.test`,
      },
      {
        realm: ACCOUNT_REALM.CUSTOMER,
        id: customerId,
        displayName: 'Khách',
        email: `pgwh-cus-${RUN}@xeprime.test`,
      },
      {
        realm: ACCOUNT_REALM.CUSTOMER,
        id: otherCustomerId,
        displayName: 'Khách khác',
        email: `pgwh-oth-${RUN}@xeprime.test`,
      },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `GatewayHoldShop-${RUN}`,
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
  await prisma.tenantBranch.create({
    data: {
      id: branchId,
      tenantId,
      code: `CN${branchId.slice(-4)}`,
      name: 'Chi nhánh test',
      provinceCode: '79',
      isDefault: true,
    },
  });
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      branchId,
      code: `XE${vehicleId.slice(-5)}`,
      name: 'Xe test',
      vehicleType: 'car',
      plateNumber: `51G-${RUN.slice(0, 5)}`,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      weekdayPrice: new Prisma.Decimal(500_000),
      createdBy: ownerId,
    },
  });
  // Gói tuyến HOA HỒNG — điều kiện để chuyến chịu phí dịch vụ (ADR 0024 điều 1).
  await prisma.plan.create({
    data: {
      id: planId,
      code: `pgwh-commission-${RUN}`,
      name: 'Hoa hồng test',
      status: PLAN_STATUS.ACTIVE,
      billingMode: BILLING_MODE.COMMISSION,
      commissionPercent: new Prisma.Decimal(10),
      basePriceMonthly: new Prisma.Decimal(0),
      limitsJson: { features: [] } as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.tenantSubscription.create({
    data: {
      id: newId(),
      tenantId,
      planId,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      price: 0,
      termMonths: 12,
      billingMode: BILLING_MODE.COMMISSION,
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 365 * 24 * 3600_000),
    },
  });
  await prisma.feePolicy.create({
    data: {
      id: policyId,
      // Dải 500–589: các spec khác giữ 600–989 (cột `version` unique toàn bảng).
      version: 500 + Math.floor(Math.random() * 90),
      status: FEE_POLICY_STATUS.ARCHIVED, // không đụng bản `active` toàn sàn của spec khác
      name: `Policy cổng test ${RUN}`,
      serviceFeePercent: new Prisma.Decimal(10),
      holdMinAmount: new Prisma.Decimal(20_000),
      holdPaymentWindowMinutes: 1440,
      freeCancelHours: 4,
    },
  });
});

afterEach(async () => {
  if (!dbAvailable) return;
  momo.created = [];
  momo.queryResult = null;
  // RESTRICT: nhật ký và lượt cổng đi TRƯỚC hold.
  await prisma.paymentGatewayOrderEvent.deleteMany({ where: { order: { tenantId } } });
  await prisma.paymentGatewayOrder.deleteMany({ where: { tenantId } });
  await prisma.holdRefund.deleteMany({ where: { tenantId } });
  await prisma.bookingHold.deleteMany({ where: { tenantId } });
  await prisma.vehicleOccupancy.deleteMany({ where: { tenantId } });
  await prisma.booking.deleteMany({ where: { tenantId } });
  await prisma.bookingRequest.deleteMany({ where: { tenantId } });
  await prisma.notification.deleteMany({ where: { tenantId } });
});

afterAll(async () => {
  if (dbAvailable) {
    await releaseWalletObligations(prisma, {
      tenantIds: [tenantId],
      userIds: [ownerId, customerId, otherCustomerId],
    });
    await prisma.auditLog.deleteMany({ where: { tenantId } });
    await prisma.tenantCustomer.deleteMany({ where: { tenantId } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId } });
    await prisma.plan.deleteMany({ where: { id: planId } });
    await prisma.feePolicy.deleteMany({ where: { id: policyId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, customerId, otherCustomerId] } },
    });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Mở phiên cho tiền giữ chỗ', () => {
  maybe(
    'số tiền = phần CÒN THIẾU đọc từ DB; quay về trang chuyến; phiên hết TRƯỚC hạn giữ chỗ',
    async () => {
      const { requestId, holdId, code } = await makeHold();
      // Khách đã chuyển khoản một phần — cổng chỉ thu phần còn lại.
      await payByBank(code, 40000);

      const order = await service.startHoldCheckout(customerId, requestId, request('native'));
      expect(order.amount).toBe('60000');
      expect(order.tripId).toBe(requestId);
      expect(momo.created[0]!.amount).toBe(60000);
      // App native: trang web quay về mang cờ để hiện nút mở lại app.
      expect(momo.created[0]!.returnUrl).toBe(
        `${SPEC_WEB.customer}/payment/${requestId}?paymentOrder=${order.id}&app=1`,
      );

      const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
      expect(new Date(order.expiresAt).getTime()).toBeLessThanOrEqual(
        hold.expiresAt.getTime() - PAYMENT_GATEWAY_EXPIRY_MARGIN_MINUTES * 60_000,
      );
    },
  );

  maybe('hold của khách KHÁC: không tồn tại với người gọi', async () => {
    const { requestId } = await makeHold();
    await expect(
      service.startHoldCheckout(otherCustomerId, requestId, request()),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: API_ERROR_CODE.NOT_FOUND }),
    });
    expect(momo.created).toHaveLength(0);
  });

  maybe('hạn giữ chỗ còn quá ngắn: không mở phiên — khách chuyển khoản', async () => {
    const { requestId, holdId } = await makeHold();
    await prisma.bookingHold.update({
      where: { id: holdId },
      data: { expiresAt: new Date(Date.now() + 5 * 60_000) },
    });
    await expect(service.startHoldCheckout(customerId, requestId, request())).rejects.toMatchObject({
      response: expect.objectContaining({ code: API_ERROR_CODE.PAYMENT_HOLD_WINDOW_TOO_SHORT }),
    });
    expect(momo.created).toHaveLength(0);
  });

  maybe('luồng giữ chỗ chưa bật: không có phương thức nào, mở phiên bị từ chối', async () => {
    const off = buildGateway(asService, { ...gatewayEnv, PAYMENT_GATEWAY_BOOKING_HOLD: 'off' });
    expect(off.service.methods(PAYMENT_ORDER_TARGET.BOOKING_HOLD).methods).toEqual([]);
    const { requestId } = await makeHold();
    await expect(
      off.service.startHoldCheckout(customerId, requestId, request()),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: API_ERROR_CODE.PAYMENT_GATEWAY_UNAVAILABLE }),
    });
  });
});

describe('Tiền về qua cổng', () => {
  maybe('đủ tiền ⇒ đơn thuê ra đời đúng MỘT lần; IPN gửi lại không tạo đơn thứ hai', async () => {
    const { requestId, holdId } = await makeHold();
    const order = await service.startHoldCheckout(customerId, requestId, request());
    const ipn = momoIpn(order.id, HOLD_AMOUNT);

    expect(await service.handleMomoIpn(ipn)).toBe('succeeded');
    expect(await service.handleMomoIpn(ipn)).toBe('already_succeeded');

    expect(await prisma.booking.count({ where: { tenantId } })).toBe(1);
    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe(BOOKING_HOLD_STATUS.PAID);
    expect(hold.paidAmount.toFixed(0)).toBe(String(HOLD_AMOUNT));
    const req = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(req.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);

    const view = await service.orderForCustomer(customerId, order.id);
    expect(view.viewState).toBe(PAYMENT_ORDER_VIEW_STATE.COMPLETED);
    // Khách khác không đọc được lượt của chuyến này.
    await expect(service.orderForCustomer(otherCustomerId, order.id)).rejects.toMatchObject({
      response: expect.objectContaining({ code: API_ERROR_CODE.NOT_FOUND }),
    });
  });

  maybe('hold đã QUÁ HẠN khi tiền về: KHÔNG tạo đơn, vào hàng đợi người xử lý', async () => {
    const { requestId, holdId } = await makeHold();
    const order = await service.startHoldCheckout(customerId, requestId, request());
    // Worker chưa kịp lật status — mốc mới là sự thật (ADR 0044 điều 7).
    await prisma.bookingHold.update({
      where: { id: holdId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    expect(await service.handleMomoIpn(momoIpn(order.id, HOLD_AMOUNT))).toBe('succeeded');
    expect(await prisma.booking.count({ where: { tenantId } })).toBe(0);
    const row = await prisma.paymentGatewayOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(row.status).toBe(PAYMENT_ORDER_STATUS.SUCCEEDED);
    expect(row.applyOutcome).toBe(PAYMENT_ORDER_APPLY_OUTCOME.TARGET_CLOSED);
    expect(row.reviewStatus).toBe(PAYMENT_ORDER_REVIEW_STATUS.OPEN);
    expect(row.reviewReason).toBe(PAYMENT_ORDER_REVIEW_REASON.TARGET_CLOSED);

    const view = await service.orderForCustomer(customerId, order.id);
    expect(view.viewState).toBe(PAYMENT_ORDER_VIEW_STATE.NEEDS_SUPPORT);
  });

  maybe(
    'hold đã đủ bằng chuyển khoản rồi cổng mới báo thu: hoàn phần thừa qua hold, KHÔNG mở hàng đợi cổng',
    async () => {
      const { requestId, holdId, code } = await makeHold();
      const order = await service.startHoldCheckout(customerId, requestId, request());
      await payByBank(code, HOLD_AMOUNT);
      expect(await prisma.booking.count({ where: { tenantId } })).toBe(1);

      expect(await service.handleMomoIpn(momoIpn(order.id, HOLD_AMOUNT))).toBe('succeeded');
      expect(await prisma.booking.count({ where: { tenantId } })).toBe(1);

      const row = await prisma.paymentGatewayOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.applyOutcome).toBe(PAYMENT_ORDER_APPLY_OUTCOME.ALREADY_PAID);
      expect(row.reviewStatus).toBe(PAYMENT_ORDER_REVIEW_STATUS.NONE);

      const refund = await prisma.holdRefund.findUniqueOrThrow({ where: { holdId } });
      expect(refund.reason).toBe(HOLD_REFUND_REASON.OVERPAID);
      expect(refund.amount.toFixed(0)).toBe(String(HOLD_AMOUNT));

      // Khách thấy "khoản trùng đã được hoàn" — không phải "xong", cũng không phải lời hứa "hỗ trợ
      // sẽ liên hệ" mà không hàng đợi nào thực hiện.
      const view = await service.orderForCustomer(customerId, order.id);
      expect(view.viewState).toBe(PAYMENT_ORDER_VIEW_STATE.DUPLICATE_REFUNDED);
    },
  );

  maybe(
    'hold đã có khoản hoàn ĐÓNG từ trước: khoản trùng qua cổng vào hàng đợi cổng, không rơi khỏi sổ',
    async () => {
      const { requestId, holdId, code } = await makeHold();
      const order = await service.startHoldCheckout(customerId, requestId, request());
      await payByBank(code, HOLD_AMOUNT);
      // Chuyển thừa một ít ⇒ hold ghi khoản hoàn và (khách có tài khoản) ghi có ví ngay: `credited`.
      await payByBank(code, 1000);
      const first = await prisma.holdRefund.findUniqueOrThrow({ where: { holdId } });
      expect(first.amount.toFixed(0)).toBe('1000');

      expect(await service.handleMomoIpn(momoIpn(order.id, HOLD_AMOUNT))).toBe('succeeded');

      const row = await prisma.paymentGatewayOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(row.applyOutcome).toBe(PAYMENT_ORDER_APPLY_OUTCOME.ALREADY_PAID);
      expect(row.reviewStatus).toBe(PAYMENT_ORDER_REVIEW_STATUS.OPEN);
      expect(row.reviewReason).toBe(PAYMENT_ORDER_REVIEW_REASON.OVERPAID);
      // Khoản hoàn đã đóng KHÔNG bị cộng dồn lặng lẽ.
      const after = await prisma.holdRefund.findUniqueOrThrow({ where: { holdId } });
      expect(after.amount.toFixed(0)).toBe('1000');

      const view = await service.orderForCustomer(customerId, order.id);
      expect(view.viewState).toBe(PAYMENT_ORDER_VIEW_STATE.NEEDS_SUPPORT);
    },
  );
});
