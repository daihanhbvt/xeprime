import { ForbiddenException } from '@nestjs/common';
import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  BILLING_MODE,
  BOOKING_REQUEST_STATUS,
  DEPOSIT_COLLECTION_MODE,
  DEPOSIT_POLICY_REASON,
  FEATURE_STATE,
  MEMBERSHIP_STATUS,
  PLAN_FEATURE,
  PLAN_FEATURE_VALUES,
  PLAN_STATUS,
  SERVICE_TYPE,
  SUBSCRIPTION_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  type FeatureState,
  type PlanFeature,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import type { AuthService } from '../src/modules/auth/auth.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import type { PhoneVerificationService } from '../src/modules/phone-verification/phone-verification.service';
import { VehicleSettingsService } from '../src/modules/vehicle-settings/vehicle-settings.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeBookingRequestsService,
  makeDepositPolicyService,
  makeNotificationService,
} from './helpers/service-factory';

/**
 * CÔNG TẮC THU CỌC CỦA GIAN HÀNG — Phase 6, trên PostgreSQL THẬT.
 *
 * Luật được khoá ở đây, theo đúng thứ tự một đồng tiền đi qua chúng:
 *
 *  1. **Hai trục, kiểm NỐI TIẾP** (ADR 0027 điều 2): tuyến thu phí trả lời trước, rồi mới tới
 *     năng lực gói, rồi mới tới công tắc của gian hàng.
 *  2. **Tuyến hoa hồng không có công tắc** (ADR 0032 điều 2) — `PATCH` trả 403 chứ không im
 *     lặng bỏ qua, vì một API nhận giá trị rồi không áp dụng là thứ tệ hơn cả từ chối.
 *  3. **Gói thiếu `escrow_hold` bị chặn Ở SERVER**, không dựa vào `PlanFeatureGuard` (guard đó
 *     mặc định chạy `warn` nên chưa chặn ai).
 *  4. **Cả hai đường duyệt** — gian hàng bấm duyệt và hệ thống tự nhận — áp cùng một chính sách.
 *     Đây là chỗ dễ trượt nhất: cả hai tính phí TRƯỚC `commitDecision`, nên nối chính sách vào
 *     một đường mà quên đường kia sẽ cho ra hai hành vi khác nhau trên cùng một gian hàng.
 *  5. **`deposit_collection_mode` ĐÓNG BĂNG lúc tạo đơn** (ADR 0025 ràng buộc 4): bật công tắc
 *     sau đó không viết lại đơn đã chạy.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const occupancy = new OccupancyService(asService);
const settings = new VehicleSettingsService(asService, audit, occupancy);
const depositPolicy = makeDepositPolicyService(asService);

const phoneVerification = {
  assertPhoneVerifiedForBooking: async () => {},
} as unknown as PhoneVerificationService;
const auth = {
  resolveOrCreateUserByPhone: async () => ({ userId: null }),
} as unknown as AuthService;

const requests = makeBookingRequestsService(asService, {
  phoneVerification,
  auth,
  audit,
  notifications,
  occupancy,
  settings,
});

/*
 * Tự động nhận chuyến KHÔNG nằm sau cờ gói nào — nó thuộc bộ cơ bản (ADR 0027 điều 1). Truyền
 * bản đồ toàn `hidden` để chứng minh điều đó: nếu một ngày ai đó gác nó sau một cờ, spec này đỏ.
 */
const HIDDEN_FEATURES = Object.fromEntries(
  PLAN_FEATURE_VALUES.map((f) => [f, FEATURE_STATE.HIDDEN]),
) as Record<PlanFeature, FeatureState>;

const RUN = newId().slice(-8).toLowerCase();
const DAY = 24 * 3600_000;

let dbAvailable = false;
let phoneCounter = 0;
const nextPhone = () => `0977${String(100000 + ++phoneCounter).slice(-6)}`;

interface Shop {
  owner: string;
  tenant: string;
  vehicle: string;
  plan: string;
}

