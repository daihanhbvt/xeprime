/**
 * Dữ liệu NỀN — thứ app không chạy nổi nếu thiếu, và phải có ở mọi môi trường kể cả production.
 *
 * Ranh giới với dữ liệu demo: ở đây không có gian hàng, không có xe, không có tên người thật.
 * Chạy `SEED_MODE=system` là dừng đúng sau file này.
 *
 * Danh mục tỉnh và catalog bộ lọc KHÔNG nằm ở đây — chúng do migration baseline nạp, vì chúng
 * là một phần của lược đồ (mọi môi trường có ngay sau `migrate deploy`, không đợi ai chạy seed).
 */
import {
  BILLING_MODE,
  DEFAULT_PLATFORM_ROLE_PERMISSIONS,
  DEFAULT_TENANT_ROLE_PERMISSIONS,
  FINANCE_CATEGORY_TYPE,
  PERMISSION_VALUES,
  PLAN_FEATURE,
  PLAN_STATUS,
  PLATFORM_ROLE,
  PLATFORM_ROLE_LABEL,
  SCOPE,
  SYSTEM_FINANCE_CATEGORY,
  TENANT_ROLE,
  TENANT_ROLE_LABEL,
  type BillingMode,
  type Permission,
  type PlanAssumedGmvJson,
  type PlanLimitsJson,
  type SystemFinanceCategoryKey,
} from '@xeprime/types';
import { log, photo, prisma, seedId } from './context';

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
  { type: FINANCE_CATEGORY_TYPE.INCOME, name: 'Phí quá giờ' },
  { type: FINANCE_CATEGORY_TYPE.INCOME, name: 'Phí đền bù va quẹt' },
  { type: FINANCE_CATEGORY_TYPE.INCOME, name: 'Phí phạt nguội' },
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
  },
  {
    type: FINANCE_CATEGORY_TYPE.EXPENSE,
    name: 'Sửa chữa sự cố',
    systemKey: SYSTEM_FINANCE_CATEGORY.REPAIR,
  },
  { type: FINANCE_CATEGORY_TYPE.EXPENSE, name: 'Mua bảo hiểm' },
  { type: FINANCE_CATEGORY_TYPE.EXPENSE, name: 'Rửa xe' },
  { type: FINANCE_CATEGORY_TYPE.EXPENSE, name: 'Giao/nhận xe' },
  { type: FINANCE_CATEGORY_TYPE.EXPENSE, name: 'Đổ xăng' },
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
      select: { id: true, systemKey: true },
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
        },
      });
      byName.set(cat.name, id);
      continue;
    }

    if (cat.systemKey && existing.systemKey !== cat.systemKey) {
      await prisma.financeCategory.update({
        where: { id: existing.id },
        data: { systemKey: cat.systemKey },
      });
    }
    byName.set(cat.name, existing.id);
  }
  return byName;
}

/**
 * Cờ năng lực backfill cho cả ba gói: ĐỦ 7 cờ đang dùng (trừ `escrow_hold` — ADR 0025 chưa thi
 * công). Mọi tenant hôm nay không có rào chắn nào; gói thiếu cờ nghĩa là ngày cổng chặn bật
 * (ADR 0027) họ MẤT quyền — W3 mới là đợt cân chỉnh từng gói, đợt này thà rộng còn siết sau.
 */
const ALL_CURRENT_FEATURES = [
  PLAN_FEATURE.FINANCE,
  PLAN_FEATURE.DEBTS,
  PLAN_FEATURE.MAINTENANCE,
  PLAN_FEATURE.MEMBERS,
  PLAN_FEATURE.BRANCHES,
  PLAN_FEATURE.DRIVERS,
  PLAN_FEATURE.CONTRACTS,
];

/** Bốn kỳ hạn chuẩn (ADR 0015 điều 3) — % giảm là DỮ LIỆU đặt tạm, admin chỉnh ở màn quản trị. */
const DEFAULT_TERMS = [
  { months: 1, discountPercent: 0 },
  { months: 3, discountPercent: 5 },
  { months: 6, discountPercent: 10 },
  { months: 12, discountPercent: 15 },
];

