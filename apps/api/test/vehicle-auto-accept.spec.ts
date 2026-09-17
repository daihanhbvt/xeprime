import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import { giveTenantPlan } from './helpers/billing-fixture';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  AUTO_ACCEPT_BLOCKER,
  BILLING_MODE,
  BOOKING_REQUEST_DECISION_SOURCE,
  BOOKING_HOLD_OUTCOME,
  BOOKING_HOLD_STATUS,
  BOOKING_REQUEST_STATUS,
  DEPOSIT_COLLECTION_MODE,
  HOLD_REFUND_REASON,
  OCCUPANCY_SOURCE_TYPE,
  BOOKING_STATUS,
  FEATURE_STATE,
  FEE_POLICY_STATUS,
  MEMBERSHIP_STATUS,
  NOTIFICATION_TYPE,
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
  makeBookingHoldsService,
  makeBookingRequestsService,
  makeNotificationService,
} from './helpers/service-factory';

/**
 * TỰ ĐỘNG NHẬN CHUYẾN — đường đi thật của một yêu cầu công khai, trên PostgreSQL THẬT.
 *
 * Luật được khoá ở đây:
 *
 *  1. Đủ điều kiện → hệ thống nhận NGAY: đơn ra đời, yêu cầu `converted_to_booking`,
 *     `decision_source = system`, người tạo là NULL (không ai bấm), audit `actorScope: system`.
 *  2. KHÔNG đủ điều kiện → yêu cầu ở lại `pending_host_approval` cho chủ xe. Hệ thống **không
 *     bao giờ tự từ chối khách**, và để lại dấu vết vì sao đã bỏ qua.
 *  3. Tuyến hoa hồng (có phí giữ chỗ) → `awaiting_hold`, CHƯA có đơn: tiền về mới sinh đơn.
 *  4. Hai yêu cầu trùng giờ gửi cùng lúc → đúng MỘT đơn; bên thua ở lại hàng chờ, không có
 *     kết cục lai (ADR 0006 — constraint DB là trọng tài).
 *  5. Khung giờ giao nhận và điều khoản bắt buộc được kiểm Ở SERVER ngay lúc gửi.
 *  6. Có tài xế chỉ tự nhận khi gán được tài xế hợp lệ trong cùng transaction tạo đơn.
 *  7. Duyệt TAY vẫn nguyên vẹn: `decision_source = host`, người ký là chủ xe.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const audit = new AuditService(asService);
const notifications = makeNotificationService(asService);
const occupancy = new OccupancyService(asService);
const settings = new VehicleSettingsService(asService, audit, occupancy);

const phoneVerification = {
  assertPhoneVerifiedForBooking: async () => {},
} as unknown as PhoneVerificationService;
const auth = {
  resolveOrCreateUserByPhone: async () => ({ userId: null }),
} as unknown as AuthService;

const holds = makeBookingHoldsService(asService);
const requests = makeBookingRequestsService(asService, {
  phoneVerification,
  auth,
  audit,
  notifications,
  occupancy,
  settings,
});

const RUN = newId().slice(-8).toLowerCase();
const DAY = 24 * 3600_000;

function features(overrides: Partial<Record<PlanFeature, FeatureState>> = {}) {
  const all = Object.fromEntries(
    PLAN_FEATURE_VALUES.map((f) => [f, FEATURE_STATE.HIDDEN]),
  ) as Record<PlanFeature, FeatureState>;
  return { ...all, ...overrides };
}
const withDrivers = features({ [PLAN_FEATURE.DRIVERS]: FEATURE_STATE.ENABLED });

let dbAvailable = false;
let ownerId: string;
let tenantId: string;
let vehicleId: string;
/** Gian hàng thứ hai — tuyến HOA HỒNG, nơi duyệt sinh khoản giữ chỗ thay vì đơn. */
let holdOwnerId: string;
let holdTenantId: string;
let holdVehicleId: string;
let planId: string;
let feePolicyActive: { id: string } | null = null;
let phoneCounter = 0;

const nextPhone = () => `0988${String(100000 + ++phoneCounter).slice(-6)}`;

/** `offsetDays` ngày nữa lúc `hourVn` giờ Việt Nam — mọi mốc nằm trong khung giờ mặc định 06–22. */
function vnAt(offsetDays: number, hourVn: number): Date {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + offsetDays);
  base.setUTCHours(hourVn - 7, 0, 0, 0);
  return base;
}

