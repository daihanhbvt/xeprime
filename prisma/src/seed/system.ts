/**
 * Dữ liệu NỀN — thứ app không chạy nổi nếu thiếu, và phải có ở mọi môi trường kể cả production.
 *
 * Ranh giới với dữ liệu demo: ở đây không có gian hàng, không có xe, không có tên người thật.
 * Chạy `SEED_MODE=system` là dừng đúng sau file này.
 *
 * Danh mục tỉnh và catalog bộ lọc KHÔNG nằm ở đây — chúng do migration baseline nạp, vì chúng
 * là một phần của lược đồ (mọi môi trường có ngay sau `migrate deploy`, không đợi ai chạy seed).
 */
import { seedPlanGuideTemplates } from './plan-guide-templates';
import { seedInsuranceProducts } from './insurance-products';
import {
  BANNER_PLACEMENT,
  DEFAULT_COMMISSION_PLAN_CODE,
  RETIRED_PER_VEHICLE_PLAN_CODE,
  RETIRED_SHOP_PLAN_CODE,
  SHOP_PLAN_CODE,
  BILLING_MODE,
  DEFAULT_PLATFORM_ROLE_PERMISSIONS,
  DEFAULT_TENANT_ROLE_PERMISSIONS,
  FINANCE_CATEGORY_TYPE,
  FULL_MANAGE_FEATURES,
  OWNER_LITE_FEATURES,
  PERMISSION_VALUES,
  PLAN_STATUS,
  PLAN_VEHICLE_SCOPE,
  parsePlanLimits,
  planVehicleScopeOf,
  PLATFORM_ROLE,
  PLATFORM_ROLE_LABEL,
  PROMO_AUDIENCE,
  PROMO_DISCOUNT_TYPE,
  PROMO_VEHICLE_SCOPE,
  SCOPE,
  SERVICE_TYPE,
  SYSTEM_FINANCE_CATEGORY,
  TENANT_ROLE,
  TENANT_ROLE_LABEL,
  type BillingMode,
  type Permission,
  type PlanLimitsJson,
  type PlanStatus,
  type PlanVehicleScope,
  type SystemFinanceCategoryKey,
} from '@xeprime/types';
import { Prisma } from '../index';
import { daysFromToday, log, photo, prisma, seedId } from './context';

export type PermissionIds = Map<Permission, string>;

async function seedPermissions(): Promise<PermissionIds> {
  const byKey: PermissionIds = new Map();

  for (const key of PERMISSION_VALUES) {
    const [module = 'core'] = key.split('.');
    const row = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: {
        id: seedId(`permission:${key}`),
        key,
        name: key,
        module: key.startsWith('platform.') ? 'platform' : module,
        scope: key.startsWith('platform.') ? SCOPE.PLATFORM : SCOPE.TENANT,
      },
      select: { id: true },
    });
    byKey.set(key, row.id);
  }
  return byKey;
}

/**
 * Role hệ thống + bộ quyền của nó. Quyền được GHI ĐÈ toàn bộ mỗi lần seed: seed là nguồn sự
 * thật cho role hệ thống, và bỏ một quyền khỏi `DEFAULT_*` phải thực sự thu hồi được.
 */
async function seedSystemRole(
  scope: string,
  key: string,
  name: string,
  permissions: readonly Permission[],
  permissionIds: PermissionIds,
): Promise<void> {
  const existing = await prisma.role.findFirst({
    where: { scope, key, tenantId: null },
    select: { id: true },
  });
  const roleId =
    existing?.id ??
    (
      await prisma.role.create({
        data: {
          id: seedId(`role:${scope}:${key}`),
          scope,
          key,
          name,
          isSystem: true,
          tenantId: null,
        },
        select: { id: true },
      })
    ).id;

  await prisma.rolePermission.deleteMany({ where: { roleId } });
  await prisma.rolePermission.createMany({
    data: permissions
      .map((p) => permissionIds.get(p))
      .filter((id): id is string => Boolean(id))
      .map((permissionId) => ({ roleId, permissionId })),
    skipDuplicates: true,
  });
}

/**
 * Danh mục thu/chi dùng chung (tenant_id null). `systemKey` chỉ có ở năm danh mục mà PHIẾU TỰ
 * ĐỘNG cần tra tới — khớp theo khoá chứ không theo tên tiếng Việt, vì đổi một dấu cách trong
 * tên là mọi phiếu tự động mất danh mục.
 */