/** Gian hàng tuyến HOA HỒNG — cọc bắt buộc, không công tắc nào tắt được. */
let commission: Shop;
/** Tuyến GÓI có cờ `escrow_hold` — gian hàng được quyền bật/tắt. */
let packagePlus: Shop;
/** Tuyến GÓI KHÔNG có cờ — công tắc không bật được, và bật lén cũng không có hiệu lực. */
let packageBasic: Shop;

/** `offsetDays` ngày nữa lúc `hourVn` giờ VN — nằm trong khung giờ giao nhận mặc định 06–22. */
function vnAt(offsetDays: number, hourVn: number): Date {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + offsetDays);
  base.setUTCHours(hourVn - 7, 0, 0, 0);
  return base;
}

async function seedShop(
  label: string,
  billingMode: string,
  planFeatures: readonly string[],
): Promise<Shop> {
  const owner = newId();
  const tenant = newId();
  const vehicle = newId();
  const plan = newId();

  await prisma.user.create({
    data: { id: owner, displayName: `Chủ ${label}`, email: `dep-${label}-${RUN}@xeprime.test` },
  });
  await prisma.tenant.create({
    data: {
      id: tenant,
      code: `T-${tenant.slice(-8)}`,
      slug: `t-${tenant.toLowerCase().slice(-10)}`,
      name: `DepShop-${label}-${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: owner,
    },
  });
  await prisma.tenantMembership.create({
    data: {
      id: newId(),
      tenantId: tenant,
      userId: owner,
      roleKey: TENANT_ROLE.SHOP_OWNER,
      status: MEMBERSHIP_STATUS.ACTIVE,
      joinedAt: new Date(),
    },
  });
  await prisma.vehicle.create({
    data: {
      id: vehicle,
      tenantId: tenant,
      code: `XE${vehicle.slice(-5)}`,
      name: `Xe ${label}`,
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      serviceTypes: [SERVICE_TYPE.SELF_DRIVE],
      weekdayPrice: new Prisma.Decimal('700000'),
      weekendPrice: new Prisma.Decimal('700000'),
      createdBy: owner,
    },
  });
  await prisma.plan.create({
    data: {
      id: plan,
      code: `dep-${label}-${RUN}`,
      name: `Gói ${label}`,
      status: PLAN_STATUS.ACTIVE,
      billingMode,
      commissionPercent:
        billingMode === BILLING_MODE.COMMISSION ? new Prisma.Decimal(10) : null,
      basePriceMonthly: new Prisma.Decimal(0),
      price: 0,
      durationDays: 30,
      limitsJson: { features: [...planFeatures] } as unknown as Prisma.InputJsonValue,
    },
  });
  await prisma.tenantSubscription.create({
    data: {
      id: newId(),
      tenantId: tenant,
      planId: plan,
      status: SUBSCRIPTION_STATUS.ACTIVE,
      price: 0,
      termMonths: 12,
      billingMode,
      startsAt: new Date(Date.now() - 60_000),
      endsAt: new Date(Date.now() + 365 * DAY),
    },
  });
  return { owner, tenant, vehicle, plan };
}

/** Đặt thẳng giá trị công tắc — bỏ qua guard, để dựng được cả những ca guard không cho phép. */
async function setToggle(tenantId: string, enabled: boolean) {
  await prisma.tenantPaymentSettings.upsert({
    where: { tenantId },
    create: { tenantId, depositCollectionEnabled: enabled },
    update: { depositCollectionEnabled: enabled },
  });
}

async function submit(shop: Shop, offsetDays = 5) {
  return requests.submitPublic(
    {
      vehicleId: shop.vehicle,
      customerName: 'Nguyễn Văn A',
      customerPhone: nextPhone(),
      pickupAt: vnAt(offsetDays, 9).toISOString(),
      returnAt: vnAt(offsetDays + 2, 9).toISOString(),
    },
    null,
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
  commission = await seedShop('comm', BILLING_MODE.COMMISSION, []);
  packagePlus = await seedShop('plus', BILLING_MODE.PACKAGE, [PLAN_FEATURE.ESCROW_HOLD]);
  packageBasic = await seedShop('basic', BILLING_MODE.PACKAGE, []);
});

afterEach(async () => {
  if (!dbAvailable) return;
  for (const shop of [commission, packagePlus, packageBasic]) {
    await prisma.bookingHold.deleteMany({ where: { tenantId: shop.tenant } });
    await prisma.vehicleOccupancy.deleteMany({ where: { tenantId: shop.tenant } });
    await prisma.booking.deleteMany({ where: { tenantId: shop.tenant } });
    await prisma.bookingRequest.deleteMany({ where: { tenantId: shop.tenant } });
    await prisma.notification.deleteMany({ where: { tenantId: shop.tenant } });
    await prisma.auditLog.deleteMany({ where: { tenantId: shop.tenant } });
    await prisma.tenantPaymentSettings.deleteMany({ where: { tenantId: shop.tenant } });
    /*
     * Tự động nhận chuyến cũng phải về mặc định giữa các ca. Để sót nó lại làm những ca SAU
     * chạy trên một đường duyệt khác với đường chúng khai — và một spec tự nhận nhầm là một
     * spec không kiểm thứ nó nói đang kiểm.
     */
    await prisma.vehicleServiceSetting.deleteMany({ where: { tenantId: shop.tenant } });
  }
});

afterAll(async () => {
  if (dbAvailable) {
    for (const shop of [commission, packagePlus, packageBasic]) {
      await prisma.tenantCustomer.deleteMany({ where: { tenantId: shop.tenant } });
      await prisma.tenantSubscription.deleteMany({ where: { tenantId: shop.tenant } });
      await prisma.plan.deleteMany({ where: { id: shop.plan } });
      await prisma.vehicleServiceSetting.deleteMany({ where: { tenantId: shop.tenant } });
      await prisma.vehicle.deleteMany({ where: { tenantId: shop.tenant } });
      await prisma.tenantMembership.deleteMany({ where: { tenantId: shop.tenant } });
      await prisma.tenant.deleteMany({ where: { id: shop.tenant } });
      await prisma.user.deleteMany({ where: { id: shop.owner } });
    }
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('DepositPolicyService.resolveForTenant — hai trục, kiểm nối tiếp', () => {
  maybe('tuyến hoa hồng: BẮT BUỘC, khoá, và công tắc không có tiếng nói nào', async () => {
    // Bật công tắc thành `false` để chứng minh nó bị BỎ QUA, không phải "tình cờ cùng kết quả".
    await setToggle(commission.tenant, false);
    const r = await depositPolicy.resolveForTenant(commission.tenant);

    expect(r.billingMode).toBe(BILLING_MODE.COMMISSION);
    expect(r.required).toBe(true);
    expect(r.editable).toBe(false);
    expect(r.reason).toBe(DEPOSIT_POLICY_REASON.COMMISSION_MANDATORY);
  });

  maybe('tuyến gói có cờ, chưa ai bấm: TẮT — vắng dòng là câu trả lời đủ', async () => {
    const r = await depositPolicy.resolveForTenant(packagePlus.tenant);

    expect(r.required).toBe(false);
    expect(r.planAllows).toBe(true);
    expect(r.editable).toBe(true);
    expect(r.reason).toBe(DEPOSIT_POLICY_REASON.PACKAGE_DISABLED);
  });

  maybe('tuyến gói có cờ, đã bật: THU', async () => {
    await setToggle(packagePlus.tenant, true);
    const r = await depositPolicy.resolveForTenant(packagePlus.tenant);

    expect(r.required).toBe(true);
    expect(r.reason).toBe(DEPOSIT_POLICY_REASON.PACKAGE_ENABLED);
  });

  maybe('gói MẤT cờ trong khi công tắc đang bật: ngừng thu, nhưng KHÔNG xoá lựa chọn', async () => {
    /*
     * Ca này là lý do `planAllows` tồn tại tách khỏi `toggleEnabled`. Gian hàng hạ bậc hoặc hết
     * hạn gói mà vẫn thu tiền khách là một khoản giữ hộ không ai chịu trách nhiệm; còn xoá luôn
     * lựa chọn của họ thì gia hạn xong phải bấm lại, trái ADR 0027 điều 5.
     */
    await setToggle(packageBasic.tenant, true);
    const r = await depositPolicy.resolveForTenant(packageBasic.tenant);

    expect(r.required).toBe(false);
    expect(r.planAllows).toBe(false);
    expect(r.toggleEnabled).toBe(true);
    expect(r.editable).toBe(false);
    expect(r.reason).toBe(DEPOSIT_POLICY_REASON.PACKAGE_FEATURE_MISSING);
  });
});

describe('PATCH /shop/payment-settings — chặn thật ở service, không nhờ guard', () => {
  maybe('tuyến hoa hồng gọi thẳng vào: 403 DEPOSIT_ALWAYS_REQUIRED', async () => {
    await expect(
      depositPolicy.updateSettings(commission.tenant, commission.owner, false),
    ).rejects.toMatchObject({
      constructor: ForbiddenException,
      response: { code: API_ERROR_CODE.DEPOSIT_ALWAYS_REQUIRED },
    });
    // Và không ghi dòng nào — một request bị từ chối không được để lại cấu hình.
    expect(
      await prisma.tenantPaymentSettings.count({ where: { tenantId: commission.tenant } }),
    ).toBe(0);
  });

  maybe('tuyến gói thiếu escrow_hold: 403 FEATURE_NOT_IN_PLAN', async () => {
    await expect(
      depositPolicy.updateSettings(packageBasic.tenant, packageBasic.owner, true),
    ).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.FEATURE_NOT_IN_PLAN,
        details: { feature: PLAN_FEATURE.ESCROW_HOLD },
      },
    });
    expect(
      await prisma.tenantPaymentSettings.count({ where: { tenantId: packageBasic.tenant } }),
    ).toBe(0);
  });

  maybe('tuyến gói có cờ: lưu được, và để lại dấu vết ai bấm', async () => {
    const r = await depositPolicy.updateSettings(packagePlus.tenant, packagePlus.owner, true);
    expect(r.required).toBe(true);

    const row = await prisma.tenantPaymentSettings.findUniqueOrThrow({
      where: { tenantId: packagePlus.tenant },
    });
    expect(row.depositCollectionEnabled).toBe(true);
    expect(row.updatedBy).toBe(packagePlus.owner);

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId: packagePlus.tenant, action: 'tenant_payment_settings.update' },
    });
    expect(log.beforeJson).toMatchObject({ depositCollectionEnabled: false });
    expect(log.afterJson).toMatchObject({ depositCollectionEnabled: true });
  });
});

describe('Duyệt TAY áp đúng chính sách', () => {
  maybe('gói + TẮT cọc → đơn ra đời ngay, không hold, mode = direct', async () => {
    const { receipt } = await submit(packagePlus);
    const approved = await requests.approve(packagePlus.tenant, packagePlus.owner, receipt.id);

    expect(approved.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
    expect(await prisma.bookingHold.count({ where: { tenantId: packagePlus.tenant } })).toBe(0);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: approved.bookingId! } });
    expect(booking.depositCollectionMode).toBe(DEPOSIT_COLLECTION_MODE.DIRECT);
  });

  maybe('gói + BẬT cọc → awaiting_hold, hold sinh ra, CHƯA có đơn', async () => {
    await setToggle(packagePlus.tenant, true);
    const { receipt } = await submit(packagePlus, 8);
    const approved = await requests.approve(packagePlus.tenant, packagePlus.owner, receipt.id);

    expect(approved.status).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
    expect(approved.bookingId).toBeNull();

    const hold = await prisma.bookingHold.findFirstOrThrow({
      where: { tenantId: packagePlus.tenant },
    });
    /*
     * Tuyến GÓI: phí dịch vụ 0, nhưng bảo hiểm xe `IV` vẫn áp (chính sách v4 bật nó cho CẢ HAI
     * tuyến — nó là điều kiện của chuyến, không phải phí của tuyến). `IP` không có vì khách
     * không giữ lựa chọn: nó TUỲ CHỌN, mặc định không thu (ADR 0032 điều 4).
     *
     *   D = 20% × 1.400.000 = 280.000 · S = 0 · IV = 2% × 1.400.000 = 28.000  ⇒  308.000
     */
    expect(hold.depositAmount.toFixed(0)).toBe('280000');
    expect(hold.serviceFeeAmount.toFixed(0)).toBe('0');
    expect(hold.vehicleInsuranceAmount.toFixed(0)).toBe('28000');
    expect(hold.personalInsuranceAmount.toFixed(0)).toBe('0');
    expect(hold.amount.toFixed(0)).toBe('308000');
  });

  maybe('hoa hồng → luôn có hold, kể cả khi công tắc bị đặt tắt', async () => {
    await setToggle(commission.tenant, false);
    const { receipt } = await submit(commission, 11);
    const approved = await requests.approve(commission.tenant, commission.owner, receipt.id);

    expect(approved.status).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
    const hold = await prisma.bookingHold.findFirstOrThrow({
      where: { tenantId: commission.tenant },
    });
    // `D + S + IV` = (20% + 10% + 2%) × 1.400.000 = 280.000 + 140.000 + 28.000.
    expect(hold.depositAmount.toFixed(0)).toBe('280000');
    expect(hold.serviceFeeAmount.toFixed(0)).toBe('140000');
    expect(hold.vehicleInsuranceAmount.toFixed(0)).toBe('28000');
    expect(hold.amount.toFixed(0)).toBe('448000');
  });

  maybe('gói THIẾU cờ → không thu, mode = direct (gian hàng tự thoả thuận)', async () => {
    await setToggle(packageBasic.tenant, true); // bật lén: không có hiệu lực
    const { receipt } = await submit(packageBasic, 14);
    const approved = await requests.approve(packageBasic.tenant, packageBasic.owner, receipt.id);

    expect(approved.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
    expect(await prisma.bookingHold.count({ where: { tenantId: packageBasic.tenant } })).toBe(0);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: approved.bookingId! } });
    expect(booking.depositCollectionMode).toBe(DEPOSIT_COLLECTION_MODE.DIRECT);
  });
});

describe('TỰ NHẬN đơn áp CÙNG chính sách với duyệt tay', () => {
  maybe('gói + BẬT cọc → tự nhận cũng dừng ở awaiting_hold', async () => {
    await settings.patchServiceSetting(
      packagePlus.tenant,
      packagePlus.vehicle,
      SERVICE_TYPE.SELF_DRIVE,
      packagePlus.owner,
      { autoAcceptEnabled: true, autoAcceptMinLeadMinutes: 60, autoAcceptMaxLeadMinutes: 129600 },
      HIDDEN_FEATURES,
    );
    await setToggle(packagePlus.tenant, true);

    const { receipt } = await submit(packagePlus, 17);
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });

    expect(row.status).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
    expect(await prisma.bookingHold.count({ where: { tenantId: packagePlus.tenant } })).toBe(1);
  });

  maybe('gói + TẮT cọc → tự nhận tạo đơn ngay, mode = direct', async () => {
    await settings.patchServiceSetting(
      packagePlus.tenant,
      packagePlus.vehicle,
      SERVICE_TYPE.SELF_DRIVE,
      packagePlus.owner,
      { autoAcceptEnabled: true, autoAcceptMinLeadMinutes: 60, autoAcceptMaxLeadMinutes: 129600 },
      HIDDEN_FEATURES,
    );

    const { receipt } = await submit(packagePlus, 20);
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });

    expect(row.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: row.bookingId! } });
    expect(booking.depositCollectionMode).toBe(DEPOSIT_COLLECTION_MODE.DIRECT);
  });
});

describe('Đóng băng — ADR 0025 ràng buộc 4', () => {
  maybe('bật công tắc SAU khi đơn đã tạo không viết lại đơn đó', async () => {
    const { receipt } = await submit(packagePlus, 23);
    const approved = await requests.approve(packagePlus.tenant, packagePlus.owner, receipt.id);
    const bookingId = approved.bookingId!;

    await depositPolicy.updateSettings(packagePlus.tenant, packagePlus.owner, true);
    expect((await depositPolicy.resolveForTenant(packagePlus.tenant)).required).toBe(true);

    const after = await prisma.booking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(after.depositCollectionMode).toBe(DEPOSIT_COLLECTION_MODE.DIRECT);
  });
});
