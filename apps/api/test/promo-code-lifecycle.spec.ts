import { ConflictException } from '@nestjs/common';
import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BILLING_MODE,
  BOOKING_REQUEST_STATUS,
  MEMBERSHIP_STATUS,
  PLAN_STATUS,
  PROMO_AUDIENCE,
  PROMO_DISCOUNT_TYPE,
  PROMO_INELIGIBLE_REASON,
  PROMO_REDEMPTION_STATUS,
  PROMO_RELEASE_REASON,
  PROMO_VEHICLE_SCOPE,
  SERVICE_TYPE,
  SUBSCRIPTION_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import type { AuthService } from '../src/modules/auth/auth.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import type { PhoneVerificationService } from '../src/modules/phone-verification/phone-verification.service';
import { PromoCodeEvaluatorService } from '../src/modules/promo-codes/promo-code-evaluator.service';
import { PromoCodesService } from '../src/modules/promo-codes/promo-codes.service';
import { PromoQuoteService } from '../src/modules/promo-codes/promo-quote.service';
import { VehicleSettingsService } from '../src/modules/vehicle-settings/vehicle-settings.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeBookingHoldsService,
  makeBookingRequestsService,
  makeNotificationService,
  makePricingService,
} from './helpers/service-factory';

/**
 * MÃ KHUYẾN MÃI NỀN TẢNG — vòng đời và dòng tiền, trên PostgreSQL THẬT (ADR 0046).
 *
 * Phép tính thuần đã khoá ở `packages/types/src/promo-code.test.ts`. Spec này khoá những thứ chỉ
 * một database thật trả lời được:
 *
 *  1. **Ba cửa kiểm** — xem trước · gửi yêu cầu · chốt giá lúc duyệt — cho cùng một con số.
 *  2. **GIỮ → CHỐT → NHẢ**: lượt được giữ lúc gửi, chốt khi ĐƠN hình thành, nhả khi yêu cầu chết.
 *  3. **Đơn đã hình thành rồi bị huỷ KHÔNG khôi phục lượt** — quy tắc thi hành bằng điều kiện
 *     `status = 'reserved'` trong câu `UPDATE`, không bằng một câu `if` ai đó phải nhớ.
 *  4. **Tranh chấp lượt CUỐI**: hai yêu cầu song song trên một mã còn đúng một lượt.
 *  5. **Dòng tiền khép kín**: `booking_holds` giữ quyền lợi đầy đủ + cột tài trợ, `bookings` giữ
 *     doanh thu gian hàng KHÔNG bị bớt, và CHECK của DB gác cả hai.
 *  6. **Snapshot**: admin sửa/tắt/xoá chiến dịch sau đó KHÔNG viết lại giá của đơn cũ.
 *  7. **Quyền**: service quản trị không nhận `tenantId` ở đâu cả, và trường bị khoá là khoá thật.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const occupancy = new OccupancyService(asService);
const settings = new VehicleSettingsService(asService, audit, occupancy);
const holds = makeBookingHoldsService(asService);
const pricing = makePricingService(asService);
const evaluator = new PromoCodeEvaluatorService(asService);
const promoQuote = new PromoQuoteService(pricing, evaluator);
const admin = new PromoCodesService(asService, audit);

const phoneVerification = {
  assertPhoneVerifiedForBooking: async () => {},
} as unknown as PhoneVerificationService;

/** Danh tính khách — đường công khai LUÔN quy SĐT đã qua OTP về một tài khoản (ADR 0046 điều 5). */
let currentCustomer: string;
const auth = {
  resolveOrCreateUserByPhone: async () => ({ userId: currentCustomer }),
} as unknown as AuthService;

const requests = makeBookingRequestsService(asService, {
  phoneVerification,
  auth,
  audit,
  notifications,
  occupancy,
  settings,
  pricing,
});

const RUN = newId().slice(-8).toLowerCase();
const DAY = 24 * 3600_000;

/**
 * Chuyến 2 ngày × 700.000đ trên CHÍNH SÁCH PHÍ HIỆU LỰC của môi trường (bản `active` duy nhất):
 * phí dịch vụ 10% · cọc 20% (sàn 50.000) · bảo hiểm xe 2% · thuế 10% (CHỦ XE chịu) · sàn giữ chỗ
 * 20.000. Bảo hiểm người 1% chỉ tính khi khách GIỮ lựa chọn, và không ca nào ở đây chọn nó.
 *
 * Suy ra từ chính sách chứ không gõ tay từng số ở mỗi `expect`: một lần đổi chính sách dev sẽ
 * làm spec đỏ ở ĐÚNG một chỗ, thay vì đỏ ở hai chục chỗ với hai chục con số rời rạc.
 */
const RENTAL = 1_400_000;
const SERVICE_FEE = RENTAL * 0.1;
const VEHICLE_INSURANCE = RENTAL * 0.02;
/** `T` — CHỦ XE chịu, KHÔNG cộng vào tổng khách (ADR 0032 điều 3). */
const TAX = RENTAL * 0.1;
const DEPOSIT = RENTAL * 0.2;
/** `D + S + IV` — quyền lợi, trước tài trợ. */
const GROSS_ONLINE = DEPOSIT + SERVICE_FEE + VEHICLE_INSURANCE;
/** `B + S + IV` — số khách trả khi KHÔNG có mã. */
const CUSTOMER_TOTAL = RENTAL + SERVICE_FEE + VEHICLE_INSURANCE;
/** `D + S` — phần tài trợ được; bảo hiểm là tiền giữ hộ, không tài trợ được (ADR 0033 điều 4). */
const SPONSORABLE = DEPOSIT + SERVICE_FEE;

let dbAvailable = false;
let mainCustomer: string;
let tenantId: string;
let ownerId: string;
let vehicleId: string;
let motorbikeId: string;
let planId: string;
let adminUserId: string;
let phoneCounter = 0;
const promoIds: string[] = [];
const customerIds: string[] = [];

const nextPhone = () => `0966${String(100000 + ++phoneCounter).slice(-6)}`;

/** `offsetDays` ngày nữa lúc `hourVn` giờ VN — trong khung giao nhận mặc định 06–22. */
function vnAt(offsetDays: number, hourVn: number): Date {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + offsetDays);
  base.setUTCHours(hourVn - 7, 0, 0, 0);
  return base;
}

async function makeCustomer(label: string): Promise<string> {
  const id = newId();
  await prisma.user.create({
    data: { id, displayName: `Khách ${label}`, email: `promo-${label}-${RUN}@xeprime.test` },
  });
  customerIds.push(id);
  return id;
}

interface PromoInput {
  code: string;
  discountType?: string;
  discountAmount?: string | null;
  discountPercent?: number | null;
  maxDiscountAmount?: string | null;
  minOrderAmount?: string;
  audience?: string;
  vehicleScope?: string;
  serviceScope?: string[];
  provinceCodes?: string[];
  totalUsageLimit?: number | null;
  perCustomerLimit?: number | null;
  startsAt?: Date;
  endsAt?: Date;
  isActive?: boolean;
  listed?: boolean;
}