async function seedShop(label: string, commission: boolean) {
  const owner = newId();
  const tenant = newId();
  const vehicle = newId();
  await prisma.user.create({
    data: { id: owner, displayName: `Chủ ${label}`, email: `auto-${label}-${RUN}@xeprime.test` },
  });
  await prisma.tenant.create({
    data: {
      id: tenant,
      code: `T-${tenant.slice(-8)}`,
      slug: `t-${tenant.toLowerCase().slice(-10)}`,
      name: `AutoShop-${label}-${RUN}`,
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
      serviceTypes: [SERVICE_TYPE.SELF_DRIVE, SERVICE_TYPE.WITH_DRIVER],
      weekdayPrice: new Prisma.Decimal('700000'),
      weekendPrice: new Prisma.Decimal('700000'),
      withDriverDailyPrice: new Prisma.Decimal('1300000'),
      createdBy: owner,
    },
  });
  if (commission) {
    planId = newId();
    await prisma.plan.create({
      data: {
        id: planId,
        code: `auto-commission-${RUN}`,
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
        tenantId: tenant,
        planId,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        price: 0,
        termMonths: 12,
        billingMode: BILLING_MODE.COMMISSION,
        startsAt: new Date(Date.now() - 60_000),
        endsAt: new Date(Date.now() + 365 * DAY),
      },
    });
  } else {
    /*
     * KHÔNG để tenant nào không có gói (15/09/2026).
     *
     * `commission: false` ở đây nghĩa là "gian hàng tuyến GÓI", không phải "gian hàng không có
     * gói" — trạng thái thứ hai không tồn tại trên production (`registerShop` gán gói mặc định
     * trong cùng transaction, và migration backfill đã vá dữ liệu cũ). Từ khi đường duyệt yêu
     * cầu từ chối đoán tuyến (`TENANT_BILLING_NOT_CONFIGURED`), fixture phải nói đúng sự thật đó.
     */
    await giveTenantPlan(prisma, tenant, { billingMode: BILLING_MODE.PACKAGE });
  }
  return { owner, tenant, vehicle };
}

/** Bật tự động nhận cho một dịch vụ với khoảng đặt trước rộng — case mặc định của spec. */
async function enableAutoAccept(
  tenant: string,
  vehicle: string,
  owner: string,
  serviceType: string,
  featureMap = features(),
) {
  await settings.patchServiceSetting(
    tenant,
    vehicle,
    serviceType,
    owner,
    { autoAcceptEnabled: true },
    featureMap,
  );
}

/**
 * Khách trả ĐỦ khoản giữ chỗ của một yêu cầu — bước mà ADR 0039 chèn vào giữa "gửi" và "có đơn".
 *
 * Gọi thẳng `applyBankPaymentWithinTx` thay vì dựng webhook SePay: spec này kiểm luật TỰ NHẬN,
 * không kiểm đường đối soát ngân hàng (đã có `booking-hold-lifecycle.spec.ts` lo). Nhưng vẫn đi
 * qua đúng hàm mà webhook gọi, nên không có nhánh nào chỉ test mới chạy.
 */
async function payHold(requestId: string) {
  const hold = await prisma.bookingHold.findFirstOrThrow({
    where: { bookingRequestId: requestId },
    select: { id: true, code: true, amount: true },
  });
  return prisma.$transaction((tx) =>
    holds.applyBankPaymentWithinTx(tx, {
      code: hold.code,
      amount: hold.amount,
      providerTxId: `auto-accept-${hold.id}`,
    }),
  );
}

/** Gửi yêu cầu RỒI trả tiền — đường đầy đủ tới lúc hệ thống quyết định có nhận chuyến không. */
async function submitAndPay(
  overrides: Partial<Parameters<typeof requests.submitPublic>[0]> = {},
  vehicle = vehicleId,
) {
  const { receipt } = await submit(overrides, vehicle);
  const paid = await payHold(receipt.id);
  const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
  return { receipt, paid, row };
}

