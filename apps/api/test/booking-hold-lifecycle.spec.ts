import { ConfigService } from '@nestjs/config';
import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  AUDIT_ACTOR_SCOPE,
  BILLING_MODE,
  BOOKING_HOLD_OUTCOME,
  BOOKING_HOLD_STATUS,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  FEE_POLICY_STATUS,
  HOLD_REFUND_REASON,
  HOLD_REFUND_STATUS,
  OCCUPANCY_SOURCE_TYPE,
  PLAN_STATUS,
  SUBSCRIPTION_STATUS,
  SUPPORT_CASE_CATEGORY,
  SUPPORT_CASE_STATUS,
  SUPPORT_PARTY,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  type BookingPriceSnapshot,
} from '@xeprime/types';
import { SepayService } from '../src/modules/sepay/sepay.service';
import { HoldSettlementService } from '../src/modules/holds/hold-settlement.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { NotificationService } from '../src/modules/notification/notification.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeBillingService,
  makeBookingHoldsService,
  makeBookingsService,
} from './helpers/service-factory';

/**
 * VÒNG ĐỜI KHOẢN GIỮ CHỖ — đường tiền của tuyến hoa hồng (R3, ADR 0028/0029) trên PostgreSQL THẬT.
 *
 * Đây là spec của **Gate R3**: *"tiền vào, hoàn và giữ của mọi case khớp sổ; không có bút toán mồ
 * côi hoặc cộng đôi"*. Mỗi khối dưới đây là một case của gate đó:
 *
 *  1. Thiếu tiền → KHÔNG tạo đơn, giữ mã để chuyển bù; đủ → đơn ra đời trong CÙNG transaction.
 *  2. Webhook gửi lại / hai giao dịch song song → đúng MỘT đơn, tiền không cộng đôi.
 *  3. Chuyển THỪA → ghi yêu cầu hoàn phần dư (giữ chỗ không có "kỳ sau" — ADR 0022 điều 5).
 *  4. Hết hạn → nhả lịch, không ai giữ chỗ của người khác.
 *  5. Kết cục theo mốc huỷ ĐÃ ĐÓNG BĂNG: sớm → hoàn, muộn → chủ xe hưởng, hoàn thành → nền tảng giữ.
 *  6. Tranh chấp mở → TẠM GIỮ kết cục, không tự chốt.
 *
 * Tiền là `Decimal`; mọi khẳng định so bằng chuỗi để không rơi vào sai số dấu phẩy động.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const audit = new AuditService(asService);
const notifications = new NotificationService(asService);
const holds = makeBookingHoldsService(asService);
const bookings = makeBookingsService(asService);
const settlement = new HoldSettlementService(asService, audit, notifications);
const sepay = new SepayService(asService, makeBillingService(asService), holds, {
  get: (key: string) => (key === 'SEPAY_API_KEY' ? 'test-key-0123456789abcdef' : undefined),
} as unknown as ConfigService);

const RUN = newId().slice(-8).toLowerCase();
/** Tiền tố mã giao dịch riêng — `bank_transactions` là bảng toàn sàn, xem `sepay-webhook.spec.ts`. */
const TX_PREFIX = `hold-${RUN}-`;
const ownRows = { providerTxId: { startsWith: TX_PREFIX } } as const;

let dbAvailable = false;
let ownerId: string;
let customerId: string;
let tenantId: string;
let vehicleId: string;
let branchId: string;
let planId: string;
let policyId: string;
let txCounter = 0;

/** Giá thuê 1.000.000đ ⇒ phí dịch vụ 10% = 100.000đ (trên sàn 20.000). */
const BASE = '1000000';
const HOLD_AMOUNT = '100000';

function payload(code: string, amount: number): Record<string, unknown> {
  txCounter += 1;
  return {
    id: `${TX_PREFIX}${txCounter}`,
    transferType: 'in',
    transferAmount: amount,
    content: `chuyen khoan ${code}`,
    /*
     * NGÀY HÔM NAY theo giờ Việt Nam, không phải một mốc cứng: `dailyReconciliation` lọc theo
     * `bank_time`, nên một ngày cố định biến case đối chiếu thành quả bom hẹn giờ — xanh tới
     * ngày đó rồi đỏ mãi mãi (đã nổ ngày 09/09/2026).
     */
    transactionDate: `${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })} 09:00:00`,
  };
}