const SYSTEM_FINANCE_CATEGORIES: ReadonlyArray<{
  type: string;
  name: string;
  systemKey?: SystemFinanceCategoryKey;
  /**
   * Khoản này luôn thuộc về MỘT CHIẾC XE cụ thể (ADR 0052) — form bắt buộc chọn xe.
   *
   * Vì sao cần: đo trên dữ liệu thật, phiếu "Đổ xăng", "Rửa xe", "Phí quá giờ" nhập tay thường
   * bị bỏ trống ô Xe. Chúng rơi khỏi báo cáo hiệu quả theo xe và trôi vào nhóm "chung" cùng với
   * tiền thuê mặt bằng — hai thứ khác hẳn nhau nằm chung một rổ thì không ai sửa được nữa.
   */
  requiresVehicle?: true;
}> = [
  { type: FINANCE_CATEGORY_TYPE.INCOME, name: 'Tiền thuê xe' },
  {
    type: FINANCE_CATEGORY_TYPE.INCOME,
    name: 'Tiền cọc',
    systemKey: SYSTEM_FINANCE_CATEGORY.DEPOSIT,
  },
  {
    type: FINANCE_CATEGORY_TYPE.INCOME,
    name: 'Thanh toán đơn',
    systemKey: SYSTEM_FINANCE_CATEGORY.BOOKING_PAYMENT,
  },
  { type: FINANCE_CATEGORY_TYPE.INCOME, name: 'Phí quá giờ', requiresVehicle: true },
  { type: FINANCE_CATEGORY_TYPE.INCOME, name: 'Phí đền bù va quẹt', requiresVehicle: true },
  { type: FINANCE_CATEGORY_TYPE.INCOME, name: 'Phí phạt nguội', requiresVehicle: true },
  { type: FINANCE_CATEGORY_TYPE.INCOME, name: 'Thu khác' },

  {
    type: FINANCE_CATEGORY_TYPE.EXPENSE,
    name: 'Hoàn cọc',
    systemKey: SYSTEM_FINANCE_CATEGORY.DEPOSIT_REFUND,
  },
  {
    type: FINANCE_CATEGORY_TYPE.EXPENSE,
    name: 'Bảo dưỡng/Thay nhớt',
    systemKey: SYSTEM_FINANCE_CATEGORY.MAINTENANCE,
    requiresVehicle: true,
  },
  {
    type: FINANCE_CATEGORY_TYPE.EXPENSE,
    name: 'Sửa chữa sự cố',
    systemKey: SYSTEM_FINANCE_CATEGORY.REPAIR,
    requiresVehicle: true,
  },
  { type: FINANCE_CATEGORY_TYPE.EXPENSE, name: 'Mua bảo hiểm', requiresVehicle: true },
  { type: FINANCE_CATEGORY_TYPE.EXPENSE, name: 'Rửa xe', requiresVehicle: true },
  { type: FINANCE_CATEGORY_TYPE.EXPENSE, name: 'Giao/nhận xe', requiresVehicle: true },
  { type: FINANCE_CATEGORY_TYPE.EXPENSE, name: 'Đổ xăng', requiresVehicle: true },
  { type: FINANCE_CATEGORY_TYPE.EXPENSE, name: 'Chi phí vận hành' },
  { type: FINANCE_CATEGORY_TYPE.EXPENSE, name: 'Chi phí marketing' },
  { type: FINANCE_CATEGORY_TYPE.EXPENSE, name: 'Chi phí văn phòng' },
  { type: FINANCE_CATEGORY_TYPE.EXPENSE, name: 'Chi khác' },
];

/** Tra danh mục thu/chi theo TÊN — phiếu demo gắn danh mục như người dùng thật chọn. */
export type FinanceCategoryIds = Map<string, string>;

async function seedFinanceCategories(): Promise<FinanceCategoryIds> {
  const byName: FinanceCategoryIds = new Map();
  for (const cat of SYSTEM_FINANCE_CATEGORIES) {
    const existing = await prisma.financeCategory.findFirst({
      where: cat.systemKey
        ? { OR: [{ systemKey: cat.systemKey }, { tenantId: null, type: cat.type, name: cat.name }] }
        : { tenantId: null, type: cat.type, name: cat.name },
      select: { id: true, systemKey: true, requiresVehicle: true },
    });

    if (!existing) {
      const id = seedId(`finance-category:${cat.type}:${cat.name}`);
      await prisma.financeCategory.create({
        data: {
          id,
          tenantId: null,
          type: cat.type,
          name: cat.name,
          isSystem: true,
          systemKey: cat.systemKey ?? null,
          requiresVehicle: cat.requiresVehicle ?? false,
        },
      });
      byName.set(cat.name, id);
      continue;
    }

    // Hội tụ cả hai cờ: hàng đã có từ đợt seed trước chưa biết tới `requiresVehicle`.
    const wantsVehicle = cat.requiresVehicle ?? false;
    const patch = {
      ...(cat.systemKey && existing.systemKey !== cat.systemKey
        ? { systemKey: cat.systemKey }
        : {}),
      ...(existing.requiresVehicle !== wantsVehicle ? { requiresVehicle: wantsVehicle } : {}),
    };
    if (Object.keys(patch).length > 0) {
      await prisma.financeCategory.update({ where: { id: existing.id }, data: patch });
    }
    byName.set(cat.name, existing.id);
  }
  return byName;
}

/**
 * Cờ năng lực của từng bậc gói — ranh giới hai bậc lấy từ `@xeprime/types`, KHÔNG khai lại ở đây.
 *
 * ⚠️ Đợt trước cấp `ALL_CURRENT_FEATURES` (đủ 7 cờ) cho **cả ba** gói với ghi chú "thà rộng còn
 * siết sau". Hệ quả là hai bậc năng lực của ADR 0027 chưa hề tồn tại trên dữ liệu: gói hoa hồng
 * `free` — nơi MỌI gian hàng mới hạ cánh (`assignDefaultPlanWithinTx`) — mở đúng bằng gói thuê
 * bao, nên "nâng cấp lên gian hàng" không mở thêm gì và tấm so sánh ở màn "Gói của tôi" luôn
 * hiện "đã có tất cả". Đợt này siết đúng như ADR 0027 điều 1.
 *
 * An toàn cho tenant đang vận hành nằm ở CHỖ KHÁC, không phải ở đây: `tenants.used_features`
 * (migration 20260830000000) làm tenant đã có dữ liệu rơi vào `read_only` chứ không phải
 * `hidden` — họ mất quyền GHI, không mất quyền XEM (ADR 0027 điều 3). Và cổng chặn vẫn ở
 * `PLAN_FEATURE_ENFORCEMENT=warn` nên chưa ai bị chặn thật; `docs/deployment.md` §9.4b là nơi
 * quyết định lúc nào bật `on`.
 */