async function submit(
  overrides: Partial<Parameters<typeof requests.submitPublic>[0]> = {},
  vehicle = vehicleId,
) {
  return requests.submitPublic(
    {
      vehicleId: vehicle,
      customerName: 'Nguyễn Văn A',
      customerPhone: nextPhone(),
      pickupAt: vnAt(5, 9).toISOString(),
      returnAt: vnAt(7, 9).toISOString(),
      ...overrides,
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
  const main = await seedShop('main', false);
  ownerId = main.owner;
  tenantId = main.tenant;
  vehicleId = main.vehicle;

  const commission = await seedShop('hold', true);
  holdOwnerId = commission.owner;
  holdTenantId = commission.tenant;
  holdVehicleId = commission.vehicle;

  /*
   * Phí giữ chỗ đến từ bản chính sách phí ĐANG ACTIVE của cả sàn (migration
   * `20260907150000_r3_marketplace_money` cài bản pilot). Cột `status` có unique nên không thể
   * có bản active thứ hai; spec đọc bản đang có thay vì tráo trạng thái toàn cục.
   */
  feePolicyActive = await prisma.feePolicy.findFirst({
    where: { status: FEE_POLICY_STATUS.ACTIVE },
    select: { id: true },
  });
});

afterEach(async () => {
  if (!dbAvailable) return;
  const tenants = { in: [tenantId, holdTenantId] };
  await prisma.bookingHold.deleteMany({ where: { tenantId: tenants } });
  await prisma.vehicleOccupancy.deleteMany({ where: { tenantId: tenants } });
  await prisma.booking.deleteMany({ where: { tenantId: tenants } });
  await prisma.bookingRequest.deleteMany({ where: { tenantId: tenants } });
  await prisma.tenantCustomer.deleteMany({ where: { tenantId: tenants } });
  await prisma.driver.deleteMany({ where: { tenantId: tenants } });
  await prisma.notification.deleteMany({ where: { tenantId: tenants } });
  await prisma.auditLog.deleteMany({ where: { tenantId: tenants } });
  await prisma.vehicleServiceSetting.deleteMany({ where: { tenantId: tenants } });
  await prisma.vehicleHandoverWindow.deleteMany({ where: { tenantId: tenants } });
  await prisma.vehicleOperationSetting.deleteMany({ where: { tenantId: tenants } });
});

afterAll(async () => {
  if (dbAvailable) {
    const tenants = { in: [tenantId, holdTenantId] };
    await prisma.tenantSubscription.deleteMany({ where: { tenantId: tenants } });
    await prisma.plan.deleteMany({ where: { id: planId } });
    await prisma.vehicle.deleteMany({ where: { tenantId: tenants } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: tenants } });
    await prisma.tenant.deleteMany({ where: { id: tenants } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerId, holdOwnerId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

/*
 * ⚠️ VÒNG ĐỜI ĐÃ ĐỔI — ADR 0039.
 *
 * Trước đây "tự nhận" xảy ra ngay lúc khách bấm gửi. Nay khách trả giữ chỗ TRƯỚC (mọi gian hàng
 * đều thu cọc từ 16/09/2026), nên mốc hệ thống quyết định có nhận chuyến hay không là lúc TIỀN
 * VỀ. Mọi ca dưới đây vì thế đi qua `submitAndPay`, và "không tự nhận" nay nghĩa là yêu cầu
 * dừng ở `hold_paid` chờ chủ xe — KHÔNG phải `pending_host_approval`, vì chỗ đã bị chiếm và
 * tiền đã nằm ở XePrime.
 */
describe('Đủ điều kiện — hệ thống nhận ngay khi tiền về', () => {
  maybe('tự lái: gửi xong là CHỜ TIỀN và đã chiếm lịch, chưa có đơn', async () => {
    await enableAutoAccept(tenantId, vehicleId, ownerId, SERVICE_TYPE.SELF_DRIVE);
    const { receipt } = await submit();

    /*
     * Khác biệt lớn nhất của ADR 0039 nằm ở đúng ba dòng này: chỗ xe đã được giữ ngay lúc khách
     * bấm, nhưng đơn thuê thì chưa — và sẽ không có chừng nào tiền chưa về.
     */
    expect(receipt.status).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
    expect(receipt.bookingId).toBeNull();
    expect(await prisma.booking.count({ where: { tenantId } })).toBe(0);
    expect(
      await prisma.vehicleOccupancy.count({
        where: { tenantId, sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST },
      }),
    ).toBe(1);

    const hold = await prisma.bookingHold.findFirstOrThrow({
      where: { bookingRequestId: receipt.id },
    });
    expect(hold.status).toBe(BOOKING_HOLD_STATUS.PENDING);
    expect(hold.code.startsWith('XPH')).toBe(true);
    // Chưa ai quyết định gì — cột này là thứ phân biệt hai đường sinh hold (ADR 0039 điều 4).
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(row.decidedAt).toBeNull();
  });

  maybe('tiền về: đơn ra đời, nguồn quyết định là SYSTEM, không ai đứng tên người tạo', async () => {
    await enableAutoAccept(tenantId, vehicleId, ownerId, SERVICE_TYPE.SELF_DRIVE);
    const { paid, row } = await submitAndPay();

    expect(paid.outcome).toBe('activated');
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
    expect(row.decisionSource).toBe(BOOKING_REQUEST_DECISION_SOURCE.SYSTEM);
    expect(row.decidedBy).toBeNull();

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: row.bookingId! } });
    expect(booking.status).toBe(BOOKING_STATUS.RESERVED);
    expect(booking.createdBy).toBeNull();

    // Lịch CHUYỂN từ yêu cầu sang đơn — không nhân đôi, không hở.
    expect(await prisma.vehicleOccupancy.count({ where: { sourceId: booking.id } })).toBe(1);
    expect(
      await prisma.vehicleOccupancy.count({
        where: { tenantId, sourceType: OCCUPANCY_SOURCE_TYPE.BOOKING_REQUEST },
      }),
    ).toBe(0);

    // Audit ghi hệ thống là người ký, không mượn tên chủ xe.
    const log = await prisma.auditLog.findFirst({
      where: { tenantId, action: 'booking_request.accept_paid' },
    });
    expect(log?.actorScope).toBe(AUDIT_ACTOR_SCOPE.SYSTEM);
    expect(log?.actorUserId).toBeNull();
  });

  /**
   * Gian hàng KHÔNG bị gọi lúc khách mới bấm đặt (ADR 0039 hệ quả 1).
   *
   * Chỗ đó chưa chắc chắn và có thể biến mất sau 30 phút; một thông báo cho mỗi lượt bấm sẽ biến
   * hộp thư gian hàng thành nơi không ai đọc nữa. Họ được gọi khi tiền đã về — lúc đó mới có
   * việc để làm.
   */
  maybe('gian hàng im lặng cho tới khi tiền về, rồi nhận đúng MỘT thông báo', async () => {
    await enableAutoAccept(tenantId, vehicleId, ownerId, SERVICE_TYPE.SELF_DRIVE);
    const { receipt } = await submit();

    expect(
      await prisma.notification.count({
        where: { tenantId, type: NOTIFICATION_TYPE.BOOKING_REQUEST_SUBMITTED },
      }),
    ).toBe(0);

    await payHold(receipt.id);

    expect(
      await prisma.notification.count({
        where: { tenantId, type: NOTIFICATION_TYPE.BOOKING_AUTO_ACCEPTED },
      }),
    ).toBeGreaterThanOrEqual(1);
    expect(
      await prisma.notification.count({
        where: { tenantId, type: NOTIFICATION_TYPE.BOOKING_REQUEST_SUBMITTED },
      }),
    ).toBe(0);
  });

  maybe('thời gian chết của xe đi vào lịch của đơn tự nhận', async () => {
    await settings.saveOperation(tenantId, vehicleId, ownerId, {
      turnaroundBufferMinutes: 90,
      pickupWindows: [],
      returnWindows: [],
    });
    await enableAutoAccept(tenantId, vehicleId, ownerId, SERVICE_TYPE.SELF_DRIVE);
    const { row } = await submitAndPay();

    const occ = await prisma.vehicleOccupancy.findFirstOrThrow({
      where: { sourceId: row.bookingId! },
    });
    expect(occ.bufferMinutes).toBe(90);
  });
});

describe('Không đủ điều kiện — về hàng chờ, không tự từ chối khách', () => {
  /**
   * MỐC ĐẶT TRƯỚC ĐÃ BỊ BỎ (17/09/2026).
   *
   * Ca này trước đây khẳng định điều ngược lại: nhận sau 2 ngày < mức tối thiểu 7 ngày ⇒ bỏ qua
   * tự nhận với mã `lead_too_short`. Giữ nguyên tình huống và lật kỳ vọng, vì đây là thứ dễ bị
   * cài lại nhất — một mặc định "6 giờ tới 1 tuần" quay về là công tắc lại nói dối.
   */
  maybe('đặt sát giờ vẫn tự nhận — không còn khoảng đặt trước nào', async () => {
    await enableAutoAccept(tenantId, vehicleId, ownerId, SERVICE_TYPE.SELF_DRIVE);
    // Nhận ngay ngày mai: dưới mọi mức "đặt trước tối thiểu" từng tồn tại.
    const { row } = await submitAndPay({
      pickupAt: vnAt(1, 9).toISOString(),
      returnAt: vnAt(2, 9).toISOString(),
    });

    expect(row.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
    expect(row.bookingId).not.toBeNull();
    expect(
      await prisma.auditLog.count({
        where: { tenantId, action: 'booking_request.auto_accept_skipped' },
      }),
    ).toBe(0);
  });

  /** Đặt xa cũng vậy — mốc "tối đa" từng chặn mọi chuyến đặt trước hơn một tuần. */
  maybe('đặt trước cả tháng vẫn tự nhận', async () => {
    await enableAutoAccept(tenantId, vehicleId, ownerId, SERVICE_TYPE.SELF_DRIVE);
    const { row } = await submitAndPay({
      pickupAt: vnAt(40, 9).toISOString(),
      returnAt: vnAt(41, 9).toISOString(),
    });

    expect(row.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
    expect(row.bookingId).not.toBeNull();
  });

  maybe('chưa bật tự nhận: tiền về xong vẫn chờ chủ xe bấm duyệt', async () => {
    const { row } = await submitAndPay();
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.HOLD_PAID);
    expect(row.bookingId).toBeNull();
    /*
     * KHÔNG ghi dấu bỏ qua khi lý do là "chưa bật": phần lớn gian hàng không bật "Đặt ngay", và
     * một dòng audit cho mỗi lượt đặt của họ chỉ làm nhật ký dài ra mà không nói thêm gì.
     */
    expect(
      await prisma.auditLog.count({
        where: { tenantId, action: 'booking_request.auto_accept_skipped' },
      }),
    ).toBe(0);
  });

  maybe('thuê dài hạn không bao giờ tự nhận — lịch do gian hàng chốt (ADR 0011)', async () => {
    await prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        serviceTypes: [SERVICE_TYPE.SELF_DRIVE, SERVICE_TYPE.WITH_DRIVER, SERVICE_TYPE.LONG_TERM],
        monthlyPrice: new Prisma.Decimal('12000000'),
      },
    });
    await enableAutoAccept(tenantId, vehicleId, ownerId, SERVICE_TYPE.SELF_DRIVE);
    try {
      const { receipt } = await requests.submitPublic(
        {
          vehicleId,
          customerName: 'Khách dài hạn',
          customerPhone: nextPhone(),
          serviceType: SERVICE_TYPE.LONG_TERM,
          longTermPackageMonths: 3,
          pickupPreference: 'within_7_days',
        },
        null,
      );
      /*
       * Dài hạn là NGOẠI LỆ của ADR 0039 điều 4: khách mới nêu nguyện vọng ngày nhận, gian hàng
       * chốt lịch lúc duyệt (ADR 0011). Chưa có lịch thì chưa có giá, chưa có giá thì không có
       * số tiền nào để in lên QR — nên nó giữ nguyên thứ tự duyệt-trước-cọc-sau.
       */
      expect(receipt.autoAccepted).toBe(false);
      expect(receipt.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
      expect(await prisma.bookingHold.count({ where: { bookingRequestId: receipt.id } })).toBe(0);
    } finally {
      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: {
          serviceTypes: [SERVICE_TYPE.SELF_DRIVE, SERVICE_TYPE.WITH_DRIVER],
          monthlyPrice: null,
        },
      });
    }
  });
});