/** Snapshot giá + phụ phí giống hệt thứ `PricingService.buildSnapshot` dựng lúc duyệt. */
function snapshotOf(): BookingPriceSnapshot {
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
        {
          key: 'service_fee',
          beneficiary: 'platform',
          bearer: 'customer',
          percent: 10,
          amount: HOLD_AMOUNT,
        },
      ],
      customerFeeTotal: HOLD_AMOUNT,
      customerTotalAmount: '1100000',
      ownerNetAmount: BASE,
      holdAmount: HOLD_AMOUNT,
    },
  };
}

/** Một yêu cầu ĐÃ DUYỆT + hold `pending` — điểm xuất phát của mọi case bên dưới. */
async function makeHold(offsetDays = 10): Promise<{ requestId: string; holdId: string; code: string }> {
  const requestId = newId();
  const pickupAt = new Date(Date.now() + offsetDays * 24 * 3600_000);
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
  const created = await prisma.$transaction((tx) =>
    holds.createForApprovedRequestWithinTx(tx, {
      tenantId,
      requestId,
      vehicleId,
      vehicleName: 'Xe test',
      customerUserId: customerId,
      schedule: { pickupAt, returnAt, packageMonths: null },
      snapshot: snapshotOf(),
      actorUserId: ownerId,
    }),
  );
  await prisma.bookingRequest.update({
    where: { id: requestId },
    data: { status: BOOKING_REQUEST_STATUS.AWAITING_HOLD },
  });
  return { requestId, holdId: created.id, code: created.code };
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
  tenantId = newId();
  vehicleId = newId();
  branchId = newId();
  planId = newId();
  policyId = newId();

  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ xe', email: `hold-own-${RUN}@xeprime.test` },
      { id: customerId, displayName: 'Khách', email: `hold-cus-${RUN}@xeprime.test` },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `HoldShop-${RUN}`,
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
      plateNumber: `51A-${RUN.slice(0, 5)}`,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      weekdayPrice: new Prisma.Decimal(500_000),
      createdBy: ownerId,
    },
  });
  // Gói tuyến HOA HỒNG — điều kiện để chuyến chịu phí dịch vụ (ADR 0024 điều 1).
  await prisma.plan.create({
    data: {
      id: planId,
      code: `hold-commission-${RUN}`,
      name: 'Hoa hồng test',
      status: PLAN_STATUS.ACTIVE,
      billingMode: BILLING_MODE.COMMISSION,
      commissionPercent: new Prisma.Decimal(10),
      basePriceMonthly: new Prisma.Decimal(0),
      price: 0,
      durationDays: 30,
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
      version: 900 + Math.floor(Math.random() * 90),
      status: FEE_POLICY_STATUS.ARCHIVED, // không đụng bản `active` toàn sàn của spec khác
      name: `Policy test ${RUN}`,
      serviceFeePercent: new Prisma.Decimal(10),
      holdMinAmount: new Prisma.Decimal(20_000),
      holdPaymentWindowMinutes: 1440,
      freeCancelHours: 4,
    },
  });
});