const FEATURES_BY_TIER = {
  /** Tuyến hoa hồng = chủ xe cơ bản. Rỗng có chủ đích — xem `OWNER_LITE_FEATURES`. */
  ownerLite: [...OWNER_LITE_FEATURES],
  /** Tuyến gói = gian hàng thuê bao. */
  fullManage: [...FULL_MANAGE_FEATURES],
};

/**
 * Gói dịch vụ nền tảng (ADR 0041 · ADR 0065). Không phải dữ liệu demo: màn quản trị gói và màn
 * chọn gói của gian hàng cần danh mục này ở mọi môi trường.
 *
 * KHÔNG đổi mã đã phát hành — đổi mã là mồ côi mọi `tenant_subscriptions` đang trỏ tới; gói
 * hết vai trò thì lật `archived`, không xoá. Mã bậc sống ở `SHOP_PLAN_CODE`.
 *
 * ## Danh mục có TÁM hàng, và chúng không cùng một loại thứ
 *
 * `free` (`DEFAULT_COMMISSION_PLAN_CODE`) **không phải một SKU**. Nó là TUYẾN vào cửa: mọi
 * chủ xe cá nhân được gán nó lúc mở gian hàng, giá 0đ, không kỳ hạn nào để mua, không gì để
 * gia hạn. Backend giữ nó là duy nhất và không cho archive (`BillingService` —
 * `COMMISSION_PLAN_IS_SINGLETON` / `DEFAULT_PLAN_PROTECTED`), còn `listPlansForTenant` lọc nó
 * ra khỏi màn chọn gói. Phí dịch vụ 10% nằm PHÍA KHÁCH, cộng vào khoản giữ chỗ (ADR 0029
 * điều 2) — không phải khoản khấu trừ của chủ xe. Phạm vi `all` (CHECK `plans_commission_scope_all`).
 *
 * Bảy hàng còn lại là bậc gian hàng THEO LOẠI XE (ADR 0065, chủ sản phẩm chốt 21/10/2026):
 *
 * | Mã | Phạm vi | Trần xe (loại đó) |
 * | --- | --- | --- |
 * | `moto_1` / `moto_5` / `moto_10` | `motorbike` | 1 / 5 / 10 xe máy |
 * | `car_1` / `car_5` / `car_10` | `car` | 1 / 5 / 10 ô tô |
 * | `enterprise_contact` | `all` | không giới hạn — bán bằng tư vấn (`salesOnly`) |
 *
 * Một gian hàng giữ TỐI ĐA một gói xe máy VÀ một gói ô tô cùng lúc; gói doanh nghiệp thay cả hai
 * (EXCLUDE `tenant_subscriptions_package_scope_no_overlap`). Chi nhánh không còn giới hạn ở bậc nào.
 *
 * ## ⚠️ GIÁ LÀ SỐ GIỮ CHỖ ⇒ sáu bậc tự mua ra đời ở `draft` (CHƯA MỞ BÁN)
 *
 * Bảng giá dưới đây là con số tạm (bội số 1.000đ). Sáu bậc tự mua được TẠO ở trạng thái `draft`:
 * không hiện ở bảng giá gian hàng, không tự mua được, gán tay phải nhập giá. Admin sửa giá thật
 * rồi bấm Mở bán. Seed chỉ TẠO, không ghi đè lúc chạy lại (xem `seedPlans`); dữ liệu demo mở bán
 * chúng bằng `publishDraftPlansForDemo`. Giá cả kỳ là số TUYỆT ĐỐI, giảm dần theo
 * tháng (ADR 0041 điều 2) — % tiết kiệm hiển thị được tính ra, không lưu ở đâu.
 *
 * Migration `20261021110000_per_vehicle_type_plans` chèn đúng bảy hàng này (cùng id `seedId`) để
 * ánh xạ thuê bao đang chạy; seed là nguồn NỘI DUNG và ghi đè các trường ở đó.
 *
 * ## Cả bảy bậc mở CÙNG bộ tính năng
 *
 * Ranh giới năng lực là giữa hai TUYẾN (ADR 0027 · ADR 0038), không phải giữa các bậc. Bậc khác
 * nhau ở LOẠI XE và QUY MÔ.
 */
const PLAN_FULL_MANAGE = {
  maxBranches: null,
  maxMembers: null,
  salesOnly: false,
  graceDays: 7,
  features: FEATURES_BY_TIER.fullManage,
} as const;

/** Bảng giá giữ chỗ của một bậc — tiền CẢ KỲ cho 1 / 3 / 6 / 12 tháng (ADR 0041 điều 2). */
function termPrices(m1: number, m3: number, m6: number, m12: number): PlanLimitsJson['termPrices'] {
  return [
    { months: 1, price: String(m1) },
    { months: 3, price: String(m3) },
    { months: 6, price: String(m6) },
    { months: 12, price: String(m12) },
  ];
}