/**
 * Gói dịch vụ nền tảng (ADR 0015/0020). Không phải dữ liệu demo: màn quản trị gói và màn chọn
 * gói của gian hàng cần danh mục này ở mọi môi trường.
 *
 * KHÔNG đổi mã đã phát hành — đổi mã là mồ côi mọi `tenant_subscriptions` đang trỏ tới; gói
 * hết vai trò thì lật `archived`, không xoá. Giá là DỮ LIỆU pilot cho admin chỉnh sau
 * (ADR 0029 — kiểm điểm giao đã gỡ, phí nền 0đ hợp lệ).
 *
 * ⚠️ `free` là gói MẶC ĐỊNH lúc đăng ký — đặt nó vào TUYẾN HOA HỒNG (10%, không phí cố định,
 * không giới hạn chỗ) là quyết định tiền bạc của ADR 0020: chủ xe nhỏ vào miễn phí và chỉ trả
 * khi có doanh thu; hai đơn đầu còn được miễn cả hoa hồng (ADR 0026, thi công đợt sau).
 */
const PLANS: ReadonlyArray<{
  code: string;
  name: string;
  description: string;
  billingMode: BillingMode;
  commissionPercent: number | null;
  basePriceMonthly: number;
  assumedMonthlyGmv: PlanAssumedGmvJson | null;
  limits: PlanLimitsJson;
  /** Cột cũ ADR 0010 — giữ tới đợt contract. */
  price: number;
  durationDays: number;
  maxVehicles: number | null;
  sortOrder: number;
  /** 'archived' = gói lịch sử, giữ hàng cho subscription cũ nhưng không bán nữa (ADR 0029). */
  status?: 'active' | 'archived';
}> = [
  {
    code: 'free',
    name: 'Hoa hồng theo chuyến',
    description:
      'Mặc định khi mở gian hàng — không phí cố định, nền tảng thu hoa hồng trên mỗi chuyến qua khoản giữ chỗ.',
    billingMode: BILLING_MODE.COMMISSION,
    commissionPercent: 10,
    basePriceMonthly: 0,
    assumedMonthlyGmv: null,
    limits: {
      perVehiclePrice: { car: null, motorbike: null },
      includedCars: 0,
      includedMotorbikes: 0,
      maxCars: null,
      maxMotorbikes: null,
      maxMembers: null,
      maxBranches: null,
      terms: DEFAULT_TERMS,
      graceDays: 7,
      features: ALL_CURRENT_FEATURES,
    },
    price: 0,
    durationDays: 30,
    maxVehicles: null,
    sortOrder: 0,
  },
  /*
   * Gói pilot GIÁ PHẲNG THEO CHỖ (ADR 0029): không phí nền, 1 xe = 100k, 2 xe = 200k.
   * Kỳ hạn bán TỐI THIỂU 3 tháng — `terms` từ ADR 0029 là danh sách kỳ hạn ĐƯỢC BÁN,
   * không chỉ là bảng giảm giá, nên vắng kỳ 1 tháng nghĩa là không mua được 1 tháng.
   * Giá là DỮ LIỆU pilot; admin đổi ở màn quản trị gói, đổi không hồi tố đơn/hoá đơn cũ.
   */
  {
    code: 'per-vehicle',
    name: 'Gói theo xe',
    description:
      'Trả theo số chỗ xe: 100.000đ/ô tô và 40.000đ/xe máy mỗi tháng, tối thiểu 3 tháng — 0đ phí dịch vụ nền tảng trên mỗi chuyến.',
    billingMode: BILLING_MODE.PACKAGE,
    commissionPercent: null,
    basePriceMonthly: 0,
    // Tham khảo định giá, KHÔNG còn là đầu vào của phép kiểm nào (ADR 0029 gỡ kiểm điểm giao).
    assumedMonthlyGmv: { monthlyGmvPerCar: '1500000', commissionPercent: 10 },
    limits: {
      perVehiclePrice: { car: '100000', motorbike: '40000' },
      includedCars: 0,
      includedMotorbikes: 0,
      maxCars: null,
      maxMotorbikes: null,
      maxMembers: null,
      maxBranches: null,
      terms: [
        { months: 3, discountPercent: 0 },
        { months: 6, discountPercent: 0 },
        { months: 12, discountPercent: 0 },
      ],
      graceDays: 7,
      features: ALL_CURRENT_FEATURES,
    },
    price: 0,
    durationDays: 30,
    maxVehicles: null,
    sortOrder: 1,
  },

  // Hai bậc phí-nền cũ (ADR 0015/0020) — ARCHIVED từ ADR 0029: giữ hàng cho subscription demo
  // cũ còn trỏ tới, không bán nữa. Seed chạy lại sẽ tự lật archived cho DB đã có sẵn chúng.
  {
    code: 'standard',
    name: 'Tiêu chuẩn (cũ)',
    status: 'archived',
    description:
      'Gian hàng một chi nhánh — phí nền gồm sẵn 5 chỗ ô tô, 0đ trên chuyến, mua thêm chỗ theo đơn giá.',
    billingMode: BILLING_MODE.PACKAGE,
    commissionPercent: null,
    basePriceMonthly: 990_000,
    // Ngưỡng kiểm điểm giao: 5 chỗ × 10% × 1.500.000đ = 750.000đ ≤ 990.000đ ✓ (ADR 0020).
    assumedMonthlyGmv: { monthlyGmvPerCar: '1500000', commissionPercent: 10 },
    limits: {
      perVehiclePrice: { car: '120000', motorbike: '40000' },
      includedCars: 5,
      includedMotorbikes: 0,
      maxCars: 20,
      maxMotorbikes: 20,
      maxMembers: 5,
      maxBranches: 1,
      terms: DEFAULT_TERMS,
      graceDays: 7,
      features: ALL_CURRENT_FEATURES,
    },
    price: 490_000,
    durationDays: 30,
    maxVehicles: 20,
    sortOrder: 8,
  },
  {
    code: 'pro',
    name: 'Chuyên nghiệp (cũ)',
    status: 'archived',
    description:
      'Đội xe lớn, nhiều chi nhánh — đơn giá chỗ rẻ hơn, không trần chỗ, gồm sẵn 12 chỗ ô tô.',
    billingMode: BILLING_MODE.PACKAGE,
    commissionPercent: null,
    basePriceMonthly: 1_990_000,
    // Ngưỡng: 12 chỗ × 10% × 1.500.000đ = 1.800.000đ ≤ 1.990.000đ ✓.
    assumedMonthlyGmv: { monthlyGmvPerCar: '1500000', commissionPercent: 10 },
    limits: {
      perVehiclePrice: { car: '100000', motorbike: '30000' },
      includedCars: 12,
      includedMotorbikes: 0,
      maxCars: null,
      maxMotorbikes: null,
      maxMembers: null,
      maxBranches: null,
      terms: DEFAULT_TERMS,
      graceDays: 7,
      features: ALL_CURRENT_FEATURES,
    },
    price: 1_490_000,
    durationDays: 30,
    maxVehicles: null,
    sortOrder: 9,
  },
];