afterEach(async () => {
  if (!dbAvailable) return;
  await prisma.bankTransaction.deleteMany({ where: ownRows });
  await prisma.holdRefund.deleteMany({ where: { tenantId } });
  await prisma.supportCase.deleteMany({ where: { tenantId } });
  await prisma.bookingHold.deleteMany({ where: { tenantId } });
  await prisma.vehicleOccupancy.deleteMany({ where: { tenantId } });
  await prisma.booking.deleteMany({ where: { tenantId } });
  await prisma.bookingRequest.deleteMany({ where: { tenantId } });
  await prisma.notification.deleteMany({ where: { tenantId } });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.tenantCustomer.deleteMany({ where: { tenantId } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId } });
    await prisma.plan.deleteMany({ where: { id: planId } });
    await prisma.feePolicy.deleteMany({ where: { id: policyId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantBranch.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, customerId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Tạo hold khi duyệt — chiếm lịch, chưa có đơn', () => {
  maybe('hold `pending` + CHIẾM LỊCH ngay, chưa có đơn thuê nào', async () => {
    const { requestId, holdId } = await makeHold();

    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe(BOOKING_HOLD_STATUS.PENDING);
    expect(hold.amount.toFixed(0)).toBe(HOLD_AMOUNT);
    expect(hold.code.startsWith('XPH')).toBe(true);

    // Chiếm lịch từ lúc duyệt: nếu không, hai khách cùng được duyệt một chỗ.
    const occ = await prisma.vehicleOccupancy.findFirst({
      where: { sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST, sourceId: requestId },
    });
    expect(occ).not.toBeNull();
    expect(await prisma.booking.count({ where: { tenantId } })).toBe(0);
  });

  maybe('mốc huỷ miễn phí ĐÓNG BĂNG theo chính sách, không tính lại từ giờ nhận', async () => {
    const { holdId } = await makeHold(10);
    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    const req = await prisma.bookingRequest.findFirstOrThrow({ where: { tenantId } });
    // freeCancelHours = 4 ⇒ đúng 4 giờ trước giờ nhận.
    expect(hold.freeCancelUntil.getTime()).toBe(req.pickupAt!.getTime() - 4 * 3600_000);
  });
});

describe('Tiền về — thiếu / đủ / thừa (ADR 0016 điều 6 · ADR 0022 điều 5)', () => {
  maybe('chuyển THIẾU: `underpaid`, KHÔNG tạo đơn, giữ mã để chuyển bù', async () => {
    const { code, holdId } = await makeHold();
    const res = await sepay.ingest(payload(code, 40_000));
    expect(res).toMatchObject({ matched: true, note: 'partial' });

    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe(BOOKING_HOLD_STATUS.UNDERPAID);
    expect(hold.paidAmount.toFixed(0)).toBe('40000');
    expect(hold.bookingId).toBeNull();
    expect(await prisma.booking.count({ where: { tenantId } })).toBe(0);
  });

  maybe('chuyển bù cho ĐỦ: đơn thuê ra đời trong CÙNG transaction, lịch chuyển sang đơn', async () => {
    const { code, holdId, requestId } = await makeHold();
    await sepay.ingest(payload(code, 40_000));
    const res = await sepay.ingest(payload(code, 60_000));
    expect(res).toMatchObject({ matched: true, note: 'activated' });

    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe(BOOKING_HOLD_STATUS.PAID);
    expect(hold.paidAmount.toFixed(0)).toBe(HOLD_AMOUNT);
    expect(hold.bookingId).not.toBeNull();

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: hold.bookingId! } });
    // Đơn mang ĐÚNG giá thuê; phí dịch vụ nằm ở cột riêng, KHÔNG cộng vào doanh thu gian hàng.
    expect(booking.totalAmount.toFixed(0)).toBe(BASE);
    expect(booking.serviceFeeAmount.toFixed(0)).toBe(HOLD_AMOUNT);
    expect(booking.customerTotalAmount?.toFixed(0)).toBe('1100000');
    expect(booking.billingMode).toBe(BILLING_MODE.COMMISSION);

    const req = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(req.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
    expect(req.bookingId).toBe(booking.id);

    // Lịch của YÊU CẦU đã nhả, lịch của ĐƠN đã đặt — đúng một bản ghi chiếm chỗ.
    expect(
      await prisma.vehicleOccupancy.count({
        where: { sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST, sourceId: requestId },
      }),
    ).toBe(0);
    expect(
      await prisma.vehicleOccupancy.count({
        where: { sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING, sourceId: booking.id },
      }),
    ).toBe(1);
  });

  maybe('webhook gửi LẠI cùng mã giao dịch: 200 duplicate, KHÔNG tạo đơn thứ hai', async () => {
    const { code } = await makeHold();
    const body = payload(code, 100_000);
    const first = await sepay.ingest(body);
    const second = await sepay.ingest(body);

    expect(first).toMatchObject({ duplicate: false, matched: true });
    expect(second).toMatchObject({ duplicate: true });
    expect(await prisma.booking.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.bankTransaction.count({ where: ownRows })).toBe(1);
  });

  maybe('hai giao dịch ĐỦ TIỀN chạy song song: đúng MỘT đơn, phần dư thành yêu cầu hoàn', async () => {
    const { code, holdId } = await makeHold();
    const results = await Promise.allSettled([
      sepay.ingest(payload(code, 100_000)),
      sepay.ingest(payload(code, 100_000)),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);

    expect(await prisma.booking.count({ where: { tenantId } })).toBe(1);
    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.paidAmount.toFixed(0)).toBe('200000');

    // Phần dư KHÔNG bị nuốt: nó là tiền của khách và phải có đường về.
    const refund = await prisma.holdRefund.findUniqueOrThrow({ where: { holdId } });
    expect(refund.reason).toBe(HOLD_REFUND_REASON.OVERPAID);
    expect(refund.amount.toFixed(0)).toBe('100000');
  });

  maybe('chuyển THỪA ngay lần đầu: mở đơn + ghi hoàn phần dư', async () => {
    const { code, holdId } = await makeHold();
    await sepay.ingest(payload(code, 130_000));

    expect(await prisma.booking.count({ where: { tenantId } })).toBe(1);
    const refund = await prisma.holdRefund.findUniqueOrThrow({ where: { holdId } });
    expect(refund.amount.toFixed(0)).toBe('30000');
    expect(refund.status).toBe(HOLD_REFUND_STATUS.PENDING);
  });

  maybe('hold ĐÃ QUÁ HẠN không nhận tiền — giao dịch nằm lại hàng đợi admin', async () => {
    const { code, holdId } = await makeHold();
    await prisma.bookingHold.update({
      where: { id: holdId },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    const res = await sepay.ingest(payload(code, 100_000));
    expect(res.matched).toBe(false);
    expect(await prisma.booking.count({ where: { tenantId } })).toBe(0);
  });
});

describe('Kết cục — tiền về tay ai (ADR 0028 điều 6)', () => {
  /** Đưa một hold tới trạng thái đã trả + đã có đơn. */
  async function paidHold(offsetDays = 10) {
    const made = await makeHold(offsetDays);
    await sepay.ingest(payload(made.code, 100_000));
    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: made.holdId } });
    return { ...made, bookingId: hold.bookingId! };
  }

  maybe('chuyến HOÀN THÀNH ⇒ `kept`: nền tảng giữ phí, không sinh yêu cầu hoàn', async () => {
    const { holdId, bookingId } = await paidHold();
    await prisma.$transaction(async (tx) => {
      await bookings.transitionWithinTx(tx, tenantId, bookingId, ownerId, BOOKING_STATUS.RESERVED, BOOKING_STATUS.CONFIRMED);
      await bookings.transitionWithinTx(tx, tenantId, bookingId, ownerId, BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.ACTIVE);
      await bookings.transitionWithinTx(tx, tenantId, bookingId, ownerId, BOOKING_STATUS.ACTIVE, BOOKING_STATUS.COMPLETED);
    });

    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.outcome).toBe(BOOKING_HOLD_OUTCOME.KEPT);
    expect(hold.status).toBe(BOOKING_HOLD_STATUS.RELEASED);
    expect(await prisma.holdRefund.count({ where: { holdId } })).toBe(0);
  });

  maybe('KHÁCH huỷ TRƯỚC mốc miễn phí ⇒ `refunded` + yêu cầu hoàn đủ số đã trả', async () => {
    // Giờ nhận còn 10 ngày ⇒ đang trong cửa sổ huỷ miễn phí.
    const { holdId, bookingId } = await paidHold(10);
    await prisma.$transaction((tx) =>
      bookings.transitionWithinTx(tx, tenantId, bookingId, customerId, BOOKING_STATUS.RESERVED, BOOKING_STATUS.CANCELLED, {
        actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
      }),
    );

    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.outcome).toBe(BOOKING_HOLD_OUTCOME.REFUNDED);
    const refund = await prisma.holdRefund.findUniqueOrThrow({ where: { holdId } });
    expect(refund.reason).toBe(HOLD_REFUND_REASON.EARLY_CANCEL);
    expect(refund.amount.toFixed(0)).toBe(HOLD_AMOUNT);
  });

  maybe('KHÁCH huỷ SAU mốc miễn phí ⇒ `forfeited`, KHÔNG hoàn', async () => {
    const { holdId, bookingId } = await paidHold(10);
    // Dời mốc miễn phí về quá khứ — mốc là CỘT đã đóng băng, đây là cách mô phỏng "đã qua mốc".
    await prisma.bookingHold.update({
      where: { id: holdId },
      data: { freeCancelUntil: new Date(Date.now() - 3600_000) },
    });
    await prisma.$transaction((tx) =>
      bookings.transitionWithinTx(tx, tenantId, bookingId, customerId, BOOKING_STATUS.RESERVED, BOOKING_STATUS.CANCELLED, {
        actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
      }),
    );

    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.outcome).toBe(BOOKING_HOLD_OUTCOME.FORFEITED);
    expect(await prisma.holdRefund.count({ where: { holdId } })).toBe(0);
  });

  maybe('GIAN HÀNG huỷ ⇒ `refunded` dù đã qua mốc — khách không có lỗi', async () => {
    const { holdId, bookingId } = await paidHold(10);
    await prisma.bookingHold.update({
      where: { id: holdId },
      data: { freeCancelUntil: new Date(Date.now() - 3600_000) },
    });
    await prisma.$transaction((tx) =>
      bookings.transitionWithinTx(tx, tenantId, bookingId, ownerId, BOOKING_STATUS.RESERVED, BOOKING_STATUS.CANCELLED, {
        actorScope: AUDIT_ACTOR_SCOPE.TENANT,
      }),
    );

    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.outcome).toBe(BOOKING_HOLD_OUTCOME.REFUNDED);
    const refund = await prisma.holdRefund.findUniqueOrThrow({ where: { holdId } });
    expect(refund.reason).toBe(HOLD_REFUND_REASON.OWNER_CANCEL);
  });

  maybe('chốt kết cục là IDEMPOTENT — chuyển trạng thái lần nữa không ghi đè, không hoàn hai lần', async () => {
    const { holdId, bookingId } = await paidHold();
    await prisma.$transaction((tx) =>
      bookings.transitionWithinTx(tx, tenantId, bookingId, customerId, BOOKING_STATUS.RESERVED, BOOKING_STATUS.CANCELLED, {
        actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
      }),
    );
    // Gọi lại hook trực tiếp — mô phỏng worker/retry chạy lại.
    await prisma.$transaction((tx) =>
      settlement.settleForBookingWithinTx(tx, {
        bookingId,
        tenantId,
        to: BOOKING_STATUS.CANCELLED,
        actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
        actorUserId: customerId,
      }),
    );

    expect(await prisma.holdRefund.count({ where: { holdId } })).toBe(1);
    const refund = await prisma.holdRefund.findUniqueOrThrow({ where: { holdId } });
    expect(refund.amount.toFixed(0)).toBe(HOLD_AMOUNT);
  });

  maybe('TRANH CHẤP mở ⇒ kết cục bị TẠM GIỮ, admin chốt tay sau', async () => {
    const { holdId, bookingId } = await paidHold();
    await prisma.supportCase.create({
      data: {
        id: newId(),
        code: `SC${RUN.slice(0, 6).toUpperCase()}`,
        tenantId,
        bookingId,
        openedByUserId: customerId,
        openedByScope: SUPPORT_PARTY.CUSTOMER,
        category: SUPPORT_CASE_CATEGORY.DISPUTE,
        status: SUPPORT_CASE_STATUS.OPEN,
        subject: 'Xe không đúng mô tả',
        description: 'Khiếu nại thử',
      },
    });

    await prisma.$transaction((tx) =>
      bookings.transitionWithinTx(tx, tenantId, bookingId, customerId, BOOKING_STATUS.RESERVED, BOOKING_STATUS.CANCELLED, {
        actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
      }),
    );

    // Đơn VẪN huỷ được — chuyển trạng thái là việc vận hành xe, tiền đi sau.
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(booking.status).toBe(BOOKING_STATUS.CANCELLED);
    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.outcome).toBeNull();
    expect(hold.status).toBe(BOOKING_HOLD_STATUS.PAID);

    // Admin chốt tay sau khi case kết luận.
    await settlement.adminSettle(holdId, ownerId, {
      outcome: BOOKING_HOLD_OUTCOME.REFUNDED,
      note: 'Kết luận tranh chấp: hoàn khách',
    });
    const after = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(after.outcome).toBe(BOOKING_HOLD_OUTCOME.REFUNDED);
    expect(await prisma.holdRefund.count({ where: { holdId } })).toBe(1);
  });
});

