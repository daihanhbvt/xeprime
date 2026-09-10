import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  AUTO_ACCEPT_BLOCKER,
  CUSTOMER_DOCUMENT_TYPE,
  DRIVER_DEPOSIT_MODE,
  DRIVER_SURCHARGE_KIND,
  DRIVER_SURCHARGE_KIND_VALUES,
  DRIVER_SURCHARGE_UNIT,
  FEATURE_STATE,
  HANDOVER_WINDOW_KIND,
  IDENTITY_VERIFY_METHOD,
  MEMBERSHIP_STATUS,
  PLAN_FEATURE,
  PLAN_FEATURE_VALUES,
  ROUTE_TYPE,
  SERVICE_TYPE,
  SURCHARGE_CATEGORY,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  type FeatureState,
  type PlanFeature,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { VehicleSettingsService } from '../src/modules/vehicle-settings/vehicle-settings.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { makeBookingsService } from './helpers/service-factory';

/**
 * THIẾT LẬP VẬN HÀNH THEO XE — không gian "Quản lý xe" (08/09/2026), trên PostgreSQL THẬT.
 *
 * Những gì spec này giữ:
 *
 *  1. **Phạm vi gian hàng**: tenant B không đọc/ghi được thiết lập của xe tenant A, và DB (FK
 *     tổ hợp `(vehicle_id, tenant_id)`) chặn cả khi service bị bỏ qua.
 *  2. **Khung giờ giao nhận**: CHECK khoảng phút, EXCLUDE chống chồng lấn, và `assertHandoverWindows`
 *     từ chối giờ nằm ngoài khung — kiểm ở SERVER, không phải ở form.
 *  3. **Thời gian chết** thật sự tham gia lịch bận: đơn kế tiếp nằm trong đệm bị constraint chặn.
 *  4. **Ràng buộc chéo** của thiết lập dịch vụ mà class-validator không mô tả được.
 *  5. **Phụ phí công bố ≠ phụ phí đã ghi**: một bên là quy tắc mặc định, một bên là khoản thật
 *     trên đơn; sửa quy tắc sau đó KHÔNG động vào snapshot đã đóng băng.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const audit = new AuditService(asService);
const settings = new VehicleSettingsService(asService, audit, new OccupancyService(asService));
const bookings = makeBookingsService(asService);

const RUN = newId().slice(-8).toLowerCase();

/** Gói bật/tắt tính năng — `listServiceSettings`/`patchServiceSetting` nhận map này từ guard. */
function features(overrides: Partial<Record<PlanFeature, FeatureState>> = {}) {
  const all = Object.fromEntries(
    PLAN_FEATURE_VALUES.map((f) => [f, FEATURE_STATE.HIDDEN]),
  ) as Record<PlanFeature, FeatureState>;
  return { ...all, ...overrides };
}
const withDrivers = features({ [PLAN_FEATURE.DRIVERS]: FEATURE_STATE.ENABLED });

let dbAvailable = false;
let ownerA: string;
let ownerB: string;
let tenantA: string;
let tenantB: string;
let vehicleA: string;
let vehicleB: string;

/** `x` ngày nữa lúc 09:00 giờ Việt Nam (UTC+7) — giữ mọi mốc nằm gọn trong khung giờ mặc định. */
function vnDay(offsetDays: number, hourVn = 9): Date {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + offsetDays);
  base.setUTCHours(hourVn - 7, 0, 0, 0);
  return base;
}