describe('Khung giờ và điều khoản — chặn ngay lúc gửi, ở SERVER', () => {
  maybe('giờ nhận ngoài khung giao xe bị từ chối bằng mã lỗi riêng', async () => {
    await settings.saveOperation(tenantId, vehicleId, ownerId, {
      turnaroundBufferMinutes: 0,
      pickupWindows: [{ start: '08:00', end: '18:00' }],
      returnWindows: [{ start: '08:00', end: '18:00' }],
    });
    await expect(
      submit({ pickupAt: vnAt(5, 5).toISOString(), returnAt: vnAt(7, 10).toISOString() }),
    ).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.HANDOVER_WINDOW_VIOLATION },
    });
    expect(await prisma.bookingRequest.count({ where: { tenantId } })).toBe(0);
  });

  maybe(
    'chủ xe bắt đồng ý điều khoản: thiếu tích thì không nhận, có tích thì đóng băng mốc',
    async () => {
      await settings.patchServiceSetting(
        tenantId,
        vehicleId,
        SERVICE_TYPE.SELF_DRIVE,
        ownerId,
        { requireTermsAcceptance: true, termsText: 'Không hút thuốc trong xe.' },
        features(),
      );

      await expect(submit()).rejects.toMatchObject({
        response: { code: API_ERROR_CODE.RENTAL_TERMS_ACCEPTANCE_REQUIRED },
      });

      const { receipt } = await submit({ acceptedTerms: true });
      const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
      const terms = row.rentalTerms as { termsText?: string; termsAcceptedAt?: string } | null;
      expect(terms?.termsText).toBe('Không hút thuốc trong xe.');
      expect(terms?.termsAcceptedAt).toBeTruthy();
    },
  );

  maybe('thời lượng dưới mức tối thiểu của chuyến có tài xế bị từ chối', async () => {
    await prisma.driver.create({
      data: { id: newId(), tenantId, name: 'Tài xế 1', phone: '0900000001', status: 'active' },
    });
    await settings.patchServiceSetting(
      tenantId,
      vehicleId,
      SERVICE_TYPE.WITH_DRIVER,
      ownerId,
      { minRentalMinutes: 720 },
      withDrivers,
    );
    await expect(
      submit({
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        routeType: 'in_city',
        pickupAddress: '12 Lê Lợi, Q.1',
        pickupAt: vnAt(5, 9).toISOString(),
        returnAt: vnAt(5, 12).toISOString(),
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.MIN_RENTAL_DURATION } });
  });
});