const PLANS: ReadonlyArray<{
  code: string;
  name: string;
  description: string;
  billingMode: BillingMode;
  commissionPercent: number | null;
  vehicleScope: PlanVehicleScope;
  limits: PlanLimitsJson;
  sortOrder: number;
  /**
   * Trạng thái LÚC TẠO (seed không ghi đè sau đó). `draft` = chưa mở bán — sáu bậc giá giữ chỗ
   * (ADR 0065); `archived` = gói lịch sử. Bỏ trống = `active`.
   */
  status?: PlanStatus;
}> = [
  {
    code: DEFAULT_COMMISSION_PLAN_CODE,
    name: 'Tuyến hoa hồng mặc định',
    description:
      'TUYẾN vào cửa của mọi chủ xe cá nhân, không phải gói để mua: 0đ thuê bao, không hạn sử dụng. ' +
      'Nền tảng thu phí dịch vụ 10% ở PHÍA KHÁCH qua khoản giữ chỗ khi đặt xe. Tối đa 3 xe (Owner Lite).',
    billingMode: BILLING_MODE.COMMISSION,
    commissionPercent: 10,
    vehicleScope: PLAN_VEHICLE_SCOPE.ALL,
    limits: {
      /*
       * `maxVehicles` NULL có chủ đích — và nó KHÔNG có nghĩa "không giới hạn" ở đây.
       *
       * Trần của tuyến hoa hồng là `OWNER_LITE_VEHICLE_LIMIT` = 3, một quy tắc SẢN PHẨM viết
       * trong code (ADR 0038 điều 12). `vehicleQuotaFor` nhận ra tuyến này trước khi đọc tới
       * `limits`, nên con số ở đây không bao giờ được dùng.
       */
      maxVehicles: null,
      maxBranches: null,
      maxMembers: null,
      /*
       * RỖNG có chủ đích: `termPrices` là bảng giá VÀ danh sách kỳ hạn ĐƯỢC BÁN (ADR 0041 điều
       * 2), và tuyến hoa hồng không bán gì cả. Dòng thuê bao kỹ thuật vẫn dài
       * `COMMISSION_TRACK_TERM_MONTHS` (12 tháng) và được job vòng đời nối liền từ `ends_at`.
       */
      termPrices: [],
      salesOnly: false,
      recommended: false,
      graceDays: 7,
      features: FEATURES_BY_TIER.ownerLite,
    },
    sortOrder: 0,
  },
  {
    code: SHOP_PLAN_CODE.MOTO_1,
    status: PLAN_STATUS.DRAFT,
    name: 'Xe máy · 1 xe',
    description: 'Gói xe máy cho chủ xe vừa bắt đầu — đăng 1 xe máy, đủ bộ quản lý gian hàng.',
    billingMode: BILLING_MODE.PACKAGE,
    commissionPercent: null,
    vehicleScope: PLAN_VEHICLE_SCOPE.MOTORBIKE,
    limits: {
      ...PLAN_FULL_MANAGE,
      maxVehicles: 1,
      termPrices: termPrices(49_000, 139_000, 269_000, 499_000),
      recommended: false,
    },
    sortOrder: 1,
  },
  {
    code: SHOP_PLAN_CODE.MOTO_5,
    status: PLAN_STATUS.DRAFT,
    name: 'Xe máy · 5 xe',
    description: 'Gói xe máy cho cửa hàng nhỏ — tối đa 5 xe máy.',
    billingMode: BILLING_MODE.PACKAGE,
    commissionPercent: null,
    vehicleScope: PLAN_VEHICLE_SCOPE.MOTORBIKE,
    limits: {
      ...PLAN_FULL_MANAGE,
      maxVehicles: 5,
      termPrices: termPrices(149_000, 419_000, 799_000, 1_490_000),
      recommended: true,
    },
    sortOrder: 2,
  },
  {
    code: SHOP_PLAN_CODE.MOTO_10,
    status: PLAN_STATUS.DRAFT,
    name: 'Xe máy · 10 xe',
    description: 'Gói xe máy cho đội xe vừa — tối đa 10 xe máy.',
    billingMode: BILLING_MODE.PACKAGE,
    commissionPercent: null,
    vehicleScope: PLAN_VEHICLE_SCOPE.MOTORBIKE,
    limits: {
      ...PLAN_FULL_MANAGE,
      maxVehicles: 10,
      termPrices: termPrices(249_000, 699_000, 1_339_000, 2_490_000),
      recommended: false,
    },
    sortOrder: 3,
  },
  {
    code: SHOP_PLAN_CODE.CAR_1,
    status: PLAN_STATUS.DRAFT,
    name: 'Ô tô · 1 xe',
    description: 'Gói ô tô cho chủ xe vừa bắt đầu — đăng 1 ô tô, đủ bộ quản lý gian hàng.',
    billingMode: BILLING_MODE.PACKAGE,
    commissionPercent: null,
    vehicleScope: PLAN_VEHICLE_SCOPE.CAR,
    limits: {
      ...PLAN_FULL_MANAGE,
      maxVehicles: 1,
      termPrices: termPrices(99_000, 279_000, 539_000, 990_000),
      recommended: false,
    },
    sortOrder: 4,
  },
  {
    code: SHOP_PLAN_CODE.CAR_5,
    status: PLAN_STATUS.DRAFT,
    name: 'Ô tô · 5 xe',
    description: 'Gói ô tô cho cửa hàng nhỏ — tối đa 5 ô tô.',
    billingMode: BILLING_MODE.PACKAGE,
    commissionPercent: null,
    vehicleScope: PLAN_VEHICLE_SCOPE.CAR,
    limits: {
      ...PLAN_FULL_MANAGE,
      maxVehicles: 5,
      termPrices: termPrices(299_000, 849_000, 1_619_000, 2_990_000),
      recommended: true,
    },
    sortOrder: 5,
  },
  {
    code: SHOP_PLAN_CODE.CAR_10,
    status: PLAN_STATUS.DRAFT,
    name: 'Ô tô · 10 xe',
    description: 'Gói ô tô cho đội xe vừa — tối đa 10 ô tô.',
    billingMode: BILLING_MODE.PACKAGE,
    commissionPercent: null,
    vehicleScope: PLAN_VEHICLE_SCOPE.CAR,
    limits: {
      ...PLAN_FULL_MANAGE,
      maxVehicles: 10,
      termPrices: termPrices(499_000, 1_419_000, 2_699_000, 4_990_000),
      recommended: false,
    },
    sortOrder: 6,
  },
  {
    code: SHOP_PLAN_CODE.ENTERPRISE,
    name: 'Doanh nghiệp',
    description:
      'Không giới hạn ô tô, xe máy và chi nhánh. Liên hệ XePrime để được tư vấn và báo giá riêng.',
    billingMode: BILLING_MODE.PACKAGE,
    commissionPercent: null,
    vehicleScope: PLAN_VEHICLE_SCOPE.ALL,
    limits: {
      ...PLAN_FULL_MANAGE,
      maxVehicles: null,
      /*
       * Không bảng giá VÀ `salesOnly` — hai thứ đi đôi (ADR 0041 điều 5): backend từ chối
       * `purchase()` (`PLAN_NOT_SELF_SERVE`) và bắt admin nhập giá đàm phán lúc gán.
       */
      termPrices: [],
      salesOnly: true,
      recommended: false,
    },
    sortOrder: 7,
  },
];

