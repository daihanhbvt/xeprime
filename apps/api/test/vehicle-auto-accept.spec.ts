import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import { giveTenantPlan } from './helpers/billing-fixture';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  AUTO_ACCEPT_BLOCKER,
  BILLING_MODE,
  BOOKING_REQUEST_DECISION_SOURCE,
  BOOKING_HOLD_STATUS,
  BOOKING_REQUEST_STATUS,
  DEPOSIT_COLLECTION_MODE,
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
 *  3. Chuyến có thu tiền giữ chỗ → `awaiting_hold`, CHƯA có đơn: tiền về mới sinh đơn.
 *  4. Hai yêu cầu trùng giờ gửi cùng lúc → đúng MỘT chỗ được giữ; bên thua ở lại hàng chờ hoặc
 *     được đóng bằng `slot_taken`, không có kết cục lai (ADR 0006 — constraint DB là trọng tài).
 *  5. Khung giờ giao nhận và điều khoản bắt buộc được kiểm Ở SERVER ngay lúc gửi.
 *  6. Có tài xế + có thu tiền giữ chỗ → KHÔNG tự nhận: đơn ra đời tới hai giờ sau, không ai hứa
 *     được một tài xế rảnh cho khoảng đó (ADR 0044 điều 8).
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
 * Khách trả ĐỦ tiền giữ chỗ — bước cuối cùng, và là bước DUY NHẤT biến một chuyến thành ĐƠN THUÊ
 * (ADR 0044 điều 2).
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

/** Gửi yêu cầu (hệ thống tự nhận nếu đủ điều kiện) RỒI trả tiền — đường đầy đủ tới ĐƠN THUÊ. */
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
 * ⚠️ VÒNG ĐỜI — ADR 0044 (ghi đè ADR 0039).
 *
 * "Tự nhận" xảy ra ngay lúc khách bấm gửi, qua CÙNG đường với duyệt tay: hệ thống chốt lịch,
 * chốt giá, giữ xe và phát QR. Đơn thuê ra đời sau đó, khi đối soát xác nhận đã nhận đủ tiền —
 * nên các ca dưới đây đi qua `submitAndPay`.
 *
 * "Không tự nhận" nghĩa là yêu cầu dừng ở `pending_host_approval`: chưa ai nhận thì chưa thu
 * tiền và chưa giữ chỗ, nên không có gì để trả.
 */
