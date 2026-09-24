import { ConfigService } from '@nestjs/config';
import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  AUDIT_ACTOR_SCOPE,
  BANK_MATCH_STATUS,
  BANK_MATCH_TARGET_TYPE,
  BILLING_MODE,
  BOOKING_HOLD_OUTCOME,
  BOOKING_HOLD_STATUS,
  BOOKING_REQUEST_STATUS,
  BOOKING_STATUS,
  DEPOSIT_COLLECTION_MODE,
  FEE_POLICY_STATUS,
  NOTIFICATION_TYPE,
  HOLD_PAYMENT_WINDOW_MINUTES,
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
import { sweepBookingHoldExpiry } from '../../worker/src/jobs/booking-hold-expiry';
import { sweepBookingRequestDeadlines } from '../../worker/src/jobs/booking-request-deadlines';
import { SepayService } from '../src/modules/sepay/sepay.service';
import { HoldSettlementService } from '../src/modules/holds/hold-settlement.service';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { AuditService } from '../src/modules/audit/audit.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeNotificationService,
  makeBillingService,
  makeBookingHoldsService,
  makeBookingsService,
  makeBookingRequestsService,
} from './helpers/service-factory';
import { releaseWalletObligations } from './helpers/wallet-cleanup';

/**
 * VÒNG ĐỜI KHOẢN GIỮ CHỖ — đường tiền của tuyến hoa hồng (R3, ADR 0028/0029) trên PostgreSQL THẬT.
 *
 * Đây là spec của **Gate R3**: *"tiền vào, hoàn và giữ của mọi case khớp sổ; không có bút toán mồ
 * côi hoặc cộng đôi"*. Mỗi khối dưới đây là một case của gate đó:
 *
 *  1. Thiếu tiền → KHÔNG tạo đơn, giữ mã để chuyển bù; đủ → đơn ra đời trong CÙNG transaction.
 *     Hold chỉ sinh SAU khi chuyến đã được nhận (ADR 0044), nên `decided_at` luôn có ở dữ liệu mới.
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
const notifications = makeNotificationService(asService);
const holds = makeBookingHoldsService(asService);
const bookings = makeBookingsService(asService);
const settlement = new HoldSettlementService(asService, audit, notifications, new WalletService(asService));
const sepay = new SepayService(asService, makeBillingService(asService), holds, {
  get: (key: string) => (key === 'SEPAY_API_KEY' ? 'test-key-0123456789abcdef' : undefined),
} as unknown as ConfigService);

/**
 * Đường DUYỆT/TỪ CHỐI của gian hàng — cần cho các ca ADR 0039 ở cuối file, nơi gian hàng phải
 * quyết định SAU khi khách đã trả tiền.
 */
const requests = makeBookingRequestsService(asService, {
  phoneVerification: {
    assertPhoneVerifiedForBooking: async () => {},
  } as unknown as Parameters<typeof makeBookingRequestsService>[1]['phoneVerification'],
  auth: {
    resolveOrCreateUserByPhone: async () => ({ userId: customerId }),
  } as unknown as Parameters<typeof makeBookingRequestsService>[1]['auth'],
  bookings,
  audit,
  notifications,
});

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
      // Chính sách của spec này để cọc = 0 ⇒ toàn bộ khoản giữ chỗ là phí dịch vụ, đúng như
      // trước ADR 0032. Công thức D + S + IV + IP được khoá ở fee-policy.test.ts.
      depositAmount: '0',
      // Không có mã khuyến mãi ⇒ `grossOnlineAmount === onlineAmount` (ADR 0046). Spec này khoá
      // vòng đời hold, nên nó cố ý giữ trạng thái "không tài trợ" làm đường đối chiếu.
      grossOnlineAmount: HOLD_AMOUNT,
      promoDiscountAmount: '0',
      promo: null,
      onlineAmount: HOLD_AMOUNT,
      payAtPickupAmount: BASE,
      taxAmount: '0',
      ownerPayableAmount: '0',
      ownerNetAmount: BASE,
      holdAmount: HOLD_AMOUNT,
    },
  };
}

