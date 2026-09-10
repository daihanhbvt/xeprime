import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUDIT_ACTOR_SCOPE,
  AUTO_ACCEPT_BLOCKER,
  BILLING_MODE,
  BOOKING_REQUEST_DECISION_SOURCE,
  BOOKING_REQUEST_STATUS,
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
import { makeNotificationService, makeBookingRequestsService } from './helpers/service-factory';

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
        price: 0,
        durationDays: 30,
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
    { autoAcceptEnabled: true, autoAcceptMinLeadMinutes: 60, autoAcceptMaxLeadMinutes: 129600 },
    featureMap,
  );
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

describe('Đủ điều kiện — hệ thống nhận ngay', () => {
  maybe('tự lái: đơn ra đời, nguồn quyết định là SYSTEM, không ai đứng tên người tạo', async () => {
    await enableAutoAccept(tenantId, vehicleId, ownerId, SERVICE_TYPE.SELF_DRIVE);
    const { receipt } = await submit();

    expect(receipt.autoAccepted).toBe(true);
    expect(receipt.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
    expect(receipt.bookingId).toBeTruthy();

    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
    expect(row.decisionSource).toBe(BOOKING_REQUEST_DECISION_SOURCE.SYSTEM);
    expect(row.decidedBy).toBeNull();

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: receipt.bookingId! } });
    expect(booking.status).toBe(BOOKING_STATUS.RESERVED);
    expect(booking.createdBy).toBeNull();

    // Lịch bị giữ NGAY — đây là khác biệt lớn nhất so với một yêu cầu chờ duyệt.
    const held = await prisma.vehicleOccupancy.count({ where: { sourceId: booking.id } });
    expect(held).toBe(1);

    // Audit ghi hệ thống là người ký, không mượn tên chủ xe.
    const log = await prisma.auditLog.findFirst({
      where: { tenantId, action: { startsWith: 'booking_request.auto_accept' } },
    });
    expect(log?.actorScope).toBe(AUDIT_ACTOR_SCOPE.SYSTEM);
    expect(log?.actorUserId).toBeNull();
  });

  maybe('chủ xe nhận đúng MỘT thông báo "đã tự nhận", không kèm "có yêu cầu mới"', async () => {
    await enableAutoAccept(tenantId, vehicleId, ownerId, SERVICE_TYPE.SELF_DRIVE);
    const { receipt } = await submit();

    const auto = await prisma.notification.count({
      where: { tenantId, type: NOTIFICATION_TYPE.BOOKING_AUTO_ACCEPTED },
    });
    const submitted = await prisma.notification.count({
      where: { tenantId, type: NOTIFICATION_TYPE.BOOKING_REQUEST_SUBMITTED },
    });
    expect(auto).toBeGreaterThanOrEqual(1);
    expect(submitted).toBe(0);
    expect(receipt.autoAccepted).toBe(true);
  });

  maybe('thời gian chết của xe đi vào lịch của đơn tự nhận', async () => {
    await settings.saveOperation(tenantId, vehicleId, ownerId, {
      turnaroundBufferMinutes: 90,
      pickupWindows: [],
      returnWindows: [],
    });
    await enableAutoAccept(tenantId, vehicleId, ownerId, SERVICE_TYPE.SELF_DRIVE);
    const { receipt } = await submit();

    const row = await prisma.vehicleOccupancy.findFirstOrThrow({
      where: { sourceId: receipt.bookingId! },
    });
    expect(row.bufferMinutes).toBe(90);
  });
});

describe('Không đủ điều kiện — về hàng chờ, không tự từ chối khách', () => {
  maybe('đặt quá sát giờ: yêu cầu ở lại chờ duyệt và ghi dấu lý do bỏ qua', async () => {
    await settings.patchServiceSetting(
      tenantId,
      vehicleId,
      SERVICE_TYPE.SELF_DRIVE,
      ownerId,
      {
        autoAcceptEnabled: true,
        autoAcceptMinLeadMinutes: 10080,
        autoAcceptMaxLeadMinutes: 129600,
      },
      features(),
    );
    // Nhận sau 2 ngày < 7 ngày tối thiểu.
    const { receipt } = await submit({
      pickupAt: vnAt(2, 9).toISOString(),
      returnAt: vnAt(3, 9).toISOString(),
    });

    expect(receipt.autoAccepted).toBe(false);
    expect(receipt.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    expect(receipt.bookingId).toBeNull();
    expect(await prisma.booking.count({ where: { tenantId } })).toBe(0);
    // Không chiếm lịch: nhiều khách vẫn được hỏi cùng chiếc xe (ADR 0006).
    expect(await prisma.vehicleOccupancy.count({ where: { tenantId } })).toBe(0);

    const skip = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId, action: 'booking_request.auto_accept_skipped' },
    });
    expect((skip.afterJson as { blocker?: string } | null)?.blocker).toBe(
      AUTO_ACCEPT_BLOCKER.LEAD_TOO_SHORT,
    );
    // Vẫn phải có thông báo "yêu cầu mới" — chủ xe không được im lặng bỏ sót đơn.
    expect(
      await prisma.notification.count({
        where: { tenantId, type: NOTIFICATION_TYPE.BOOKING_REQUEST_SUBMITTED },
      }),
    ).toBeGreaterThanOrEqual(1);
  });

  maybe('chưa bật tự nhận: mọi yêu cầu vẫn đi đường duyệt tay như trước', async () => {
    const { receipt } = await submit();
    expect(receipt.autoAccepted).toBe(false);
    expect(receipt.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
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
      expect(receipt.autoAccepted).toBe(false);
      expect(receipt.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
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

    const { receipt } = await submit({
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      routeType: 'in_city',
      pickupAddress: '12 Lê Lợi, Q.1',
    });
    expect(receipt.autoAccepted).toBe(false);
    const skip = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId, action: 'booking_request.auto_accept_skipped' },
    });
    expect((skip.afterJson as { blocker?: string } | null)?.blocker).toBe(
      AUTO_ACCEPT_BLOCKER.NO_DRIVER,
    );
  });

  maybe('có tài xế hợp lệ: đơn tự nhận mang luôn tài xế được gán', async () => {
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
    expect(receipt.autoAccepted).toBe(true);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: receipt.bookingId! } });
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
    const { receipt } = await submit({
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      routeType: 'in_city',
      pickupAddress: '12 Lê Lợi, Q.1',
    });
    expect(receipt.autoAccepted).toBe(false);
    expect(await prisma.booking.count({ where: { tenantId } })).toBe(0);
  });
});