/** Ghi thẳng bảng — dựng được cả những hình dạng mà API cố ý không cho tạo (đã hết hạn…). */
async function seedPromo(input: PromoInput): Promise<string> {
  const id = newId();
  await prisma.promoCode.create({
    data: {
      id,
      code: input.code,
      name: `Chiến dịch ${input.code}`,
      discountType: input.discountType ?? PROMO_DISCOUNT_TYPE.FIXED,
      discountAmount:
        input.discountAmount === undefined
          ? new Prisma.Decimal(100_000)
          : input.discountAmount == null
            ? null
            : new Prisma.Decimal(input.discountAmount),
      discountPercent: input.discountPercent ?? null,
      maxDiscountAmount:
        input.maxDiscountAmount == null ? null : new Prisma.Decimal(input.maxDiscountAmount),
      minOrderAmount: new Prisma.Decimal(input.minOrderAmount ?? 0),
      audience: input.audience ?? PROMO_AUDIENCE.ALL,
      vehicleScope: input.vehicleScope ?? PROMO_VEHICLE_SCOPE.ALL,
      serviceScope: input.serviceScope ?? [],
      provinceCodes: input.provinceCodes ?? [],
      totalUsageLimit: input.totalUsageLimit ?? null,
      perCustomerLimit: input.perCustomerLimit ?? null,
      startsAt: input.startsAt ?? new Date(Date.now() - DAY),
      endsAt: input.endsAt ?? new Date(Date.now() + 30 * DAY),
      isActive: input.isActive ?? true,
      listed: input.listed ?? true,
      createdBy: adminUserId,
    },
  });
  promoIds.push(id);
  return id;
}

async function submit(
  opts: {
    promoCode?: string;
    offsetDays?: number;
    vehicle?: string;
    customerUserId?: string | null;
  } = {},
) {
  const offsetDays = opts.offsetDays ?? 5;
  return requests.submitPublic(
    {
      vehicleId: opts.vehicle ?? vehicleId,
      customerName: 'Nguyễn Văn A',
      customerPhone: nextPhone(),
      pickupAt: vnAt(offsetDays, 9).toISOString(),
      returnAt: vnAt(offsetDays + 2, 9).toISOString(),
      ...(opts.promoCode === undefined ? {} : { promoCode: opts.promoCode }),
    },
    opts.customerUserId === undefined ? null : opts.customerUserId,
  );
}

/** Tham số xem trước cho đúng chuyến mà `submit()` gửi. */
function previewInput(code: string, offsetDays = 5, vehicle = vehicleId) {
  return {
    code,
    vehicleId: vehicle,
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    pickupAt: vnAt(offsetDays, 9).toISOString(),
    returnAt: vnAt(offsetDays + 2, 9).toISOString(),
  };
}

/**
 * Khách chuyển ĐỦ tiền giữ chỗ ⇒ ĐƠN ra đời (ADR 0044 điều 2). Trả về chính đơn đó.
 *
 * Gom thành helper vì đây là đường DUY NHẤT một đơn hình thành ở nhánh có thu tiền, nên mọi ca
 * cần một đơn đều phải đi qua nó — viết lại ba dòng này ở mỗi ca là mời một ca nào đó "tạo đơn"
 * bằng một cách không tồn tại ở production.
 */