describe('Có tài xế — chỉ nhận khi gán được tài xế', () => {
  maybe('không có tài xế rảnh: về hàng chờ với lý do NO_DRIVER', async () => {
    await prisma.driver.create({
      data: { id: newId(), tenantId, name: 'Tài xế 1', phone: '0900000002', status: 'active' },
    });
    await enableAutoAccept(tenantId, vehicleId, ownerId, SERVICE_TYPE.WITH_DRIVER, withDrivers);
    // Tài xế duy nhất bị vô hiệu hoá SAU khi bật — cấu hình còn bật, năng lực thì không.
    await prisma.driver.updateMany({ where: { tenantId }, data: { status: 'inactive' } });

    const { row } = await submitAndPay({
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      routeType: 'in_city',
      pickupAddress: '12 Lê Lợi, Q.1',
    });
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.HOLD_PAID);
    const skip = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId, action: 'booking_request.auto_accept_skipped' },
    });
    expect((skip.afterJson as { blocker?: string } | null)?.blocker).toBe(
      AUTO_ACCEPT_BLOCKER.NO_DRIVER,
    );
  });

  /**
   * ADR 0032 từng CHẶN hẳn ca này (`HOLD_REQUIRED_WITH_DRIVER`): khi đơn chỉ ra đời hàng giờ sau
   * lúc duyệt, không thể hứa một tài xế rồi mới tạo đơn. Lập luận đó mất hiệu lực ở ADR 0039 —
   * tiền đã về và đơn được tạo NGAY trong cùng transaction, nên gán tài xế ở đây an toàn đúng
   * bằng lúc gian hàng bấm duyệt tay.
   */
  maybe('có tài xế hợp lệ: đơn tự nhận mang luôn tài xế được gán', async () => {
    const driverId = newId();
    await prisma.driver.create({
      data: { id: driverId, tenantId, name: 'Tài xế rảnh', phone: '0900000003', status: 'active' },
    });
    await enableAutoAccept(tenantId, vehicleId, ownerId, SERVICE_TYPE.WITH_DRIVER, withDrivers);

    const { row } = await submitAndPay({
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      routeType: 'in_city',
      pickupAddress: '12 Lê Lợi, Q.1',
    });
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: row.bookingId! } });
    expect(booking.driverId).toBe(driverId);
  });

  maybe('GPLX hết hạn trước lúc trả xe: không gán, không tự nhận', async () => {
    await prisma.driver.create({
      data: {
        id: newId(),
        tenantId,
        name: 'Tài xế hết hạn',
        phone: '0900000004',
        status: 'active',
        licenseExpiresAt: vnAt(6, 12),
      },
    });
    await enableAutoAccept(tenantId, vehicleId, ownerId, SERVICE_TYPE.WITH_DRIVER, withDrivers);

    // Chuyến trả vào ngày thứ 7 — sau hạn GPLX ngày thứ 6.
    const { row } = await submitAndPay({
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      routeType: 'in_city',
      pickupAddress: '12 Lê Lợi, Q.1',
    });
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.HOLD_PAID);
    expect(await prisma.booking.count({ where: { tenantId } })).toBe(0);
  });
});