describe('Đua nhau — constraint DB là trọng tài', () => {
  maybe('hai yêu cầu trùng giờ gửi CÙNG LÚC: đúng một đơn, bên thua ở lại hàng chờ', async () => {
    await enableAutoAccept(tenantId, vehicleId, ownerId, SERVICE_TYPE.SELF_DRIVE);
    const window = { pickupAt: vnAt(8, 9).toISOString(), returnAt: vnAt(10, 9).toISOString() };

    const results = await Promise.all([submit(window), submit(window)]);
    const accepted = results.filter((r) => r.receipt.autoAccepted);
    expect(accepted).toHaveLength(1);

    expect(await prisma.booking.count({ where: { tenantId } })).toBe(1);
    expect(await prisma.vehicleOccupancy.count({ where: { tenantId } })).toBe(1);

    const loser = results.find((r) => !r.receipt.autoAccepted)!;
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: loser.receipt.id } });
    expect(row.status).toBe(BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL);
    expect(row.decisionSource).toBeNull();
  });

  maybe('lịch đã bị chiếm trước đó: yêu cầu mới không tự nhận đè lên', async () => {
    await enableAutoAccept(tenantId, vehicleId, ownerId, SERVICE_TYPE.SELF_DRIVE);
    const window = { pickupAt: vnAt(8, 9).toISOString(), returnAt: vnAt(10, 9).toISOString() };
    const first = await submit(window);
    expect(first.receipt.autoAccepted).toBe(true);

    const second = await submit(window);
    expect(second.receipt.autoAccepted).toBe(false);
    expect(await prisma.booking.count({ where: { tenantId } })).toBe(1);
  });
});

describe('Tuyến hoa hồng — tự nhận dừng ở chờ giữ chỗ, chưa có đơn', () => {
  maybe('tự lái có phí giữ chỗ: yêu cầu sang awaiting_hold và sinh khoản giữ chỗ', async () => {
    if (!feePolicyActive) throw new Error('Thiếu chính sách phí ACTIVE — migration R3 chưa chạy?');
    {
      await enableAutoAccept(holdTenantId, holdVehicleId, holdOwnerId, SERVICE_TYPE.SELF_DRIVE);
      const { receipt } = await submit({}, holdVehicleId);

      expect(receipt.autoAccepted).toBe(true);
      expect(receipt.status).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
      // CHƯA có đơn: đơn chỉ ra đời khi tiền giữ chỗ về (ADR 0028 điều 6).
      expect(receipt.bookingId).toBeNull();
      expect(await prisma.booking.count({ where: { tenantId: holdTenantId } })).toBe(0);

      const hold = await prisma.bookingHold.findFirstOrThrow({
        where: { tenantId: holdTenantId, bookingRequestId: receipt.id },
      });
      expect(Number(hold.amount)).toBeGreaterThan(0);

      const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
      expect(row.decisionSource).toBe(BOOKING_REQUEST_DECISION_SOURCE.SYSTEM);
    }
  });

  maybe('có tài xế + cần giữ chỗ: KHÔNG tự nhận, để chủ xe duyệt tay', async () => {
    if (!feePolicyActive) throw new Error('Thiếu chính sách phí ACTIVE — migration R3 chưa chạy?');
    {
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

      expect(receipt.autoAccepted).toBe(false);
      const skip = await prisma.auditLog.findFirstOrThrow({
        where: { tenantId: holdTenantId, action: 'booking_request.auto_accept_skipped' },
      });
      expect((skip.afterJson as { blocker?: string } | null)?.blocker).toBe(
        AUTO_ACCEPT_BLOCKER.HOLD_REQUIRED_WITH_DRIVER,
      );
    }
  });
});

describe('Duyệt tay không bị thay đổi', () => {
  maybe('chủ xe bấm duyệt: nguồn quyết định là HOST và người ký là chủ xe', async () => {
    const { receipt } = await submit();
    const approved = await requests.approve(tenantId, ownerId, receipt.id);
    expect(approved.status).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);

    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
    expect(row.decisionSource).toBe(BOOKING_REQUEST_DECISION_SOURCE.HOST);
    expect(row.decidedBy).toBe(ownerId);

    const booking = await prisma.booking.findUniqueOrThrow({ where: { id: approved.bookingId! } });
    expect(booking.createdBy).toBe(ownerId);
  });

  maybe(
    'từ chối vẫn ghi nguồn HOST — hệ thống không bao giờ đứng tên một lời từ chối',
    async () => {
      const { receipt } = await submit();
      await requests.reject(tenantId, ownerId, receipt.id, 'Xe bận');
      const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });
      expect(row.status).toBe(BOOKING_REQUEST_STATUS.REJECTED_BY_HOST);
      expect(row.decisionSource).toBe(BOOKING_REQUEST_DECISION_SOURCE.HOST);
    },
  );
});
