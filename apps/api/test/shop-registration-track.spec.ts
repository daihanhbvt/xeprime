import { ConfigService } from '@nestjs/config';
import { createPrismaClient, newId, Prisma } from '@xeprime/prisma';
import {
  API_ERROR_CODE,
  APPROVAL_TARGET_TYPE,
  BILLING_MODE,
  BILLING_PHASE,
  PACKAGE_SHOP_LISTING_REQUIREMENT,
  PLAN_STATUS,
  REGISTRATION_TRACK,
  SHOP_ONBOARDING_STATE,
  SHOP_VERIFICATION,
  SUBSCRIPTION_INVOICE_STATUS,
  SUBSCRIPTION_STATUS,
  TENANT_STATUS,
  TENANT_TYPE,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
  isPackageOnboardingPending,
} from '@xeprime/types';
import { SepayService } from '../src/modules/sepay/sepay.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import {
  makeBillingService,
  makeBookingHoldsService,
  makeTenantsService,
  makeVehiclesService,
} from './helpers/service-factory';

/**
 * HAI TUYẾN ĐĂNG KÝ, TÁCH HẲN NHAU — ADR 0040, chạy trên PostgreSQL THẬT.
 *
 * Spec này khoá đúng cái bug đã có thật trên `develop`, và nó là loại bug mà mỗi mảnh đều "đúng"
 * một mình:
 *
 *  - hai điểm vào dùng chung `ShopRegistration` và chung `POST /tenants`, chỉ khác câu chữ;
 *  - `registerShop` gán gói hoa hồng mặc định cho MỌI tenant;
 *  - nên `/auth/me` trả `billingMode = commission` cho cả hai, và người vừa bấm "Đăng ký gian
 *    hàng" bị điều hướng vào đúng màn "Hồ sơ chủ xe" của tuyến kia.
 *
 * Bốn nhóm dưới đây đi trọn vòng: đăng ký hai tuyến → tạo hoá đơn → tiền về qua webhook SePay →
 * gian hàng vào Manage → cổng logo trước khi gửi xe duyệt.
 *
 * Chạy: pnpm db:up && pnpm --filter @xeprime/api test shop-registration-track
 */
const prisma = createPrismaClient();
const asService = prisma as unknown as PrismaService;
const tenants = makeTenantsService(asService);
const billing = makeBillingService(asService);
const vehicles = makeVehiclesService(asService);

const SEPAY_API_KEY = 'test-track-key-0123456789abcdef';
const sepay = new SepayService(asService, billing, makeBookingHoldsService(asService), {
  get: (key: string) => (key === 'SEPAY_API_KEY' ? SEPAY_API_KEY : undefined),
} as unknown as ConfigService);

/** TP.HCM + một xã thuộc chính tỉnh đó — danh mục do migration nạp, không cần seed gì thêm. */
const HCM = '79';
/** Tỉnh KHÁC, để kiểm luật "xã phải thuộc tỉnh đã chọn". */
const HANOI = '01';

const RUN = newId().slice(-6).toLowerCase();

/**
 * Tiền tố mã giao dịch RIÊNG của spec này.
 *
 * `bank_transactions` là bảng TOÀN SÀN, không có `tenant_id` để lọc (ADR 0022 điều 2), và jest
 * chạy nhiều worker song song. Mọi lượt xoá/đếm ở đây vì vậy đều lọc theo tiền tố này — cùng kỷ
 * luật mà `sepay-webhook.spec.ts` đặt ra.
 */
const TX_PREFIX = `track-${RUN}-`;

let dbAvailable = false;
let commissionOwnerId: string;
let packageOwnerId: string;
let packagePlanId: string;
/** Xã thuộc TP.HCM và xã thuộc Hà Nội — đọc từ danh mục thật, không gõ tay mã. */
let hcmWard: string;
let hanoiWard: string;

let txCounter = 0;

function payload(over: Record<string, unknown> = {}): Record<string, unknown> {
  txCounter += 1;
  return {
    id: `${TX_PREFIX}${txCounter}`,
    gateway: 'MBBank',
    transactionDate: '2026-09-16 10:15:00',
    accountNumber: '0000111122',
    content: 'thanh toan goi',
    transferType: 'in',
    transferAmount: 100_000,
    accumulated: 0,
    ...over,
  };
}

