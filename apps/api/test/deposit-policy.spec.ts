import { ForbiddenException } from '@nestjs/common';
import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  ACCOUNT_REALM,
  API_ERROR_CODE,
  BILLING_MODE,
  BOOKING_HOLD_STATUS,
  BOOKING_REQUEST_DECISION_SOURCE,
  BOOKING_REQUEST_STATUS,
  DEPOSIT_COLLECTION_MODE,
  DEPOSIT_POLICY_REASON,
  MEMBERSHIP_STATUS,
  PLAN_FEATURE,
  PLAN_STATUS,
  SERVICE_TYPE,
  SUBSCRIPTION_STATUS,
  TENANT_ROLE,
  TENANT_STATUS,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { AuditService } from '../src/modules/audit/audit.service';
import { OccupancyService } from '../src/modules/calendar/occupancy.service';
import { VehicleSettingsService } from '../src/modules/vehicle-settings/vehicle-settings.service';
import { ListingsService } from '../src/modules/public-listings/listings.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { customerAccountFor } from './helpers/customer-account';
import {
  makeBookingHoldsService,
  makeBookingRequestsService,
  makeDepositPolicyService,
  makeNotificationService,
  makePricingService,
  makeDriversService,
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
const settings = new VehicleSettingsService(asService, audit, occupancy, new ListingsService(asService), makeDriversService(asService));
const depositPolicy = makeDepositPolicyService(asService);
/** Đường tiền THẬT của khoản giữ chỗ — dùng để chứng minh hold cũ vẫn chốt được sau khi công tắc đổi. */
const holds = makeBookingHoldsService(asService);
/**
 * Bản DỰNG RIÊNG với `platformMandatory = false` — luật hai trục của ADR 0027 điều 2.
 *
 * Giai đoạn 16/09/2026 bắt cả sàn thu cọc, nên `depositPolicy` (bản production) không còn đi
 * qua nhánh tuyến/gói nào nữa. Xoá các ca đó đi thì ngày mở lại công tắc là ngày một luật về
 * tiền quay lại mà không còn test nào canh — nên chúng ở lại, chạy trên instance này.
 */
const twoAxis = makeDepositPolicyService(asService, { platformMandatory: false });

const requests = makeBookingRequestsService(asService, {
  audit,
  notifications,
  occupancy,
  settings,
});

/**
 * Đường duyệt dựng trên `twoAxis` — dùng cho các khối "khi giai đoạn kết thúc".
 *
 * `pricing` phải dựng từ CHÍNH `twoAxis` đó: `commitDecision` đóng băng con số mà `pricing`
 * tính, nên một bên nói "có thu cọc" còn bên kia nói "không" sẽ đẻ ra đơn có
 * `deposit_collection_mode` không khớp số tiền của chính nó — một tổ hợp không tồn tại ở
 * production, và một spec xanh vì lý do sai.
 */
const twoAxisRequests = makeBookingRequestsService(asService, {
  audit,
  notifications,
  occupancy,
  settings,
  depositPolicy: twoAxis,
  pricing: makePricingService(asService, { depositPolicy: twoAxis }),
});

const RUN = newId().slice(-8).toLowerCase();
const DAY = 24 * 3600_000;

let dbAvailable = false;
let phoneCounter = 0;
const nextPhone = () => `0977${String(100000 + ++phoneCounter).slice(-6)}`;

/** Tài khoản khách đã gửi yêu cầu trong spec — dọn ở `afterAll`. */
const customerIds = new Set<string>();
/**
 * Người gửi yêu cầu: một tài khoản KHÁCH đã xác minh SĐT (ADR 0060) — mỗi lượt gửi một số mới,
 * tức một người mới, nên trần chỗ giữ chưa trả của một khách không dính vào chính sách cọc.
 */
async function customer(name: string, phone: string): Promise<string> {
  const id = await customerAccountFor(asService, phone, name);
  customerIds.add(id);
  return id;
}

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
    data: {
      realm: ACCOUNT_REALM.PARTNER,
      id: owner,
      displayName: `Chủ ${label}`,
      email: `dep-${label}-${RUN}@xeprime.test`,
    },
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
      commissionPercent: billingMode === BILLING_MODE.COMMISSION ? new Prisma.Decimal(10) : null,
      basePriceMonthly: new Prisma.Decimal(0),
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

/**
 * `via` mặc định là đường production. Khối "khi giai đoạn kết thúc" phải truyền
 * `twoAxisRequests`: gửi bằng một instance rồi duyệt bằng instance kia nghĩa là hold sinh ra
 * theo luật này còn đơn được duyệt theo luật kia — một tổ hợp không tồn tại ở production.
 */
async function submit(shop: Shop, offsetDays = 5, via = requests) {
  return via.submitPublic(
    {
      vehicleId: shop.vehicle,
      pickupAt: vnAt(offsetDays, 9).toISOString(),
      returnAt: vnAt(offsetDays + 2, 9).toISOString(),
    },
    await customer('Nguyễn Văn A', nextPhone()),
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
    await prisma.user.deleteMany({ where: { id: { in: [...customerIds] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

describe('DepositPolicyService.resolveForTenant — GIAI ĐOẠN cả sàn thu cọc', () => {
  /**
   * Công tắc của gian hàng và năng lực gói đều KHÔNG có tiếng nói nào trong giai đoạn này.
   *
   * Đặt công tắc `false` ở cả ba hình dạng gian hàng để chứng minh kết quả không phải trùng
   * hợp: tuyến hoa hồng (vốn đã bắt buộc), tuyến gói có cờ (trước đây sẽ TẮT), và tuyến gói
   * THIẾU cờ (trước đây bị chặn bởi năng lực gói).
   */
  maybe('mọi gian hàng đều THU, công tắc khoá, lý do nói đúng là luật của SÀN', async () => {
    for (const shop of [commission, packagePlus, packageBasic]) {
      await setToggle(shop.tenant, false);
      const r = await depositPolicy.resolveForTenant(shop.tenant);

      expect(r.required).toBe(true);
      expect(r.editable).toBe(false);
      expect(r.reason).toBe(DEPOSIT_POLICY_REASON.PLATFORM_MANDATORY);
    }
  });

  /**
   * `toggleEnabled` phải trả GIÁ TRỊ ĐANG LƯU, không phải `true` cho đẹp.
   *
   * Đó là lựa chọn gian hàng sẽ quay về khi công tắc mở lại; một API nói dối về nó sẽ làm màn
   * cấu hình hiện sai đúng vào ngày đó — và migration 20260916120000 ghi `true` cho tất cả
   * chính là để giá trị đó có nghĩa.
   */
  maybe('vẫn báo đúng giá trị công tắc ĐANG LƯU, dù nó không còn tác dụng', async () => {
    await setToggle(packagePlus.tenant, false);
    expect((await depositPolicy.resolveForTenant(packagePlus.tenant)).toggleEnabled).toBe(false);

    await setToggle(packagePlus.tenant, true);
    expect((await depositPolicy.resolveForTenant(packagePlus.tenant)).toggleEnabled).toBe(true);
  });

  /** Chưa xác định được tuyến vẫn thắng: không đoán tiền trên một danh mục gói hỏng. */
  maybe('KHÔNG lấn lên nhánh chưa xác định được tuyến', async () => {
    /*
     * Xoá hẳn dòng thuê bao thay vì đẩy `ends_at` về quá khứ: CHECK
     * `tenant_subscriptions_ends_after_starts` không cho một kỳ kết thúc trước khi bắt đầu, và
     * "gian hàng chưa có gói nào" mới đúng là tình huống cần dựng ở đây.
     */
    const saved = await prisma.tenantSubscription.findMany({
      where: { tenantId: packageBasic.tenant },
    });
    await prisma.tenantSubscription.deleteMany({ where: { tenantId: packageBasic.tenant } });
    try {
      const r = await depositPolicy.resolveForTenant(packageBasic.tenant);
      expect(r.billingMode).toBeNull();
      expect(r.required).toBe(false);
      expect(r.reason).toBe(DEPOSIT_POLICY_REASON.BILLING_NOT_CONFIGURED);
    } finally {
      // `quotaJson` nullable làm kiểu của `createMany` không nhận lại nguyên bản vừa đọc ra;
      // dựng lại từng dòng là cách gọn nhất mà vẫn giữ đúng dữ liệu cũ.
      for (const row of saved) {
        await prisma.tenantSubscription.create({
          data: { ...row, quotaJson: row.quotaJson ?? Prisma.JsonNull },
        });
      }
    }
  });

  maybe('PATCH bị chặn cho MỌI tuyến, kể cả gói có đủ cờ', async () => {
    for (const shop of [commission, packagePlus, packageBasic]) {
      await expect(
        depositPolicy.updateSettings(shop.tenant, shop.owner, false),
      ).rejects.toMatchObject({
        constructor: ForbiddenException,
        response: { code: API_ERROR_CODE.DEPOSIT_ALWAYS_REQUIRED },
      });
    }
  });
});

describe('DepositPolicyService.resolveForTenant — hai trục, kiểm nối tiếp (khi giai đoạn kết thúc)', () => {
  maybe('tuyến hoa hồng: BẮT BUỘC, khoá, và công tắc không có tiếng nói nào', async () => {
    // Bật công tắc thành `false` để chứng minh nó bị BỎ QUA, không phải "tình cờ cùng kết quả".
    await setToggle(commission.tenant, false);
    const r = await twoAxis.resolveForTenant(commission.tenant);

    expect(r.billingMode).toBe(BILLING_MODE.COMMISSION);
    expect(r.required).toBe(true);
    expect(r.editable).toBe(false);
    expect(r.reason).toBe(DEPOSIT_POLICY_REASON.COMMISSION_MANDATORY);
  });

  maybe('tuyến gói có cờ, chưa ai bấm: TẮT — vắng dòng là câu trả lời đủ', async () => {
    const r = await twoAxis.resolveForTenant(packagePlus.tenant);

    expect(r.required).toBe(false);
    expect(r.planAllows).toBe(true);
    expect(r.editable).toBe(true);
    expect(r.reason).toBe(DEPOSIT_POLICY_REASON.PACKAGE_DISABLED);
  });

  maybe('tuyến gói có cờ, đã bật: THU', async () => {
    await setToggle(packagePlus.tenant, true);
    const r = await twoAxis.resolveForTenant(packagePlus.tenant);

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
    const r = await twoAxis.resolveForTenant(packageBasic.tenant);

    expect(r.required).toBe(false);
    expect(r.planAllows).toBe(false);
    expect(r.toggleEnabled).toBe(true);
    expect(r.editable).toBe(false);
    expect(r.reason).toBe(DEPOSIT_POLICY_REASON.PACKAGE_FEATURE_MISSING);
  });
});

describe('PATCH /shop/payment-settings — chặn thật ở service (khi giai đoạn kết thúc)', () => {
  maybe('tuyến hoa hồng gọi thẳng vào: 403 DEPOSIT_ALWAYS_REQUIRED', async () => {
    await expect(
      twoAxis.updateSettings(commission.tenant, commission.owner, false),
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
      twoAxis.updateSettings(packageBasic.tenant, packageBasic.owner, true),
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
    const r = await twoAxis.updateSettings(packagePlus.tenant, packagePlus.owner, true);
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

/*
 * BA KHỐI DƯỚI ĐÂY chạy trên `twoAxisRequests` — tức luật HAI TRỤC của ADR 0027 điều 2.
 *
 * Trong giai đoạn cả sàn thu cọc chúng KHÔNG mô tả hành vi đang chạy (mọi gian hàng đều thu cọc),
 * nhưng chúng mô tả hành vi sẽ quay lại nguyên vẹn khi `platformMandatory` về `false`.
 * Hành vi ĐANG chạy được khoá ở khối "GIAI ĐOẠN cả sàn thu cọc" phía trên.
 *
 * LUỒNG TIỀN v2 (ADR 0064, chính sách phí v7) đổi nghĩa của "TẮT cọc": nó không còn là "không thu
 * đồng nào" nữa. Phí sàn `S` áp ở CẢ HAI tuyến và thuế `T` khấu trừ từ chủ xe ở cả hai tuyến, nên
 * XePrime vẫn phải cầm phần KHÔNG phải tiền của chủ xe (`S + H + IV + IP + T`) — tắt cọc chỉ bỏ
 * phần giữ chỗ của chủ xe `D`, không bỏ sàn đó (ADR 0064 điều 5). Hệ quả: chuyến tuyến gói tắt cọc VẪN đi qua
 * `awaiting_hold` với một mã QR, chỉ là nhỏ hơn. Nhánh `direct` của `commitDecision` chỉ còn cho
 * chuyến không có số tiền online nào (báo giá tạm tính, hoặc chính sách mà sàn đó bằng 0).
 *
 * Số liệu chung của fixture (chính sách v9 đang active — ADR 0066 · 0068):
 *   ô tô, 700.000đ/ngày × 2 ngày ⇒ B = 1.400.000 · không phí giao (G = 0)
 *   S = 50.000 (phí sàn cố định ô tô, cả hai tuyến)
 *   T = GTGT 5% × B 70.000 + TNCN 2% × B 28.000 = 98.000 (tự lái, gian hàng chưa có hồ sơ người
 *       bán ⇒ cá nhân — ADR 0068; khấu trừ từ chủ xe, không cộng vào tổng khách)
 *   H = 10% × B = 140.000 ở tuyến hoa hồng (cả 2 ngày nằm ở nấc 1–2) · 0 ở tuyến gói
 *   IV = IP = 0 — khách KHÔNG tích bảo hiểm nào (tuỳ chọn, mặc định không chọn — ADR 0064 điều 10)
 *   Phần giữ chỗ của chủ xe D = 15% × B = 210.000 (trên TIỀN THUÊ, không sàn tiền)
 *   Tiền giữ chỗ = S + H + IV + IP + D: 400.000 ở tuyến hoa hồng · 260.000 ở tuyến gói bật cọc
 */

/** Hold DUY NHẤT của một gian hàng trong ca đang chạy (`afterEach` dọn sạch giữa các ca). */
async function onlyHold(tenantId: string) {
  expect(await prisma.bookingHold.count({ where: { tenantId } })).toBe(1);
  return prisma.bookingHold.findFirstOrThrow({ where: { tenantId } });
}

/**
 * Tuyến gói KHÔNG thu cọc (tắt công tắc, hoặc gói thiếu `escrow_hold`): khoản online đúng bằng
 * sàn và không hơn.
 *
 *   sàn = S + H + IV + IP + T = 50.000 + 0 + 0 + 0 + 98.000 = 148.000 (> holdMin 20.000)
 *   D   = 148.000 − S − H − IV − IP = 98.000 = T   ⇒ ví chủ xe nhận D − T = 0 cho phần online
 */
function expectPackageFloorOnly(hold: {
  depositAmount: Prisma.Decimal;
  serviceFeeAmount: Prisma.Decimal;
  ownerCommissionAmount: Prisma.Decimal;
  vehicleInsuranceAmount: Prisma.Decimal;
  personalInsuranceAmount: Prisma.Decimal;
  amount: Prisma.Decimal;
}) {
  expect(hold.depositAmount.toFixed(0)).toBe('98000');
  expect(hold.serviceFeeAmount.toFixed(0)).toBe('50000');
  expect(hold.ownerCommissionAmount.toFixed(0)).toBe('0');
  expect(hold.vehicleInsuranceAmount.toFixed(0)).toBe('0');
  expect(hold.personalInsuranceAmount.toFixed(0)).toBe('0');
  expect(hold.amount.toFixed(0)).toBe('148000');
}

/** Các dòng tiền đã ĐÓNG BĂNG trên một đơn — so trước/sau một lượt đổi công tắc. */
function bookingMoney(b: {
  serviceFeeAmount: Prisma.Decimal;
  ownerCommissionAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  depositAmountOnline: Prisma.Decimal | null;
  ownerPayableAmount: Prisma.Decimal | null;
  customerTotalAmount: Prisma.Decimal | null;
  depositCollectionMode: string | null;
}) {
  return {
    serviceFee: b.serviceFeeAmount.toFixed(0),
    commission: b.ownerCommissionAmount.toFixed(0),
    tax: b.taxAmount.toFixed(0),
    online: b.depositAmountOnline?.toFixed(0) ?? null,
    ownerPayable: b.ownerPayableAmount?.toFixed(0) ?? null,
    customerTotal: b.customerTotalAmount?.toFixed(0) ?? null,
    mode: b.depositCollectionMode,
  };
}

describe('Duyệt TAY áp đúng chính sách (khi giai đoạn kết thúc)', () => {
  maybe('gói + TẮT cọc → vẫn awaiting_hold, nhưng hold chỉ = S + T (không có phần 15% của chủ xe)', async () => {
    const receipt = await submit(packagePlus, 5, twoAxisRequests);
    const approved = await twoAxisRequests.approve(
      packagePlus.tenant,
      packagePlus.owner,
      receipt.id,
    );

    // Sàn `S + T` > 0 nên vẫn có khoản online ⇒ hold, CHƯA có đơn (ADR 0044 điều 2).
    expect(approved.status).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
    expect(approved.bookingId).toBeNull();
    expectPackageFloorOnly(await onlyHold(packagePlus.tenant));
  });

  maybe('gói + BẬT cọc → duyệt ra awaiting_hold, hold = S + 15% tiền thuê, CHƯA có đơn', async () => {
    await setToggle(packagePlus.tenant, true);
    // Có thu tiền giữ chỗ ⇒ hold sinh lúc DUYỆT (ADR 0044 điều 2), không phải lúc gửi.
    const receipt = await submit(packagePlus, 8, twoAxisRequests);
    const approved = await twoAxisRequests.approve(
      packagePlus.tenant,
      packagePlus.owner,
      receipt.id,
    );

    expect(approved.status).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
    expect(approved.bookingId).toBeNull();

    const hold = await onlyHold(packagePlus.tenant);
    /*
     * Tuyến GÓI: H = 0, nhưng S vẫn có (phí sàn áp cả hai tuyến — ADR 0064 điều 2).
     *
     *   D      = 15% × 1.400.000 = 210.000
     *   online = max(S 50.000 + D 210.000 = 260.000, sàn S + T = 148.000) = 260.000
     */
    expect(hold.depositAmount.toFixed(0)).toBe('210000');
    expect(hold.serviceFeeAmount.toFixed(0)).toBe('50000');
    expect(hold.ownerCommissionAmount.toFixed(0)).toBe('0');
    expect(hold.vehicleInsuranceAmount.toFixed(0)).toBe('0');
    expect(hold.personalInsuranceAmount.toFixed(0)).toBe('0');
    expect(hold.amount.toFixed(0)).toBe('260000');
  });

  maybe('hoa hồng → luôn thu phần giữ chỗ của chủ xe, kể cả khi công tắc bị đặt tắt', async () => {
    await setToggle(commission.tenant, false);
    const receipt = await submit(commission, 11, twoAxisRequests);
    const approved = await twoAxisRequests.approve(commission.tenant, commission.owner, receipt.id);

    expect(approved.status).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
    const hold = await onlyHold(commission.tenant);
    /*
     * Công tắc `false` bị BỎ QUA: nếu nó có tiếng nói, khoản online sẽ chỉ là sàn
     * S + H + T = 50.000 + 140.000 + 98.000 = 288.000.
     *
     *   D      = 15% × 1.400.000 = 210.000   (≥ T 98.000 — ví chủ xe không âm)
     *   online = max(S 50.000 + H 140.000 + D 210.000 = 400.000, 288.000) = 400.000
     */
    expect(hold.depositAmount.toFixed(0)).toBe('210000');
    expect(hold.serviceFeeAmount.toFixed(0)).toBe('50000');
    expect(hold.ownerCommissionAmount.toFixed(0)).toBe('140000');
    expect(hold.vehicleInsuranceAmount.toFixed(0)).toBe('0');
    expect(hold.personalInsuranceAmount.toFixed(0)).toBe('0');
    expect(hold.amount.toFixed(0)).toBe('400000');
  });

  maybe('gói THIẾU cờ → bật lén không có hiệu lực: hold chỉ = S + T', async () => {
    await setToggle(packageBasic.tenant, true); // bật lén: không có hiệu lực
    const receipt = await submit(packageBasic, 14, twoAxisRequests);
    const approved = await twoAxisRequests.approve(
      packageBasic.tenant,
      packageBasic.owner,
      receipt.id,
    );

    // Nếu công tắc lén có hiệu lực, hold sẽ là 260.000 như ca "gói + BẬT cọc".
    expect(approved.status).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
    expect(approved.bookingId).toBeNull();
    expectPackageFloorOnly(await onlyHold(packageBasic.tenant));
  });
});

describe('TỰ NHẬN đơn áp CÙNG chính sách với duyệt tay (khi giai đoạn kết thúc)', () => {
  maybe('gói + BẬT cọc → tự nhận cũng dừng ở awaiting_hold, hold = S + 15% tiền thuê', async () => {
    await settings.patchServiceSetting(
      packagePlus.tenant,
      packagePlus.vehicle,
      SERVICE_TYPE.SELF_DRIVE,
      packagePlus.owner,
      { autoAcceptEnabled: true },
    );
    await setToggle(packagePlus.tenant, true);

    const receipt = await submit(packagePlus, 17, twoAxisRequests);
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });

    expect(row.status).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
    expect(row.decisionSource).toBe(BOOKING_REQUEST_DECISION_SOURCE.SYSTEM);
    // Cùng con số với duyệt tay: 50.000 + 15% × 1.400.000 = 260.000 (xem ca "gói + BẬT cọc").
    expect((await onlyHold(packagePlus.tenant)).amount.toFixed(0)).toBe('260000');
  });

  maybe('gói + TẮT cọc → tự nhận cũng chỉ thu S + T, giống hệt duyệt tay', async () => {
    await settings.patchServiceSetting(
      packagePlus.tenant,
      packagePlus.vehicle,
      SERVICE_TYPE.SELF_DRIVE,
      packagePlus.owner,
      { autoAcceptEnabled: true },
    );

    const receipt = await submit(packagePlus, 20, twoAxisRequests);
    const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } });

    expect(row.status).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
    expect(row.decisionSource).toBe(BOOKING_REQUEST_DECISION_SOURCE.SYSTEM);
    expectPackageFloorOnly(await onlyHold(packagePlus.tenant));
  });
});

describe('Đóng băng — ADR 0025 ràng buộc 4 (khi giai đoạn kết thúc)', () => {
  /*
   * Bản v2 của "bật công tắc sau khi đơn đã tạo": tắt cọc nay vẫn sinh hold (S + T), nên đơn ra
   * đời từ tiền về chứ không ngay lúc duyệt. Thứ cần khoá vẫn y nguyên — lượt BẬT công tắc sau đó
   * không được viết lại số tiền đã chốt: hold không phình thành 260.000, khoản 148.000 khách
   * chuyển vẫn đủ để mở đơn, và đơn giữ nguyên các dòng tiền + `deposit_collection_mode` của nó.
   */
  maybe('bật công tắc SAU khi đã chốt (tắt cọc) không viết lại hold lẫn đơn', async () => {
    const receipt = await submit(packagePlus, 23, twoAxisRequests);
    const approved = await twoAxisRequests.approve(
      packagePlus.tenant,
      packagePlus.owner,
      receipt.id,
    );
    expect(approved.status).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
    const hold = await onlyHold(packagePlus.tenant);
    expectPackageFloorOnly(hold);
    // Quyết định "có thu cọc không" đóng băng trên hold cùng lúc với số tiền.
    expect(hold.depositRequired).toBe(false);

    // Gian hàng BẬT cọc trong lúc khách đang cầm mã 148.000.
    await twoAxis.updateSettings(packagePlus.tenant, packagePlus.owner, true);
    expect((await twoAxis.resolveForTenant(packagePlus.tenant)).required).toBe(true);
    const stillOff = await prisma.bookingHold.findUniqueOrThrow({ where: { id: hold.id } });
    expectPackageFloorOnly(stillOff);
    expect(stillOff.depositRequired).toBe(false);

    // Khách chuyển đúng số trên QR cũ — không bị coi là thiếu so với 260.000 của luật mới.
    const applied = await prisma.$transaction((tx) =>
      holds.applyBankPaymentWithinTx(tx, {
        code: hold.code,
        amount: new Prisma.Decimal('148000'),
        providerTxId: `deposit-freeze-on-${hold.code}`,
      }),
    );
    expect(applied.outcome).toBe('activated');

    const booking = await prisma.booking.findFirstOrThrow({
      where: { tenantId: packagePlus.tenant },
    });
    const frozen = bookingMoney(booking);
    /*
     *   S = 50.000 · H = 0 · T = 98.000 · D (phần online của chủ xe) = 98.000
     *   ownerPayable = D − T = 0 · tổng khách = B + S = 1.450.000
     *   `direct`: khoản XePrime thu chỉ là phần KHÔNG phải tiền chủ xe (S + T), không có đồng cọc
     *   nào — cọc do chủ xe tự thu (ADR 0028 điều 9). Đọc từ quyết định đóng băng trên HOLD lúc
     *   duyệt, không từ công tắc lúc tiền về (lúc đó đã BẬT) — ADR 0025 ràng buộc 4.
     */
    expect(frozen).toEqual({
      serviceFee: '50000',
      commission: '0',
      tax: '98000',
      online: '98000',
      ownerPayable: '0',
      customerTotal: '1450000',
      mode: DEPOSIT_COLLECTION_MODE.DIRECT,
    });

    // Đổi công tắc thêm một vòng nữa SAU khi đơn đã có: đơn vẫn đọc ra đúng chính nó.
    await setToggle(packagePlus.tenant, false);
    await setToggle(packagePlus.tenant, true);
    const after = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(bookingMoney(after)).toEqual(frozen);
  });

  /*
   * Chiều ngược lại, cũng ở luật hai trục: chốt khi công tắc BẬT (hold có phần D), rồi TẮT trước
   * khi tiền về. Đơn phải mang `platform` — XePrime đang giữ cọc thật của khách.
   */
  maybe('tắt công tắc SAU khi đã chốt (bật cọc) — tiền về vẫn đóng băng `platform`', async () => {
    await setToggle(packagePlus.tenant, true);
    const receipt = await submit(packagePlus, 29, twoAxisRequests);
    const approved = await twoAxisRequests.approve(
      packagePlus.tenant,
      packagePlus.owner,
      receipt.id,
    );
    expect(approved.status).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);
    const hold = await onlyHold(packagePlus.tenant);
    expect(hold.amount.toFixed(0)).toBe('260000');
    expect(hold.depositRequired).toBe(true);

    await setToggle(packagePlus.tenant, false);
    expect((await twoAxis.resolveForTenant(packagePlus.tenant)).required).toBe(false);

    const applied = await prisma.$transaction((tx) =>
      holds.applyBankPaymentWithinTx(tx, {
        code: hold.code,
        amount: new Prisma.Decimal('260000'),
        providerTxId: `deposit-freeze-off-${hold.code}`,
      }),
    );
    expect(applied.outcome).toBe('activated');

    const booking = await prisma.booking.findFirstOrThrow({
      where: { tenantId: packagePlus.tenant },
    });
    expect(booking.depositCollectionMode).toBe(DEPOSIT_COLLECTION_MODE.PLATFORM);
  });
});

/**
 * CÔNG TẮC ĐỔI GIỮA CHỪNG — mặt còn lại của việc đóng băng (ADR 0025 ràng buộc 4).
 *
 * Ca ở khối trên khoá chiều "bật sau khi đơn `direct` đã tạo". Ca ở đây khoá chiều NGUY HIỂM
 * HƠN: một chuyến đã bước vào đường tiền — hold đã sinh, mã `XPH…` đã đưa cho khách, khách có
 * thể đang cầm QR — rồi gian hàng TẮT công tắc. Nếu lượt tắt đó có tiếng nói với chuyến ấy thì
 * khoản tiền khách vừa chuyển không còn đích nào để về.
 *
 * Kỳ vọng: lượt tắt chỉ áp cho chuyến SAU. Hold cũ giữ nguyên số tiền và mã; tiền về vẫn mở đơn;
 * và đơn đó vẫn mang `platform` — vì nó ra đời từ tiền XePrime đã thu thật.
 */
describe('Công tắc đổi SAU khi hold đã sinh — đường tiền không đổi giữa chừng', () => {
  maybe(
    'tắt cọc khi khách đang cầm mã: hold giữ nguyên, tiền về vẫn mở đơn `platform`',
    async () => {
      await setToggle(packagePlus.tenant, true);
      // Hold sinh lúc gian hàng NHẬN chuyến (ADR 0044) — từ đó khách cầm mã và đồng hồ chạy.
      const receipt = await submit(packagePlus, 26);
      const accepted = await requests.approve(packagePlus.tenant, packagePlus.owner, receipt.id);
      expect(accepted.status).toBe(BOOKING_REQUEST_STATUS.AWAITING_HOLD);

      const hold = await prisma.bookingHold.findFirstOrThrow({
        where: { tenantId: packagePlus.tenant },
      });
      const frozenAmount = hold.amount.toFixed(0);

      /*
       * Gian hàng đổi ý TRONG LÚC khách đang cầm mã chuyển khoản.
       *
       * Ghi thẳng bản ghi thay vì gọi `updateSettings`: trong giai đoạn cả sàn thu cọc, đường ghi
       * đó trả 403 cho mọi tuyến. Thứ ca này kiểm không phải "ai được bấm nút" (khối PATCH ở trên
       * lo) mà là "một lượt đổi công tắc — bất kể đến từ đâu — có viết lại được một chuyến đang
       * chạy hay không".
       */
      await setToggle(packagePlus.tenant, false);

      const still = await prisma.bookingHold.findUniqueOrThrow({ where: { id: hold.id } });
      expect(still.status).toBe(BOOKING_HOLD_STATUS.PENDING);
      expect(still.code).toBe(hold.code);
      expect(still.amount.toFixed(0)).toBe(frozenAmount);

      // Khách chuyển đủ. Đường tiền phải hoạt động y như lúc hold được sinh ra.
      const applied = await prisma.$transaction((tx) =>
        holds.applyBankPaymentWithinTx(tx, {
          code: hold.code,
          amount: new Prisma.Decimal(frozenAmount),
          providerTxId: `deposit-freeze-${hold.code}`,
        }),
      );
      expect(applied.outcome).toBe('activated');

      /*
       * Chuyến đã được nhận từ trước, nên lượt tiền về này mở ĐƠN ngay (ADR 0044 điều 2) — không
       * bắt gian hàng bấm lần thứ hai. Đó cũng là lúc `deposit_collection_mode` đóng băng, và nó
       * phải đóng băng theo khoản tiền ĐÃ THU chứ không theo công tắc của hôm nay.
       */
      const booking = await prisma.booking.findFirstOrThrow({
        where: { tenantId: packagePlus.tenant },
      });
      /*
       * `platform` chứ không phải `direct`: lúc chốt chuyến có thu cọc, và quyết định đó đóng
       * băng trên hold (`deposit_required`). Đọc công tắc của hôm nay để suy ra "ai thu cọc" sẽ
       * nói sai về một khoản tiền có thật.
       */
      expect(still.depositRequired).toBe(true);
      expect(booking.depositCollectionMode).toBe(DEPOSIT_COLLECTION_MODE.PLATFORM);
      expect(
        (await prisma.bookingRequest.findUniqueOrThrow({ where: { id: receipt.id } })).status,
      ).toBe(BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING);
    },
  );
});