/** Tra gói theo `code` để gán thuê bao cho gian hàng demo (kèm snapshot chế độ — ADR 0024). */
export type PlanIds = Map<
  string,
  {
    id: string;
    price: number;
    billingMode: BillingMode;
    commissionPercent: number | null;
    /** Số chỗ mặc định của một lượt gán demo = đúng số gồm sẵn. */
    slots: { car: number; motorbike: number };
    /** Đơn giá chỗ/tháng (ADR 0029) — shop demo tự tính tiền theo đội xe của nó. */
    perVehiclePrice: { car: number; motorbike: number };
    basePriceMonthly: number;
  }
>;

async function seedPlans(): Promise<PlanIds> {
  const byCode: PlanIds = new Map();
  for (const plan of PLANS) {
    const id = seedId(`plan:${plan.code}`);
    const fields = {
      name: plan.name,
      description: plan.description,
      billingMode: plan.billingMode,
      commissionPercent: plan.commissionPercent,
      basePriceMonthly: plan.basePriceMonthly,
      assumedMonthlyGmvJson: plan.assumedMonthlyGmv ?? undefined,
      limitsJson: plan.limits,
      price: plan.price,
      durationDays: plan.durationDays,
      maxVehicles: plan.maxVehicles,
      sortOrder: plan.sortOrder,
      // Trạng thái do seed quyết cả ở UPDATE: chạy lại seed trên DB cũ phải lật được
      // standard/pro sang archived (ADR 0029), không chỉ với hàng tạo mới.
      status: plan.status ?? PLAN_STATUS.ACTIVE,
    };
    const row = await prisma.plan.upsert({
      where: { code: plan.code },
      update: fields,
      create: { id, code: plan.code, ...fields },
      select: { id: true },
    });
    byCode.set(plan.code, {
      id: row.id,
      price: plan.price,
      billingMode: plan.billingMode,
      commissionPercent: plan.commissionPercent,
      slots: { car: plan.limits.includedCars, motorbike: plan.limits.includedMotorbikes },
      perVehiclePrice: {
        car: Number(plan.limits.perVehiclePrice.car ?? 0),
        motorbike: Number(plan.limits.perVehiclePrice.motorbike ?? 0),
      },
      basePriceMonthly: plan.basePriceMonthly,
    });
  }
  return byCode;
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

  return { permissionIds, financeCategoryIds, planIds };
}
