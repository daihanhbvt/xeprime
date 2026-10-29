import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  APPROVAL_ACTION,
  APPROVAL_STATUS,
  APPROVAL_TARGET_TYPE,
  AUTO_ACCEPT_BLOCKER,
  COLLATERAL_MODE,
  CUSTOMER_DOCUMENT_TYPE,
  DRIVER_DEPOSIT_MODE,
  DRIVER_SURCHARGE_KIND,
  DRIVER_SURCHARGE_KIND_VALUES,
  DRIVER_SURCHARGE_UNIT,
  HANDOVER_WINDOW_KIND,
  IDENTITY_VERIFY_METHOD,
  MEMBERSHIP_STATUS,
  ROUTE_TYPE,
  SERVICE_TYPE,
  SURCHARGE_CATEGORY,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  DRIVER_LINK_STATUS,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { buildVehicleReviewSnapshot } from '../src/modules/vehicles/vehicle-review-snapshot';
import { VehicleSettingsService } from '../src/modules/vehicle-settings/vehicle-settings.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeBookingsService,
  makeDriversService,
  makePricingService,
} from './helpers/service-factory';
import { cleanupDriverAccounts, seedDriverLink } from './helpers/driver-link';

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
 *  5. **Phụ phí tài xế đã gỡ** (ADR 0075): đọc trả bốn loại đều tắt, lưu bị từ chối, snapshot mới
 *     không còn phụ phí; khoản đã ghi trên đơn cũ giữ nguyên số.
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;

const audit = new AuditService(asService);
const settings = new VehicleSettingsService(
  asService,
  audit,
  new OccupancyService(asService),
  new ListingsService(asService),
  makeDriversService(asService),
);
const bookings = makeBookingsService(asService);

const RUN = newId().slice(-8).toLowerCase();