/** Tra gói theo `code` để gán thuê bao cho gian hàng demo (kèm snapshot chế độ — ADR 0024). */
export type PlanIds = Map<
  string,
  {
    id: string;
    billingMode: BillingMode;
    commissionPercent: number | null;
    /** Phạm vi loại xe (ADR 0065) — dòng thuê bao demo snapshot nó, trigger ở DB đòi khớp. */
    vehicleScope: PlanVehicleScope;
    /** Bảng giá cả kỳ (ADR 0041 điều 2) — gian hàng demo lấy đúng giá niêm yết của kỳ nó mua. */
    termPrices: PlanLimitsJson['termPrices'];
    /** Hạn mức SNAPSHOT lên dòng thuê bao demo — cùng hình dạng `BillingService.assign` ghi. */
    quota: { maxVehicles: number | null; maxBranches: number | null; maxMembers: number | null };
  }
>;

/**
 * Bậc gói của các mô hình TRƯỚC — `standard`/`pro` (phí nền, ADR 0015/0020), `per-vehicle`
 * (giá theo chỗ, ADR 0029) và ba bậc theo trần TỔNG của ADR 0041 (`shop-*`, nghỉ hưu bởi ADR 0065).
 *
 * Lý do gỡ khỏi danh mục là màn quản trị gói, không phải sự sạch sẽ: một bảng mà nửa số hàng
 * thuộc những mô hình định giá đã chết buộc admin phải đọc TÊN để đoán hàng nào còn bán.
 */
const RETIRED_PLAN_CODES = [
  'standard',
  'pro',
  RETIRED_PER_VEHICLE_PLAN_CODE,
  RETIRED_SHOP_PLAN_CODE.BASIC,
  RETIRED_SHOP_PLAN_CODE.ADVANCED,
  RETIRED_SHOP_PLAN_CODE.PRO,
] as const;

/**
 * Gỡ các bậc cũ khỏi danh mục — XOÁ khi không còn gì trỏ tới, ARCHIVE khi còn.
 *
 * "Còn gì trỏ tới" là thuê bao (`tenant_subscriptions.plan_id` là `ON DELETE RESTRICT`) HOẶC hoá
 * đơn (`subscription_invoices.lines_json.planId`, không có FK): xoá một bậc mà hoá đơn đã phát hành
 * còn nhắc tới là để một hoá đơn `issued` không bao giờ kích hoạt được khi tiền về. Ở DB đã reset
 * thì nhánh xoá chạy; ở môi trường còn dữ liệu cũ thì seed lật `archived` và NÓI RA.
 */
