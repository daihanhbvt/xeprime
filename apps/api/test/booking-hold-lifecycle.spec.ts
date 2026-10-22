import { ConfigService } from '@nestjs/config';
import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  BANK_MATCH_STATUS,
  BANK_MATCH_TARGET_TYPE,
  BILLING_MODE,
  BOOKING_HOLD_OUTCOME,
  BOOKING_HOLD_STATUS,
  BOOKING_REQUEST_DECISION_SOURCE,
  BOOKING_REQUEST_STATUS,
  BOOKING_REQUEST_STATUS_LIVE_VALUES,
  BOOKING_STATUS,
  CANCELLATION_REASON_CATEGORY,
  type BookingPriceSnapshot,
  DEPOSIT_COLLECTION_MODE,
  FEE_POLICY_STATUS,
  HOLD_PAYMENT_WINDOW_MINUTES,
  HOLD_REFUND_REASON,
  HOLD_REFUND_STATUS,
  NOTIFICATION_TYPE,
  OCCUPANCY_SOURCE_TYPE,
  PLAN_STATUS,
  SUBSCRIPTION_STATUS,
  SUPPORT_CASE_CATEGORY,
  SUPPORT_CASE_STATUS,
  SUPPORT_PARTY,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  holdFreeCancelMinutes,
  holdPaymentWindowMinutes,
} from '@xeprime/types';
import { sweepBookingHoldExpiry } from '../../worker/src/jobs/booking-hold-expiry';
import { SepayService } from '../src/modules/sepay/sepay.service';
import { HoldSettlementService } from '../src/modules/holds/hold-settlement.service';
import { WalletService } from '../src/modules/wallet/wallet.service';
import { AuditService } from '../src/modules/audit/audit.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeNotificationService,
  makeBillingService,
  makeBookingHoldsService,
  makeBookingsService,
  makeBookingRequestsService,
} from './helpers/service-factory';
import { FEE_POLICY_V2_OFF } from './helpers/fee-snapshot';
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
const settlement = new HoldSettlementService(
  asService,
  audit,
  notifications,
  new WalletService(asService),
);
const sepay = new SepayService(asService, makeBillingService(asService), holds, {
  get: (key: string) => (key === 'SEPAY_API_KEY' ? 'test-key-0123456789abcdef' : undefined),
} as unknown as ConfigService);

/**
 * Đường DUYỆT/HUỶ của gian hàng — cần cho các ca ADR 0055 ở cuối file. Spec này không đi qua
 * `submitPublic` (yêu cầu dựng thẳng trong `makeHold`), nên không cần tài khoản khách nào khác.
 */