async function makeShop(
  label: string,
): Promise<{ ownerId: string; tenantId: string; vehicleId: string }> {
  const ownerId = newId();
  const tenantId = newId();
  const vehicleId = newId();
  await prisma.user.create({
    data: { id: ownerId, displayName: `Chủ ${label}`, email: `vset-${label}-${RUN}@xeprime.test` },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `VSetShop-${label}-${RUN}`,
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
  await prisma.vehicle.create({
    data: {
      id: vehicleId,
      tenantId,
      code: `XE${vehicleId.slice(-5)}`,
      name: `Xe ${label}`,
      vehicleType: VEHICLE_TYPE.CAR,
      publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
      serviceTypes: [SERVICE_TYPE.SELF_DRIVE, SERVICE_TYPE.WITH_DRIVER],
      weekdayPrice: new Prisma.Decimal('700000'),
      withDriverDailyPrice: new Prisma.Decimal('1300000'),
      createdBy: ownerId,
    },
  });
  return { ownerId, tenantId, vehicleId };
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
  const a = await makeShop('a');
  const b = await makeShop('b');
  ownerA = a.ownerId;
  tenantA = a.tenantId;
  vehicleA = a.vehicleId;
  ownerB = b.ownerId;
  tenantB = b.tenantId;
  vehicleB = b.vehicleId;
});

afterEach(async () => {
  if (!dbAvailable) return;
  const tenants = { in: [tenantA, tenantB] };
  await prisma.bookingSurcharge.deleteMany({ where: { tenantId: tenants } });
  await prisma.vehicleOccupancy.deleteMany({ where: { tenantId: tenants } });
  await prisma.booking.deleteMany({ where: { tenantId: tenants } });
  await prisma.vehicleHandoverWindow.deleteMany({ where: { tenantId: tenants } });
  await prisma.vehicleOperationSetting.deleteMany({ where: { tenantId: tenants } });
  await prisma.vehicleServiceSetting.deleteMany({ where: { tenantId: tenants } });
  await prisma.vehicleDriverSurchargeRule.deleteMany({ where: { tenantId: tenants } });
  await prisma.driver.deleteMany({ where: { tenantId: tenants } });
  await prisma.auditLog.deleteMany({ where: { tenantId: tenants } });
  await prisma.notification.deleteMany({ where: { tenantId: tenants } });
});

afterAll(async () => {
  if (dbAvailable) {
    const tenants = { in: [tenantA, tenantB] };
    await prisma.vehicle.deleteMany({ where: { tenantId: tenants } });
    await prisma.tenantMembership.deleteMany({ where: { tenantId: tenants } });
    await prisma.tenant.deleteMany({ where: { id: tenants } });
    await prisma.user.deleteMany({ where: { id: { in: [ownerA, ownerB] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('Phạm vi gian hàng — thiết lập của xe không rò sang gian hàng khác', () => {
  maybe('mọi lối đọc/ghi bằng tenant khác đều 404, không phải 403 hay dữ liệu rỗng', async () => {
    await settings.saveOperation(tenantA, vehicleA, ownerA, {
      turnaroundBufferMinutes: 60,
      pickupWindows: [{ start: '07:00', end: '20:00' }],
      returnWindows: [{ start: '07:00', end: '20:00' }],
    });

    await expect(settings.getOperation(tenantB, vehicleA)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      settings.saveOperation(tenantB, vehicleA, ownerB, {
        turnaroundBufferMinutes: 0,
        pickupWindows: [],
        returnWindows: [],
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(settings.listServiceSettings(tenantB, vehicleA, features())).rejects.toMatchObject(
      {
        status: 404,
      },
    );
    await expect(
      settings.patchServiceSetting(
        tenantB,
        vehicleA,
        SERVICE_TYPE.SELF_DRIVE,
        ownerB,
        {},
        features(),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(settings.listSurchargeRules(tenantB, vehicleA)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      settings.saveSurchargeRules(tenantB, vehicleA, ownerB, { items: [] }),
    ).rejects.toMatchObject({
      status: 404,
    });

    // Thiết lập của A vẫn nguyên vẹn sau loạt thử của B.
    const still = await settings.getOperation(tenantA, vehicleA);
    expect(still.turnaroundBufferMinutes).toBe(60);
  });

  maybe('FK tổ hợp chặn dòng "tenant B + xe của A" ngay cả khi service bị bỏ qua', async () => {
    await expect(
      prisma.vehicleOperationSetting.create({
        data: { id: newId(), tenantId: tenantB, vehicleId: vehicleA, turnaroundBufferMinutes: 30 },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.vehicleServiceSetting.create({
        data: {
          id: newId(),
          tenantId: tenantB,
          vehicleId: vehicleA,
          serviceType: SERVICE_TYPE.SELF_DRIVE,
        },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.vehicleDriverSurchargeRule.create({
        data: {
          id: newId(),
          tenantId: tenantB,
          vehicleId: vehicleA,
          kind: DRIVER_SURCHARGE_KIND.WAITING,
        },
      }),
    ).rejects.toThrow();
  });
});

describe('Khung giờ giao nhận — luật ở DB, không ở form', () => {
  maybe(
    'CHECK từ chối khoảng phút vô nghĩa; EXCLUDE từ chối hai khung cùng loại chồng nhau',
    async () => {
      await expect(
        prisma.vehicleHandoverWindow.create({
          data: {
            id: newId(),
            tenantId: tenantA,
            vehicleId: vehicleA,
            kind: HANDOVER_WINDOW_KIND.PICKUP,
            startMinute: 600,
            endMinute: 600,
          },
        }),
      ).rejects.toThrow();

      await prisma.vehicleHandoverWindow.create({
        data: {
          id: newId(),
          tenantId: tenantA,
          vehicleId: vehicleA,
          kind: HANDOVER_WINDOW_KIND.PICKUP,
          startMinute: 360,
          endMinute: 720,
        },
      });
      // Chồng lấn cùng loại → 23P01.
      await expect(
        prisma.vehicleHandoverWindow.create({
          data: {
            id: newId(),
            tenantId: tenantA,
            vehicleId: vehicleA,
            kind: HANDOVER_WINDOW_KIND.PICKUP,
            startMinute: 700,
            endMinute: 900,
          },
        }),
      ).rejects.toThrow();
      // Kề nhau (nửa mở) và khác loại thì hợp lệ.
      await prisma.vehicleHandoverWindow.createMany({
        data: [
          {
            id: newId(),
            tenantId: tenantA,
            vehicleId: vehicleA,
            kind: HANDOVER_WINDOW_KIND.PICKUP,
            startMinute: 720,
            endMinute: 900,
          },
          {
            id: newId(),
            tenantId: tenantA,
            vehicleId: vehicleA,
            kind: HANDOVER_WINDOW_KIND.RETURN,
            startMinute: 360,
            endMinute: 720,
          },
        ],
      });
      const rows = await prisma.vehicleHandoverWindow.count({ where: { vehicleId: vehicleA } });
      expect(rows).toBe(3);
    },
  );

  maybe('giờ nhận/trả ngoài khung bị SERVER từ chối bằng mã lỗi riêng', async () => {
    await settings.saveOperation(tenantA, vehicleA, ownerA, {
      turnaroundBufferMinutes: 0,
      pickupWindows: [{ start: '08:00', end: '18:00' }],
      returnWindows: [{ start: '08:00', end: '18:00' }],
    });

    // 05:00 giờ VN — ngoài khung nhận.
    await expect(
      settings.assertHandoverWindows(prisma, vehicleA, vnDay(3, 5), vnDay(4, 10)),
    ).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.HANDOVER_WINDOW_VIOLATION, details: { kind: 'pickup' } },
    });
    // Giờ nhận hợp lệ, giờ TRẢ ngoài khung.
    await expect(
      settings.assertHandoverWindows(prisma, vehicleA, vnDay(3, 10), vnDay(4, 22)),
    ).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.HANDOVER_WINDOW_VIOLATION, details: { kind: 'return' } },
    });
    // Cả hai trong khung → không ném.
    await expect(
      settings.assertHandoverWindows(prisma, vehicleA, vnDay(3, 10), vnDay(4, 16)),
    ).resolves.toBeUndefined();
    // Không cấu hình khung nào = nhận mọi giờ.
    await expect(
      settings.assertHandoverWindows(prisma, vehicleB, vnDay(3, 5), vnDay(4, 23)),
    ).resolves.toBeUndefined();
  });
});

describe('Thời gian chết — đệm thật sự chiếm lịch', () => {
  maybe('đơn kế tiếp nằm trong đệm bị constraint chặn; ngoài đệm thì nhận', async () => {
    await settings.saveOperation(tenantA, vehicleA, ownerA, {
      turnaroundBufferMinutes: 120,
      pickupWindows: [],
      returnWindows: [],
    });

    const first = await bookings.create(tenantA, ownerA, {
      vehicleId: vehicleA,
      customerName: 'Khách 1',
      pickupAt: vnDay(10, 8).toISOString(),
      returnAt: vnDay(11, 8).toISOString(),
      baseAmount: '700000',
    });
    const occupancy = await prisma.vehicleOccupancy.findFirstOrThrow({
      where: { sourceId: first.id },
      select: { bufferMinutes: true },
    });
    expect(occupancy.bufferMinutes).toBe(120);

    /*
     * Bắt đầu 1 giờ sau khi trả — vẫn nằm trong đệm 2 giờ. Ở tầng service ta thấy ĐÚNG tên
     * constraint đã nổ: thứ chặn là exclusion constraint của DB chứ không phải một phép kiểm ở
     * tầng app (ADR 0006). `AllExceptionsFilter` mới là chỗ đổi `23P01` thành 409 ở tầng HTTP.
     */
    await expect(
      bookings.create(tenantA, ownerA, {
        vehicleId: vehicleA,
        customerName: 'Khách 2',
        pickupAt: vnDay(11, 9).toISOString(),
        returnAt: vnDay(12, 8).toISOString(),
        baseAmount: '700000',
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining('vehicle_occupancies_no_overlap'),
    });

    // Sau đệm thì nhận bình thường.
    const third = await bookings.create(tenantA, ownerA, {
      vehicleId: vehicleA,
      customerName: 'Khách 3',
      pickupAt: vnDay(11, 11).toISOString(),
      returnAt: vnDay(12, 8).toISOString(),
      baseAmount: '700000',
    });
    expect(third.id).toBeTruthy();
  });

  maybe('chưa cấu hình = 0 phút, KHÔNG âm thầm áp đệm cho dữ liệu cũ', async () => {
    expect(await settings.turnaroundBufferFor(prisma, vehicleB)).toBe(0);
    const booking = await bookings.create(tenantB, ownerB, {
      vehicleId: vehicleB,
      customerName: 'Khách B',
      pickupAt: vnDay(10, 8).toISOString(),
      returnAt: vnDay(11, 8).toISOString(),
      baseAmount: '700000',
    });
    const occupancy = await prisma.vehicleOccupancy.findFirstOrThrow({
      where: { sourceId: booking.id },
      select: { bufferMinutes: true },
    });
    expect(occupancy.bufferMinutes).toBe(0);
  });
});

describe('Thiết lập theo dịch vụ — ràng buộc chéo ở server', () => {
  maybe('đặt trước tối thiểu không được vượt tối đa', async () => {
    await expect(
      settings.patchServiceSetting(
        tenantA,
        vehicleA,
        SERVICE_TYPE.SELF_DRIVE,
        ownerA,
        { autoAcceptMinLeadMinutes: 10080, autoAcceptMaxLeadMinutes: 360 },
        features(),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  maybe('bắt đồng ý điều khoản thì phải có nội dung điều khoản', async () => {
    await expect(
      settings.patchServiceSetting(
        tenantA,
        vehicleA,
        SERVICE_TYPE.SELF_DRIVE,
        ownerA,
        { requireTermsAcceptance: true },
        features(),
      ),
    ).rejects.toMatchObject({ status: 400 });

    const ok = await settings.patchServiceSetting(
      tenantA,
      vehicleA,
      SERVICE_TYPE.SELF_DRIVE,
      ownerA,
      { requireTermsAcceptance: true, termsText: 'Không hút thuốc trong xe.' },
      features(),
    );
    expect(ok.requireTermsAcceptance).toBe(true);
  });

  maybe('"giấy tờ khác" không định danh được ai — không nhận làm yêu cầu bắt buộc', async () => {
    await expect(
      settings.patchServiceSetting(
        tenantA,
        vehicleA,
        SERVICE_TYPE.SELF_DRIVE,
        ownerA,
        { requiredDocuments: [CUSTOMER_DOCUMENT_TYPE.OTHER] },
        features(),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  maybe('hộ chiếu cộng vào bộ giấy tờ HIỆU LỰC, GPLX theo luật vẫn còn', async () => {
    const saved = await settings.patchServiceSetting(
      tenantA,
      vehicleA,
      SERVICE_TYPE.SELF_DRIVE,
      ownerA,
      { requiredDocuments: [CUSTOMER_DOCUMENT_TYPE.PASSPORT] },
      features(),
    );
    expect(saved.effectiveRequiredDocuments).toContain(CUSTOMER_DOCUMENT_TYPE.PASSPORT);
    expect(saved.effectiveRequiredDocuments).toContain(CUSTOMER_DOCUMENT_TYPE.DRIVER_LICENCE);
  });

  maybe('tự lái chuẩn hoá các trường riêng của có tài xế về mặc định', async () => {
    const saved = await settings.patchServiceSetting(
      tenantA,
      vehicleA,
      SERVICE_TYPE.SELF_DRIVE,
      ownerA,
      { minRentalMinutes: 720, preferredRouteTypes: [ROUTE_TYPE.INTER_CITY] },
      features(),
    );
    expect(saved.minRentalMinutes).toBeNull();
    expect(saved.preferredRouteTypes).toEqual([]);
    expect(saved.depositMode).toBe(DRIVER_DEPOSIT_MODE.NONE);
  });

  maybe('dịch vụ dài hạn không có thiết lập riêng — từ chối ngay', async () => {
    await expect(
      settings.patchServiceSetting(
        tenantA,
        vehicleA,
        SERVICE_TYPE.LONG_TERM,
        ownerA,
        { autoAcceptEnabled: true },
        features(),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  maybe('cọc 30%/50% chưa có luồng thu — server từ chối ghi', async () => {
    await expect(
      settings.patchServiceSetting(
        tenantA,
        vehicleA,
        SERVICE_TYPE.WITH_DRIVER,
        ownerA,
        { depositMode: DRIVER_DEPOSIT_MODE.PERCENT_30 },
        withDrivers,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  maybe('bật tự nhận CÓ TÀI XẾ đòi gói có tính năng Tài xế VÀ tài xế đang hoạt động', async () => {
    // Gói chưa mở tính năng Tài xế.
    await expect(
      settings.patchServiceSetting(
        tenantA,
        vehicleA,
        SERVICE_TYPE.WITH_DRIVER,
        ownerA,
        { autoAcceptEnabled: true },
        features(),
      ),
    ).rejects.toMatchObject({ status: 409 });

    // Có tính năng nhưng chưa có tài xế nào.
    await expect(
      settings.patchServiceSetting(
        tenantA,
        vehicleA,
        SERVICE_TYPE.WITH_DRIVER,
        ownerA,
        { autoAcceptEnabled: true },
        withDrivers,
      ),
    ).rejects.toMatchObject({ status: 409 });

    await prisma.driver.create({
      data: {
        id: newId(),
        tenantId: tenantA,
        name: 'Tài xế A',
        phone: '0900000001',
        status: 'active',
      },
    });
    const saved = await settings.patchServiceSetting(
      tenantA,
      vehicleA,
      SERVICE_TYPE.WITH_DRIVER,
      ownerA,
      { autoAcceptEnabled: true },
      withDrivers,
    );
    expect(saved.autoAcceptEnabled).toBe(true);
    expect(saved.withDriverAutoAccept?.available).toBe(true);
  });

  maybe('PATCH chỉ đụng trường được gửi — phần còn lại giữ nguyên', async () => {
    await settings.patchServiceSetting(
      tenantA,
      vehicleA,
      SERVICE_TYPE.SELF_DRIVE,
      ownerA,
      {
        autoAcceptEnabled: false,
        autoAcceptMinLeadMinutes: 720,
        identityVerifyMethod: IDENTITY_VERIFY_METHOD.VNEID,
        termsText: 'Điều khoản gốc',
      },
      features(),
    );
    const patched = await settings.patchServiceSetting(
      tenantA,
      vehicleA,
      SERVICE_TYPE.SELF_DRIVE,
      ownerA,
      { autoAcceptEnabled: true },
      features(),
    );
    expect(patched.autoAcceptEnabled).toBe(true);
    expect(patched.autoAcceptMinLeadMinutes).toBe(720);
    expect(patched.identityVerifyMethod).toBe(IDENTITY_VERIFY_METHOD.VNEID);
    expect(patched.termsText).toBe('Điều khoản gốc');
  });

  maybe('mỗi lần ghi để lại một dòng audit của gian hàng', async () => {
    await settings.patchServiceSetting(
      tenantA,
      vehicleA,
      SERVICE_TYPE.SELF_DRIVE,
      ownerA,
      { autoAcceptEnabled: true },
      features(),
    );
    const log = await prisma.auditLog.findFirst({
      where: { tenantId: tenantA, action: 'vehicle.service_settings.update' },
    });
    expect(log?.targetId).toBe(vehicleA);
    expect(log?.actorUserId).toBe(ownerA);
  });
});

describe('Đánh giá tự nhận — hàm thuần, mã chặn nói đúng lý do', () => {
  maybe('từng điều kiện trả đúng mã chặn của nó', async () => {
    const base = await settings.serviceSettingFor(prisma, vehicleA, SERVICE_TYPE.SELF_DRIVE);
    const windows = { pickup: [], return: [] };
    const now = new Date();
    const at = (h: number) => new Date(now.getTime() + h * 3600_000);

    // Chưa bật.
    expect(
      settings.evaluateAutoAccept(base, windows, {
        serviceType: SERVICE_TYPE.SELF_DRIVE,
        pickupAt: at(48),
        returnAt: at(72),
        quoteIsEstimate: false,
        holdRequired: false,
        termsAccepted: true,
        now,
      }),
    ).toBe(AUTO_ACCEPT_BLOCKER.DISABLED);

    const on = {
      ...base,
      autoAcceptEnabled: true,
      autoAcceptMinLeadMinutes: 360,
      autoAcceptMaxLeadMinutes: 10080,
    };
    const input = {
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      quoteIsEstimate: false,
      holdRequired: false,
      termsAccepted: true,
      now,
    };
    expect(
      settings.evaluateAutoAccept(on, windows, { ...input, pickupAt: at(2), returnAt: at(30) }),
    ).toBe(AUTO_ACCEPT_BLOCKER.LEAD_TOO_SHORT);
    expect(
      settings.evaluateAutoAccept(on, windows, {
        ...input,
        pickupAt: at(24 * 30),
        returnAt: at(24 * 31),
      }),
    ).toBe(AUTO_ACCEPT_BLOCKER.LEAD_TOO_LONG);
    expect(
      settings.evaluateAutoAccept(on, windows, {
        ...input,
        pickupAt: at(48),
        returnAt: at(72),
        quoteIsEstimate: true,
      }),
    ).toBe(AUTO_ACCEPT_BLOCKER.QUOTE_ESTIMATE);
    expect(
      settings.evaluateAutoAccept(
        { ...on, requireTermsAcceptance: true, termsText: 'x' },
        windows,
        { ...input, pickupAt: at(48), returnAt: at(72), termsAccepted: false },
      ),
    ).toBe(AUTO_ACCEPT_BLOCKER.TERMS_NOT_ACCEPTED);
    expect(
      settings.evaluateAutoAccept({ ...on, minRentalMinutes: 720 }, windows, {
        ...input,
        pickupAt: at(48),
        returnAt: at(50),
      }),
    ).toBe(AUTO_ACCEPT_BLOCKER.BELOW_MIN_DURATION);
    // Có tài xế + cần giữ chỗ: không hứa tài xế trước hàng giờ (ADR 0028 điều 6).
    expect(
      settings.evaluateAutoAccept(on, windows, {
        ...input,
        serviceType: SERVICE_TYPE.WITH_DRIVER,
        pickupAt: at(48),
        returnAt: at(72),
        holdRequired: true,
      }),
    ).toBe(AUTO_ACCEPT_BLOCKER.HOLD_REQUIRED_WITH_DRIVER);
    // Dài hạn không bao giờ tự nhận.
    expect(
      settings.evaluateAutoAccept(on, windows, {
        ...input,
        serviceType: SERVICE_TYPE.LONG_TERM,
        pickupAt: at(48),
        returnAt: at(72),
      }),
    ).toBe(AUTO_ACCEPT_BLOCKER.SERVICE_NOT_SUPPORTED);
    // Đủ điều kiện.
    expect(
      settings.evaluateAutoAccept(on, windows, { ...input, pickupAt: at(48), returnAt: at(72) }),
    ).toBeNull();
  });

  maybe('preview công khai thấy lịch bận và thiếu tài xế', async () => {
    await settings.patchServiceSetting(
      tenantA,
      vehicleA,
      SERVICE_TYPE.SELF_DRIVE,
      ownerA,
      { autoAcceptEnabled: true, autoAcceptMinLeadMinutes: 60, autoAcceptMaxLeadMinutes: 129600 },
      features(),
    );
    const pickupAt = vnDay(12, 8);
    const returnAt = vnDay(13, 8);
    const input = {
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      pickupAt,
      returnAt,
      quoteIsEstimate: false,
      holdRequired: false,
      termsAccepted: true,
    };
    expect(await settings.previewAutoAccept(vehicleA, input)).toEqual({
      eligible: true,
      blocker: null,
    });

    await bookings.create(tenantA, ownerA, {
      vehicleId: vehicleA,
      customerName: 'Khách chiếm lịch',
      pickupAt: pickupAt.toISOString(),
      returnAt: returnAt.toISOString(),
      baseAmount: '700000',
    });
    expect(await settings.previewAutoAccept(vehicleA, input)).toEqual({
      eligible: false,
      blocker: AUTO_ACCEPT_BLOCKER.SCHEDULE_BUSY,
    });
  });

  maybe('tài xế hết hạn GPLX hoặc đang bận không được chọn', async () => {
    const pickupAt = vnDay(14, 8);
    const returnAt = vnDay(15, 8);

    // GPLX hết hạn TRƯỚC lúc trả xe.
    const expired = newId();
    await prisma.driver.create({
      data: {
        id: expired,
        tenantId: tenantA,
        name: 'Tài xế hết hạn',
        phone: '0900000010',
        status: 'active',
        licenseExpiresAt: vnDay(14, 12),
      },
    });
    expect(await settings.pickAssignableDriver(prisma, tenantA, { pickupAt, returnAt })).toBeNull();

    // Tài xế còn hạn nhưng đã có đơn giao nhau.
    const busy = newId();
    await prisma.driver.create({
      data: {
        id: busy,
        tenantId: tenantA,
        name: 'Tài xế bận',
        phone: '0900000002',
        status: 'active',
      },
    });
    const overlapping = await bookings.create(tenantA, ownerA, {
      vehicleId: vehicleA,
      customerName: 'Khách của tài xế bận',
      pickupAt: pickupAt.toISOString(),
      returnAt: returnAt.toISOString(),
      baseAmount: '700000',
    });
    await prisma.booking.update({ where: { id: overlapping.id }, data: { driverId: busy } });
    expect(await settings.pickAssignableDriver(prisma, tenantA, { pickupAt, returnAt })).toBeNull();

    // Thêm một tài xế rảnh → chọn được.
    await prisma.driver.create({
      data: {
        id: newId(),
        tenantId: tenantA,
        name: 'Aa tài xế rảnh',
        phone: '0900000003',
        status: 'active',
      },
    });
    const picked = await settings.pickAssignableDriver(prisma, tenantA, { pickupAt, returnAt });
    expect(picked?.name).toBe('Aa tài xế rảnh');
  });
});

describe('Phụ phí công bố ≠ phụ phí đã ghi', () => {
  maybe('quy tắc mặc định lưu theo (xe, loại) và đọc lại đúng đơn vị/ngưỡng', async () => {
    const saved = await settings.saveSurchargeRules(tenantA, vehicleA, ownerA, {
      items: [
        {
          kind: DRIVER_SURCHARGE_KIND.OVERTIME,
          enabled: true,
          amount: '80000',
          thresholdValue: 1320,
        },
        { kind: DRIVER_SURCHARGE_KIND.WAITING, enabled: true, amount: '30000', thresholdValue: 30 },
        {
          kind: DRIVER_SURCHARGE_KIND.OVERNIGHT,
          enabled: false,
          amount: '200000',
          thresholdValue: null,
        },
      ],
    });
    const overtime = saved.find((r) => r.kind === DRIVER_SURCHARGE_KIND.OVERTIME);
    expect(overtime?.amount).toBe('80000');
    expect(overtime?.thresholdValue).toBe(1320);
    expect(overtime?.unit).toBe(DRIVER_SURCHARGE_UNIT.PER_HOUR);
    // Màn cấu hình luôn thấy ĐỦ BỐN loại — loại chưa đặt trả về tắt/0, không biến mất khỏi form.
    expect(saved.map((r) => r.kind)).toEqual([...DRIVER_SURCHARGE_KIND_VALUES]);
    expect(saved.find((r) => r.kind === DRIVER_SURCHARGE_KIND.LONG_DISTANCE)).toMatchObject({
      enabled: false,
      amount: '0',
    });

    // Nhưng snapshot công bố cho khách CHỈ mang quy tắc đang bật.
    const snapshot = await settings.rentalTermsSnapshotFor(
      prisma,
      vehicleA,
      SERVICE_TYPE.WITH_DRIVER,
      null,
    );
    expect(snapshot.surchargeRules.map((r) => r.kind).sort()).toEqual(
      [DRIVER_SURCHARGE_KIND.OVERTIME, DRIVER_SURCHARGE_KIND.WAITING].sort(),
    );
    // Tự lái không có phụ phí tài xế nào.
    const selfDrive = await settings.rentalTermsSnapshotFor(
      prisma,
      vehicleA,
      SERVICE_TYPE.SELF_DRIVE,
      null,
    );
    expect(selfDrive.surchargeRules).toEqual([]);
  });

  maybe('bật một loại phụ phí mà để số tiền 0 là vô nghĩa — server từ chối', async () => {
    await expect(
      settings.saveSurchargeRules(tenantA, vehicleA, ownerA, {
        items: [
          { kind: DRIVER_SURCHARGE_KIND.WAITING, enabled: true, amount: '0', thresholdValue: 30 },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });

    // Ngưỡng của loại không có ngưỡng, và mốc giờ vượt một ngày cũng bị chặn.
    await expect(
      settings.saveSurchargeRules(tenantA, vehicleA, ownerA, {
        items: [
          {
            kind: DRIVER_SURCHARGE_KIND.OVERNIGHT,
            enabled: true,
            amount: '200000',
            thresholdValue: 10,
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      settings.saveSurchargeRules(tenantA, vehicleA, ownerA, {
        items: [
          {
            kind: DRIVER_SURCHARGE_KIND.OVERTIME,
            enabled: true,
            amount: '80000',
            thresholdValue: 5000,
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  maybe('sửa quy tắc SAU khi đơn tồn tại không đụng khoản phát sinh đã ghi', async () => {
    await settings.saveSurchargeRules(tenantA, vehicleA, ownerA, {
      items: [
        { kind: DRIVER_SURCHARGE_KIND.WAITING, enabled: true, amount: '30000', thresholdValue: 30 },
      ],
    });
    const booking = await bookings.create(tenantA, ownerA, {
      vehicleId: vehicleA,
      customerName: 'Khách phụ phí',
      pickupAt: vnDay(20, 8).toISOString(),
      returnAt: vnDay(21, 8).toISOString(),
      baseAmount: '700000',
    });
    // Khoản THẬT trên đơn — con số do người ghi quyết định, không phải quy tắc.
    await prisma.bookingSurcharge.create({
      data: {
        id: newId(),
        tenantId: tenantA,
        bookingId: booking.id,
        category: SURCHARGE_CATEGORY.WAITING,
        amount: new Prisma.Decimal('45000'),
        reason: 'Chờ khách 90 phút',
        createdBy: ownerA,
      },
    });

    // Chủ xe đổi quy tắc sau đó.
    await settings.saveSurchargeRules(tenantA, vehicleA, ownerA, {
      items: [
        { kind: DRIVER_SURCHARGE_KIND.WAITING, enabled: true, amount: '99000', thresholdValue: 15 },
      ],
    });

    const recorded = await prisma.bookingSurcharge.findFirstOrThrow({
      where: { bookingId: booking.id },
    });
    expect(recorded.amount.toFixed(0)).toBe('45000');
    expect(recorded.category).toBe(SURCHARGE_CATEGORY.WAITING);
  });

  maybe('snapshot điều kiện thuê đóng băng lúc tạo, đổi thiết lập sau không ghi đè', async () => {
    await settings.patchServiceSetting(
      tenantA,
      vehicleA,
      SERVICE_TYPE.SELF_DRIVE,
      ownerA,
      { termsText: 'Bản A', identityVerifyMethod: IDENTITY_VERIFY_METHOD.IN_PERSON },
      features(),
    );
    const frozen = await settings.rentalTermsSnapshotFor(
      prisma,
      vehicleA,
      SERVICE_TYPE.SELF_DRIVE,
      null,
    );
    expect(frozen?.termsText).toBe('Bản A');

    await settings.patchServiceSetting(
      tenantA,
      vehicleA,
      SERVICE_TYPE.SELF_DRIVE,
      ownerA,
      { termsText: 'Bản B' },
      features(),
    );
    // Bản đã lấy ra vẫn là "Bản A" — snapshot là dữ liệu, không phải con trỏ tới cấu hình.
    expect(frozen?.termsText).toBe('Bản A');
    const now = await settings.rentalTermsSnapshotFor(
      prisma,
      vehicleA,
      SERVICE_TYPE.SELF_DRIVE,
      null,
    );
    expect(now?.termsText).toBe('Bản B');
  });
});