describe('Đua nhau — constraint DB là trọng tài', () => {
  /**
   * Cuộc đua CHUYỂN CHỖ ở ADR 0039: trước đây hai người đua nhau ở bước tạo ĐƠN, nay họ đua ở
   * bước GIỮ CHỖ — sớm hơn hẳn, và đó chính là điều khiến luồng mới tốt hơn. Người thua biết
   * ngay lúc bấm rằng chỗ không còn, thay vì sau hàng giờ chờ chủ xe duyệt.
   */
  maybe('hai yêu cầu trùng giờ gửi CÙNG LÚC: đúng một chỗ được giữ', async () => {
    await enableAutoAccept(tenantId, vehicleId, ownerId, SERVICE_TYPE.SELF_DRIVE);
    const window = { pickupAt: vnAt(8, 9).toISOString(), returnAt: vnAt(10, 9).toISOString() };

    const results = await Promise.all([submit(window), submit(window)]);
    const held = results.filter(
      (r) => r.receipt.status === BOOKING_REQUEST_STATUS.AWAITING_HOLD,
    );
    expect(held).toHaveLength(1);

    // Đúng MỘT khoản giữ chỗ và đúng MỘT ô lịch — constraint DB là trọng tài (ADR 0006).
    expect(await prisma.bookingHold.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.vehicleOccupancy.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.booking.count({ where: { tenantId } })).toBe(0);

    // Bên thua KHÔNG bị từ chối — yêu cầu của họ về hàng chờ để chủ xe tự quyết.
    const loser = results.find(
      (r) => r.receipt.status !== BOOKING_REQUEST_STATUS.AWAITING_HOLD,
    )!;
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: loser.receipt.id } });
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    expect(row.decisionSource).toBeNull();
  });

  maybe('lịch đã bị chiếm trước đó: yêu cầu mới không giữ chỗ đè lên', async () => {
    await enableAutoAccept(tenantId, vehicleId, ownerId, SERVICE_TYPE.SELF_DRIVE);
    const window = { pickupAt: vnAt(8, 9).toISOString(), returnAt: vnAt(10, 9).toISOString() };
    const first = await submitAndPay(window);
    expect(first.row.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);

    const second = await submit(window);
    expect(second.receipt.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    expect(await prisma.bookingHold.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.booking.count({ where: { tenantId } })).toBe(1);
  });
});