async function mkUser(tag: string): Promise<string> {
  const id = newId();
  await prisma.user.create({
    data: {
      id,
      displayName: `Chủ ${tag}`,
      email: `${tag}-${RUN}@xeprime.test`,
      // `users.phone` là UNIQUE — mốc thời gian + bộ đếm cho một số khác nhau mỗi lần chạy.
      phone: `849${String(Date.now()).slice(-6)}${String(txCounter++).padStart(2, '0')}`,
    },
  });
  return id;
}

/** Hồ sơ xe ĐỦ điều kiện lên chợ — chỉ để cổng hồ sơ GIAN HÀNG là thứ duy nhất còn chặn. */
async function seedVehicle(tenantId: string, branchId: string): Promise<string> {
  const id = newId();
  await prisma.vehicle.create({
    data: {
      id,
      tenantId,
      branchId,
      code: `V-${id.slice(-6)}`,
      name: 'Toyota Vios',
      vehicleType: VEHICLE_TYPE.CAR,
      plateNumber: `51K-${id.slice(-3)}.45`,
      mainImageUrl: `https://img.example/${id.slice(-6)}-main.jpg`,
      brand: 'toyota',
      model: 'Vios',
      manufactureYear: 2022,
      seatCount: 5,
      fuelType: 'gasoline',
      transmission: 'automatic',
      fuelConsumptionCombined: 7.5,
      weekdayPrice: '600000',
    },
  });
  await prisma.vehicleImage.createMany({
    data: [1, 2, 3].map((n) => ({
      id: newId(),
      tenantId,
      vehicleId: id,
      imageUrl: `https://img.example/${id.slice(-6)}-${n}.jpg`,
      sortOrder: n,
    })),
  });
  return id;
}

async function defaultBranchId(tenantId: string): Promise<string> {
  const branch = await prisma.tenantBranch.findFirstOrThrow({
    where: { tenantId, isDefault: true, deletedAt: null },
    select: { id: true },
  });
  return branch.id;
}

function onboardingStateOf(tenantId: string): Promise<string> {
  return prisma.tenant
    .findUniqueOrThrow({ where: { id: tenantId }, select: { onboardingState: true } })
    .then((row) => row.onboardingState);
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

  commissionOwnerId = await mkUser('hoahong');
  packageOwnerId = await mkUser('gianhang');

  const [hcm, hanoi] = await Promise.all([
    prisma.ward.findFirstOrThrow({ where: { provinceCode: HCM }, select: { code: true } }),
    prisma.ward.findFirstOrThrow({ where: { provinceCode: HANOI }, select: { code: true } }),
  ]);
  hcmWard = hcm.code;
  hanoiWard = hanoi.code;

  /*
   * Bậc gói TUYẾN THUÊ BAO riêng của spec. Không dùng bậc seed (`per-vehicle`) vì các spec khác
   * cũng gán nó, và `_count.subscriptions` của nó là thứ `platform-billing` đang đếm.
   */
  packagePlanId = newId();
  await prisma.plan.create({
    data: {
      id: packagePlanId,
      code: `track-pkg-${RUN}`,
      name: 'Gói gian hàng (spec tuyến)',
      billingMode: BILLING_MODE.PACKAGE,
      basePriceMonthly: new Prisma.Decimal(0),
      status: PLAN_STATUS.ACTIVE,
      limitsJson: {
        maxVehicles: null,
                maxMembers: null,
        maxBranches: null,
        termPrices: [{ months: 3, price: '300000' }],
        graceDays: 7,
        features: [],
      } as unknown as Prisma.InputJsonValue,
    },
  });
});