async function payHoldOf(requestId: string) {
  const hold = await prisma.bookingHold.findUniqueOrThrow({
    where: { bookingRequestId: requestId },
  });
  const applied = await prisma.$transaction((tx) =>
    holds.applyBankPaymentWithinTx(tx, {
      code: hold.code,
      amount: hold.amount,
      providerTxId: `promo-pay-${hold.code}`,
    }),
  );
  if (applied.outcome !== 'activated' || !applied.bookingId) {
    throw new Error(`Tiền về đủ nhưng không tạo được đơn: ${applied.outcome}`);
  }
  return prisma.booking.findUniqueOrThrow({ where: { id: applied.bookingId } });
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
  vehicleId = newId();
  motorbikeId = newId();
  planId = newId();
  adminUserId = newId();

  await prisma.user.createMany({
    data: [
      { id: ownerId, displayName: 'Chủ Promo', email: `promo-owner-${RUN}@xeprime.test` },
      { id: adminUserId, displayName: 'Admin Promo', email: `promo-admin-${RUN}@xeprime.test` },
    ],
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `PromoShop-${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
    },
  });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId,
      userId: ownerId,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
      joinedAt: new Date(),
    },
  });
  await prisma.vehicle.createMany({
    data: [
      {
        id: vehicleId,
        tenantId,
        code: `XE${vehicleId.slice(-5)}`,
        name: 'Ô tô Promo',
        vehicleType: VEHICLE_TYPE.CAR,
        publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
        serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
        weekdayPrice: new Prisma.Decimal('700000'),
        weekendPrice: new Prisma.Decimal('700000'),
        createdBy: ownerId,
      },
      {
        id: motorbikeId,
        tenantId,
        code: `XM${motorbikeId.slice(-5)}`,
        name: 'Xe máy Promo',
        vehicleType: VEHICLE_TYPE.MOTORBIKE,
        publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
        serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
        weekdayPrice: new Prisma.Decimal('700000'),
        weekendPrice: new Prisma.Decimal('700000'),
        createdBy: ownerId,
      },
    ],
  });
  await prisma.plan.create({
    data: {
      id: planId,
      code: `promo-${RUN}`,
      name: 'Gói hoa hồng promo',
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
      endsAt: new Date(Date.now() + 365 * DAY),
    },
  });

  mainCustomer = await makeCustomer('main');
  currentCustomer = mainCustomer;
});

/*
 * `currentCustomer` là trạng thái CHIA SẺ (stub `resolveOrCreateUserByPhone` đọc nó). Vài ca cố
 * ý đổi nó để dựng "một người khác"; không trả về mặc định thì ca SAU chạy với danh tính của ca
 * TRƯỚC — và một spec xanh vì lý do sai là thứ tệ hơn một spec đỏ.
 */
beforeEach(() => {
  currentCustomer = mainCustomer;
});

afterEach(async () => {
  if (!dbAvailable) return;
  await prisma.promoRedemption.deleteMany({ where: { promoCodeId: { in: promoIds } } });
  await prisma.bookingHold.deleteMany({ where: { tenantId } });
  await prisma.vehicleOccupancy.deleteMany({ where: { tenantId } });
  await prisma.booking.deleteMany({ where: { tenantId } });
  await prisma.bookingRequest.deleteMany({ where: { tenantId } });
  await prisma.notification.deleteMany({ where: { tenantId } });
  await prisma.auditLog.deleteMany({ where: { tenantId } });
  await prisma.vehicleServiceSetting.deleteMany({ where: { tenantId } });
  // Bộ đếm phải về 0 giữa các ca: một ca trước để lại `reserved_count = 1` sẽ làm ca sau nói
  // "hết lượt" vì một lý do không thuộc về nó.
  await prisma.promoCode.updateMany({
    where: { id: { in: promoIds } },
    data: { reservedCount: 0, redeemedCount: 0 },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    await prisma.promoRedemption.deleteMany({ where: { promoCodeId: { in: promoIds } } });
    await prisma.promoCode.deleteMany({ where: { id: { in: promoIds } } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: adminUserId } });
    await prisma.tenantCustomer.deleteMany({ where: { tenantId } });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId } });
    await prisma.plan.deleteMany({ where: { id: planId } });
    await prisma.vehicle.deleteMany({ where: { tenantId } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, adminUserId, ...customerIds] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

// ───────────────────────────────────────────────────────────────────────────────
// 1. Xem trước — cửa kiểm thứ nhất
// ───────────────────────────────────────────────────────────────────────────────

describe('Xem trước mã — ĐỌC THUẦN, không giữ lượt', () => {
  maybe('mã hợp lệ trả số giảm + tổng khách trả SAU giảm, do SERVER tính', async () => {
    await seedPromo({ code: `XT1${RUN.slice(0, 4)}`.toUpperCase(), discountAmount: '100000' });
    const r = await promoQuote.preview(
      previewInput(`xt1${RUN.slice(0, 4)}`),
      currentCustomer,
    );

    expect(r.applicable).toBe(true);
    expect(r.discountAmount).toBe('100000');
    expect(r.customerTotalAmount).toBe(String(CUSTOMER_TOTAL - 100_000));
    expect(r.holdAmount).toBe(String(GROSS_ONLINE - 100_000));
  });

  maybe('xem trước KHÔNG giữ lượt — gọi mười lần, bộ đếm vẫn 0', async () => {
    /*
     * Giữ lượt ở bước xem trước là để một vòng `curl` dùng cạn một chiến dịch trong vài giây
     * (ADR 0046 điều 6).
     */
    const code = `XT2${RUN.slice(0, 4)}`.toUpperCase();
    const id = await seedPromo({ code, totalUsageLimit: 1 });
    for (let i = 0; i < 10; i++) {
      const r = await promoQuote.preview(previewInput(code), currentCustomer);
      expect(r.applicable).toBe(true);
    }
    const row = await prisma.promoCode.findUniqueOrThrow({ where: { id } });
    expect(row.reservedCount).toBe(0);
    expect(row.redeemedCount).toBe(0);
    expect(await prisma.promoRedemption.count({ where: { promoCodeId: id } })).toBe(0);
  });

  maybe('mã không tồn tại và mã đã xoá mềm trả CÙNG một lý do — không cho dò', async () => {
    const code = `XT3${RUN.slice(0, 4)}`.toUpperCase();
    const id = await seedPromo({ code });
    await prisma.promoCode.update({ where: { id }, data: { deletedAt: new Date() } });

    const deleted = await promoQuote.preview(previewInput(code), currentCustomer);
    const missing = await promoQuote.preview(previewInput('KHONGTONTAI'), currentCustomer);
    expect(deleted.reason).toBe(PROMO_INELIGIBLE_REASON.NOT_FOUND);
    expect(missing.reason).toBe(PROMO_INELIGIBLE_REASON.NOT_FOUND);
  });

  maybe('mỗi điều kiện có MÃ LÝ DO riêng, ổn định cho giao diện dịch', async () => {
    const suffix = RUN.slice(0, 3).toUpperCase();
    const cases: Array<[string, PromoInput, string]> = [
      ['đã tắt', { code: `OFF${suffix}`, isActive: false }, PROMO_INELIGIBLE_REASON.DISABLED],
      [
        'chưa bắt đầu',
        { code: `SOON${suffix}`, startsAt: new Date(Date.now() + 5 * DAY) },
        PROMO_INELIGIBLE_REASON.NOT_STARTED,
      ],
      [
        'đã hết hạn',
        {
          code: `OLD${suffix}`,
          startsAt: new Date(Date.now() - 10 * DAY),
          endsAt: new Date(Date.now() - DAY),
        },
        PROMO_INELIGIBLE_REASON.EXPIRED,
      ],
      [
        'chưa đủ đơn tối thiểu',
        { code: `MIN${suffix}`, minOrderAmount: '5000000' },
        PROMO_INELIGIBLE_REASON.MIN_ORDER_NOT_MET,
      ],
      [
        'sai loại xe',
        { code: `BIKE${suffix}`, vehicleScope: PROMO_VEHICLE_SCOPE.MOTORBIKE },
        PROMO_INELIGIBLE_REASON.VEHICLE_SCOPE_MISMATCH,
      ],
      [
        'sai dịch vụ',
        { code: `DRV${suffix}`, serviceScope: [SERVICE_TYPE.WITH_DRIVER] },
        PROMO_INELIGIBLE_REASON.SERVICE_SCOPE_MISMATCH,
      ],
    ];

    for (const [label, input, reason] of cases) {
      await seedPromo(input);
      const r = await promoQuote.preview(previewInput(input.code), currentCustomer);
      expect(`${label}:${r.reason}`).toBe(`${label}:${reason}`);
      expect(r.applicable).toBe(false);
      // Không áp được ⇒ MỌI số tiền về null: một ô "giảm 0đ" trông như mã đã áp mà vô tác dụng.
      expect(r.discountAmount).toBeNull();
      expect(r.customerTotalAmount).toBeNull();
    }
  });

  maybe('mã HẾT LƯỢT nói đúng là hết lượt, không nói "không tồn tại"', async () => {
    const code = `FULL${RUN.slice(0, 3)}`.toUpperCase();
    const id = await seedPromo({ code, totalUsageLimit: 1 });
    await prisma.promoCode.update({ where: { id }, data: { reservedCount: 1 } });

    const r = await promoQuote.preview(previewInput(code), currentCustomer);
    expect(r.reason).toBe(PROMO_INELIGIBLE_REASON.EXHAUSTED);
  });

  maybe('khách CHƯA đăng nhập + mã theo đối tượng ⇒ REQUIRES_IDENTITY, không lộ gì về ai', async () => {
    /*
     * Endpoint công khai không được trả lời câu "số này đã từng thuê xe chưa" cho một người chưa
     * chứng minh mình là ai (ADR 0046 điều 9). Trả một lý do TRUNG TÍNH và để bước gửi (đã qua
     * OTP) kiểm thật.
     */
    const code = `NEW${RUN.slice(0, 3)}`.toUpperCase();
    await seedPromo({ code, audience: PROMO_AUDIENCE.NEW_CUSTOMER });

    const anon = await promoQuote.preview(previewInput(code), null);
    expect(anon.reason).toBe(PROMO_INELIGIBLE_REASON.REQUIRES_IDENTITY);

    const signed = await promoQuote.preview(previewInput(code), currentCustomer);
    expect(signed.applicable).toBe(true);
  });

  maybe('"khách hàng mới" đo bằng ĐƠN ĐÃ HÌNH THÀNH, không bằng số lượt gửi yêu cầu', async () => {
    const code = `NEW2${RUN.slice(0, 3)}`.toUpperCase();
    await seedPromo({ code, audience: PROMO_AUDIENCE.NEW_CUSTOMER });
    const repeat = await makeCustomer('repeat');

    // Mười yêu cầu CHƯA thành đơn vẫn là khách mới — họ chưa từng thuê xe của XePrime.
    for (let i = 0; i < 3; i++) {
      await prisma.bookingRequest.create({
        data: {
          id: newId(),
          tenantId,
          vehicleId,
          status: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
          customerName: 'Khách cũ',
          customerPhone: nextPhone(),
          customerUserId: repeat,
          pickupAt: vnAt(40 + i, 9),
          returnAt: vnAt(42 + i, 9),
          respondBy: new Date(Date.now() + DAY),
        },
      });
    }
    expect((await promoQuote.preview(previewInput(code), repeat)).applicable).toBe(true);

    // Một yêu cầu ĐÃ thành đơn thì họ không còn mới.
    await prisma.bookingRequest.create({
      data: {
        id: newId(),
        tenantId,
        vehicleId,
        status: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
        customerName: 'Khách cũ',
        customerPhone: nextPhone(),
        customerUserId: repeat,
        pickupAt: vnAt(60, 9),
        returnAt: vnAt(62, 9),
        respondBy: new Date(Date.now() + DAY),
      },
    });
    const after = await promoQuote.preview(previewInput(code), repeat);
    expect(after.reason).toBe(PROMO_INELIGIBLE_REASON.AUDIENCE_MISMATCH);
  });

  maybe('danh sách mã khả dụng: áp được lên trước, mã ẩn KHÔNG lọt ra', async () => {
    const listedCode = `LST${RUN.slice(0, 3)}`.toUpperCase();
    const hiddenCode = `HID${RUN.slice(0, 3)}`.toUpperCase();
    const weakCode = `WEAK${RUN.slice(0, 3)}`.toUpperCase();
    await seedPromo({ code: listedCode, discountAmount: '200000' });
    await seedPromo({ code: hiddenCode, discountAmount: '300000', listed: false });
    await seedPromo({ code: weakCode, minOrderAmount: '9000000' });

    const list = await promoQuote.available(
      {
        vehicleId,
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        pickupAt: vnAt(5, 9).toISOString(),
        returnAt: vnAt(7, 9).toISOString(),
      },
      currentCustomer,
    );
    const codes = list.map((r) => r.code);
    expect(codes).toContain(listedCode);
    expect(codes).toContain(weakCode);
    // Mã riêng gửi qua email/SMS không được lộ ra một danh sách công khai (ADR 0046 điều 9).
    expect(codes).not.toContain(hiddenCode);
    // Mã áp được nằm trước mã không áp được.
    expect(list.findIndex((r) => r.code === listedCode)).toBeLessThan(
      list.findIndex((r) => r.code === weakCode),
    );
    expect(list.find((r) => r.code === weakCode)?.reason).toBe(
      PROMO_INELIGIBLE_REASON.MIN_ORDER_NOT_MET,
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// 2. Gửi yêu cầu — GIỮ lượt
// ───────────────────────────────────────────────────────────────────────────────

describe('Gửi yêu cầu — GIỮ lượt trong cùng transaction', () => {
  maybe('lượt được giữ, snapshot đóng băng trên yêu cầu, bộ đếm tăng đúng 1', async () => {
    const code = `SUB${RUN.slice(0, 3)}`.toUpperCase();
    const id = await seedPromo({ code, totalUsageLimit: 5, discountAmount: '100000' });

    const { receipt } = await submit({ promoCode: code });
    const req = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(req.promoCodeId).toBe(id);
    expect((req.promoSnapshot as Record<string, unknown>).code).toBe(code);
    expect((req.promoSnapshot as Record<string, unknown>).discountApplied).toBe('100000');

    const redemption = await prisma.promoRedemption.findUniqueOrThrow({
      where: { bookingRequestId: receipt.id },
    });
    expect(redemption.status).toBe(PROMO_REDEMPTION_STATUS.RESERVED);
    expect(redemption.customerUserId).toBe(currentCustomer);

    const row = await prisma.promoCode.findUniqueOrThrow({ where: { id } });
    expect(row.reservedCount).toBe(1);
    expect(row.redeemedCount).toBe(0);
  });

  maybe('mã không áp được ⇒ TỪ CHỐI cả lượt gửi, không âm thầm bỏ mã rồi tăng tiền', async () => {
    /*
     * Bỏ mã rồi vẫn ghi yêu cầu làm số tiền khách phải trả TĂNG so với con số họ vừa đồng ý, và
     * họ chỉ phát hiện ra lúc nhìn mã QR.
     */
    const code = `BAD${RUN.slice(0, 3)}`.toUpperCase();
    await seedPromo({ code, minOrderAmount: '9000000' });

    await expect(submit({ promoCode: code })).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.PROMO_CODE_NOT_APPLICABLE,
        details: { reason: PROMO_INELIGIBLE_REASON.MIN_ORDER_NOT_MET },
      },
    });
    // Và KHÔNG để lại yêu cầu nào.
    expect(await prisma.bookingRequest.count({ where: { tenantId } })).toBe(0);
  });

  maybe('mã gõ chữ thường / có khoảng trắng vẫn áp được — server chuẩn hoá', async () => {
    const code = `NRM${RUN.slice(0, 3)}`.toUpperCase();
    await seedPromo({ code });
    const { receipt } = await submit({ promoCode: `  ${code.toLowerCase()} ` });
    const redemption = await prisma.promoRedemption.findUniqueOrThrow({
      where: { bookingRequestId: receipt.id },
    });
    expect(redemption.code).toBe(code);
  });

  maybe('TRẦN MỖI KHÁCH: lượt thứ hai của cùng một người bị chặn', async () => {
    const code = `ONE${RUN.slice(0, 3)}`.toUpperCase();
    await seedPromo({ code, perCustomerLimit: 1 });

    await submit({ promoCode: code, offsetDays: 5 });
    await expect(submit({ promoCode: code, offsetDays: 20 })).rejects.toMatchObject({
      response: {
        details: { reason: PROMO_INELIGIBLE_REASON.CUSTOMER_LIMIT_REACHED },
      },
    });
  });

  maybe('TRẦN MỖI KHÁCH không chặn người KHÁC', async () => {
    const code = `ONE2${RUN.slice(0, 3)}`.toUpperCase();
    await seedPromo({ code, perCustomerLimit: 1 });
    const other = await makeCustomer('other');

    await submit({ promoCode: code, offsetDays: 5 });
    currentCustomer = other;
    const second = await submit({ promoCode: code, offsetDays: 20 });
    expect(second.receipt.id).toBeTruthy();
  });

  maybe('TRANH CHẤP LƯỢT CUỐI: hai yêu cầu song song, đúng MỘT bên thắng', async () => {
    /*
     * Trần tổng được gác bằng `UPDATE … WHERE reserved_count < total_usage_limit` — một câu lệnh
     * vừa đọc vừa ghi, nên Postgres tuần tự hoá hai transaction trên chính hàng đó.
     *
     * Hai KHÁCH khác nhau để loại hết khoá theo khách ra khỏi phép thử: thứ duy nhất còn gác ở
     * đây là bộ đếm tổng.
     */
    const code = `RACE${RUN.slice(0, 3)}`.toUpperCase();
    const id = await seedPromo({ code, totalUsageLimit: 1 });
    const a = await makeCustomer('racea');
    const b = await makeCustomer('raceb');

    const runOne = async (customer: string, offsetDays: number) => {
      currentCustomer = customer;
      return submit({ promoCode: code, offsetDays, customerUserId: customer });
    };
    const results = await Promise.allSettled([runOne(a, 5), runOne(b, 25)]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    expect((rejected[0] as PromiseRejectedResult).reason.response.code).toBe(
      API_ERROR_CODE.PROMO_CODE_EXHAUSTED,
    );

    const row = await prisma.promoCode.findUniqueOrThrow({ where: { id } });
    expect(row.reservedCount).toBe(1);
    expect(await prisma.promoRedemption.count({ where: { promoCodeId: id } })).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// 3. Chốt giá lúc duyệt + dòng tiền
// ───────────────────────────────────────────────────────────────────────────────

describe('Chốt giá lúc duyệt — dòng tiền khép kín', () => {
  maybe('hold mang QUYỀN LỢI đầy đủ + cột tài trợ; số khách chuyển đã trừ', async () => {
    const code = `HLD${RUN.slice(0, 3)}`.toUpperCase();
    await seedPromo({ code, discountAmount: '100000' });
    const { receipt } = await submit({ promoCode: code });
    await requests.approve(tenantId, ownerId, receipt.id);

    const hold = await prisma.bookingHold.findUniqueOrThrow({
      where: { bookingRequestId: receipt.id },
    });

    // Con số in lên QR: 420.000 − 100.000.
    expect(hold.amount.toFixed(0)).toBe(String(GROSS_ONLINE - 100_000));
    // QUYỀN LỢI không đổi: chủ xe vẫn được 280.000 cọc, nền tảng vẫn ghi nhận 140.000 phí.
    expect(hold.depositAmount.toFixed(0)).toBe(String(DEPOSIT));
    expect(hold.serviceFeeAmount.toFixed(0)).toBe(String(SERVICE_FEE));
    expect(hold.promoDiscountAmount.toFixed(0)).toBe('100000');
    // Bất biến `D + S + IV + IP − P = amount` — cũng là CHECK ở DB.
    expect(
      Number(hold.depositAmount) +
        Number(hold.serviceFeeAmount) +
        Number(hold.vehicleInsuranceAmount) +
        Number(hold.personalInsuranceAmount) -
        Number(hold.promoDiscountAmount),
    ).toBe(Number(hold.amount));
  });

  maybe('ĐƠN: doanh thu gian hàng KHÔNG bị bớt, chỉ số KHÁCH TRẢ giảm', async () => {
    const code = `BKG${RUN.slice(0, 3)}`.toUpperCase();
    const promoId = await seedPromo({ code, discountAmount: '100000' });
    const { receipt } = await submit({ promoCode: code });
    await requests.approve(tenantId, ownerId, receipt.id);
    const hold = await prisma.bookingHold.findUniqueOrThrow({
      where: { bookingRequestId: receipt.id },
    });

    // Tiền về đủ ⇒ ĐƠN ra đời (ADR 0044 điều 2).
    const applied = await prisma.$transaction((tx) =>
      holds.applyBankPaymentWithinTx(tx, {
        code: hold.code,
        amount: hold.amount,
        providerTxId: `promo-${hold.code}`,
      }),
    );
    expect(applied.outcome).toBe('activated');

    const booking = await prisma.booking.findFirstOrThrow({ where: { tenantId } });
    /*
     * ĐÂY là bất biến trung tâm: `total_amount` là doanh thu gian hàng và mã của nền tảng không
     * được chạm vào nó. `discount_amount` là khuyến mãi TRỰC TIẾP của chủ xe — vẫn 0 ở ca này,
     * nên hai loại giảm giá phân biệt được và đối soát được.
     */
    expect(booking.totalAmount.toFixed(0)).toBe(String(RENTAL));
    expect(booking.discountAmount.toFixed(0)).toBe('0');
    expect(booking.promoCodeId).toBe(promoId);
    expect(booking.promoDiscountAmount.toFixed(0)).toBe('100000');
    // Số khách trả = B + S + IV − P.
    expect(booking.customerTotalAmount?.toFixed(0)).toBe(String(CUSTOMER_TOTAL - 100_000));
    /*
     * Khoản XePrime nợ chủ xe = D − T, y như khi KHÔNG có mã: phần tài trợ do nền tảng gánh, nên
     * nó không được xuất hiện ở đây dưới bất kỳ hình thức nào (ADR 0046 điều 2).
     */
    expect(booking.ownerPayableAmount?.toFixed(0)).toBe(String(DEPOSIT - TAX));
    expect(booking.taxAmount.toFixed(0)).toBe(String(TAX));

    // Lượt mã CHỐT đúng ở mốc đơn hình thành.
    const redemption = await prisma.promoRedemption.findUniqueOrThrow({
      where: { bookingRequestId: receipt.id },
    });
    expect(redemption.status).toBe(PROMO_REDEMPTION_STATUS.REDEEMED);
    expect(redemption.bookingId).toBe(booking.id);
    expect(redemption.discountAmount.toFixed(0)).toBe('100000');
    const row = await prisma.promoCode.findUniqueOrThrow({ where: { id: promoId } });
    expect(row.redeemedCount).toBe(1);
    expect(row.reservedCount).toBe(1);
  });

  maybe('CỘNG DỒN với khuyến mãi trực tiếp của xe — mã tính trên tiền thuê SAU giảm', async () => {
    /*
     * Xe giảm trực tiếp 10%: 1.400.000 → 1.260.000. Mã 10% ⇒ 126.000đ, không phải 140.000đ
     * (ADR 0046 điều 3). Hai dòng giảm vẫn nằm ở hai chỗ khác nhau trên đơn.
     */
    const code = `STK${RUN.slice(0, 3)}`.toUpperCase();
    await seedPromo({
      code,
      discountType: PROMO_DISCOUNT_TYPE.PERCENT,
      discountAmount: null,
      discountPercent: 10,
    });
    await prisma.vehicle.update({ where: { id: vehicleId }, data: { discountPercent: 10 } });
    try {
      const { receipt } = await submit({ promoCode: code });
      await requests.approve(tenantId, ownerId, receipt.id);
      const booking = await payHoldOf(receipt.id);

      // Khuyến mãi trực tiếp: CHỦ XE bớt, nên nó trừ vào doanh thu của chính họ.
      expect(booking.discountAmount.toFixed(0)).toBe('140000');
      expect(booking.totalAmount.toFixed(0)).toBe('1260000');
      // Mã nền tảng: 10% của 1.260.000 — KHÔNG phải 10% của 1.400.000 (ADR 0046 điều 3).
      expect(booking.promoDiscountAmount.toFixed(0)).toBe('126000');
    } finally {
      await prisma.vehicle.update({ where: { id: vehicleId }, data: { discountPercent: null } });
    }
  });

  maybe('TỰ NHẬN đi cùng một đường — mã áp y hệt lúc duyệt tay', async () => {
    const code = `AUT${RUN.slice(0, 3)}`.toUpperCase();
    await seedPromo({ code, discountAmount: '100000' });
    await prisma.vehicleServiceSetting.create({
      data: {
        id: newId(),
        tenantId,
        vehicleId,
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        autoAcceptEnabled: true,
      },
    });

    const { receipt } = await submit({ promoCode: code });
    const hold = await prisma.bookingHold.findUniqueOrThrow({
      where: { bookingRequestId: receipt.id },
    });
    expect(hold.promoDiscountAmount.toFixed(0)).toBe('100000');
    expect(hold.amount.toFixed(0)).toBe(String(GROSS_ONLINE - 100_000));
  });

  maybe('mã KHỔNG LỒ bị kẹp ở `D + S` — không lấn một đồng nào vào tiền bảo hiểm', async () => {
    /*
     * Trần chặt nhất ở đây là phần TÀI TRỢ ĐƯỢC (420.000), không phải `grossOnline − sàn`
     * (428.000): 28.000đ bảo hiểm là tiền XePrime giữ hộ hãng bảo hiểm và vẫn phải chuyển đủ cho
     * đối tác dù nền tảng có giảm giá cho khách hay không (ADR 0033 điều 4).
     */
    const code = `CAP${RUN.slice(0, 3)}`.toUpperCase();
    await seedPromo({ code, discountAmount: '9000000' });
    const { receipt } = await submit({ promoCode: code });
    await requests.approve(tenantId, ownerId, receipt.id);

    const hold = await prisma.bookingHold.findUniqueOrThrow({
      where: { bookingRequestId: receipt.id },
    });
    expect(hold.promoDiscountAmount.toFixed(0)).toBe(String(SPONSORABLE));
    expect(hold.amount.toFixed(0)).toBe(String(GROSS_ONLINE - SPONSORABLE));
    // Phần bảo hiểm khách chuyển KHÔNG bị bớt — nó đúng bằng `IV`.
    expect(hold.amount.toFixed(0)).toBe(String(VEHICLE_INSURANCE));
    expect(hold.vehicleInsuranceAmount.toFixed(0)).toBe(String(VEHICLE_INSURANCE));
  });

  maybe('KHÔNG có mã: mọi cột tài trợ bằng 0 — hành vi y như trước ADR 0046', async () => {
    const { receipt } = await submit();
    await requests.approve(tenantId, ownerId, receipt.id);
    const hold = await prisma.bookingHold.findUniqueOrThrow({
      where: { bookingRequestId: receipt.id },
    });
    expect(hold.promoDiscountAmount.toFixed(0)).toBe('0');
    expect(hold.amount.toFixed(0)).toBe(String(GROSS_ONLINE));
    expect(await prisma.promoRedemption.count()).toBe(0);
  });

  maybe('mã hết đủ điều kiện lúc chốt giá ⇒ NHẢ lượt, BÁO KHÁCH, lượt duyệt vẫn đi tiếp', async () => {
    /*
     * Gian hàng hạ giá xe giữa lúc khách chờ duyệt, làm chuyến tụt xuống dưới đơn tối thiểu của
     * mã. Chặn lượt duyệt là phạt gian hàng cho một chi tiết marketing; im lặng bỏ mã là tăng
     * tiền khách phải trả mà không nói. Đường đúng: nhả lượt + thông báo (ADR 0046 điều 7).
     */
    const code = `DRP${RUN.slice(0, 3)}`.toUpperCase();
    const promoId = await seedPromo({ code, minOrderAmount: '1300000' });
    const { receipt } = await submit({ promoCode: code });

    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: { weekdayPrice: new Prisma.Decimal('300000'), weekendPrice: new Prisma.Decimal('300000') },
    });
    try {
      await requests.approve(tenantId, ownerId, receipt.id);
    } finally {
      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: {
          weekdayPrice: new Prisma.Decimal('700000'),
          weekendPrice: new Prisma.Decimal('700000'),
        },
      });
    }

    const redemption = await prisma.promoRedemption.findUniqueOrThrow({
      where: { bookingRequestId: receipt.id },
    });
    expect(redemption.status).toBe(PROMO_REDEMPTION_STATUS.RELEASED);
    expect(redemption.releaseReason).toBe(PROMO_RELEASE_REASON.NO_LONGER_ELIGIBLE);

    const req = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
    // Dấu mã bị xoá khỏi yêu cầu: giữ lại một mã không giảm đồng nào là nói dối mọi bề mặt đọc lại.
    expect(req.promoCodeId).toBeNull();
    expect(req.promoSnapshot).toBeNull();
    expect(req.status).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);

    const hold = await prisma.bookingHold.findUniqueOrThrow({
      where: { bookingRequestId: receipt.id },
    });
    expect(hold.promoDiscountAmount.toFixed(0)).toBe('0');

    // Khách PHẢI được báo — đây là phần khiến việc bỏ mã không còn âm thầm.
    const notified = await prisma.notification.count({
      where: { userId: currentCustomer, type: 'promo_code_dropped' },
    });
    expect(notified).toBe(1);

    // Lượt về kho.
    const row = await prisma.promoCode.findUniqueOrThrow({ where: { id: promoId } });
    expect(row.reservedCount).toBe(0);
  });

  maybe('SNAPSHOT: admin sửa mức giảm sau khi khách áp mã KHÔNG viết lại giá của họ', async () => {
    const code = `SNP${RUN.slice(0, 3)}`.toUpperCase();
    const promoId = await seedPromo({ code, discountAmount: '100000' });
    const { receipt } = await submit({ promoCode: code });

    // Admin đổi mức giảm và TẮT chiến dịch — hai việc bình thường của vận hành.
    await prisma.promoCode.update({
      where: { id: promoId },
      data: { discountAmount: new Prisma.Decimal('10000'), isActive: false },
    });

    await requests.approve(tenantId, ownerId, receipt.id);
    const hold = await prisma.bookingHold.findUniqueOrThrow({
      where: { bookingRequestId: receipt.id },
    });
    // 100.000 — con số đã hiện trên màn hình của khách, không phải 10.000 của hôm nay.
    expect(hold.promoDiscountAmount.toFixed(0)).toBe('100000');
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// 4. NHẢ lượt
// ───────────────────────────────────────────────────────────────────────────────

describe('NHẢ lượt — yêu cầu chết trước khi thành đơn', () => {
  maybe('gian hàng TỪ CHỐI ⇒ lượt về kho với lý do đúng', async () => {
    const code = `REJ${RUN.slice(0, 3)}`.toUpperCase();
    const promoId = await seedPromo({ code, totalUsageLimit: 1 });
    const { receipt } = await submit({ promoCode: code });

    await requests.reject(tenantId, ownerId, receipt.id, 'Xe đang bảo dưỡng');

    const redemption = await prisma.promoRedemption.findUniqueOrThrow({
      where: { bookingRequestId: receipt.id },
    });
    expect(redemption.status).toBe(PROMO_REDEMPTION_STATUS.RELEASED);
    expect(redemption.releaseReason).toBe(PROMO_RELEASE_REASON.REQUEST_REJECTED);
    const row = await prisma.promoCode.findUniqueOrThrow({ where: { id: promoId } });
    expect(row.reservedCount).toBe(0);
    // Và mã dùng lại được ngay.
    expect((await promoQuote.preview(previewInput(code), currentCustomer)).applicable).toBe(true);
  });

  maybe('MẤT KHUNG GIỜ (`slot_taken`) ⇒ lượt của người thua về kho', async () => {
    const code = `SLT${RUN.slice(0, 3)}`.toUpperCase();
    const promoId = await seedPromo({ code, totalUsageLimit: 5 });
    const loserCustomer = await makeCustomer('loser');

    currentCustomer = loserCustomer;
    const loser = await submit({ promoCode: code, offsetDays: 8, customerUserId: loserCustomer });
    const winner = await submit({ offsetDays: 8, customerUserId: currentCustomer });

    await requests.approve(tenantId, ownerId, winner.receipt.id);

    const req = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: loser.receipt.id } });
    expect(req.status).toBe(BOOKING_REQUEST_STATUS.SLOT_TAKEN);
    const redemption = await prisma.promoRedemption.findUniqueOrThrow({
      where: { bookingRequestId: loser.receipt.id },
    });
    expect(redemption.status).toBe(PROMO_REDEMPTION_STATUS.RELEASED);
    expect(redemption.releaseReason).toBe(PROMO_RELEASE_REASON.SLOT_TAKEN);
    const row = await prisma.promoCode.findUniqueOrThrow({ where: { id: promoId } });
    expect(row.reservedCount).toBe(0);
  });

  maybe('ĐƠN ĐÃ HÌNH THÀNH rồi bị huỷ ⇒ lượt KHÔNG khôi phục', async () => {
    /*
     * Quy tắc ADR 0046 điều 6, và nó được thi hành bằng điều kiện `status = 'reserved'` trong
     * câu `UPDATE` của `releasePromoRedemption` — không bằng một câu `if` ai đó phải nhớ.
     *
     * Lý do: huỷ trong cửa sổ miễn phí không mất đồng nào, nên nếu huỷ mà hoàn lượt thì vòng
     * "đặt rồi huỷ" biến một mã dùng-một-lần thành mã dùng vô hạn.
     */
    const code = `FIN${RUN.slice(0, 3)}`.toUpperCase();
    const promoId = await seedPromo({ code, totalUsageLimit: 1 });
    const { receipt } = await submit({ promoCode: code });
    await requests.approve(tenantId, ownerId, receipt.id);
    const hold = await prisma.bookingHold.findUniqueOrThrow({
      where: { bookingRequestId: receipt.id },
    });
    await prisma.$transaction((tx) =>
      holds.applyBankPaymentWithinTx(tx, {
        code: hold.code,
        amount: hold.amount,
        providerTxId: `promo-final-${hold.code}`,
      }),
    );

    // Gọi thẳng đường nhả — mọi đường huỷ đơn đều đi qua nó.
    const { releasePromoRedemption } = await import('@xeprime/prisma');
    await prisma.$transaction((tx) =>
      releasePromoRedemption(tx, {
        bookingRequestId: receipt.id,
        reason: PROMO_RELEASE_REASON.REQUEST_CANCELLED,
      }),
    );

    const redemption = await prisma.promoRedemption.findUniqueOrThrow({
      where: { bookingRequestId: receipt.id },
    });
    expect(redemption.status).toBe(PROMO_REDEMPTION_STATUS.REDEEMED);
    const row = await prisma.promoCode.findUniqueOrThrow({ where: { id: promoId } });
    expect(row.reservedCount).toBe(1);
    expect(row.redeemedCount).toBe(1);
    // Mã đã dùng hết lượt và KHÔNG sống lại.
    expect((await promoQuote.preview(previewInput(code), currentCustomer)).reason).toBe(
      PROMO_INELIGIBLE_REASON.EXHAUSTED,
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// 5. Quản trị
// ───────────────────────────────────────────────────────────────────────────────

describe('Quản trị mã — quyền và trường bị khoá', () => {
  const upsert = (code: string, over: Record<string, unknown> = {}) => ({
    code,
    name: 'Chiến dịch admin',
    description: null,
    discountType: PROMO_DISCOUNT_TYPE.FIXED,
    discountAmount: '100000',
    discountPercent: null,
    maxDiscountAmount: null,
    minOrderAmount: '800000',
    audience: PROMO_AUDIENCE.ALL,
    vehicleScope: PROMO_VEHICLE_SCOPE.ALL,
    serviceScope: [],
    provinceCodes: [],
    totalUsageLimit: 500,
    perCustomerLimit: 1,
    startsAt: new Date(Date.now() - DAY).toISOString(),
    endsAt: new Date(Date.now() + 30 * DAY).toISOString(),
    isActive: true,
    listed: true,
    ...over,
  });

  maybe('tạo mã: chuẩn hoá code, ghi audit với actorScope = platform', async () => {
    const code = `ADM${RUN.slice(0, 3)}`.toUpperCase();
    const dto = upsert(code.toLowerCase());
    const created = await admin.create(adminUserId, dto as never);
    promoIds.push(created.id);

    expect(created.code).toBe(code);
    expect(created.state).toBe('active');
    expect(created.hasUsage).toBe(false);
    expect(created.lockedFields).toEqual([]);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { targetType: 'promo_code', targetId: created.id, action: 'promo_code.create' },
    });
    expect(log.actorScope).toBe('platform');
    // Mã nền tảng KHÔNG thuộc gian hàng nào — dòng audit cũng không mang tenant.
    expect(log.tenantId).toBeNull();
  });

  maybe('mã TRÙNG bị chặn bằng unique ở DB, trả mã lỗi riêng', async () => {
    const code = `DUP${RUN.slice(0, 3)}`.toUpperCase();
    await seedPromo({ code });
    await expect(admin.create(adminUserId, upsert(code) as never)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.PROMO_CODE_DUPLICATE },
    });
  });

  maybe('cấu hình sai bị chặn bằng CHÍNH hàm form admin dùng để báo sớm', async () => {
    await expect(
      admin.create(
        adminUserId,
        upsert(`INV${RUN.slice(0, 3)}`.toUpperCase(), {
          endsAt: new Date(Date.now() - 10 * DAY).toISOString(),
        }) as never,
      ),
    ).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.VALIDATION_FAILED,
        details: { blockers: ['end_before_start'] },
      },
    });
  });

  maybe('mã ĐÃ CÓ LƯỢT DÙNG: sửa mức giảm bị chặn, nhưng nới thời gian thì được', async () => {
    const code = `LCK${RUN.slice(0, 3)}`.toUpperCase();
    const promoId = await seedPromo({ code, discountAmount: '100000' });
    await submit({ promoCode: code });

    const current = await admin.getOne(promoId);
    expect(current.hasUsage).toBe(true);
    expect(current.lockedFields).toContain('discountAmount');

    const base = upsert(code, {
      startsAt: current.startsAt,
      endsAt: current.endsAt,
      totalUsageLimit: current.totalUsageLimit,
      perCustomerLimit: current.perCustomerLimit,
      minOrderAmount: current.minOrderAmount,
    });

    await expect(
      admin.update(promoId, adminUserId, { ...base, discountAmount: '500000' } as never),
    ).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.PROMO_CODE_LOCKED,
        details: { fields: ['discountAmount'] },
      },
    });

    /*
     * Gửi lại CÙNG giá trị không bị coi là "sửa": form admin gửi cả object, nên một lượt đổi mô
     * tả cũng mang theo `discountAmount` y như cũ — từ chối nó là từ chối một việc không có gì sai.
     */
    const renamed = await admin.update(promoId, adminUserId, {
      ...base,
      name: 'Tên mới',
      endsAt: new Date(Date.now() + 60 * DAY).toISOString(),
    } as never);
    expect(renamed.name).toBe('Tên mới');
  });

  maybe('bật/tắt vẫn dùng được khi mã đã có lượt — đường duy nhất còn lại', async () => {
    const code = `TGL${RUN.slice(0, 3)}`.toUpperCase();
    const promoId = await seedPromo({ code });
    await submit({ promoCode: code });

    const off = await admin.toggle(promoId, adminUserId, { isActive: false });
    expect(off.isActive).toBe(false);
    expect(off.state).toBe('disabled');
    expect((await promoQuote.preview(previewInput(code), currentCustomer)).reason).toBe(
      PROMO_INELIGIBLE_REASON.DISABLED,
    );
  });

  maybe('NHÂN BẢN: mã mới, TẮT sẵn, giữ nguyên bộ điều kiện', async () => {
    const code = `CPY${RUN.slice(0, 3)}`.toUpperCase();
    const promoId = await seedPromo({ code, discountAmount: '123000', minOrderAmount: '900000' });

    const copy = await admin.duplicate(promoId, adminUserId);
    promoIds.push(copy.id);

    expect(copy.code).toBe(`${code}2`);
    // Tắt sẵn: nhân bản là bước đầu của "sửa một chiến dịch đã chạy", nên bản mới phải chờ soát.
    expect(copy.isActive).toBe(false);
    expect(copy.discountAmount).toBe('123000');
    expect(copy.minOrderAmount).toBe('900000');
    expect(copy.reservedCount).toBe(0);
  });

  maybe('XOÁ MỀM: mã đã dùng vẫn đọc lại được, và DB CHẶN xoá cứng', async () => {
    const code = `DEL${RUN.slice(0, 3)}`.toUpperCase();
    const promoId = await seedPromo({ code });
    await submit({ promoCode: code });

    await admin.remove(promoId, adminUserId);
    const row = await prisma.promoCode.findUniqueOrThrow({ where: { id: promoId } });
    expect(row.deletedAt).not.toBeNull();
    // Xoá mềm cũng tắt công tắc — một mã đã xoá không được còn hiệu lực ở đường đọc nào.
    expect(row.isActive).toBe(false);

    /*
     * `promo_redemptions.promo_code_id` là `RESTRICT`: kể cả một `deleteMany` viết sai cũng bị
     * chặn, nên lịch sử giá của đơn cũ không thể mất (ADR 0046 điều 8).
     */
    await expect(prisma.promoCode.delete({ where: { id: promoId } })).rejects.toThrow();
  });

  maybe('danh sách: lọc theo trạng thái SUY RA và đếm thẻ thống kê ở SERVER', async () => {
    const suffix = RUN.slice(0, 2).toUpperCase();
    await seedPromo({ code: `ST1${suffix}` });
    await seedPromo({ code: `ST2${suffix}`, isActive: false });
    await seedPromo({
      code: `ST3${suffix}`,
      startsAt: new Date(Date.now() - 10 * DAY),
      endsAt: new Date(Date.now() - DAY),
    });

    const disabled = await admin.list({ state: 'disabled', q: suffix });
    expect(disabled.data.every((r) => r.isActive === false)).toBe(true);
    expect(disabled.data.some((r) => r.code === `ST2${suffix}`)).toBe(true);

    const expired = await admin.list({ state: 'expired', q: suffix });
    expect(expired.data.some((r) => r.code === `ST3${suffix}`)).toBe(true);
    expect(expired.data.some((r) => r.code === `ST1${suffix}`)).toBe(false);

    // Thẻ thống kê đếm trên TOÀN BỘ chiến dịch, không theo bộ lọc đang bật.
    const filtered = await admin.list({ q: `ST1${suffix}` });
    expect(filtered.data).toHaveLength(1);
    expect(filtered.stats.total).toBeGreaterThan(1);
  });

  maybe('lượt sử dụng: tên khách ĐÃ CHE, và tổng tài trợ chỉ đếm lượt đã CHỐT', async () => {
    const code = `USE${RUN.slice(0, 3)}`.toUpperCase();
    const promoId = await seedPromo({ code, discountAmount: '100000' });
    const { receipt } = await submit({ promoCode: code });

    const reserved = await admin.getOne(promoId);
    // Lượt đang GIỮ chưa tiêu đồng nào — yêu cầu còn có thể bị từ chối.
    expect(reserved.sponsoredAmount).toBe('0');

    await requests.approve(tenantId, ownerId, receipt.id);
    const hold = await prisma.bookingHold.findUniqueOrThrow({
      where: { bookingRequestId: receipt.id },
    });
    await prisma.$transaction((tx) =>
      holds.applyBankPaymentWithinTx(tx, {
        code: hold.code,
        amount: hold.amount,
        providerTxId: `promo-use-${hold.code}`,
      }),
    );

    const after = await admin.getOne(promoId);
    expect(after.sponsoredAmount).toBe('100000');

    const page = await admin.listRedemptions(promoId, {});
    expect(page.meta.total).toBe(1);
    expect(page.data[0]?.status).toBe(PROMO_REDEMPTION_STATUS.REDEEMED);
    expect(page.data[0]?.customerNameMasked).toBe('Khách m.');
    expect(page.data[0]?.bookingCode).toBeTruthy();
  });

  maybe('service quản trị KHÔNG có tham số `tenantId` ở bất cứ hàm nào', () => {
    /*
     * "Gian hàng không tạo được mã nền tảng" được thi hành ở BA lớp: `@PlatformOnly()` ở
     * controller, permission `platform.promo_codes.manage`, và — ở đây — tầng KIỂU: không có
     * đường nào truyền một tenant vào service này.
     *
     * Kiểm bằng arity thay vì bằng một lời gọi: nếu ai đó thêm một tham số tenant, số này đổi.
     */
    expect(admin.list.length).toBe(1);
    expect(admin.create.length).toBe(2);
    expect(admin.update.length).toBe(3);
    expect(admin.toggle.length).toBe(3);
    expect(admin.remove.length).toBe(2);
    return Promise.resolve();
  });
});

/** Guard nghiệp vụ cũ vẫn phải giữ nguyên khi có mã — mã không mở cửa nào. */
describe('Mã khuyến mãi không nới một luật nào khác', () => {
  maybe('gian hàng đặt xe của CHÍNH MÌNH vẫn bị chặn dù có mã', async () => {
    const code = `OWN${RUN.slice(0, 3)}`.toUpperCase();
    await seedPromo({ code });
    currentCustomer = ownerId;
    await expect(submit({ promoCode: code, customerUserId: ownerId })).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.CANNOT_BOOK_OWN_VEHICLE },
    });
  });
});