/** Gói bật/tắt tính năng — `listServiceSettings`/`patchServiceSetting` nhận map này từ guard. */

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
    data: {
      realm: ACCOUNT_REALM.PARTNER,
      id: ownerId,
      displayName: `Chủ ${label}`,
      email: `vset-${label}-${RUN}@xeprime.test`,
    },
  });
  await prisma.tenant.create({
    data: {
      id: tenantId,
      code: `T-${tenantId.slice(-8)}`,
      slug: `t-${tenantId.toLowerCase().slice(-10)}`,
      name: `VSetShop-${label}-${RUN}`,
      status: TENANT_STATUS.ACTIVE,
      ownerUserId: ownerId,
      // Tiền công tài xế/ngày mặc định (ADR 0075) — tự gán "Đặt ngay" cần một số để mời tài xế.
      driverDailyWage: new Prisma.Decimal('500000'),
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
    await cleanupDriverAccounts(asService);
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
    await expect(settings.listServiceSettings(tenantB, vehicleA)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      settings.patchServiceSetting(tenantB, vehicleA, SERVICE_TYPE.SELF_DRIVE, ownerB, {}),
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
  maybe('bắt đồng ý điều khoản thì phải có nội dung điều khoản', async () => {
    await expect(
      settings.patchServiceSetting(tenantA, vehicleA, SERVICE_TYPE.SELF_DRIVE, ownerA, {
        requireTermsAcceptance: true,
      }),
    ).rejects.toMatchObject({ status: 400 });

    const ok = await settings.patchServiceSetting(
      tenantA,
      vehicleA,
      SERVICE_TYPE.SELF_DRIVE,
      ownerA,
      { requireTermsAcceptance: true, termsText: 'Không hút thuốc trong xe.' },
    );
    expect(ok.requireTermsAcceptance).toBe(true);
  });

  maybe('"giấy tờ khác" không định danh được ai — không nhận làm yêu cầu bắt buộc', async () => {
    await expect(
      settings.patchServiceSetting(tenantA, vehicleA, SERVICE_TYPE.SELF_DRIVE, ownerA, {
        requiredDocuments: [CUSTOMER_DOCUMENT_TYPE.OTHER],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  maybe('hộ chiếu cộng vào bộ giấy tờ HIỆU LỰC, GPLX theo luật vẫn còn', async () => {
    const saved = await settings.patchServiceSetting(
      tenantA,
      vehicleA,
      SERVICE_TYPE.SELF_DRIVE,
      ownerA,
      { requiredDocuments: [CUSTOMER_DOCUMENT_TYPE.PASSPORT] },
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
    );
    expect(saved.minRentalMinutes).toBeNull();
    expect(saved.preferredRouteTypes).toEqual([]);
    expect(saved.depositMode).toBe(DRIVER_DEPOSIT_MODE.NONE);
  });

  maybe('dịch vụ dài hạn không có thiết lập riêng — từ chối ngay', async () => {
    await expect(
      settings.patchServiceSetting(tenantA, vehicleA, SERVICE_TYPE.LONG_TERM, ownerA, {
        autoAcceptEnabled: true,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  maybe('cọc 30%/50% chưa có luồng thu — server từ chối ghi', async () => {
    await expect(
      settings.patchServiceSetting(tenantA, vehicleA, SERVICE_TYPE.WITH_DRIVER, ownerA, {
        depositMode: DRIVER_DEPOSIT_MODE.PERCENT_30,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  maybe(
    'bật tự nhận CÓ TÀI XẾ đòi một tài xế đang liên kết (không còn gác theo gói — ADR 0063)',
    async () => {
      // Chưa có tài xế nào.
      await expect(
        settings.patchServiceSetting(tenantA, vehicleA, SERVICE_TYPE.WITH_DRIVER, ownerA, {
          autoAcceptEnabled: true,
        }),
      ).rejects.toMatchObject({ status: 409 });

      await seedDriverLink(asService, { tenantId: tenantA, name: 'Tài xế A' });
      const saved = await settings.patchServiceSetting(
        tenantA,
        vehicleA,
        SERVICE_TYPE.WITH_DRIVER,
        ownerA,
        { autoAcceptEnabled: true },
      );
      expect(saved.autoAcceptEnabled).toBe(true);
      expect(saved.withDriverAutoAccept?.available).toBe(true);
    },
  );

  maybe('PATCH chỉ đụng trường được gửi — phần còn lại giữ nguyên', async () => {
    await settings.patchServiceSetting(tenantA, vehicleA, SERVICE_TYPE.SELF_DRIVE, ownerA, {
      autoAcceptEnabled: false,
      identityVerifyMethod: IDENTITY_VERIFY_METHOD.VNEID,
      termsText: 'Điều khoản gốc',
    });
    const patched = await settings.patchServiceSetting(
      tenantA,
      vehicleA,
      SERVICE_TYPE.SELF_DRIVE,
      ownerA,
      { autoAcceptEnabled: true },
    );
    expect(patched.autoAcceptEnabled).toBe(true);
    expect(patched.identityVerifyMethod).toBe(IDENTITY_VERIFY_METHOD.VNEID);
    expect(patched.termsText).toBe('Điều khoản gốc');
  });

  maybe('mỗi lần ghi để lại một dòng audit của gian hàng', async () => {
    await settings.patchServiceSetting(tenantA, vehicleA, SERVICE_TYPE.SELF_DRIVE, ownerA, {
      autoAcceptEnabled: true,
    });
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
      }),
    ).toBe(AUTO_ACCEPT_BLOCKER.DISABLED);

    const on = { ...base, autoAcceptEnabled: true };
    const input = {
      serviceType: SERVICE_TYPE.SELF_DRIVE,
      quoteIsEstimate: false,
      holdRequired: false,
      termsAccepted: true,
    };
    /*
     * KHÔNG còn mốc đặt trước (17/09/2026). Hai ca này từng là LEAD_TOO_SHORT / LEAD_TOO_LONG —
     * giữ lại đúng chúng và lật kỳ vọng, vì đây là thứ dễ bị cài lại nhất: đặt sau 2 giờ và đặt
     * trước 30 ngày đều phải tự nhận.
     */
    expect(
      settings.evaluateAutoAccept(on, windows, { ...input, pickupAt: at(2), returnAt: at(30) }),
    ).toBeNull();
    expect(
      settings.evaluateAutoAccept(on, windows, {
        ...input,
        pickupAt: at(24 * 30),
        returnAt: at(24 * 31),
      }),
    ).toBeNull();
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
    await settings.patchServiceSetting(tenantA, vehicleA, SERVICE_TYPE.SELF_DRIVE, ownerA, {
      autoAcceptEnabled: true,
    });
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

  maybe('hasAvailableDriver: tài xế đang bận hoặc tạm khoá không tính là rảnh', async () => {
    const pickupAt = vnDay(14, 8);
    const returnAt = vnDay(15, 8);
    const window = { pickupAt, returnAt };
    expect(await settings.hasAvailableDriver(prisma, tenantA, window)).toBe(false);

    // Tạm khoá không được gán → không rảnh.
    await seedDriverLink(asService, {
      tenantId: tenantA,
      name: 'Tài xế tạm khoá',
      linkStatus: DRIVER_LINK_STATUS.SUSPENDED,
    });
    expect(await settings.hasAvailableDriver(prisma, tenantA, window)).toBe(false);

    // Tài xế đang liên kết nhưng đã có đơn giao nhau (kể cả lượt gán còn chờ nhận).
    const busy = await seedDriverLink(asService, { tenantId: tenantA, name: 'Tài xế bận' });
    const overlapping = await bookings.create(tenantA, ownerA, {
      vehicleId: vehicleA,
      customerName: 'Khách của tài xế bận',
      serviceType: SERVICE_TYPE.WITH_DRIVER,
      routeType: 'in_city',
      pickupAddress: '1 Lê Lợi',
      pickupAt: pickupAt.toISOString(),
      returnAt: returnAt.toISOString(),
      baseAmount: '700000',
    });
    await bookings.assignDriver(tenantA, overlapping.id, ownerA, busy.driverId);
    expect(await settings.hasAvailableDriver(prisma, tenantA, window)).toBe(false);

    // Thêm một tài xế rảnh → có.
    await seedDriverLink(asService, { tenantId: tenantA, name: 'Tài xế rảnh' });
    expect(await settings.hasAvailableDriver(prisma, tenantA, window)).toBe(true);
  });
});

describe('Phụ phí tài xế đã gỡ — ADR 0075 điều 7', () => {
  maybe('đọc trả đủ bốn loại đều TẮT; lưu bị từ chối DRIVER_SURCHARGE_RETIRED', async () => {
    const rules = await settings.listSurchargeRules(tenantA, vehicleA);
    // App đã phát hành vẫn nhận đúng hình dạng cũ — bốn loại, không loại nào bật.
    expect(rules.map((r) => r.kind)).toEqual([...DRIVER_SURCHARGE_KIND_VALUES]);
    expect(rules.every((r) => !r.enabled && r.amount === '0')).toBe(true);
    expect(rules.find((r) => r.kind === DRIVER_SURCHARGE_KIND.OVERTIME)?.unit).toBe(
      DRIVER_SURCHARGE_UNIT.PER_HOUR,
    );

    await expect(
      settings.saveSurchargeRules(tenantA, vehicleA, ownerA, {
        items: [
          {
            kind: DRIVER_SURCHARGE_KIND.WAITING,
            enabled: true,
            amount: '30000',
            thresholdValue: 30,
          },
        ],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: API_ERROR_CODE.DRIVER_SURCHARGE_RETIRED }),
    });
    // Xe của gian hàng khác vẫn 404 trước — không lộ "xe có tồn tại".
    await expect(
      settings.saveSurchargeRules(tenantB, vehicleA, ownerB, { items: [] }),
    ).rejects.toMatchObject({
      status: 404,
    });
  });

  maybe('snapshot điều kiện thuê không còn phụ phí — cả có tài lẫn tự lái', async () => {
    for (const service of [SERVICE_TYPE.WITH_DRIVER, SERVICE_TYPE.SELF_DRIVE]) {
      const snapshot = await settings.rentalTermsSnapshotFor(prisma, vehicleA, service, null);
      expect(snapshot.surchargeRules).toEqual([]);
    }
  });

  maybe('khoản phụ phí ĐÃ GHI trên đơn cũ giữ nguyên số', async () => {
    const booking = await bookings.create(tenantA, ownerA, {
      vehicleId: vehicleA,
      customerName: 'Khách phụ phí',
      pickupAt: vnDay(20, 8).toISOString(),
      returnAt: vnDay(21, 8).toISOString(),
      baseAmount: '700000',
    });
    // Khoản THẬT ghi trước khi gỡ (dữ liệu cũ) — đọc lại đúng số, đúng danh mục.
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
    const recorded = await prisma.bookingSurcharge.findFirstOrThrow({
      where: { bookingId: booking.id },
    });
    expect(recorded.amount.toFixed(0)).toBe('45000');
    expect(recorded.category).toBe(SURCHARGE_CATEGORY.WAITING);
  });

  maybe('snapshot điều kiện thuê đóng băng lúc tạo, đổi thiết lập sau không ghi đè', async () => {
    await settings.patchServiceSetting(tenantA, vehicleA, SERVICE_TYPE.SELF_DRIVE, ownerA, {
      termsText: 'Bản A',
      identityVerifyMethod: IDENTITY_VERIFY_METHOD.IN_PERSON,
    });
    const frozen = await settings.rentalTermsSnapshotFor(
      prisma,
      vehicleA,
      SERVICE_TYPE.SELF_DRIVE,
      null,
    );
    expect(frozen?.termsText).toBe('Bản A');

    await settings.patchServiceSetting(tenantA, vehicleA, SERVICE_TYPE.SELF_DRIVE, ownerA, {
      termsText: 'Bản B',
    });
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

/*
 * Đường ghi THỨ BA của "phiếu duyệt mang bản mới nhất" (24/09/2026).
 *
 * `VehicleSettingsModule` là module LÁ — nó cố ý không import VehiclesModule/PricingModule để
 * không tạo vòng Nest, nên nó gọi hàm THUẦN `refreshPendingApprovalSnapshot`. Test này tồn tại
 * vì đó chính là đường dễ bị quên nhất: hai đường kia nằm trong `VehiclesService` cạnh chỗ tạo
 * phiếu, còn đường này ở một module khác hẳn.
 *
 * Điều kiện thuê (`termsText`) là thứ KHÁCH đọc trước khi đặt, nên để nó trôi khỏi snapshot là
 * để người duyệt phê chuẩn một bộ điều khoản chưa ai xem.
 */
describe('Sửa thiết lập dịch vụ khi phiếu duyệt còn chờ', () => {
  maybe('phiếu mang điều kiện mới, và KHÔNG mất chính sách thuê', async () => {
    // Chính sách thuê của xe — phần mà đường ghi này không nạp lại được (`policy: 'unchanged'`).
    await prisma.rentalPolicy.create({
      data: {
        id: newId(),
        tenantId: tenantA,
        vehicleId: vehicleA,
        collateralMode: COLLATERAL_MODE.NONE,
        depositAmount: 0,
        deliveryEnabled: true,
        deliveryMaxRadiusKm: 25,
        includedDistanceKmPerDay: 300,
        excessDistanceFeePerKm: 3000,
      },
    });

    const snapshot = await buildVehicleReviewSnapshot(prisma, {
      vehicleId: vehicleA,
      policy: await makePricingService(asService).effectivePolicy(tenantA, vehicleA),
      now: new Date(),
    });
    expect(snapshot?.policy).not.toBeNull();

    const taskId = newId();
    await prisma.approvalTask.create({
      data: {
        id: taskId,
        tenantId: tenantA,
        targetType: APPROVAL_TARGET_TYPE.VEHICLE,
        targetId: vehicleA,
        status: APPROVAL_STATUS.PENDING,
        submittedBy: ownerA,
        snapshot: snapshot as never,
      },
    });
    await prisma.approvalVehicleSubject.create({
      data: {
        approvalTaskId: taskId,
        vehicleId: vehicleA,
        vehicleType: snapshot!.vehicle.vehicleType,
        name: snapshot!.vehicle.name,
        code: snapshot!.vehicle.code,
        plateNumber: snapshot!.vehicle.plateNumber,
        storefrontKind: snapshot!.source.storefrontKind,
        sourceName: snapshot!.source.name,
      },
    });

    await settings.patchServiceSetting(tenantA, vehicleA, SERVICE_TYPE.SELF_DRIVE, ownerA, {
      termsText: `Không hút thuốc trong xe ${RUN}`,
    });

    const task = await prisma.approvalTask.findUniqueOrThrow({
      where: { id: taskId },
      select: { snapshot: true, logs: { select: { action: true } } },
    });
    const next = task.snapshot as unknown as NonNullable<typeof snapshot>;

    expect(next.services.find((s) => s.serviceType === SERVICE_TYPE.SELF_DRIVE)?.termsText).toBe(
      `Không hút thuốc trong xe ${RUN}`,
    );
    // Chính sách mang sang nguyên vẹn — không bị `null` hoá vì đường ghi này không nạp được nó.
    expect(next.policy).toEqual(snapshot!.policy);
    expect(task.logs.map((l) => l.action)).toEqual([APPROVAL_ACTION.PROFILE_UPDATED]);
  });
});