/*
 * TUYẾN HOA HỒNG nay đi CÙNG một đường với tuyến gói (ADR 0039 + quyết định thu cọc toàn sàn
 * 16/09/2026): cả hai đều sinh hold lúc khách gửi. Khối này vì thế không còn kiểm "tuyến nào thì
 * có hold" nữa — nó kiểm thứ VẪN khác nhau giữa hai tuyến: SỐ TIỀN trong hold.
 */
describe('Tuyến hoa hồng — phí dịch vụ nằm trong khoản giữ chỗ', () => {
  maybe('hold của tuyến hoa hồng mang dòng phí dịch vụ; tuyến gói thì không', async () => {
    if (!feePolicyActive) throw new Error('Thiếu chính sách phí ACTIVE — migration R3 chưa chạy?');

    const commission = await submit({}, holdVehicleId);
    const shop = await submit();

    const commissionHold = await prisma.bookingHold.findFirstOrThrow({
      where: { bookingRequestId: commission.receipt.id },
    });
    const shopHold = await prisma.bookingHold.findFirstOrThrow({
      where: { bookingRequestId: shop.receipt.id },
    });

    // `S` — phí dịch vụ phía khách: 10% ở tuyến hoa hồng, 0 ở tuyến gói (ADR 0028 điều 1).
    expect(Number(commissionHold.serviceFeeAmount)).toBeGreaterThan(0);
    expect(Number(shopHold.serviceFeeAmount)).toBe(0);
    // Cả hai đều có `D` — cọc là tiền thuê của chủ xe, không phụ thuộc tuyến.
    expect(Number(commissionHold.depositAmount)).toBeGreaterThan(0);
    expect(Number(shopHold.depositAmount)).toBeGreaterThan(0);
  });

  /**
   * ADR 0032 từng chặn tự nhận cho chuyến CÓ TÀI XẾ khi phải giữ chỗ
   * (`HOLD_REQUIRED_WITH_DRIVER`). ADR 0039 gỡ chặn đó: đơn nay ra đời ngay trong transaction
   * tiền về, nên tài xế gán được ở đúng chỗ mà constraint lịch tài xế gác.
   */
  maybe('có tài xế + cần giữ chỗ: tiền về là tự nhận được, không còn bị chặn', async () => {
    if (!feePolicyActive) throw new Error('Thiếu chính sách phí ACTIVE — migration R3 chưa chạy?');
    const driverId = newId();
    await prisma.driver.create({
      data: {
        id: driverId,
        tenantId: holdTenantId,
        name: 'Tài xế hoa hồng',
        phone: '0900000005',
        status: 'active',
      },
    });
    await enableAutoAccept(
      holdTenantId,
      holdVehicleId,
      holdOwnerId,
      SERVICE_TYPE.WITH_DRIVER,
      withDrivers,
    );
    const { row } = await submitAndPay(
      {
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        routeType: 'in_city',
        pickupAddress: '12 Lê Lợi, Q.1',
      },
      holdVehicleId,
    );

    expect(row.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: row.bookingId! } });
    expect(booking.driverId).toBe(driverId);
  });
});