/** Một yêu cầu ĐÃ DUYỆT + hold `pending` — điểm xuất phát của mọi case bên dưới. */
async function makeHold(offsetDays = 10): Promise<{ requestId: string; holdId: string; code: string; acceptedAt: Date }> {
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
  /*
   * MỘT mốc "đặt xe thành công" cho cả `decided_at` lẫn hai cửa sổ tiền — dựng đúng hình dạng
   * mà `approveWithHold` dùng thật, để test không khẳng định được một thứ mà production không
   * bảo đảm.
   */
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
  return { requestId, holdId: created.id, code: created.code, acceptedAt };
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
    // Ví của gian hàng (tiền giữ chỗ bị tịch thu) và của khách (tiền hoàn) — `Restrict` chặn
    // xoá tenant/user khi chúng còn, nên gỡ trước.
    await releaseWalletObligations(prisma, {
      tenantIds: [tenantId],
      userIds: [ownerId, customerId],
    });
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

describe('Nhận chuyến ⇒ tạo hold: chiếm lịch, phát QR, CHƯA có đơn (ADR 0044)', () => {
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

  /**
   * ADR 0032 điều 5 đổi cách tính: đếm XUÔI từ `acceptedAt`, không tính ngược từ giờ nhận.
   *
   * Công thức cũ (`pickupAt − 4h`) cho khách đặt trước mười ngày nguyên mười ngày để đổi ý
   * miễn phí, còn khách đặt sát giờ thì gần như không có phút nào — cùng một "chính sách 4 giờ"
   * mà hai người nhận hai thứ khác hẳn.
   */
  maybe('mốc huỷ miễn phí đếm XUÔI 4 giờ từ lúc duyệt, không tính ngược từ giờ nhận', async () => {
    const { holdId } = await makeHold(10);
    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    const req = await prisma.bookingRequest.findFirstOrThrow({ where: { tenantId } });

    const fromAccepted = req.decidedAt!.getTime() + 4 * 3600_000;
    expect(hold.freeCancelUntil.getTime()).toBe(fromAccepted);
    // Và chuyến này nhận xe sau 10 ngày, nên mốc KHÔNG dính gì tới giờ nhận.
    expect(hold.freeCancelUntil.getTime()).toBeLessThan(req.pickupAt!.getTime());
  });

  /**
   * Mốc duyệt và mốc tiền phải là MỘT: hai lần gọi `new Date()` trong cùng transaction sinh ra
   * hai con số lệch vài mili-giây, đủ để đồng hồ đếm ngược trên màn hình và bản ghi audit nói
   * hai điều khác nhau về cùng một chuyến.
   */
  maybe('hạn trả cọc và mốc huỷ miễn phí cùng gốc với decided_at — một mốc, không phải ba', async () => {
    const { holdId } = await makeHold(10);
    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    const req = await prisma.bookingRequest.findFirstOrThrow({ where: { tenantId } });

    const accepted = req.decidedAt!.getTime();
    // Chính sách của spec này để cửa sổ 1440 phút (xem `snapshotOf`).
    expect(hold.expiresAt.getTime()).toBe(accepted + 1440 * 60_000);
    expect(hold.freeCancelUntil.getTime()).toBe(accepted + 4 * 3600_000);
  });

  /**
   * Chuyến sát giờ: cửa sổ bị kẹp về giờ nhận. Quyền huỷ miễn phí không thể sống qua thời điểm
   * khách đã cầm xe — và vì thế UI phải cảnh báo TRƯỚC khi họ trả tiền (ADR 0032 điều 5).
   */
  maybe('chuyến nhận xe sát giờ ⇒ cửa sổ huỷ miễn phí bị kẹp về giờ nhận', async () => {
    // Nhận xe sau 2 giờ — ngắn hơn cả cửa sổ huỷ miễn phí 4 giờ.
    const { holdId } = await makeHold(2 / 24);
    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    const req = await prisma.bookingRequest.findFirstOrThrow({ where: { tenantId } });

    expect(hold.freeCancelUntil.getTime()).toBe(req.pickupAt!.getTime());
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
    /*
     * Đơn này ra đời VÌ tiền cọc đã về tài khoản XePrime — `platform` đóng băng tại đây
     * (Phase 6, ADR 0025 ràng buộc 4). Không có nhánh nào khác dẫn tới đường tạo đơn này, nên
     * một giá trị khác ở đây nghĩa là có đường thứ hai mà không ai biết.
     */
    expect(booking.depositCollectionMode).toBe(DEPOSIT_COLLECTION_MODE.PLATFORM);

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

  /**
   * Khách có tài khoản ⇒ phần dư vào VÍ ĐIỂM ngay, không nằm chờ admin chuyển tay (ADR 0033
   * điều 5). Đây là điểm đổi hành vi so với R3: trước đây mọi khoản hoàn đều là `pending`, và
   * đó chính là chỗ luồng hoàn tiền ùn lại.
   */
  maybe('chuyển THỪA ngay lần đầu: mở đơn + phần dư vào VÍ ĐIỂM', async () => {
    // Ví dùng chung với các ca trước trong file, nên đo DELTA chứ không đo số tuyệt đối.
    const before = await prisma.wallet.findFirst({ where: { ownerUserId: customerId } });
    const balanceBefore = Number(before?.balance ?? 0);
    const { code, holdId } = await makeHold();
    await sepay.ingest(payload(code, 130_000));

    expect(await prisma.booking.count({ where: { tenantId } })).toBe(1);
    const refund = await prisma.holdRefund.findUniqueOrThrow({ where: { holdId } });
    expect(refund.amount.toFixed(0)).toBe('30000');
    expect(refund.status).toBe(HOLD_REFUND_STATUS.CREDITED);
    expect(refund.settlementMode).toBe('balance');
    expect(refund.walletEntryId).not.toBeNull();

    // Và tiền có mặt thật trong ví, đúng loại bút toán "chuyển thừa".
    const entry = await prisma.walletEntry.findUniqueOrThrow({
      where: { id: refund.walletEntryId! },
    });
    expect(entry.kind).toBe('hold_overpay');
    expect(entry.amount.toFixed(0)).toBe('30000');

    const w = await prisma.wallet.findFirstOrThrow({ where: { ownerUserId: customerId } });
    expect(Number(w.balance) - balanceBefore).toBe(30_000);
  });

  /**
   * Khách VÃNG LAI (đặt xe không cần tài khoản) không có ví để ghi có, nên khoản hoàn vẫn đi
   * đường chuyển khoản tay. Đây là đường VĨNH VIỄN, không phải một chặng quá độ — và ca này
   * khoá điều đó lại.
   */
  maybe('khách VÃNG LAI: không có ví ⇒ vẫn là khoản chờ admin chuyển tay', async () => {
    const requestId = newId();
    const pickupAt = new Date(Date.now() + 10 * 24 * 3600_000);
    const returnAt = new Date(pickupAt.getTime() + 2 * 24 * 3600_000);
    await prisma.bookingRequest.create({
      data: {
        id: requestId,
        tenantId,
        vehicleId,
        status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
        customerName: 'Khách vãng lai',
        customerPhone: `091${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
        customerUserId: null,
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
        customerUserId: null,
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

    await sepay.ingest(payload(created.code, 130_000));

    const refund = await prisma.holdRefund.findUniqueOrThrow({ where: { holdId: created.id } });
    expect(refund.status).toBe(HOLD_REFUND_STATUS.PENDING);
    expect(refund.settlementMode).toBe('bank_transfer');
    expect(refund.walletEntryId).toBeNull();
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

  /**
   * ADR 0032 đổi bản chất khoản giữ chỗ: nó chứa `D` — một phần GIÁ THUÊ, tức tiền của chủ xe —
   * nên chuyến hoàn thành không còn là "nền tảng giữ tất". Kết cục nay là `settled` và tiền được
   * phân bổ theo bốn cột (ADR 0033 điều 3).
   *
   * Chính sách của spec này để cọc = 0 (xem `snapshotOf`), nên toàn bộ là phí dịch vụ và không
   * dòng ví nào sinh ra — nhưng KẾT CỤC vẫn phải là `settled`, không phải `kept`.
   */
  maybe('chuyến HOÀN THÀNH ⇒ `settled`: phân bổ theo bốn cột, không sinh khoản hoàn', async () => {
    const { holdId, bookingId } = await paidHold();
    await prisma.$transaction(async (tx) => {
      // ADR 0047: reserved → active là cạnh trực tiếp, không còn đệm qua `confirmed`.
      await bookings.transitionWithinTx(tx, tenantId, bookingId, ownerId, BOOKING_STATUS.RESERVED, BOOKING_STATUS.ACTIVE);
      await bookings.transitionWithinTx(tx, tenantId, bookingId, ownerId, BOOKING_STATUS.ACTIVE, BOOKING_STATUS.COMPLETED);
    });

    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.outcome).toBe(BOOKING_HOLD_OUTCOME.SETTLED);
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

  /**
   * Huỷ muộn KHÔNG còn là "mất trắng" (ADR 0032 điều 5): `D + S` chia đôi chủ xe/XePrime, còn
   * `IV + IP` hoàn 100% vì hợp đồng bảo hiểm chưa được mua.
   */
  maybe('KHÁCH huỷ SAU mốc miễn phí ⇒ `split_late_cancel`: D+S chia đôi, không mất trắng', async () => {
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
    expect(hold.outcome).toBe(BOOKING_HOLD_OUTCOME.SPLIT_LATE_CANCEL);

    /*
     * Chính sách của spec để cọc = 0 nên phần chia đôi chỉ có `S`; nửa của chủ xe vào ví gian
     * hàng, nửa còn lại là doanh thu XePrime (không đi qua ví — ADR 0033 điều 3).
     */
    const shopWallet = await prisma.wallet.findFirstOrThrow({ where: { ownerTenantId: tenantId } });
    const entry = await prisma.walletEntry.findFirstOrThrow({
      where: { walletId: shopWallet.id, sourceRefId: holdId },
    });
    expect(entry.kind).toBe('hold_forfeit');
    expect(Number(entry.amount)).toBe(Number(HOLD_AMOUNT) / 2);

    // Bảo hiểm = 0 ở chính sách này ⇒ không có gì hoàn cho khách.
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
    expect(rec.inflow.variance).toBe('0');
    expect(Number(rec.inflow.matchedHolds)).toBeGreaterThanOrEqual(100_000);
    /*
     * Hold vừa trả tiền nhưng CHƯA chốt kết cục ⇒ toàn bộ 100.000đ là tiền GIỮ HỘ, chưa đồng
     * nào là doanh thu. Khách huỷ sớm là hoàn đủ cả phần phí dịch vụ (ADR 0032 điều 5), nên
     * ghi nhận sớm một phần nào của nó đều là ghi nhận một khoản chưa chắc được giữ.
     */
    expect(Number(rec.custodied.holdsUnsettled)).toBeGreaterThanOrEqual(100_000);
  });
});

/**
 * ĐUA GIỮA TIỀN VÀ MỘT QUYẾT ĐỊNH KHÁC — gate R3 điều "không có bút toán mồ côi".
 *
 * Ba tình huống ở đây đều có chung một hình dạng: khoản tiền là THẬT và đã vào tài khoản
 * XePrime, nhưng đích của nó vừa biến mất hoặc vừa từ chối nhận. Câu hỏi duy nhất cần trả lời
 * đúng là *dòng tiền đó có còn trong sổ để admin nhìn thấy không* — vì khách đã mất tiền rồi,
 * và thứ duy nhất đưa nó về được là một bản ghi.
 */
describe('Tiền về khi đích đã đóng — không nửa vời, không mồ côi', () => {
  /**
   * Khách bấm huỷ ĐÚNG LÚC tiền về (ADR 0032 điều 5).
   *
   * Ở đây lượt huỷ đã commit trước, nên webhook gặp một hold `cancelled`. Kỳ vọng: KHÔNG hồi
   * sinh chuyến — không đơn, yêu cầu vẫn là `cancelled_by_customer`, hold vẫn `cancelled` — mà
   * vẫn phải có đúng một dòng `bank_transactions` mang mã `XPH…` nằm ở hàng đợi chưa khớp.
   */
  maybe('khách huỷ rồi tiền mới về: không tạo đơn, giao dịch vẫn nằm trong sổ', async () => {
    const { code, holdId, requestId } = await makeHold();

    await prisma.$transaction(async (tx) => {
      await tx.bookingRequest.update({
        where: { id: requestId },
        data: { status: BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER },
      });
      await holds.cancelForRequestWithinTx(tx, {
        requestId,
        tenantId,
        actorUserId: customerId,
        actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
      });
    });

    const res = await sepay.ingest(payload(code, 100_000));
    expect(res).toMatchObject({ received: true, matched: false });

    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe(BOOKING_HOLD_STATUS.CANCELLED);
    expect(hold.bookingId).toBeNull();
    // Hold đã đóng KHÔNG nhận tiền: `paid_amount` phải đứng yên, nếu không kết cục sẽ tính trên
    // một khoản mà hold này không còn quyền giữ.
    expect(hold.paidAmount.toFixed(0)).toBe('0');
    expect(await prisma.booking.count({ where: { tenantId } })).toBe(0);
    expect(
      (await prisma.bookingRequest.findUniqueOrThrow({ where: { id: requestId } })).status,
    ).toBe(BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER);

    // Tiền thật vẫn nằm trong sổ, chưa khớp — đây chính là dòng admin sẽ hoàn cho khách.
    const row = await prisma.bankTransaction.findFirstOrThrow({ where: ownRows });
    expect(row.referenceCode).toBe(code);
    expect(row.amountIn.toFixed(0)).toBe('100000');
    expect(row.matchStatus).toBe(BANK_MATCH_STATUS.UNMATCHED);
  });

  /**
   * LƯỢT KHỚP HỎNG KHÔNG ĐƯỢC CUỐN THEO DÒNG TIỀN (16/09/2026).
   *
   * Trước đợt này, `bank_transactions.create` nằm CÙNG transaction với lượt khớp, nên một lỗi
   * bất kỳ ở đường khớp — deadlock với lượt huỷ của khách, `EXCLUDE` của lịch nổ lúc mở đơn,
   * một bug ở tầng tạo đơn — cuốn luôn dòng tiền đó theo rồi trả 5xx. SePay retry, lỗi lặp lại
   * y hệt, và khoản tiền thật của khách không có một dòng nào để admin nhìn thấy.
   *
   * Lỗi được dựng bằng spy thay vì cố tái hiện một deadlock thật: thứ cần khoá ở đây là *hậu
   * quả của một lỗi bất kỳ*, không phải một nguyên nhân cụ thể — và một test đua thật sẽ nhấp
   * nháy.
   */
  maybe('khớp hỏng giữa chừng: giao dịch VẪN được ghi, và lần gửi lại khớp tiếp được', async () => {
    const { code, holdId } = await makeHold();
    const body = payload(code, 100_000);

    const spy = jest
      .spyOn(holds, 'applyBankPaymentWithinTx')
      .mockRejectedValueOnce(new Error('deadlock detected'));

    const failed = await sepay.ingest(body);
    // 200, không 5xx: một lỗi tất định sẽ lặp lại y hệt ở lần retry — bão retry là thứ tự chuốc.
    expect(failed).toMatchObject({ received: true, matched: false, note: 'match_failed' });

    const orphan = await prisma.bankTransaction.findFirstOrThrow({ where: ownRows });
    expect(orphan.matchStatus).toBe(BANK_MATCH_STATUS.UNMATCHED);
    expect(orphan.referenceCode).toBe(code);
    // Lượt khớp quay đầu TRỌN VẸN: không có nửa đồng nào được cộng vào hold.
    expect(
      (await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } })).paidAmount.toFixed(0),
    ).toBe('0');
    expect(await prisma.booking.count({ where: { tenantId } })).toBe(0);

    spy.mockRestore();

    /*
     * SePay gửi lại CÙNG giao dịch. Dòng cũ còn `unmatched` ⇒ theo bất biến của `SepayService`
     * thì chưa có gì được áp, nên lần này phải khớp tiếp và mở đơn — chứ không phải bị coi là
     * "đã xử lý rồi" và để tiền nằm chết trong hàng đợi.
     */
    const retried = await sepay.ingest(body);
    expect(retried).toMatchObject({ received: true, duplicate: true, matched: true, note: 'activated' });

    // Vẫn ĐÚNG MỘT dòng tiền và ĐÚNG MỘT đơn — ghi lại lần hai là cộng đôi.
    expect(await prisma.bankTransaction.count({ where: ownRows })).toBe(1);
    expect(await prisma.booking.count({ where: { tenantId } })).toBe(1);
    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe(BOOKING_HOLD_STATUS.PAID);
    expect(hold.paidAmount.toFixed(0)).toBe('100000');
    expect(hold.bookingId).not.toBeNull();

    const row = await prisma.bankTransaction.findFirstOrThrow({ where: ownRows });
    expect(row.matchStatus).toBe(BANK_MATCH_STATUS.MATCHED);
    expect(row.matchedType).toBe(BANK_MATCH_TARGET_TYPE.BOOKING_HOLD);
    expect(row.matchedRefId).toBe(holdId);
  });

  /**
   * Dòng đã có KẾT LUẬN không bao giờ được áp lại — kể cả khi kết luận đó do admin đặt tay.
   *
   * Không có chốt này thì một lần SePay gửi lại sau khi admin đã `ignored` một giao dịch sẽ
   * cộng tiền vào hold lần nữa.
   */
  maybe('giao dịch đã được admin xử lý tay: gửi lại KHÔNG áp lần nữa', async () => {
    const { code, holdId } = await makeHold();
    const body = payload(code, 100_000);

    // Lần đầu không khớp được (hold chưa tồn tại dưới mã này với admin) — giả lập admin bỏ qua.
    await sepay.ingest({ ...body, content: 'chuyen khoan khong co ma' });
    await prisma.bankTransaction.updateMany({
      where: ownRows,
      data: { matchStatus: BANK_MATCH_STATUS.IGNORED, matchNote: 'admin bỏ qua' },
    });

    const again = await sepay.ingest(body);
    expect(again).toMatchObject({ received: true, duplicate: true, matched: false });

    expect(
      (await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } })).paidAmount.toFixed(0),
    ).toBe('0');
    expect(await prisma.booking.count({ where: { tenantId } })).toBe(0);
    expect(
      (await prisma.bankTransaction.findFirstOrThrow({ where: ownRows })).matchStatus,
    ).toBe(BANK_MATCH_STATUS.IGNORED);
  });
});

/**
 * VÒNG ĐỜI MỚI CỦA ADR 0039 — tiền đi TRƯỚC, gian hàng duyệt SAU.
 *
 * Khác mọi khối phía trên: ở đó hold sinh ra lúc gian hàng DUYỆT (đường của thuê dài hạn và báo
 * giá tạm tính — ADR 0039 điều 4 giữ nguyên thứ tự cũ cho hai ca đó). Ở đây hold sinh lúc khách
 * GỬI, nên `decided_at` còn trống và tiền về KHÔNG mở đơn ngay.
 */
/**
 * CỬA SỔ THANH TOÁN — nhắc hai lần, rồi chết. Không gia hạn (ADR 0044 điều 3).
 *
 * Hold ở spec này dùng chính sách cửa sổ 1440 phút (xem `snapshotOf`), nên mọi ca dưới đây dời
 * `expires_at` bằng tay để mô phỏng thời gian trôi thay vì phải chờ thật.
 */
describe('Cửa sổ thanh toán — nhắc rồi hết hạn, không gia hạn (ADR 0044)', () => {
  /**
   * Mô phỏng "đồng hồ đã chạy gần hết cửa sổ": còn `minutesLeft` phút, trên một cửa sổ dài
   * `windowMinutes` phút.
   *
   * Dời CẢ `created_at` chứ không chỉ `expires_at`, vì worker đọc hiệu của hai cột để biết cửa
   * sổ của hold này có bao giờ dài tới ngưỡng nhắc hay không. Chỉ dời `expires_at` thì một hold
   * "còn 45 phút" trông như một hold có cửa sổ 45 phút, và mốc nhắc 60 phút bị bỏ qua — đúng
   * nhánh mà ca "cửa sổ ngắn hơn ngưỡng" bên dưới kiểm riêng.
   */
  async function setRemaining(
    holdId: string,
    minutesLeft: number,
    windowMinutes = HOLD_PAYMENT_WINDOW_MINUTES,
  ): Promise<void> {
    const now = Date.now();
    await prisma.bookingHold.update({
      where: { id: holdId },
      data: {
        createdAt: new Date(now - (windowMinutes - minutesLeft) * 60_000),
        expiresAt: new Date(now + minutesLeft * 60_000),
      },
    });
  }

  maybe('mốc còn 60 phút: nhắc ĐÚNG MỘT lần, hold vẫn sống', async () => {
    const { holdId } = await makeHold(30);
    await setRemaining(holdId, 45);

    /*
     * Worker quét TOÀN SÀN, và jest chạy bốn spec song song trên cùng một database — nên con số
     * trả về không bao giờ là một khẳng định chắc chắn. Thứ chắc chắn là TRẠNG THÁI của chính
     * hold này và số thông báo của CHÍNH tenant này; mọi ca dưới đây khẳng định theo hai thứ đó.
     */
    await sweepBookingHoldExpiry(prisma, new Date());

    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe(BOOKING_HOLD_STATUS.PENDING);
    expect(hold.paymentRemindedAt).not.toBeNull();
    // Hạn KHÔNG bị dời: nhắc là nhắc, không phải gia hạn ngầm.
    expect(hold.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(hold.extensionCount).toBe(0);

    // Chạy lại KHÔNG nhắc lần hai — cột claim là thứ giữ cho thông báo còn đáng tin.
    await sweepBookingHoldExpiry(prisma, new Date());
    expect(
      await prisma.notification.count({
        where: { tenantId, type: NOTIFICATION_TYPE.HOLD_EXPIRING },
      }),
    ).toBe(1);
  });

  maybe('mốc còn 15 phút: nhắc lần CUỐI, độc lập với lần đầu', async () => {
    const { holdId } = await makeHold(31);
    await setRemaining(holdId, 10);

    // Cùng một nhịp bắn cả hai mốc: hold này đã trôi qua cả hai mà chưa được nhắc lần nào.
    await sweepBookingHoldExpiry(prisma, new Date());

    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.paymentRemindedAt).not.toBeNull();
    expect(hold.finalPaymentRemindedAt).not.toBeNull();

    await sweepBookingHoldExpiry(prisma, new Date());
    expect(
      await prisma.notification.count({
        where: { tenantId, type: NOTIFICATION_TYPE.HOLD_EXPIRING },
      }),
    ).toBe(2);
  });

  /**
   * Cửa sổ bị KẸP bởi giờ nhận xe thì mốc nhắc "còn 60 phút" không tồn tại với hold đó.
   *
   * Không có cái chặn này, một chuyến sát giờ sẽ nhận thông báo "còn 60 phút để thanh toán"
   * trong cùng giây với thông báo "hãy thanh toán tiền giữ chỗ" — hai tin ngược nhau.
   */
  maybe('cửa sổ ngắn hơn ngưỡng ⇒ KHÔNG nhắc mốc đó', async () => {
    // Nhận xe sau 40 phút ⇒ hạn bị kẹp về giờ nhận, cửa sổ thật chỉ 40 phút < 60.
    const { holdId } = await makeHold(40 / (24 * 60));

    await sweepBookingHoldExpiry(prisma, new Date());

    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.paymentRemindedAt).toBeNull();

    // Nhưng mốc "còn 15 phút" thì vẫn tới được — nó nằm trong cửa sổ 40 phút này.
    await setRemaining(holdId, 10, 40);
    await sweepBookingHoldExpiry(prisma, new Date());
    const reminded = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(reminded.finalPaymentRemindedAt).not.toBeNull();
    expect(reminded.paymentRemindedAt).toBeNull();
  });

  maybe('quá hạn: hold chết NGAY lượt quét đầu, nhả chỗ, yêu cầu `hold_expired`', async () => {
    const { holdId, requestId } = await makeHold(32);
    await prisma.bookingHold.update({
      where: { id: holdId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    await sweepBookingHoldExpiry(prisma, new Date());

    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe(BOOKING_HOLD_STATUS.EXPIRED);
    // Không có lượt gia hạn nào chen vào giữa (ADR 0044 điều 3).
    expect(hold.extensionCount).toBe(0);
    expect(
      (await prisma.bookingRequest.findUniqueOrThrow({ where: { id: requestId } })).status,
    ).toBe(BOOKING_REQUEST_STATUS.HOLD_EXPIRED);
    expect(await prisma.vehicleOccupancy.count({ where: { sourceId: requestId } })).toBe(0);

    // Chạy lại: không có gì để làm nữa — trạng thái và mốc nhả đứng yên.
    await sweepBookingHoldExpiry(prisma, new Date());
    const after = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(after.status).toBe(BOOKING_HOLD_STATUS.EXPIRED);
    expect(after.releasedAt?.getTime()).toBe(hold.releasedAt?.getTime());
  });

  /**
   * KHÁCH HUỶ TRƯỚC KHI TRẢ TIỀN ⇒ nhả chỗ ngay, không có khoản hoàn nào (ADR 0044 điều 7).
   *
   * Đây là lợi ích trực tiếp của thứ tự mới: chiếc xe quay lại chợ trong vài giây thay vì phải
   * chờ hết cửa sổ hai giờ, và không một đồng nào phải đi qua đường hoàn.
   */
  maybe('khách huỷ trước khi trả tiền: hold `cancelled`, nhả chỗ, KHÔNG có khoản hoàn', async () => {
    const { holdId, requestId } = await makeHold(35);

    await prisma.$transaction(async (tx) => {
      await tx.bookingRequest.updateMany({
        where: { id: requestId },
        data: { status: BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER },
      });
      await holds.cancelForRequestWithinTx(tx, {
        requestId,
        tenantId,
        actorUserId: customerId,
        actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
      });
    });

    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe(BOOKING_HOLD_STATUS.CANCELLED);
    expect(await prisma.holdRefund.count({ where: { holdId } })).toBe(0);
    expect(await prisma.vehicleOccupancy.count({ where: { sourceId: requestId } })).toBe(0);

    // Và chỗ đã nhả thì tiền về muộn KHÔNG được kích hoạt lại nó.
    const res = await sepay.ingest(payload(hold.code, 100_000));
    expect(res).toMatchObject({ matched: false });
    expect(await prisma.booking.count({ where: { tenantId } })).toBe(0);
  });

  /**
   * TRẢ THIẾU rồi hết hạn — tiền đã chuyển phải quay về khách.
   *
   * Đây là ca dễ bị bỏ sót nhất của cả luồng: hold `underpaid` là tiền THẬT của một người thật,
   * và nếu worker chỉ lật `expired` rồi nhả lịch thì khoản đó nằm lại trong tài khoản nền tảng
   * mà không sổ nào ghi nợ.
   */
  maybe('trả THIẾU rồi hết hạn: hoàn đúng phần đã chuyển, không hoàn hai lần', async () => {
    const { code, holdId } = await makeHold(33);
    await sepay.ingest(payload(code, 40_000));
    await prisma.bookingHold.update({
      where: { id: holdId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    await sweepBookingHoldExpiry(prisma, new Date());

    const refund = await prisma.holdRefund.findUniqueOrThrow({ where: { holdId } });
    expect(refund.amount.toFixed(0)).toBe('40000');
    expect(refund.reason).toBe(HOLD_REFUND_REASON.HOLD_EXPIRED);

    await sweepBookingHoldExpiry(prisma, new Date());
    expect(await prisma.holdRefund.count({ where: { holdId } })).toBe(1);
  });

  /**
   * TIỀN VỀ MUỘN — sau khi hold đã hết hạn và chỗ đã nhả.
   *
   * Không tạo đơn từ một yêu cầu đã chết: chỗ đó có thể đã thuộc về khách khác. Giao dịch nằm
   * lại `bank_transactions` cho admin xử lý tay, và đó là đường đối soát duy nhất đúng ở đây.
   */
  maybe('tiền về SAU khi hết hạn: không đơn, giao dịch nằm lại hàng đợi admin', async () => {
    const { code, holdId, requestId } = await makeHold(34);
    await prisma.bookingHold.update({
      where: { id: holdId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await sweepBookingHoldExpiry(prisma, new Date());

    const res = await sepay.ingest(payload(code, 100_000));
    expect(res).toMatchObject({ matched: false });

    expect(await prisma.booking.count({ where: { tenantId } })).toBe(0);
    expect(
      (await prisma.bookingRequest.findUniqueOrThrow({ where: { id: requestId } })).status,
    ).toBe(BOOKING_REQUEST_STATUS.HOLD_EXPIRED);
    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe(BOOKING_HOLD_STATUS.EXPIRED);
    // Khoản tiền vẫn được GHI NHẬN — nó không được phép bốc hơi khỏi sổ.
    expect(await prisma.bankTransaction.count({ where: ownRows })).toBe(1);
  });
});

/**
 * DỮ LIỆU LEGACY ADR 0039 — hold sinh lúc khách bấm đặt, trước khi có ai duyệt.
 *
 * ADR 0044 không tạo những bản ghi này nữa, nhưng các yêu cầu đã ở chặng đó phải đi hết đường
 * của chúng: bỏ nhánh này đi là để tiền thật của khách nằm lại vô thời hạn. Dấu hiệu nhận biết
 * là `booking_requests.decided_at IS NULL`.
 */
describe('Dữ liệu LEGACY ADR 0039 vẫn đi hết đường', () => {
  /** Yêu cầu chờ tiền mà CHƯA ai quyết định — đúng hình dạng luồng ADR 0039 tạo ra. */
  async function makeUndecidedHold(offsetDays = 40) {
    const made = await makeHold(offsetDays);
    await prisma.bookingRequest.update({
      where: { id: made.requestId },
      data: { decidedAt: null, decidedBy: null, decisionSource: null },
    });
    return made;
  }

  maybe('tiền đủ nhưng CHƯA ai nhận: hold `paid`, yêu cầu `hold_paid`, chưa có đơn', async () => {
    const { code, holdId, requestId } = await makeUndecidedHold();
    const res = await sepay.ingest(payload(code, 100_000));
    expect(res).toMatchObject({ matched: true, note: 'activated' });

    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe(BOOKING_HOLD_STATUS.PAID);
    // `booking_id` còn trống: ở thời kỳ đó tiền về KHÔNG đồng nghĩa với "có đơn".
    expect(hold.bookingId).toBeNull();
    expect(await prisma.booking.count({ where: { tenantId } })).toBe(0);

    const req = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(req.status).toBe(BOOKING_REQUEST_STATUS.HOLD_PAID);
    // Chỗ VẪN bị giữ — khách đã trả tiền thật cho nó.
    expect(
      await prisma.vehicleOccupancy.count({
        where: { sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST, sourceId: requestId },
      }),
    ).toBe(1);

    // Đồng hồ phản hồi của gian hàng bắt đầu lại từ đây — nếu không, khách trả ở phút cuối sẽ
    // đẩy chủ xe vào thế quá hạn ngay lập tức.
    expect(req.respondBy.getTime()).toBeGreaterThan(Date.now());
  });

  maybe('gian hàng NHẬN sau khi khách đã trả: đơn mở từ snapshot đã chốt', async () => {
    const { code, holdId, requestId } = await makeUndecidedHold(45);
    await sepay.ingest(payload(code, 100_000));

    await requests.approve(tenantId, ownerId, requestId);

    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.bookingId).not.toBeNull();
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: hold.bookingId! } });
    // Giá KHÔNG được tính lại: khách đã trả theo con số đóng băng trên hold.
    expect(booking.totalAmount.toFixed(0)).toBe(BASE);
    expect(booking.serviceFeeAmount.toFixed(0)).toBe(HOLD_AMOUNT);
    expect(
      (await prisma.bookingRequest.findUniqueOrThrow({ where: { id: requestId } })).status,
    ).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
  });

  maybe('gian hàng TỪ CHỐI sau khi đã trả tiền: hoàn 100%, nhả chỗ, không chia đôi', async () => {
    const { code, holdId, requestId } = await makeUndecidedHold(41);
    await sepay.ingest(payload(code, 100_000));

    await requests.reject(tenantId, ownerId, requestId, 'Xe hỏng đột xuất');

    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe(BOOKING_HOLD_STATUS.RELEASED);
    expect(hold.outcome).toBe(BOOKING_HOLD_OUTCOME.REFUNDED);
    /*
     * Phân bổ ba vế phải khớp bốn dòng tiền — `booking_holds_settled_allocation_check` canh ở
     * DB. Hoàn 100% nghĩa là TOÀN BỘ về phía khách, không đồng nào cho chủ xe hay nền tảng.
     */
    expect(hold.settledCustomerAmount.toFixed(0)).toBe(HOLD_AMOUNT);
    expect(hold.settledOwnerAmount.toFixed(0)).toBe('0');
    expect(hold.settledPlatformAmount.toFixed(0)).toBe('0');

    const refund = await prisma.holdRefund.findUniqueOrThrow({ where: { holdId } });
    expect(refund.amount.toFixed(0)).toBe(HOLD_AMOUNT);
    expect(refund.reason).toBe(HOLD_REFUND_REASON.OWNER_CANCEL);

    expect(await prisma.booking.count({ where: { tenantId } })).toBe(0);
    expect(
      await prisma.vehicleOccupancy.count({ where: { sourceId: requestId } }),
    ).toBe(0);
    expect(
      (await prisma.bookingRequest.findUniqueOrThrow({ where: { id: requestId } })).status,
    ).toBe(BOOKING_REQUEST_STATUS.REJECTED_BY_HOST);
  });

  /**
   * Bỏ sót nhánh này nghĩa là tiền của khách nằm lại VÔ THỜI HẠN vì gian hàng không bấm nút —
   * kiểu lỗi không ai phát hiện ra cho tới lúc khách gọi hỗ trợ.
   */
  maybe('gian hàng KHÔNG phản hồi: worker tự hoàn đủ và nhả chỗ', async () => {
    const { code, holdId, requestId } = await makeUndecidedHold(42);
    await sepay.ingest(payload(code, 100_000));

    // Đẩy hạn phản hồi về quá khứ — mô phỏng thời gian trôi mà không phải chờ.
    await prisma.bookingRequest.update({
      where: { id: requestId },
      data: { respondBy: new Date(Date.now() - 60_000) },
    });
    const result = await sweepBookingRequestDeadlines(prisma, new Date());
    expect(result.expiredPaid).toBeGreaterThanOrEqual(1);

    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe(BOOKING_HOLD_STATUS.RELEASED);
    expect(hold.outcome).toBe(BOOKING_HOLD_OUTCOME.REFUNDED);
    expect((await prisma.holdRefund.findUniqueOrThrow({ where: { holdId } })).amount.toFixed(0)).toBe(
      HOLD_AMOUNT,
    );
    expect(await prisma.vehicleOccupancy.count({ where: { sourceId: requestId } })).toBe(0);

    // Chạy lại KHÔNG hoàn lần hai — worker phải idempotent trên đường tiền.
    const again = await sweepBookingRequestDeadlines(prisma, new Date());
    expect(again.expiredPaid).toBe(0);
    expect(await prisma.holdRefund.count({ where: { holdId } })).toBe(1);
  });
});