describe('Hoàn tiền — đường chuyển trả của admin', () => {
  maybe('chưa khai tài khoản thì KHÔNG chuyển được', async () => {
    const { holdId } = await makeHold();
    const refund = await prisma.holdRefund.create({
      data: {
        id: newId(),
        holdId,
        tenantId,
        customerUserId: customerId,
        amount: new Prisma.Decimal(50_000),
        status: HOLD_REFUND_STATUS.PENDING,
        reason: HOLD_REFUND_REASON.ADMIN_DECISION,
      },
    });
    await expect(
      settlement.markRefundPaid(refund.id, ownerId, { bankReference: 'FT123' }),
    ).rejects.toThrow();
  });

  maybe('khai tài khoản → admin chuyển → `paid` có bằng chứng, và không chuyển lại được', async () => {
    const { holdId } = await makeHold();
    const refund = await prisma.holdRefund.create({
      data: {
        id: newId(),
        holdId,
        tenantId,
        customerUserId: customerId,
        amount: new Prisma.Decimal(50_000),
        status: HOLD_REFUND_STATUS.PENDING,
        reason: HOLD_REFUND_REASON.EARLY_CANCEL,
      },
    });
    await settlement.provideRefundAccount(holdId, customerId, {
      bankCode: 'vcb',
      bankAccountNumber: '0123 456 789',
      bankAccountName: 'Nguyen Van A',
    });
    await settlement.markRefundPaid(refund.id, ownerId, { bankReference: 'FT-OUT-1' });

    const row = await prisma.holdRefund.findUniqueOrThrow({ where: { id: refund.id } });
    expect(row.status).toBe(HOLD_REFUND_STATUS.PAID);
    expect(row.bankCode).toBe('VCB');
    expect(row.bankAccountNumber).toBe('0123456789');
    expect(row.paidBy).toBe(ownerId);
    expect(row.bankReference).toBe('FT-OUT-1');

    // Chuyển hai lần cho một khoản là mất tiền — chặn ở điều kiện trạng thái.
    await expect(
      settlement.markRefundPaid(refund.id, ownerId, { bankReference: 'FT-OUT-2' }),
    ).rejects.toThrow();
  });
});

describe('Đối chiếu ngày — sổ phải khớp ngân hàng', () => {
  maybe('tiền vào khớp hold nằm đúng cột, chênh lệch bằng 0', async () => {
    const { code } = await makeHold();
    await sepay.ingest(payload(code, 100_000));

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
    const rec = await holds.dailyReconciliation(today);

    // Giao dịch của spec khác cũng nằm trong ngày, nên khẳng định vào BẤT BIẾN chứ không vào
    // con số tuyệt đối: mọi đồng vào đều thuộc đúng một nhóm, không có dòng mồ côi.
    expect(rec.variance).toBe('0');
    expect(Number(rec.matchedHolds)).toBeGreaterThanOrEqual(100_000);
  });
});