/*
 * DUYỆT TAY — nay xảy ra SAU khi khách đã trả tiền (ADR 0039 điều 1).
 *
 * Đây là đường mặc định của phần lớn gian hàng: họ không bật "Đặt ngay", nên chuyến dừng ở
 * `hold_paid` và chờ đúng một cú bấm. Điều đổi so với trước là khi họ bấm, tiền đã nằm ở
 * XePrime — nên "từ chối" không còn miễn phí mà kéo theo một khoản hoàn.
 */
describe('Duyệt tay sau khi khách đã cọc', () => {
  maybe('chủ xe bấm duyệt: nguồn quyết định là HOST và người ký là chủ xe', async () => {
    const { receipt, row: paid } = await submitAndPay();
    expect(paid.status).toBe(BOOKING_REQUEST_STATUS.HOLD_PAID);

    const approved = await requests.approve(tenantId, ownerId, receipt.id);
    expect(approved.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);

    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(row.decisionSource).toBe(BOOKING_REQUEST_DECISION_SOURCE.HOST);
    expect(row.decidedBy).toBe(ownerId);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: approved.bookingId! } });
    expect(booking.createdBy).toBe(ownerId);
    // Tiền đã thu qua XePrime ⇒ đơn đóng băng `platform`, công tắc sau đó không viết lại.
    expect(booking.depositCollectionMode).toBe(DEPOSIT_COLLECTION_MODE.PLATFORM);
  });

  /**
   * TỪ CHỐI SAU KHI ĐÃ THU TIỀN phải hoàn ĐỦ (ADR 0039 điều 5).
   *
   * Khách không làm gì sai: họ trả tiền và chờ. `split_late_cancel` tồn tại để bù cho gian hàng
   * khi họ ĐÃ nhận chuyến; ở đây họ chưa nhận gì cả.
   */
  maybe('từ chối sau khi đã cọc: hoàn đủ, nhả chỗ, nguồn vẫn là HOST', async () => {
    const { receipt } = await submitAndPay();
    const hold = await prisma.bookingHold.findFirstOrThrow({
      where: { bookingRequestId: receipt.id },
    });

    await requests.reject(tenantId, ownerId, receipt.id, 'Xe bận');

    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.REJECTED_BY_HOST);
    expect(row.decisionSource).toBe(BOOKING_REQUEST_DECISION_SOURCE.HOST);

    const after = await prisma.bookingHold.findUniqueOrThrow({ where: { id: hold.id } });
    expect(after.status).toBe(BOOKING_HOLD_STATUS.RELEASED);
    expect(after.outcome).toBe(BOOKING_HOLD_OUTCOME.REFUNDED);

    // Hoàn ĐỦ số đã trả — không chia đôi, không giữ lại phí dịch vụ.
    const refund = await prisma.holdRefund.findUniqueOrThrow({ where: { holdId: hold.id } });
    expect(refund.amount.toFixed(0)).toBe(hold.amount.toFixed(0));
    expect(refund.reason).toBe(HOLD_REFUND_REASON.OWNER_CANCEL);

    // Chỗ được nhả ngay — khách khác đặt được chiếc xe đó.
    expect(await prisma.vehicleOccupancy.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.booking.count({ where: { tenantId } })).toBe(0);
  });
});
