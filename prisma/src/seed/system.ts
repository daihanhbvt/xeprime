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
  DEFAULT_PLATFORM_ROLE_PERMISSIONS,
  DEFAULT_TENANT_ROLE_PERMISSIONS,
  FINANCE_CATEGORY_TYPE,
  PERMISSION_VALUES,
  PLAN_STATUS,
  PLATFORM_ROLE,
  PLATFORM_ROLE_LABEL,
  SCOPE,
  SYSTEM_FINANCE_CATEGORY,
  TENANT_ROLE,
  TENANT_ROLE_LABEL,
  type Permission,
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
 * Gói dịch vụ nền tảng (ADR 0010). Không phải dữ liệu demo: màn quản trị gói và màn chọn gói
 * của gian hàng cần danh mục này ở mọi môi trường.
 */
const PLANS = [
  {
    code: 'free',
    name: 'Dùng thử',
    description: 'Cho gian hàng mới mở — tối đa 3 xe, đủ để chạy thử toàn bộ quy trình.',
    price: 0,
    durationDays: 30,
    maxVehicles: 3,
    sortOrder: 0,
  },
  {
    code: 'standard',
    name: 'Tiêu chuẩn',
    description: 'Gian hàng một chi nhánh — tối đa 20 xe, đủ tính năng vận hành và sổ thu chi.',
    price: 490_000,
    durationDays: 30,
    maxVehicles: 20,
    sortOrder: 1,
  },
  {
    code: 'pro',
    name: 'Chuyên nghiệp',
    description: 'Nhiều chi nhánh, không giới hạn số xe, có tài xế và báo cáo nâng cao.',
    price: 1_490_000,
    durationDays: 30,
    maxVehicles: null,
    sortOrder: 2,
  },
] as const;

/** Tra gói theo `code` để gán thuê bao cho gian hàng demo. */
export type PlanIds = Map<string, { id: string; price: number }>;

async function seedPlans(): Promise<PlanIds> {
  const byCode: PlanIds = new Map();
  for (const plan of PLANS) {
    const id = seedId(`plan:${plan.code}`);
    const fields = {
      name: plan.name,
      description: plan.description,
      price: plan.price,
      durationDays: plan.durationDays,
      maxVehicles: plan.maxVehicles,
      sortOrder: plan.sortOrder,
    };
    const row = await prisma.plan.upsert({
      where: { code: plan.code },
      update: fields,
      create: { id, code: plan.code, status: PLAN_STATUS.ACTIVE, ...fields },
      select: { id: true },
    });
    byCode.set(plan.code, { id: row.id, price: plan.price });
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