const requests = makeBookingRequestsService(asService, {
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
        taxRates: null,
        taxLegalBasis: null,
        taxPercent: null,
        taxLabel: null,
        tripInsuranceEnabled: false,
        tripInsurancePercent: null,
        vehicleProtectionEnabled: false,
        vehicleProtectionPercent: null,
        insurancePartnerName: null,
        ...FEE_POLICY_V2_OFF,
      },
      vehicleType: VEHICLE_TYPE.CAR,
      rentalDays: 2,
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
      // Snapshot đời trước luồng tiền v2: không có hoa hồng `H`, sàn giữ lại đúng bằng `S`.
      ownerCommissionAmount: '0',
      platformRetainedAmount: HOLD_AMOUNT,
      sponsorableAmount: HOLD_AMOUNT,
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
async function makeHold(
  offsetDays = 10,
  /** `DepositPolicyResolution.required` lúc duyệt — đóng băng trên hold (ADR 0025 ràng buộc 4). */
  depositRequired = true,
): Promise<{ requestId: string; holdId: string; code: string; acceptedAt: Date }> {
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
      depositRequired,
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
      {
        realm: ACCOUNT_REALM.PARTNER,
        id: ownerId,
        displayName: 'Chủ xe',
        email: `hold-own-${RUN}@xeprime.test`,
      },
      {
        realm: ACCOUNT_REALM.CUSTOMER,
        id: customerId,
        displayName: 'Khách',
        email: `hold-cus-${RUN}@xeprime.test`,
      },
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
  maybe(
    'hạn trả cọc và mốc huỷ miễn phí cùng gốc với decided_at — một mốc, không phải ba',
    async () => {
      const { holdId } = await makeHold(10);
      const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
      const req = await prisma.bookingRequest.findFirstOrThrow({ where: { tenantId } });

      const accepted = req.decidedAt!.getTime();
      // Chính sách của spec này để cửa sổ 1440 phút (xem `snapshotOf`).
      expect(hold.expiresAt.getTime()).toBe(accepted + 1440 * 60_000);
      expect(hold.freeCancelUntil.getTime()).toBe(accepted + 4 * 3600_000);
    },
  );

  /**
   * Chuyến CẬN NGÀY: hai cửa sổ co theo `ΔT = pickupAt − acceptedAt` (ADR 0066 —
   * `holdWindowsFor`): huỷ miễn phí `ΔT × 20%`, thanh toán `ΔT × 30%` (sàn 15′, trần của chính
   * sách) — cả hai vẫn đếm XUÔI từ `decided_at` và không vượt giờ nhận xe.
   */
  maybe('chuyến nhận xe cận ngày ⇒ hai cửa sổ co theo khoảng cách tới giờ nhận', async () => {
    const { holdId } = await makeHold(3 / 24);
    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    const req = await prisma.bookingRequest.findFirstOrThrow({ where: { tenantId } });

    const accepted = req.decidedAt!.getTime();
    const leadMinutes = (req.pickupAt!.getTime() - accepted) / 60_000;
    expect(hold.freeCancelUntil.getTime()).toBe(
      accepted + holdFreeCancelMinutes(leadMinutes, 4) * 60_000,
    );
    expect(hold.expiresAt.getTime()).toBe(
      accepted + holdPaymentWindowMinutes(leadMinutes, 1440) * 60_000,
    );
    // ~3 giờ ⇒ ~36 phút huỷ miễn phí, ~54 phút thanh toán — ngắn hơn hẳn 4 giờ / 1440 phút.
    expect(hold.freeCancelUntil.getTime() - accepted).toBeLessThan(60 * 60_000);
    expect(hold.expiresAt.getTime()).toBeLessThan(req.pickupAt!.getTime());
  });

  /**
   * Đặt GẤP (< 2 giờ): ADR 0066 bỏ luật "không có huỷ miễn phí" — vẫn có `ΔT × 20%` (sàn 15′),
   * và mốc huỷ đóng TRƯỚC hạn thanh toán (`ΔT × 30%`).
   */
  maybe('chuyến nhận xe dưới 2 giờ ⇒ vẫn có cửa sổ huỷ miễn phí ngắn', async () => {
    const { holdId } = await makeHold(1.5 / 24);
    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    const req = await prisma.bookingRequest.findFirstOrThrow({ where: { tenantId } });

    const accepted = req.decidedAt!.getTime();
    const leadMinutes = (req.pickupAt!.getTime() - accepted) / 60_000;
    expect(hold.freeCancelUntil.getTime()).toBe(
      accepted + holdFreeCancelMinutes(leadMinutes, 4) * 60_000,
    );
    // ~90 phút ⇒ ~18 phút huỷ miễn phí, ~27 phút thanh toán.
    expect(hold.freeCancelUntil.getTime()).toBeGreaterThan(accepted);
    expect(hold.freeCancelUntil.getTime()).toBeLessThan(hold.expiresAt.getTime());
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

  maybe(
    'chuyển bù cho ĐỦ: đơn thuê ra đời trong CÙNG transaction, lịch chuyển sang đơn',
    async () => {
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
       * Chuyến được chốt CÓ thu cọc (`deposit_required` trên hold) và tiền đã về XePrime ⇒
       * `platform` đóng băng tại đây (Phase 6, ADR 0025 ràng buộc 4).
       */
      expect(booking.depositCollectionMode).toBe(DEPOSIT_COLLECTION_MODE.PLATFORM);

      /*
       * Chi tiết đơn phía gian hàng mang BẢNG CỘNG VÍ (ADR 0068 điều 5) dựng từ snapshot đã đóng
       * băng. Snapshot đời cũ (một mức thuế, không tách GTGT/TNCN, không giá từng ngày) vẫn dựng
       * được: phần tách là `null`, đơn giá `null` vì 2 ngày mà không biết giá từng ngày, và đẳng
       * thức a − b = D − T đúng tới đồng.
       */
      const detail = await bookings.getOne(tenantId, booking.id);
      expect(detail.ownerPayout).toEqual({
        rentAmount: BASE,
        rentalDays: 2,
        unitAmount: null,
        ownerCommissionAmount: '0',
        // Snapshot đời cũ không mang nấc hoa hồng ⇒ không bịa nấc, màn hình giải thích chung.
        commissionTiers: null,
        taxAmount: '0',
        vatAmount: null,
        pitAmount: null,
        vatPercent: null,
        pitPercent: null,
        taxTotalPercent: null,
        taxExemptReason: null,
        ownerNetAmount: BASE,
        payAtPickupRentAmount: BASE,
        ownerPayableAmount: '0',
        collectsHold: true,
      });

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
    },
  );

  /*
   * Có hold KHÔNG có nghĩa là có cọc (ADR 0064 điều 5): tuyến gói tắt công tắc vẫn có hold cho
   * phần không phải tiền chủ xe. Đơn sinh từ khoản đó phải nói đúng `direct` — cọc do chủ xe tự
   * thu — chứ không phải `platform` chỉ vì tiền đã vào XePrime.
   */
  maybe('hold chốt KHÔNG thu cọc: tiền về mở đơn `direct`, không phải `platform`', async () => {
    const { code, holdId } = await makeHold(10, false);
    expect(
      (await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } })).depositRequired,
    ).toBe(false);

    const res = await sepay.ingest(payload(code, 100_000));
    expect(res).toMatchObject({ matched: true, note: 'activated' });

    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.status).toBe(BOOKING_HOLD_STATUS.PAID);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: hold.bookingId! } });
    expect(booking.depositCollectionMode).toBe(DEPOSIT_COLLECTION_MODE.DIRECT);
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

  maybe(
    'hai giao dịch ĐỦ TIỀN chạy song song: đúng MỘT đơn, phần dư thành yêu cầu hoàn',
    async () => {
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
    },
  );

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
   * Yêu cầu KHÔNG gắn tài khoản khách thì không có ví để ghi có, nên khoản hoàn đi đường chuyển
   * khoản tay. Từ ADR 0060 đường gửi công khai luôn gắn tài khoản, nhưng hàng như vậy vẫn tồn
   * tại: yêu cầu của khách vãng lai trước ADR 0060, và yêu cầu có tài khoản đã bị xoá
   * (`customer_user_id` là `ON DELETE SET NULL`). Tiền của họ vẫn phải có đường về — ca này
   * khoá điều đó lại.
   */
  maybe('yêu cầu không có tài khoản: không có ví ⇒ vẫn là khoản chờ admin chuyển tay', async () => {
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
        depositRequired: true,
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
      await bookings.transitionWithinTx(
        tx,
        tenantId,
        bookingId,
        ownerId,
        BOOKING_STATUS.RESERVED,
        BOOKING_STATUS.ACTIVE,
      );
      await bookings.transitionWithinTx(
        tx,
        tenantId,
        bookingId,
        ownerId,
        BOOKING_STATUS.ACTIVE,
        BOOKING_STATUS.COMPLETED,
      );
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
      bookings.transitionWithinTx(
        tx,
        tenantId,
        bookingId,
        customerId,
        BOOKING_STATUS.RESERVED,
        BOOKING_STATUS.CANCELLED,
        {
          actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
        },
      ),
    );

    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.outcome).toBe(BOOKING_HOLD_OUTCOME.REFUNDED);
    const refund = await prisma.holdRefund.findUniqueOrThrow({ where: { holdId } });
    expect(refund.reason).toBe(HOLD_REFUND_REASON.EARLY_CANCEL);
    expect(refund.amount.toFixed(0)).toBe(HOLD_AMOUNT);
  });

  /**
   * Huỷ muộn (ADR 0066, thay phép chia đôi của ADR 0032 điều 5 / ADR 0064 điều 8): chủ xe nhận
   * TRỌN phần giữ chỗ `D` của mình, XePrime giữ `S + H`, còn `IV + IP` hoàn 100% vì hợp đồng bảo
   * hiểm chưa được mua.
   */
  maybe(
    'KHÁCH huỷ SAU mốc miễn phí ⇒ `split_late_cancel`: chủ xe nhận trọn D, XePrime giữ S',
    async () => {
      const { holdId, bookingId } = await paidHold(10);
      /*
       * Dời mốc miễn phí về quá khứ — mốc là CỘT đã đóng băng, đây là cách mô phỏng "đã qua mốc".
       *
       * Chính sách của spec để cọc = 0 (hold = S 100.000). Tách hold thành D 60.000 + S 40.000 —
       * vẫn đúng `amount` nên CHECK `booking_holds_money_lines_sum_check` giữ — để lượt huỷ có
       * phần của chủ xe mà đền.
       */
      await prisma.bookingHold.update({
        where: { id: holdId },
        data: {
          freeCancelUntil: new Date(Date.now() - 3600_000),
          depositAmount: new Prisma.Decimal(60_000),
          serviceFeeAmount: new Prisma.Decimal(40_000),
        },
      });
      await prisma.$transaction((tx) =>
        bookings.transitionWithinTx(
          tx,
          tenantId,
          bookingId,
          customerId,
          BOOKING_STATUS.RESERVED,
          BOOKING_STATUS.CANCELLED,
          {
            actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
          },
        ),
      );

      const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
      expect(hold.outcome).toBe(BOOKING_HOLD_OUTCOME.SPLIT_LATE_CANCEL);

      /*
       * Trọn `D` 60.000 vào ví gian hàng; `S` 40.000 là doanh thu XePrime (không đi qua ví — ADR
       * 0033 điều 3).
       */
      const shopWallet = await prisma.wallet.findFirstOrThrow({
        where: { ownerTenantId: tenantId },
      });
      const entry = await prisma.walletEntry.findFirstOrThrow({
        where: { walletId: shopWallet.id, sourceRefId: holdId },
      });
      expect(entry.kind).toBe('hold_forfeit');
      expect(entry.amount.toFixed(0)).toBe('60000');
      expect(hold.settledOwnerAmount.toFixed(0)).toBe('60000');
      expect(hold.settledPlatformAmount.toFixed(0)).toBe('40000');
      expect(hold.settledTaxAmount.toFixed(0)).toBe('0');

      // Bảo hiểm = 0 ở chính sách này ⇒ không có gì hoàn cho khách.
      expect(await prisma.holdRefund.count({ where: { holdId } })).toBe(0);
    },
  );

  /**
   * Xem trước lượt huỷ (ADR 0064) hứa ĐÚNG con số lượt huỷ thật ghi xuống — một luật kết cục, một
   * phép chia. Không được có hai đường tính.
   */
  maybe('xem trước huỷ muộn khớp từng đồng với lượt huỷ thật', async () => {
    const { holdId, bookingId } = await paidHold(10);
    await prisma.bookingHold.update({
      where: { id: holdId },
      data: { freeCancelUntil: new Date(Date.now() - 3600_000) },
    });

    const preview = await settlement.previewCustomerCancel(bookingId, tenantId);
    expect(preview).toMatchObject({
      outcome: BOOKING_HOLD_OUTCOME.SPLIT_LATE_CANCEL,
      refundReason: HOLD_REFUND_REASON.LATE_CANCEL,
      withinFreeCancel: false,
      deferred: false,
    });

    await prisma.$transaction((tx) =>
      bookings.transitionWithinTx(
        tx,
        tenantId,
        bookingId,
        customerId,
        BOOKING_STATUS.RESERVED,
        BOOKING_STATUS.CANCELLED,
        { actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER },
      ),
    );
    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.settledCustomerAmount.toFixed(0)).toBe(preview!.refundAmount);
    expect(hold.settledOwnerAmount.toFixed(0)).toBe(preview!.ownerCompensationAmount);
    expect(Number(preview!.refundAmount) + Number(preview!.forfeitAmount)).toBe(
      Number(preview!.paidAmount),
    );
    // Đã chốt rồi thì không còn gì để xem trước.
    expect(await settlement.previewCustomerCancel(bookingId, tenantId)).toBeNull();
  });

  maybe('xem trước huỷ trong cửa sổ miễn phí: hoàn đủ số đã chuyển', async () => {
    const { bookingId } = await paidHold(10);
    const preview = await settlement.previewCustomerCancel(bookingId, tenantId);
    expect(preview).toMatchObject({
      outcome: BOOKING_HOLD_OUTCOME.REFUNDED,
      refundReason: HOLD_REFUND_REASON.EARLY_CANCEL,
      withinFreeCancel: true,
      refundAmount: HOLD_AMOUNT,
      forfeitAmount: '0',
    });
  });

  /**
   * Chuyển THỪA (`paidAmount > amount`): phần dư đã có đường về riêng (`overpaid`, vào ví ngay lúc
   * tiền về), nên lượt xem trước KHÔNG được hứa khách mất nó, và lượt huỷ thật vẫn phải hoàn phần
   * giữ chỗ dù yêu cầu hoàn của hold đã ở `credited`. So từng đồng, cả hai mốc.
   */
  async function overpaidHold() {
    const made = await makeHold(10);
    await sepay.ingest(payload(made.code, 130_000)); // thừa 30.000 ⇒ vào ví ngay
    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: made.holdId } });
    expect(hold.paidAmount.toFixed(0)).toBe('130000');
    return { ...made, bookingId: hold.bookingId! };
  }
  const walletBalance = async () =>
    Number(
      (await prisma.wallet.findFirst({ where: { ownerUserId: customerId } }))?.balance ?? 0,
    );
  const customerCancel = (bookingId: string) =>
    prisma.$transaction((tx) =>
      bookings.transitionWithinTx(
        tx,
        tenantId,
        bookingId,
        customerId,
        BOOKING_STATUS.RESERVED,
        BOOKING_STATUS.CANCELLED,
        { actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER },
      ),
    );

  maybe('chuyển thừa + huỷ SỚM: xem trước = lượt thật, từng đồng; phần thừa không bị tính lại', async () => {
    const { holdId, bookingId } = await overpaidHold();
    const preview = (await settlement.previewCustomerCancel(bookingId, tenantId))!;
    expect(preview).toMatchObject({
      outcome: BOOKING_HOLD_OUTCOME.REFUNDED,
      paidAmount: HOLD_AMOUNT, // 30.000 thừa đã nằm trong ví — không còn ở XePrime
      refundAmount: HOLD_AMOUNT,
      forfeitAmount: '0',
    });

    const before = await walletBalance();
    await customerCancel(bookingId);
    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.settledCustomerAmount.toFixed(0)).toBe(preview.refundAmount);
    // Tiền THẬT vào ví đúng bằng số đã hứa — trước bản sửa lượt này bị bỏ qua vì hoàn đã `credited`.
    expect(String((await walletBalance()) - before)).toBe(preview.refundAmount);
    const refund = await prisma.holdRefund.findUniqueOrThrow({ where: { holdId } });
    expect(refund.amount.toFixed(0)).toBe('130000'); // 30.000 thừa + 100.000 hoàn huỷ
    const entries = await prisma.walletEntry.findMany({
      where: { sourceRefId: holdId },
      select: { kind: true, amount: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.map((e) => [e.kind, e.amount.toFixed(0)])).toEqual([
      ['hold_overpay', '30000'],
      ['hold_refund', HOLD_AMOUNT],
    ]);
  });

  maybe('chuyển thừa + huỷ MUỘN: khách mất đúng phần chia của tiền giữ chỗ, không gồm khoản thừa', async () => {
    const { holdId, bookingId } = await overpaidHold();
    await prisma.bookingHold.update({
      where: { id: holdId },
      data: { freeCancelUntil: new Date(Date.now() - 3600_000) },
    });
    const preview = (await settlement.previewCustomerCancel(bookingId, tenantId))!;
    expect(preview.outcome).toBe(BOOKING_HOLD_OUTCOME.SPLIT_LATE_CANCEL);
    // Trước bản sửa: forfeit = 130.000 − 0 = 130.000 — hứa khách mất cả 30.000 đã hoàn.
    expect(preview.forfeitAmount).toBe(HOLD_AMOUNT);
    expect(preview.refundAmount).toBe('0');

    const before = await walletBalance();
    await customerCancel(bookingId);
    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.settledCustomerAmount.toFixed(0)).toBe(preview.refundAmount);
    expect(hold.settledOwnerAmount.toFixed(0)).toBe(preview.ownerCompensationAmount);
    expect(
      Number(hold.settledOwnerAmount) + Number(hold.settledPlatformAmount),
    ).toBe(Number(preview.forfeitAmount));
    expect(String((await walletBalance()) - before)).toBe(preview.refundAmount);
  });

  maybe('khoản thừa còn CHỜ chuyển tay (không có ví): lượt huỷ cộng dồn — xem trước tính cả nó', async () => {
    const { holdId, bookingId } = await overpaidHold();
    // Mô phỏng hàng không có tài khoản: khoản thừa nằm ở `pending`, chờ admin chuyển khoản.
    await prisma.bookingHold.update({ where: { id: holdId }, data: { customerUserId: null } });
    const refundRow = await prisma.holdRefund.findUniqueOrThrow({ where: { holdId } });
    await prisma.holdRefund.update({
      where: { holdId },
      data: {
        status: HOLD_REFUND_STATUS.PENDING,
        settlementMode: 'bank_transfer',
        walletEntryId: null,
        customerUserId: null,
      },
    });
    await prisma.walletEntry.deleteMany({ where: { id: refundRow.walletEntryId! } });
    await prisma.wallet.updateMany({
      where: { ownerUserId: customerId },
      data: { balance: { decrement: 30_000 } },
    });

    const preview = (await settlement.previewCustomerCancel(bookingId, tenantId))!;
    expect(preview).toMatchObject({
      outcome: BOOKING_HOLD_OUTCOME.REFUNDED,
      paidAmount: '130000',
      refundAmount: '130000',
      forfeitAmount: '0',
    });
    await customerCancel(bookingId);
    const refund = await prisma.holdRefund.findUniqueOrThrow({ where: { holdId } });
    expect(refund.status).toBe(HOLD_REFUND_STATUS.PENDING);
    expect(refund.amount.toFixed(0)).toBe(preview.refundAmount);
  });

  /**
   * `freeCancelAvailable` so `freeCancelUntil` với mốc NHẬN chuyến đã đóng băng (`decided_at` =
   * `acceptedAt` mà `holdWindowsFor` tính xuôi từ đó), không với `booking_holds.created_at` — hold
   * ghi sau mốc đó, và một cửa sổ huỷ ngắn hơn khoảng lệch giữa hai mốc sẽ bị báo là "không có".
   */
  maybe('freeCancelAvailable neo vào decided_at, không vào created_at của hold', async () => {
    const { requestId, holdId, acceptedAt } = await makeHold(10);
    await prisma.bookingHold.update({
      where: { id: holdId },
      data: {
        freeCancelUntil: new Date(acceptedAt.getTime() + 1_000),
        createdAt: new Date(acceptedAt.getTime() + 5_000),
      },
    });
    const dto = await holds.findForTrip(requestId, customerId);
    // Neo theo created_at sẽ ra false (mốc huỷ trước lúc ghi hold).
    expect(dto?.freeCancelAvailable).toBe(true);
  });

  maybe('GIAN HÀNG huỷ ⇒ `refunded` dù đã qua mốc — khách không có lỗi', async () => {
    const { holdId, bookingId } = await paidHold(10);
    await prisma.bookingHold.update({
      where: { id: holdId },
      data: { freeCancelUntil: new Date(Date.now() - 3600_000) },
    });
    await prisma.$transaction((tx) =>
      bookings.transitionWithinTx(
        tx,
        tenantId,
        bookingId,
        ownerId,
        BOOKING_STATUS.RESERVED,
        BOOKING_STATUS.CANCELLED,
        {
          actorScope: AUDIT_ACTOR_SCOPE.TENANT,
        },
      ),
    );

    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.outcome).toBe(BOOKING_HOLD_OUTCOME.REFUNDED);
    const refund = await prisma.holdRefund.findUniqueOrThrow({ where: { holdId } });
    expect(refund.reason).toBe(HOLD_REFUND_REASON.OWNER_CANCEL);
  });

  maybe(
    'chốt kết cục là IDEMPOTENT — chuyển trạng thái lần nữa không ghi đè, không hoàn hai lần',
    async () => {
      const { holdId, bookingId } = await paidHold();
      await prisma.$transaction((tx) =>
        bookings.transitionWithinTx(
          tx,
          tenantId,
          bookingId,
          customerId,
          BOOKING_STATUS.RESERVED,
          BOOKING_STATUS.CANCELLED,
          {
            actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
          },
        ),
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
    },
  );

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
      bookings.transitionWithinTx(
        tx,
        tenantId,
        bookingId,
        customerId,
        BOOKING_STATUS.RESERVED,
        BOOKING_STATUS.CANCELLED,
        {
          actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER,
        },
      ),
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

  /**
   * ADR 0066 lớp 3: case `handover_unconfirmed` do HỆ THỐNG mở (không người mở) cũng giữ tiền như
   * một tranh chấp — chủ xe/khách đổi trạng thái đơn sau đó không được tự giải ngân.
   */
  maybe('case CHƯA XÁC NHẬN BÀN GIAO mở ⇒ kết cục bị TẠM GIỮ như tranh chấp', async () => {
    const { holdId, bookingId } = await paidHold();
    const caseId = newId();
    await prisma.supportCase.create({
      data: {
        id: caseId,
        code: `SC${caseId.slice(-6).toUpperCase()}`,
        tenantId,
        bookingId,
        openedByUserId: null,
        openedByScope: SUPPORT_PARTY.PLATFORM,
        category: SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED,
        status: SUPPORT_CASE_STATUS.OPEN,
        subject: 'Chưa xác nhận bàn giao',
        description: 'Quá ân hạn bàn giao — case hệ thống',
      },
    });

    await prisma.$transaction((tx) =>
      bookings.transitionWithinTx(
        tx,
        tenantId,
        bookingId,
        customerId,
        BOOKING_STATUS.RESERVED,
        BOOKING_STATUS.CANCELLED,
        { actorScope: AUDIT_ACTOR_SCOPE.CUSTOMER },
      ),
    );

    const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(hold.outcome).toBeNull();
    expect(hold.status).toBe(BOOKING_HOLD_STATUS.PAID);
    expect(await prisma.holdRefund.count({ where: { holdId } })).toBe(0);
  });

  /**
   * Chốt TAY không được chọn kết cục LEGACY trên khoản có bốn dòng tiền: `kept` không phân bổ gì,
   * tức nền tảng giữ trọn phần của chủ xe lẫn hãng bảo hiểm. Đường tự động không bao giờ chọn
   * nó — tay người cũng không được (`adminSettleOutcomes`).
   */
  maybe('admin chốt tay `kept` trên khoản có dòng tiền ⇒ 409, khoản vẫn chờ chốt', async () => {
    const { holdId } = await paidHold(14);

    await expect(
      settlement.adminSettle(holdId, ownerId, {
        outcome: BOOKING_HOLD_OUTCOME.KEPT,
        note: 'Thử giữ trọn khoản',
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION } });

    const still = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
    expect(still.outcome).toBeNull();
    expect(still.status).toBe(BOOKING_HOLD_STATUS.PAID);
  });

  /**
   * Hai admin cùng chốt MỘT khoản: đúng một người thắng. Người thua phải nhận 409 — trước đây họ
   * nhận "đã chốt" cho một kết cục không hề được áp, và không có dòng audit nào của họ.
   */
  maybe(
    'hai admin chốt cùng lúc ⇒ đúng một kết cục, người sau nhận 409, một dòng audit',
    async () => {
      const { holdId } = await paidHold(14);

      const results = await Promise.allSettled([
        settlement.adminSettle(holdId, ownerId, {
          outcome: BOOKING_HOLD_OUTCOME.SETTLED,
          note: 'Admin A: chuyến hoàn thành',
        }),
        settlement.adminSettle(holdId, ownerId, {
          outcome: BOOKING_HOLD_OUTCOME.REFUNDED,
          note: 'Admin B: hoàn khách',
        }),
      ]);

      const won = results.filter((r) => r.status === 'fulfilled');
      const lost = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      expect(won).toHaveLength(1);
      expect(lost).toHaveLength(1);
      expect(lost[0]!.reason).toMatchObject({
        response: { code: API_ERROR_CODE.HOLD_NOT_PENDING },
      });

      const after = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
      expect([BOOKING_HOLD_OUTCOME.SETTLED, BOOKING_HOLD_OUTCOME.REFUNDED]).toContain(
        after.outcome,
      );
      expect(
        await prisma.auditLog.count({ where: { targetId: holdId, action: 'booking_hold.settle' } }),
      ).toBe(1);
    },
  );
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

  maybe(
    'khai tài khoản → admin chuyển → `paid` có bằng chứng, và không chuyển lại được',
    async () => {
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
    },
  );
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
    expect(retried).toMatchObject({
      received: true,
      duplicate: true,
      matched: true,
      note: 'activated',
    });

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
    expect((await prisma.bankTransaction.findFirstOrThrow({ where: ownRows })).matchStatus).toBe(
      BANK_MATCH_STATUS.IGNORED,
    );
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
  maybe(
    'khách huỷ trước khi trả tiền: hold `cancelled`, nhả chỗ, KHÔNG có khoản hoàn',
    async () => {
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
    },
  );

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
 * ADR 0055 — luồng thu-trước-duyệt (ADR 0039) đã bị GỠ: không còn `hold_paid`, và tiền về là việc
 * của KHÁCH, không phải một quyết định thứ hai của gian hàng.
 */
describe('ADR 0055 — tiền về không viết lại lượt NHẬN; DB khoá luồng thu-trước-duyệt', () => {
  /*
   * Bản trước đi vòng qua `hold_paid` và ghi `decided_by = NULL`, `decided_at = lúc tiền về`,
   * `decision_source = system` lên một chuyến chủ xe đã TỰ TAY nhận: tên người duyệt mất, thời
   * gian phản hồi đo tới lúc khách chuyển khoản, và chuyến bị kể lại thành "Đặt ngay".
   */
  maybe(
    'tiền đủ: thẳng awaiting_hold → converted_to_booking, ba cột quyết định giữ nguyên',
    async () => {
      const { code, requestId, acceptedAt } = await makeHold(46);
      await prisma.bookingRequest.update({
        where: { id: requestId },
        data: { decisionSource: BOOKING_REQUEST_DECISION_SOURCE.HOST },
      });

      const res = await sepay.ingest(payload(code, 100_000));
      expect(res).toMatchObject({ matched: true, note: 'activated' });

      const req = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: requestId } });
      expect(req.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
      expect(req.bookingId).not.toBeNull();
      expect(req.decidedBy).toBe(ownerId);
      expect(req.decidedAt?.getTime()).toBe(acceptedAt.getTime());
      expect(req.decisionSource).toBe(BOOKING_REQUEST_DECISION_SOURCE.HOST);

      // Gian hàng nghe "khách đã thanh toán" — KHÔNG phải "đã tự động nhận" cho chuyến họ tự nhận.
      const notices = await prisma.notification.findMany({
        where: { tenantId, targetId: req.bookingId! },
        select: { type: true },
      });
      expect(notices.map((n) => n.type)).toContain(NOTIFICATION_TYPE.HOLD_PAID);
      expect(notices.map((n) => n.type)).not.toContain(NOTIFICATION_TYPE.BOOKING_AUTO_ACCEPTED);
    },
  );

  maybe('DB từ chối hai trạng thái đã gỡ', async () => {
    const { requestId } = await makeHold(47);
    for (const status of [
      BOOKING_REQUEST_STATUS.HOLD_PAID,
      BOOKING_REQUEST_STATUS.APPROVED_BY_HOST,
    ]) {
      await expect(
        prisma.bookingRequest.update({ where: { id: requestId }, data: { status } }),
      ).rejects.toThrow(/booking_requests_status_valid/);
    }
  });

  /*
   * Bất biến làm cho việc gỡ nhánh legacy an toàn: không có `awaiting_hold` nào thiếu lượt nhận,
   * nên tiền về không bao giờ mở đơn cho một chuyến chưa ai đồng ý.
   */
  maybe('DB từ chối awaiting_hold thiếu decided_at', async () => {
    const { requestId } = await makeHold(48);
    await expect(
      prisma.bookingRequest.update({ where: { id: requestId }, data: { decidedAt: null } }),
    ).rejects.toThrow(/booking_requests_awaiting_hold_decided/);
  });

  maybe('chuyến đã nhận đang chờ tiền KHÔNG duyệt lại được — chỉ còn đường Huỷ', async () => {
    const { requestId } = await makeHold(49);
    await expect(requests.approve(tenantId, ownerId, requestId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.INVALID_STATUS_TRANSITION },
    });
    expect(
      (await prisma.bookingRequest.findUniqueOrThrow({ where: { id: requestId } })).status,
    ).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
  });

  /*
   * Huỷ đúng lúc tiền về: hai đường cùng chạm hold + yêu cầu, và cả hai khoá HOLD trước. Kết cục
   * phải là ĐÚNG MỘT bên thắng — không deadlock (khách nhận 500 / tiền rơi vào hàng đợi không ghi
   * chú), không hold mồ côi, không lịch treo.
   */
  maybe(
    'huỷ chen đúng lúc tiền về: đúng một bên thắng, không deadlock, không lịch treo',
    async () => {
      // Cách nhau 3 ngày, lớn hơn chuyến 2 ngày của `makeHold`: vòng nào TIỀN thắng thì đơn thuê
      // giữ lịch tới hết test (afterEach mới dọn), và offset sát nhau làm `makeHold` vòng sau đụng
      // `vehicle_occupancies_no_overlap` — test đỏ hay xanh tuỳ ai thắng cuộc đua.
      for (const offset of [50, 53, 56]) {
        const { code, holdId, requestId } = await makeHold(offset);
        const [paid, cancelled] = await Promise.allSettled([
          sepay.ingest(payload(code, 100_000)),
          requests.cancelByHost(tenantId, ownerId, requestId, {
            reasonCategory: CANCELLATION_REASON_CATEGORY.VEHICLE_UNAVAILABLE,
          }),
        ]);

        // Lượt đối soát không bao giờ hỏng vì cuộc đua — nó khớp được, hoặc ghi rõ tiền đến muộn.
        expect(paid.status).toBe('fulfilled');
        if (paid.status === 'fulfilled') expect(paid.value.note).not.toBe('match_failed');

        const req = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: requestId } });
        const hold = await prisma.bookingHold.findUniqueOrThrow({ where: { id: holdId } });
        if (req.status === BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING) {
          // Tiền thắng: lượt huỷ lùi bằng CONFLICT ("vừa thay đổi"), không phải lỗi DB thô.
          expect(cancelled.status).toBe('rejected');
          if (cancelled.status === 'rejected') {
            expect(cancelled.reason).toMatchObject({ response: { code: API_ERROR_CODE.CONFLICT } });
          }
          expect(hold.status).toBe(BOOKING_HOLD_STATUS.PAID);
          expect(await prisma.vehicleOccupancy.count({ where: { sourceId: req.bookingId! } })).toBe(
            1,
          );
        } else {
          // Huỷ thắng: hold đóng, khoản tiền tới sau nằm lại hàng đợi đối soát kèm ghi chú.
          expect(req.status).toBe(BOOKING_REQUEST_STATUS.CANCELLED_BY_HOST);
          expect(cancelled.status).toBe('fulfilled');
          expect(hold.status).toBe(BOOKING_HOLD_STATUS.CANCELLED);
          expect(hold.bookingId).toBeNull();
        }
        // Lịch của YÊU CẦU không bao giờ còn treo, ở bên nào thắng cũng vậy.
        expect(
          await prisma.vehicleOccupancy.count({
            where: { sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST, sourceId: requestId },
          }),
        ).toBe(0);
      }
    },
  );

  /*
   * Danh sách trạng thái sống ở HAI nơi — `BOOKING_REQUEST_STATUS_LIVE_VALUES` và CHECK ở DB. Thêm
   * một trạng thái vào types mà quên migration phải đỏ ở CI, không phải ở production.
   */
  maybe(
    'CHECK booking_requests_status_valid khớp đúng BOOKING_REQUEST_STATUS_LIVE_VALUES',
    async () => {
      const [row] = await prisma.$queryRaw<Array<{ def: string }>>`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conname = 'booking_requests_status_valid'`;
      const inDb = [...(row?.def ?? '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
      expect(inDb).toEqual([...BOOKING_REQUEST_STATUS_LIVE_VALUES].sort());
    },
  );
});