afterAll(async () => {
  if (dbAvailable) {
    const tenantIds = (
      await prisma.tenant.findMany({
        where: { ownerUserId: { in: [commissionOwnerId, packageOwnerId] } },
        select: { id: true },
      })
    ).map((t) => t.id);

    await prisma.bankTransaction.deleteMany({
      where: { providerTxId: { startsWith: TX_PREFIX } },
    });
    if (tenantIds.length > 0) {
      const where = { tenantId: { in: tenantIds } };
      await prisma.vehicleImage.deleteMany({ where });
      await prisma.approvalLog.deleteMany({
        where: { task: { tenantId: { in: tenantIds } } },
      });
      await prisma.approvalTask.deleteMany({ where });
      await prisma.publicListing.deleteMany({ where });
      await prisma.vehicle.deleteMany({ where });
      await prisma.subscriptionInvoice.deleteMany({ where });
      await prisma.tenantSubscription.deleteMany({ where });
      await prisma.notification.deleteMany({ where });
      await prisma.auditLog.deleteMany({ where });
      await prisma.tenantBranch.deleteMany({ where });
      await prisma.tenantProfile.deleteMany({ where });
      await prisma.tenantMembership.deleteMany({ where });
      /*
       * Ví phải gỡ TRƯỚC tenant: `wallets.owner_*` là RESTRICT (CLAUDE.md mục 5), và
       * `registerShop` đổi chủ ví sang tenant trong cùng transaction đăng ký.
       */
      await prisma.walletEntry.deleteMany({
        where: { wallet: { ownerTenantId: { in: tenantIds } } },
      });
      await prisma.wallet.deleteMany({ where: { ownerTenantId: { in: tenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    }
    await prisma.wallet.deleteMany({
      where: { ownerUserId: { in: [commissionOwnerId, packageOwnerId] } },
    });
    await prisma.plan.deleteMany({ where: { id: packagePlanId } });
    await prisma.user.deleteMany({ where: { id: { in: [commissionOwnerId, packageOwnerId] } } });
  }
  await prisma.$disconnect();
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!dbAvailable) return;
    await fn();
  });

// ───────────────────────────────────────────────────────────────────────────────
describe('1. Tuyến HOA HỒNG — hành vi cũ giữ nguyên từng điểm', () => {
  let tenantId: string;

  maybe('đăng ký không khai tuyến ⇒ commission, có gói hoa hồng mặc định ngay', async () => {
    const shop = await tenants.registerShop(commissionOwnerId, {
      name: 'Nguyễn Văn A',
      tenantType: TENANT_TYPE.INDIVIDUAL,
      provinceCode: HCM,
      // KHÔNG gửi `registrationTrack` — client cũ (app native) phải chạy y như trước.
    });
    tenantId = shop.id;

    expect(shop.status).toBe(TENANT_STATUS.ACTIVE);
    expect(shop.onboardingState).toBe(SHOP_ONBOARDING_STATE.COMMISSION);
    expect(shop.verification).toBe(SHOP_VERIFICATION.UNVERIFIED);

    /*
     * Kiểm TUYẾN, không kiểm mã bậc gói.
     *
     * `loadDefaultCommissionPlanOrThrow` chọn bậc `commission` đang bán có `sortOrder` nhỏ nhất,
     * và database TEST có nhiều bậc như vậy (mỗi spec cờ/ân hạn dựng một bậc riêng — xem
     * `assertCommissionTrackStaysSingle`). Chốt vào `DEFAULT_COMMISSION_PLAN_CODE` ở đây là để
     * spec này đỏ theo lịch xếp worker chứ không theo lỗi thật.
     */
    const billingCtx = await billing.effectiveBillingFor(tenantId);
    expect(billingCtx.billingMode).toBe(BILLING_MODE.COMMISSION);
    expect(billingCtx.phase).toBe(BILLING_PHASE.CURRENT);
  });

  /*
   * Xã/phường và địa chỉ chi tiết KHÔNG bắt buộc ở tuyến này — người mở hồ sơ chủ xe thường
   * chưa có địa chỉ chính xác, và chặn ở đây là chặn luôn việc họ bắt đầu. Chi nhánh sinh ra
   * mang cờ chờ bổ sung, và đó là xử lý đúng chứ không phải nhân nhượng.
   */
  maybe(
    'thiếu xã/phường và địa chỉ chi tiết: vẫn mở được, chi nhánh mang cờ chờ bổ sung',
    async () => {
      const branch = await prisma.tenantBranch.findFirstOrThrow({
        where: { tenantId, isDefault: true },
        select: { wardCode: true, needsLocationReview: true, provinceCode: true },
      });
      expect(branch.provinceCode).toBe(HCM);
      expect(branch.wardCode).toBeNull();
      expect(branch.needsLocationReview).toBe(true);
    },
  );

  maybe('KHÔNG bị nhận diện là đang onboarding gói', async () => {
    expect(
      isPackageOnboardingPending({
        onboardingState: await onboardingStateOf(tenantId),
        billingMode: BILLING_MODE.COMMISSION,
      }),
    ).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
describe('2. Tuyến GÓI — ý định lưu bền vững, KHÔNG thành Owner Lite', () => {
  let tenantId: string;

  /*
   * Bộ trường của tuyến gói kiểm bằng CHÍNH quy tắc mà cổng đăng xe dùng
   * (`missingPackageShopRegistrationFields` = `missingPackageShopListingRequirements` trừ logo),
   * nên hai lớp không thể lệch nhau. Ba ca dưới đây là ba trường bị thiếu, từng cái một.
   */
  maybe(
    'thiếu xã / địa chỉ / SĐT ⇒ 400 kèm details.missing là MÃ, không phải câu tiếng Việt',
    async () => {
      const base = {
        name: 'Gian hàng Bình Minh',
        provinceCode: HCM,
        wardCode: hcmWard,
        addressLine: '12 Nguyễn Huệ',
        phone: '0901234567',
        registrationTrack: REGISTRATION_TRACK.PACKAGE,
      };

      for (const [field, expected] of [
        ['wardCode', PACKAGE_SHOP_LISTING_REQUIREMENT.WARD],
        ['addressLine', PACKAGE_SHOP_LISTING_REQUIREMENT.ADDRESS],
        ['phone', PACKAGE_SHOP_LISTING_REQUIREMENT.CONTACT_PHONE],
      ] as const) {
        const dto = { ...base, [field]: undefined };
        await expect(tenants.registerShop(packageOwnerId, dto)).rejects.toMatchObject({
          response: {
            code: API_ERROR_CODE.VALIDATION_FAILED,
            details: { missing: [expected] },
          },
        });
      }

      // Không lượt nào trong số đó được để lại một tenant nửa vời.
      expect(await prisma.tenant.count({ where: { ownerUserId: packageOwnerId } })).toBe(0);
    },
  );

  /*
   * Xã PHẢI thuộc tỉnh đã chọn. Lớp chặn cuối là FK tổ hợp `(ward_code, province_code)` ở DB,
   * nhưng `AddressService` chặn trước để người dùng nhận một câu đọc được thay vì một lỗi FK.
   */
  maybe('xã KHÔNG thuộc tỉnh đã chọn ⇒ bị từ chối', async () => {
    await expect(
      tenants.registerShop(packageOwnerId, {
        name: 'Gian hàng lệch tỉnh',
        provinceCode: HCM,
        wardCode: hanoiWard,
        addressLine: '12 Nguyễn Huệ',
        phone: '0901234567',
        registrationTrack: REGISTRATION_TRACK.PACKAGE,
      }),
    ).rejects.toMatchObject({ response: { code: API_ERROR_CODE.VALIDATION_FAILED } });
    expect(await prisma.tenant.count({ where: { ownerUserId: packageOwnerId } })).toBe(0);
  });

  maybe('đủ trường ⇒ package_pending, KHÔNG có dòng thuê bao nào', async () => {
    const shop = await tenants.registerShop(packageOwnerId, {
      name: 'Gian hàng Bình Minh',
      provinceCode: HCM,
      wardCode: hcmWard,
      addressLine: '12 Nguyễn Huệ',
      phone: '0901234567',
      registrationTrack: REGISTRATION_TRACK.PACKAGE,
    });
    tenantId = shop.id;

    expect(shop.onboardingState).toBe(SHOP_ONBOARDING_STATE.PACKAGE_PENDING);
    expect(shop.status).toBe(TENANT_STATUS.ACTIVE);
    // Địa chỉ đủ hai cấp ⇒ chi nhánh mặc định KHÔNG mang cờ chờ bổ sung.
    const branch = await prisma.tenantBranch.findFirstOrThrow({
      where: { tenantId, isDefault: true },
      select: { wardCode: true, needsLocationReview: true, phone: true },
    });
    expect(branch.wardCode).toBe(hcmWard);
    expect(branch.needsLocationReview).toBe(false);
    expect(branch.phone).toBe('0901234567');

    /*
     * ĐIỀU QUAN TRỌNG NHẤT của cả spec: KHÔNG có gói hoa hồng tạm nào.
     *
     * Gán một dòng hoa hồng ở đây là biến người vừa bấm "Đăng ký gian hàng" thành chủ xe tuyến
     * hoa hồng ở MỌI nơi đọc `billingMode` — khu làm việc, nhãn tài khoản, trần 3 xe Owner Lite.
     */
    expect(await prisma.tenantSubscription.count({ where: { tenantId } })).toBe(0);
  });

  maybe('pha là `unconfigured` ⇒ đường ghi tiền TỪ CHỐI, không đoán thành tuyến nào', async () => {
    const billingCtx = await billing.effectiveBillingFor(tenantId);
    expect(billingCtx.phase).toBe(BILLING_PHASE.UNCONFIGURED);
    expect(billingCtx.billingMode).toBeNull();

    await expect(billing.billingModeForMoneyOrThrow(tenantId)).rejects.toMatchObject({
      response: { code: API_ERROR_CODE.TENANT_BILLING_NOT_CONFIGURED },
    });
  });

  maybe('được nhận diện là ĐANG onboarding gói — luật thuần dùng chung với web', async () => {
    expect(
      isPackageOnboardingPending({
        onboardingState: await onboardingStateOf(tenantId),
        billingMode: null,
      }),
    ).toBe(true);
  });

  /*
   * ADR 0040 ghi đè ADR 0036 ở đúng điều này: xác minh pháp nhân KHÔNG còn là cổng mua gói.
   * Nếu còn, thứ tự sẽ là tạo gian hàng → gửi hồ sơ → CHỜ admin → mới được trả tiền.
   */
  maybe('tạo hoá đơn gói ĐƯỢC, dù gian hàng chưa xác minh', async () => {
    expect((await tenants.getMyShop(tenantId)).verification).toBe(SHOP_VERIFICATION.UNVERIFIED);

    const invoice = await billing.purchase(tenantId, packageOwnerId, {
      planId: packagePlanId,
      termMonths: 3
    });
    expect(invoice.code).toMatch(/^XPG/);
    expect(invoice.status).toBe(SUBSCRIPTION_INVOICE_STATUS.ISSUED);
    // 1 chỗ ô tô × 100.000đ × 3 tháng
    expect(invoice.totalAmount).toBe('300000');

    // Tạo hoá đơn KHÔNG mở gì: chưa có đồng nào về.
    expect(await onboardingStateOf(tenantId)).toBe(SHOP_ONBOARDING_STATE.PACKAGE_PENDING);
    expect(await prisma.tenantSubscription.count({ where: { tenantId } })).toBe(0);
  });

  /*
   * Phong bì `{ invoice }` chứ không phải `SubscriptionInvoiceDto | null` trần: `@ApiOkResponse`
   * sinh schema KHÔNG nullable, nên trả thẳng null sẽ hứa với client rằng luôn có hoá đơn — và
   * ca thường gặp nhất của endpoint này lại là không có (ADR 0040, `PendingSubscriptionInvoiceDto`).
   */
  maybe('hoá đơn đang chờ tìm lại được bằng MỘT lượt đọc — F5 không mất mã', async () => {
    const { invoice } = await billing.pendingInvoiceForTenant(tenantId);
    expect(invoice?.code).toMatch(/^XPG/);
    expect(invoice?.status).toBe(SUBSCRIPTION_INVOICE_STATUS.ISSUED);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
describe('3. Tiền về: chỉ ĐỦ mới mở gói, và mở đúng MỘT lần', () => {
  let tenantId: string;
  let code: string;

  beforeAll(async () => {
    if (!dbAvailable) return;
    const tenant = await prisma.tenant.findFirstOrThrow({
      where: { ownerUserId: packageOwnerId },
      select: { id: true },
    });
    tenantId = tenant.id;
    const { invoice } = await billing.pendingInvoiceForTenant(tenantId);
    code = invoice!.code;
  });

  maybe('chuyển THIẾU ⇒ partially_paid, KHÔNG mở gói, onboarding chưa xong', async () => {
    const result = await sepay.ingest(
      payload({ content: `Thanh toan ${code}`, transferAmount: 100_000 }),
    );
    expect(result).toMatchObject({ matched: true, note: 'partial' });

    const invoice = await prisma.subscriptionInvoice.findUniqueOrThrow({
      where: { code },
      select: { status: true, paidAmount: true, expiresAt: true },
    });
    expect(invoice.status).toBe(SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID);
    expect(invoice.paidAmount.toString()).toBe('100000');
    // Hoá đơn đã có tiền THẬT thì thôi hạn `void` — tiền về trễ vài phút không được làm mã chết.
    expect(invoice.expiresAt).toBeNull();

    expect(await prisma.tenantSubscription.count({ where: { tenantId } })).toBe(0);
    expect(await onboardingStateOf(tenantId)).toBe(SHOP_ONBOARDING_STATE.PACKAGE_PENDING);
  });

  maybe('chuyển NỐT phần còn thiếu ⇒ paid + ĐÚNG MỘT subscription + onboarding xong', async () => {
    const result = await sepay.ingest(
      payload({ content: `Thanh toan ${code}`, transferAmount: 200_000 }),
    );
    expect(result).toMatchObject({ matched: true, note: 'activated' });

    const invoice = await prisma.subscriptionInvoice.findUniqueOrThrow({
      where: { code },
      select: {
        status: true,
        paidAt: true,
        subscriptionId: true,
        periodFrom: true,
        periodTo: true,
      },
    });
    expect(invoice.status).toBe(SUBSCRIPTION_INVOICE_STATUS.PAID);
    expect(invoice.paidAt).not.toBeNull();
    // Hoá đơn phải kể đúng câu chuyện của gói nó đã mở — kỳ THẬT thay kỳ dự kiến.
    expect(invoice.subscriptionId).not.toBeNull();

    const subs = await prisma.tenantSubscription.findMany({
      where: { tenantId },
      select: { id: true, status: true, billingMode: true, startsAt: true, endsAt: true },
    });
    expect(subs).toHaveLength(1);
    expect(subs[0]!.status).toBe(SUBSCRIPTION_STATUS.ACTIVE);
    expect(subs[0]!.billingMode).toBe(BILLING_MODE.PACKAGE);
    expect(subs[0]!.id).toBe(invoice.subscriptionId);

    /*
     * Mốc onboarding ghi trong CHÍNH transaction bật thuê bao. Tách ra ngoài sẽ tạo một cửa sổ
     * trong đó gian hàng đã trả tiền nhưng routing vẫn giữ họ ở màn chuyển khoản.
     */
    expect(await onboardingStateOf(tenantId)).toBe(SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE);

    const billingCtx = await billing.effectiveBillingFor(tenantId);
    expect(billingCtx.billingMode).toBe(BILLING_MODE.PACKAGE);
    expect(billingCtx.phase).toBe(BILLING_PHASE.CURRENT);
    // Hết bước chờ ⇒ luật thuần nói "không còn onboarding".
    expect(
      isPackageOnboardingPending({
        onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
        billingMode: BILLING_MODE.PACKAGE,
      }),
    ).toBe(false);
  });

  /*
   * KHÔNG còn hoá đơn chờ ⇒ màn onboarding của web thấy `null` ở lượt polling cuối, và đó chính
   * là tín hiệu nó dùng để làm mới scope rồi điều hướng.
   */
  maybe('trả đủ rồi thì không còn hoá đơn CHỜ nào', async () => {
    expect((await billing.pendingInvoiceForTenant(tenantId)).invoice).toBeNull();
  });

  maybe('webhook bắn LẠI cùng mã giao dịch: idempotent, không subscription thứ hai', async () => {
    const duplicate = payload({ content: `Thanh toan ${code}`, transferAmount: 300_000 });
    const first = await sepay.ingest(duplicate);
    const second = await sepay.ingest(duplicate);

    /*
     * Hoá đơn đã `paid` ⇒ tiền về lần nữa là phần DƯ, ghi làm bằng chứng chênh lệch cho màn đối
     * soát. Lượt thứ hai chạm unique `(provider, provider_tx_id)` ở DB nên nó chỉ là `duplicate`.
     */
    expect(first).toMatchObject({ duplicate: false, note: 'already_paid' });
    expect(second).toMatchObject({ duplicate: true, matched: false });
    expect(
      await prisma.bankTransaction.count({
        where: { providerTxId: duplicate.id as string },
      }),
    ).toBe(1);
    expect(await prisma.tenantSubscription.count({ where: { tenantId } })).toBe(1);
  });

  /*
   * KHÔNG có dòng hoa hồng nào để huỷ, và đó là điểm của thiết kế: tuyến gói chưa bao giờ nhận
   * một gói tạm. `resolveChainStart` vẫn giữ nhánh huỷ cho tenant đi lên từ tuyến hoa hồng —
   * `platform-billing.spec.ts` khoá nhánh đó.
   */
  maybe('không có dòng thuê bao hoa hồng nào bị bỏ lại', async () => {
    expect(
      await prisma.tenantSubscription.count({
        where: { tenantId, billingMode: BILLING_MODE.COMMISSION },
      }),
    ).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────────
describe('4. Cổng hồ sơ gian hàng TRƯỚC khi gửi xe duyệt', () => {
  let packageTenantId: string;
  let packageVehicleId: string;

  beforeAll(async () => {
    if (!dbAvailable) return;
    const tenant = await prisma.tenant.findFirstOrThrow({
      where: { ownerUserId: packageOwnerId },
      select: { id: true },
    });
    packageTenantId = tenant.id;
    packageVehicleId = await seedVehicle(packageTenantId, await defaultBranchId(packageTenantId));
  });

  maybe('thiếu logo: xe vẫn TẠO và LƯU NHÁP được bình thường', async () => {
    const row = await prisma.vehicle.findUniqueOrThrow({
      where: { id: packageVehicleId },
      select: { publicStatus: true },
    });
    expect(row.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.DRAFT);

    const profile = await prisma.tenantProfile.findUniqueOrThrow({
      where: { tenantId: packageTenantId },
      select: { logoUrl: true },
    });
    expect(profile.logoUrl).toBeNull();
  });

  maybe('thiếu logo: GỬI DUYỆT bị chặn, details.missing = ["logo"], KHÔNG tạo phiếu', async () => {
    await expect(
      vehicles.submitForPublicReview(packageTenantId, packageVehicleId, packageOwnerId),
    ).rejects.toMatchObject({
      response: {
        code: API_ERROR_CODE.SHOP_LISTING_REQUIREMENTS_MISSING,
        details: { missing: [PACKAGE_SHOP_LISTING_REQUIREMENT.LOGO] },
      },
    });

    // Cổng ném TRƯỚC transaction: xe không chuyển trạng thái và hàng đợi không có gì.
    const row = await prisma.vehicle.findUniqueOrThrow({
      where: { id: packageVehicleId },
      select: { publicStatus: true },
    });
    expect(row.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.DRAFT);
    expect(
      await prisma.approvalTask.count({
        where: { targetType: APPROVAL_TARGET_TYPE.VEHICLE, targetId: packageVehicleId },
      }),
    ).toBe(0);
  });

  maybe('thêm logo ⇒ gửi duyệt đi qua', async () => {
    await tenants.updateProfile(packageTenantId, packageOwnerId, {
      logoUrl: 'https://img.example/logo.png',
    });

    const detail = await vehicles.submitForPublicReview(
      packageTenantId,
      packageVehicleId,
      packageOwnerId,
    );
    expect(detail.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW);
    expect(
      await prisma.approvalTask.count({
        where: { targetType: APPROVAL_TARGET_TYPE.VEHICLE, targetId: packageVehicleId },
      }),
    ).toBe(1);
  });

  /*
   * CHỦ XE TUYẾN HOA HỒNG KHÔNG BỊ CỔNG LOGO CHẠM TỚI.
   *
   * Một người có một chiếc xe không có logo gian hàng và không cần có. Bắt họ thiết kế một cái là
   * dựng lại đúng rào cản mà ADR 0036 vừa gỡ khỏi phễu chủ xe — nên đây là mệnh đề quan trọng
   * nhất của nhóm này, không phải một ca phụ.
   */
  maybe('chủ xe tuyến HOA HỒNG: không logo, không SĐT chi nhánh — vẫn gửi duyệt được', async () => {
    const tenant = await prisma.tenant.findFirstOrThrow({
      where: { ownerUserId: commissionOwnerId },
      select: { id: true },
    });
    const vehicleId = await seedVehicle(tenant.id, await defaultBranchId(tenant.id));

    const profile = await prisma.tenantProfile.findUniqueOrThrow({
      where: { tenantId: tenant.id },
      select: { logoUrl: true },
    });
    expect(profile.logoUrl).toBeNull();

    const detail = await vehicles.submitForPublicReview(tenant.id, vehicleId, commissionOwnerId);
    expect(detail.publicStatus).toBe(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW);
  });
});