async function retireLegacyPlans(): Promise<void> {
  for (const code of RETIRED_PLAN_CODES) {
    const plan = await prisma.plan.findUnique({
      where: { code },
      select: { id: true, _count: { select: { subscriptions: true } } },
    });
    if (!plan) continue;
    const counted = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM subscription_invoices WHERE lines_json->>'planId' = ${plan.id}`;
    const invoices = counted[0]?.n ?? 0n;
    if (plan._count.subscriptions > 0 || Number(invoices) > 0) {
      await prisma.plan.update({
        where: { id: plan.id },
        data: { status: PLAN_STATUS.ARCHIVED },
      });
      log(
        `  ⚠️  gói cũ "${code}" còn ${plan._count.subscriptions} thuê bao / ${Number(invoices)} hoá đơn ` +
          'trỏ tới — giữ lại và lật NGỪNG BÁN thay vì xoá.',
      );
      continue;
    }
    await prisma.plan.delete({ where: { id: plan.id } });
    log(`  gỡ gói cũ khỏi danh mục: ${code}`);
  }
}
async function seedPlans(): Promise<PlanIds> {
  const byCode: PlanIds = new Map();
  await retireLegacyPlans();
  for (const plan of PLANS) {
    const id = seedId(`plan:${plan.code}`);
    /*
     * TẠO-MỘT-LẦN (ADR 0065): `update` RỖNG có chủ đích — cùng kỷ luật với banner bên dưới.
     *
     * Sau khi tạo, tên / mô tả / bảng giá / hạn mức / % hoa hồng / trạng thái là của ADMIN (màn
     * quản trị gói, có audit). Seed chạy lại ở MỌI môi trường (cả production với `SEED_MODE=system`)
     * mà ghi đè chúng là xoá giá thật admin vừa chốt bằng số giữ chỗ trong repo, và lật một bậc vừa
     * mở bán về `draft`. Muốn đổi danh mục thì đổi ở màn quản trị, hoặc viết migration dữ liệu.
     */
    const row = await prisma.plan.upsert({
      where: { code: plan.code },
      update: {},
      create: {
        id,
        code: plan.code,
        name: plan.name,
        description: plan.description,
        billingMode: plan.billingMode,
        commissionPercent: plan.commissionPercent,
        // Phạm vi không đổi sau khi tạo (dòng thuê bao snapshot nó, trigger ở DB đòi khớp).
        vehicleScope: plan.vehicleScope,
        /*
         * Cast sang `InputJsonObject`: `PlanLimitsJson` là một interface CÓ HÌNH DẠNG, còn Prisma
         * đòi một kiểu có index signature — cast ở đúng một điểm ghi.
         */
        limitsJson: plan.limits as unknown as Prisma.InputJsonObject,
        sortOrder: plan.sortOrder,
        status: plan.status ?? PLAN_STATUS.ACTIVE,
      },
      select: {
        id: true,
        vehicleScope: true,
        billingMode: true,
        commissionPercent: true,
        limitsJson: true,
      },
    });
    if (row.vehicleScope !== plan.vehicleScope) {
      throw new Error(
        `Bậc "${plan.code}" trong DB có phạm vi "${row.vehicleScope}" nhưng seed khai "${plan.vehicleScope}" — ` +
          'phạm vi không đổi được sau khi tạo; sửa dữ liệu bằng tay trước khi seed lại.',
      );
    }
    // Gian hàng demo chụp ĐÚNG thứ đang ở DB (admin có thể đã sửa), không chụp bản khai trong repo.
    const limits = parsePlanLimits(row.limitsJson);
    byCode.set(plan.code, {
      id: row.id,
      billingMode: row.billingMode as BillingMode,
      commissionPercent: row.commissionPercent === null ? null : Number(row.commissionPercent),
      vehicleScope: planVehicleScopeOf(row.vehicleScope),
      termPrices: limits.termPrices,
      quota: {
        maxVehicles: limits.maxVehicles,
        maxBranches: limits.maxBranches,
        maxMembers: limits.maxMembers,
      },
    });
  }
  return byCode;
}

/**
 * CHỈ dữ liệu DEMO (`SEED_MODE=demo` — máy dev, staging demo): mở bán sáu bậc giá giữ chỗ để màn
 * chọn gói có gì để thử. Không bao giờ chạy ở `SEED_MODE=system`: ở production chúng chờ admin
 * chốt giá thật rồi tự bấm Mở bán (ADR 0065). Chỉ lật `draft → active`; bậc admin đã ngừng bán thì
 * để nguyên.
 */
export async function publishDraftPlansForDemo(): Promise<void> {
  const codes = PLANS.filter((plan) => plan.status === PLAN_STATUS.DRAFT).map((plan) => plan.code);
  const { count } = await prisma.plan.updateMany({
    where: { code: { in: codes }, status: PLAN_STATUS.DRAFT },
    data: { status: PLAN_STATUS.ACTIVE },
  });
  if (count > 0) log(`  mở bán ${count} bậc gói giá giữ chỗ (chỉ dữ liệu demo)`);
}
/**
 * Banner hero trang chủ. Upsert với `update` RỖNG có chủ đích: admin sửa nội dung banner rồi
 * chạy lại seed thì nội dung đó phải còn — seed không đè lên thứ người dùng đã đụng tay vào.
 */
const BANNERS = [
  {
    key: 'hero-1',
    title: 'Thuê xe dễ dàng, trải nghiệm xứng tầm',
    imageUrl: photo('1449965408869-eaa3f722e40d'),
    altText: 'Thuê xe dễ dàng, trải nghiệm xứng tầm cùng XePrime',
    linkUrl: '/search',
    sortOrder: 0,
  },
  {
    key: 'hero-2',
    title: 'Hành trình trọn vẹn cùng XePrime',
    imageUrl: photo('1502877338535-766e1452684a'),
    altText: 'Đa dạng dòng xe, giá cạnh tranh, hỗ trợ 24/7',
    linkUrl: '/search',
    sortOrder: 1,
  },
  {
    key: 'hero-3',
    title: 'Đi muôn nơi theo cách của bạn',
    imageUrl: photo('1469854523086-cc02fe5d8800'),
    altText: 'Đi muôn nơi theo cách của bạn — từ xe phổ thông đến cao cấp',
    linkUrl: '/search',
    sortOrder: 2,
  },
] as const;

/**
 * Hai banner KHUYẾN MÃI demo (giữa trang chủ) — ảnh dựng lại từ bản vẽ design v2, phục vụ
 * `/public/home/`. Chỉ ở chế độ demo: nội dung là chương trình MẪU ("Giảm 20%"), đổ vào production
 * là hứa một ưu đãi không có thật.
 */
const DEMO_PROMO_BANNERS = [
  {
    key: 'promo-sale',
    title: 'Tuần lễ siêu sale — Giảm 20% (mẫu)',
    imageUrl: '/home/promo-demo-sale.webp',
    altText: 'Tuần lễ siêu sale — Giảm 20%',
    linkUrl: '/search',
    sortOrder: 0,
  },
  {
    key: 'promo-vf3',
    title: 'Đặt ngay VF3+ (mẫu)',
    imageUrl: '/home/promo-demo-vf3.webp',
    altText: 'Tuần lễ siêu sale — Đặt ngay VF3+',
    linkUrl: '/search',
    sortOrder: 1,
  },
] as const;

/** `update: {}` như banner đầu trang: admin sửa rồi chạy lại seed thì bản sửa phải còn. */
export async function seedDemoPromoBanners(): Promise<void> {
  for (const banner of DEMO_PROMO_BANNERS) {
    const { key, ...fields } = banner;
    const id = seedId(`banner:${key}`);
    await prisma.marketplaceBanner.upsert({
      where: { id },
      update: {},
      create: { id, ...fields, placement: BANNER_PLACEMENT.PROMO, active: true },
    });
  }
}

async function seedBanners(): Promise<void> {
  for (const banner of BANNERS) {
    const { key, ...fields } = banner;
    const id = seedId(`banner:${key}`);
    await prisma.marketplaceBanner.upsert({
      where: { id },
      update: {},
      create: { id, ...fields, active: true },
    });
  }
}

/**
 * MÃ KHUYẾN MÃI NỀN TẢNG (ADR 0046) — dữ liệu NỀN, không phải demo.
 *
 * Ở đây vì ba lý do: chúng không có tên người thật, không thuộc gian hàng nào, và màn quản trị
 * `/manage/admin/promo-codes` cần có nội dung để dùng được ngay sau `SEED_MODE=system`.
 *
 * Bộ này cố ý phủ đủ mọi hình dạng mà giao diện phải vẽ được: mã tiền / mã %, có trần / không
 * trần, đang chạy / sắp diễn ra / sắp hết hạn / đã hết hạn / đã tắt / hết lượt, và mã KHÔNG
 * công bố (chỉ gõ tay được). Thiếu một hình dạng nào thì nhánh giao diện của nó không ai từng
 * nhìn thấy trước khi lên production.
 *
 * `update: {}` như banner: admin sửa rồi chạy lại seed thì bản sửa phải còn.
 */
const PROMO_CODES = [
  {
    key: 'banmoi',
    code: 'BANMOI',
    name: 'Ưu đãi khách hàng mới',
    description: 'Giảm 100.000đ cho đơn thuê xe đầu tiên',
    discountType: PROMO_DISCOUNT_TYPE.FIXED,
    discountAmount: '100000',
    minOrderAmount: '800000',
    audience: PROMO_AUDIENCE.NEW_CUSTOMER,
    totalUsageLimit: 500,
    perCustomerLimit: 1,
    startsFromToday: -21,
    endsInDays: 100,
  },
  {
    key: 'vaothu',
    code: 'VAOTHU',
    name: 'Voucher vào thu',
    description: 'Giảm 8% giá thuê, tối đa 80.000đ',
    discountType: PROMO_DISCOUNT_TYPE.PERCENT,
    discountPercent: 8,
    maxDiscountAmount: '80000',
    minOrderAmount: '500000',
    totalUsageLimit: 1000,
    perCustomerLimit: 2,
    startsFromToday: -7,
    endsInDays: 69,
  },
  {
    key: 'trangtron',
    code: 'TRANGTRON',
    name: 'Ưu đãi trung thu',
    description: 'Giảm 120.000đ cho chuyến từ 1.000.000đ',
    discountType: PROMO_DISCOUNT_TYPE.FIXED,
    discountAmount: '120000',
    minOrderAmount: '1000000',
    totalUsageLimit: 500,
    perCustomerLimit: 1,
    startsFromToday: -2,
    // Sắp hết hạn — đúng hình dạng thẻ thống kê "Sắp hết hạn" của màn admin đếm tới.
    endsInDays: 5,
  },
  {
    key: 'xemay50',
    code: 'XEMAY50',
    name: 'Xe máy đi phố',
    description: 'Giảm 50.000đ cho chuyến thuê xe máy tự lái',
    discountType: PROMO_DISCOUNT_TYPE.FIXED,
    discountAmount: '50000',
    minOrderAmount: '200000',
    vehicleScope: PROMO_VEHICLE_SCOPE.MOTORBIKE,
    serviceScope: [SERVICE_TYPE.SELF_DRIVE],
    totalUsageLimit: 800,
    perCustomerLimit: 3,
    startsFromToday: -10,
    endsInDays: 80,
  },
  {
    key: 'vip20',
    code: 'VIP20',
    name: 'Ưu đãi khách VIP',
    description: 'Giảm 20% giá thuê, tối đa 200.000đ — mã riêng, không công bố',
    discountType: PROMO_DISCOUNT_TYPE.PERCENT,
    discountPercent: 20,
    maxDiscountAmount: '200000',
    minOrderAmount: '1000000',
    totalUsageLimit: 200,
    perCustomerLimit: 1,
    // KHÔNG công bố: chỉ gõ tay được, không lọt vào danh sách mã khả dụng của khách.
    listed: false,
    startsFromToday: -21,
    endsInDays: 100,
  },
  {
    key: 'sapmo',
    code: 'SAPMO',
    name: 'Chiến dịch sắp mở',
    description: 'Giảm 150.000đ — bắt đầu tuần sau',
    discountType: PROMO_DISCOUNT_TYPE.FIXED,
    discountAmount: '150000',
    minOrderAmount: '900000',
    totalUsageLimit: 300,
    perCustomerLimit: 1,
    startsFromToday: 7,
    endsInDays: 45,
  },
  {
    key: 'hello50',
    code: 'HELLO50',
    name: 'Chào hè',
    description: 'Giảm 50.000đ — chiến dịch đã kết thúc',
    discountType: PROMO_DISCOUNT_TYPE.FIXED,
    discountAmount: '50000',
    minOrderAmount: '300000',
    totalUsageLimit: 500,
    perCustomerLimit: 1,
    startsFromToday: -120,
    endsInDays: -30,
  },
  {
    key: 'flash48',
    code: 'FLASH48',
    name: 'Flash sale 48h',
    description: 'Giảm 10% tối đa 100.000đ — đã dùng hết lượt',
    discountType: PROMO_DISCOUNT_TYPE.PERCENT,
    discountPercent: 10,
    maxDiscountAmount: '100000',
    totalUsageLimit: 50,
    perCustomerLimit: 1,
    startsFromToday: -12,
    endsInDays: 30,
    /*
     * Bộ đếm mồi để màn admin có một hàng "Hết lượt" thật. `reserved_count` KHÔNG kèm dòng
     * `promo_redemptions` nào, và đó là chủ đích của dữ liệu nền: một lượt dùng phải gắn với một
     * yêu cầu thuê có thật, còn ở chế độ `system` thì chưa có yêu cầu nào tồn tại.
     */
    reservedCount: 50,
  },
  {
    key: 'tamdung',
    code: 'TAMDUNG',
    name: 'Chiến dịch đang tạm dừng',
    description: 'Giảm 80.000đ — công tắc đang TẮT',
    discountType: PROMO_DISCOUNT_TYPE.FIXED,
    discountAmount: '80000',
    minOrderAmount: '600000',
    totalUsageLimit: 400,
    perCustomerLimit: 1,
    isActive: false,
    startsFromToday: -14,
    endsInDays: 60,
  },
] as const;

async function seedPromoCodes(): Promise<void> {
  for (const promo of PROMO_CODES) {
    const id = seedId(`promo:${promo.key}`);
    await prisma.promoCode.upsert({
      where: { id },
      update: {},
      create: {
        id,
        code: promo.code,
        name: promo.name,
        description: promo.description,
        discountType: promo.discountType,
        discountAmount:
          'discountAmount' in promo && promo.discountAmount != null
            ? new Prisma.Decimal(promo.discountAmount)
            : null,
        discountPercent: 'discountPercent' in promo ? promo.discountPercent : null,
        maxDiscountAmount:
          'maxDiscountAmount' in promo && promo.maxDiscountAmount != null
            ? new Prisma.Decimal(promo.maxDiscountAmount)
            : null,
        minOrderAmount: new Prisma.Decimal('minOrderAmount' in promo ? promo.minOrderAmount : '0'),
        audience: 'audience' in promo ? promo.audience : PROMO_AUDIENCE.ALL,
        vehicleScope: 'vehicleScope' in promo ? promo.vehicleScope : PROMO_VEHICLE_SCOPE.ALL,
        serviceScope: 'serviceScope' in promo ? [...promo.serviceScope] : [],
        provinceCodes: [],
        totalUsageLimit: promo.totalUsageLimit,
        perCustomerLimit: promo.perCustomerLimit,
        reservedCount: 'reservedCount' in promo ? promo.reservedCount : 0,
        startsAt: daysFromToday(promo.startsFromToday),
        endsAt: daysFromToday(promo.endsInDays),
        isActive: 'isActive' in promo ? promo.isActive : true,
        listed: 'listed' in promo ? promo.listed : true,
      },
    });
  }
}

export interface SystemSeedResult {
  permissionIds: PermissionIds;
  financeCategoryIds: FinanceCategoryIds;
  planIds: PlanIds;
}

export async function seedSystemData(): Promise<SystemSeedResult> {
  const permissionIds = await seedPermissions();
  log(`  quyền: ${permissionIds.size}`);

  for (const roleKey of Object.values(TENANT_ROLE)) {
    await seedSystemRole(
      SCOPE.TENANT,
      roleKey,
      TENANT_ROLE_LABEL[roleKey],
      DEFAULT_TENANT_ROLE_PERMISSIONS[roleKey],
      permissionIds,
    );
  }
  for (const roleKey of Object.values(PLATFORM_ROLE)) {
    await seedSystemRole(
      SCOPE.PLATFORM,
      roleKey,
      PLATFORM_ROLE_LABEL[roleKey],
      DEFAULT_PLATFORM_ROLE_PERMISSIONS[roleKey],
      permissionIds,
    );
  }
  log(
    `  role hệ thống: ${Object.keys(TENANT_ROLE).length} gian hàng + ` +
      `${Object.keys(PLATFORM_ROLE).length} nền tảng`,
  );

  const financeCategoryIds = await seedFinanceCategories();
  log(`  danh mục thu/chi: ${financeCategoryIds.size}`);

  const planIds = await seedPlans();
  log(`  gói dịch vụ: ${planIds.size}`);

  await seedBanners();
  log(`  banner trang chủ: ${BANNERS.length}`);

  await seedPromoCodes();

  // Mẫu email "Hướng dẫn đăng ký và gia hạn gói" — admin quản lý; seed chỉ TẠO MỚI, không ghi đè.
  await seedPlanGuideTemplates();
  log(`  mã khuyến mãi nền tảng: ${PROMO_CODES.length}`);

  // Danh mục sản phẩm bảo hiểm MIC (ADR 0064) — chỉ TẠO MỚI, admin sửa ở màn "Bảo hiểm".
  log(`  sản phẩm bảo hiểm: ${await seedInsuranceProducts()}`);

  return { permissionIds, financeCategoryIds, planIds };
}