describe('Đủ điều kiện — hệ thống nhận ngay lúc khách gửi', () => {
  maybe('tự lái: gửi xong là CHỜ TIỀN và đã chiếm lịch, chưa có đơn', async () => {
    await enableAutoAccept(tenantId, vehicleId, ownerId, SERVICE_TYPE.SELF_DRIVE);
    const { receipt } = await submit();

    /*
     * Hệ thống đã NHẬN chuyến (ADR 0044): lịch chốt, xe bị giữ, QR đã phát. Nhưng đơn thuê thì
     * chưa — và sẽ không có chừng nào tiền chưa về.
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
    /*
     * ĐÃ có người quyết định — là HỆ THỐNG. `decided_at` có giá trị và `decision_source` là
     * `system`: đó chính là thứ nói cho đường xử lý tiền về biết rằng chuyến này đã được nhận
     * và tiền đủ là mở đơn ngay, không hỏi lại ai.
     */
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(row.decidedAt).not.toBeNull();
    expect(row.decisionSource).toBe(BOOKING_REQUEST_DECISION_SOURCE.SYSTEM);
    expect(row.decidedBy).toBeNull();
    expect(receipt.autoAccepted).toBe(true);
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

  maybe('chưa bật tự nhận: ở lại hàng chờ, chưa thu tiền và chưa giữ chỗ', async () => {
    const { receipt } = await submit();
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    expect(row.bookingId).toBeNull();
    expect(row.decidedAt).toBeNull();
    // Không có QR nào được phát cho một chuyến chưa ai nhận (ADR 0044 điều 1).
    expect(await prisma.bookingHold.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.vehicleOccupancy.count({ where: { tenantId } })).toBe(0);
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

/**
 * CÓ TÀI XẾ + CÓ THU TIỀN GIỮ CHỖ ⇒ KHÔNG tự nhận (ADR 0044 điều 2).
 *
 * Lý do là một ràng buộc thật của `bookings_driver_schedule_excl`: tài xế phải được gán TRONG
 * transaction tạo đơn, mà đơn chỉ ra đời khi tiền về — tức là tới hai giờ sau. Tự nhận ở đây sẽ
 * hứa một chuyến có tài xế rồi hai giờ sau mới biết có ai rảnh hay không, và lúc đó khách đã trả
 * tiền. Để chủ xe duyệt tay và tự chọn người.
 *
 * ADR 0039 từng mở ca này ra (tiền về TRƯỚC nên đơn sinh ngay lúc trả), và nó đóng lại cùng lúc
 * với thứ tự ấy. Dấu vết `HOLD_REQUIRED_WITH_DRIVER` là thứ nói cho chủ xe biết vì sao.
 */
describe('Có tài xế — không tự nhận khi chuyến có thu tiền giữ chỗ', () => {
  maybe('có tài xế rảnh vẫn KHÔNG tự nhận: về hàng chờ với lý do HOLD_REQUIRED_WITH_DRIVER', async () => {
    const driverId = newId();
    await prisma.driver.create({
      data: { id: driverId, tenantId, name: 'Tài xế rảnh', phone: '0900000003', status: 'active' },
    });
    await enableAutoAccept(tenantId, vehicleId, ownerId, SERVICE_TYPE.WITH_DRIVER, withDrivers);

    const { receipt } = await submit({
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      routeType: 'in_city',
      pickupAddress: '12 Lê Lợi, Q.1',
    });
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    expect(await prisma.bookingHold.count({ where: { tenantId } })).toBe(0);

    const skip = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId, action: 'booking_request.auto_accept_skipped' },
    });
    expect((skip.afterJson as { blocker?: string } | null)?.blocker).toBe(
      AUTO_ACCEPT_BLOCKER.HOLD_REQUIRED_WITH_DRIVER,
    );
  });

  /**
   * Chủ xe bấm duyệt TAY thì chuyến có tài xế vẫn đi được hết đường — chỉ là tài xế được gán ở
   * màn đơn sau khi tiền về, không phải tự động.
   */
  maybe('duyệt TAY chuyến có tài xế: chốt lịch, phát QR, tiền về thì mở đơn', async () => {
    await prisma.driver.create({
      data: { id: newId(), tenantId, name: 'Tài xế 9', phone: '0900000009', status: 'active' },
    });
    const { receipt } = await submit({
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      routeType: 'in_city',
      pickupAddress: '12 Lê Lợi, Q.1',
    });

    const accepted = await requests.approve(tenantId, ownerId, receipt.id);
    expect(accepted.status).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);

    await payHold(receipt.id);
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
    expect(row.bookingId).not.toBeNull();
  });

  maybe('không có tài xế rảnh: về hàng chờ, không có QR nào được phát', async () => {
    await prisma.driver.create({
      data: { id: newId(), tenantId, name: 'Tài xế 1', phone: '0900000002', status: 'active' },
    });
    await enableAutoAccept(tenantId, vehicleId, ownerId, SERVICE_TYPE.WITH_DRIVER, withDrivers);
    // Tài xế duy nhất bị vô hiệu hoá SAU khi bật — cấu hình còn bật, năng lực thì không.
    await prisma.driver.updateMany({ where: { tenantId }, data: { status: 'inactive' } });

    const { receipt } = await submit({
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      routeType: 'in_city',
      pickupAddress: '12 Lê Lợi, Q.1',
    });
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    expect(await prisma.bookingHold.count({ where: { tenantId } })).toBe(0);
  });
});

describe('Đua nhau — constraint DB là trọng tài', () => {
  /**
   * Hai lượt TỰ NHẬN cho cùng một khung giờ chạy song song — chỉ một được giữ chỗ.
   *
   * Trọng tài là `vehicle_occupancies_no_overlap`, không phải một câu `if` nào ở tầng app
   * (ADR 0006). Bên thua KHÔNG bị từ chối: lượt tự nhận hỏng rơi về hàng chờ, rồi được đóng
   * bằng `slot_taken` vì khung giờ đã có người (ADR 0044 điều 6).
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

    /*
     * Bên thua nhận một câu trả lời THẬT thay vì nằm chờ hết hạn phản hồi. Hai kết cục đều hợp
     * lệ tuỳ thứ tự hai transaction cài răng lược nhau: lượt tự nhận của người thua có thể hỏng
     * TRƯỚC khi người thắng kịp đóng nó (`pending_host_approval`), hoặc sau (`slot_taken`).
     * Thứ KHÔNG hợp lệ là một kết cục lai — một yêu cầu thứ hai cũng giữ được chỗ.
     */
    const loser = results.find(
      (r) => r.receipt.status !== BOOKING_REQUEST_STATUS.AWAITING_HOLD,
    )!;
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: loser.receipt.id } });
    expect([
      BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
      BOOKING_REQUEST_STATUS.SLOT_TAKEN,
    ]).toContain(row.status);
    expect(row.bookingId).toBeNull();
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

    /*
     * Hold chỉ tồn tại SAU khi chuyến được nhận (ADR 0044), nên hai lượt gửi phải được duyệt
     * trước khi có gì để so. Duyệt tay, không bật "Đặt ngay": ca này nói về DÒNG TIỀN của hai
     * tuyến, không về ai bấm nút.
     */
    const commission = await submit({}, holdVehicleId);
    await requests.approve(holdTenantId, holdOwnerId, commission.receipt.id);
    const shop = await submit();
    await requests.approve(tenantId, ownerId, shop.receipt.id);

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
   * CÓ TÀI XẾ + CẦN THU TIỀN GIỮ CHỖ ⇒ không tự nhận, đi duyệt tay (ADR 0044 điều 2).
   *
   * ADR 0039 từng mở ca này ra vì ở thứ tự đó tiền về TRƯỚC và đơn sinh ngay lúc trả, nên tài xế
   * gán được trong chính transaction mà `bookings_driver_schedule_excl` gác. Trả thứ tự về như
   * cũ thì lập luận đó mất hiệu lực: đơn ra đời tới hai giờ sau, và không ai hứa được một tài xế
   * rảnh cho khoảng thời gian đó.
   */
  maybe('có tài xế + cần giữ chỗ: KHÔNG tự nhận, chuyến về hàng chờ duyệt tay', async () => {
    if (!feePolicyActive) throw new Error('Thiếu chính sách phí ACTIVE — migration R3 chưa chạy?');
    await prisma.driver.create({
      data: {
        id: newId(),
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
    const { receipt } = await submit(
      {
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        routeType: 'in_city',
        pickupAddress: '12 Lê Lợi, Q.1',
      },
      holdVehicleId,
    );

    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    expect(
      await prisma.bookingHold.count({ where: { bookingRequestId: receipt.id } }),
    ).toBe(0);
  });
});

/*
 * DUYỆT TAY — đường mặc định của phần lớn gian hàng (ADR 0044 điều 2).
 *
 * Họ không bật "Đặt ngay", nên chuyến dừng ở `pending_host_approval` và chờ đúng một cú bấm.
 * Cú bấm đó chốt lịch, chốt giá, giữ xe và phát QR; ĐƠN THUÊ chỉ ra đời khi tiền về.
 */
describe('Duyệt tay: nhận chuyến trước, tiền về sau', () => {
  maybe('chủ xe bấm duyệt: nguồn quyết định là HOST và người ký là chủ xe', async () => {
    const { receipt } = await submit();

    const accepted = await requests.approve(tenantId, ownerId, receipt.id);
    expect(accepted.status).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
    expect(accepted.bookingId).toBeNull();

    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(row.decisionSource).toBe(BOOKING_REQUEST_DECISION_SOURCE.HOST);
    expect(row.decidedBy).toBe(ownerId);

    // Tiền về ⇒ đơn ra đời, KHÔNG cần chủ xe bấm lần thứ hai.
    await payHold(receipt.id);
    const converted = await prisma.bookingRequest.findUniqueOrThrow({
      where: { id: receipt.id },
    });
    expect(converted.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);

    const booking = await prisma.booking.findUniqueOrThrow({
      where: { id: converted.bookingId! },
    });
    expect(booking.createdBy).toBe(ownerId);
    // Tiền đã thu qua XePrime ⇒ đơn đóng băng `platform`, công tắc sau đó không viết lại.
    expect(booking.depositCollectionMode).toBe(DEPOSIT_COLLECTION_MODE.PLATFORM);
  });

  /**
   * BÁO GIÁ CÒN TẠM TÍNH ⇒ duyệt tạo ĐƠN NGAY, không QR (ADR 0044 điều 4).
   *
   * Xe này có giá có-tài-xế theo ngày nhưng KHÔNG có giá liên tỉnh, nên máy giá rơi về bậc gần
   * nhất và gắn `estimateNote`. CLAUDE.md cấm thu phần trăm trên một con số chưa chốt — nên
   * không có số tiền nào để in lên QR, và một mã QR ở đây sẽ là một mã giả.
   *
   * `deposit_collection_mode = none` chứ không phải `direct`: `direct` nói với khách rằng gian
   * hàng sẽ liên hệ thu một khoản, mà ở đây không ai từng tính ra khoản đó.
   */
  maybe('báo giá còn TẠM TÍNH: duyệt ra ĐƠN ngay, không hold, mode = none', async () => {
    const { receipt } = await submit({
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      routeType: 'inter_city',
      pickupAddress: '12 Lê Lợi, Q.1',
      destination: 'Đà Lạt',
    });

    const approved = await requests.approve(tenantId, ownerId, receipt.id);

    expect(approved.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
    expect(approved.bookingId).toBeTruthy();
    expect(await prisma.bookingHold.count({ where: { tenantId } })).toBe(0);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: approved.bookingId! } });
    expect(booking.depositCollectionMode).toBe(DEPOSIT_COLLECTION_MODE.NONE);
  });

  /**
   * TỪ CHỐI một yêu cầu CHƯA duyệt: không có tiền nào để hoàn, không có chỗ nào để nhả.
   *
   * Đây là lợi ích trực tiếp của việc trả thứ tự về như cũ (ADR 0044): phần lớn lượt từ chối
   * không còn chạm tới đường tiền.
   */
  maybe('từ chối khi chưa duyệt: đóng yêu cầu, không sinh khoản hoàn nào', async () => {
    const { receipt } = await submit();

    await requests.reject(tenantId, ownerId, receipt.id, 'Xe bận');

    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.REJECTED_BY_HOST);
    expect(row.decisionSource).toBe(BOOKING_REQUEST_DECISION_SOURCE.HOST);

    expect(await prisma.bookingHold.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.holdRefund.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.vehicleOccupancy.count({ where: { tenantId } })).toBe(0);
    expect(await prisma.booking.count({ where: { tenantId } })).toBe(0);
  });

});
