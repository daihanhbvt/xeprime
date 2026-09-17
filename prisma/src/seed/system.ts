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
  DEFAULT_COMMISSION_PLAN_CODE,
  RETIRED_PER_VEHICLE_PLAN_CODE,
  SHOP_PLAN_CODE,
  BILLING_MODE,
  DEFAULT_PLATFORM_ROLE_PERMISSIONS,
  DEFAULT_TENANT_ROLE_PERMISSIONS,
  FINANCE_CATEGORY_TYPE,
  FULL_MANAGE_FEATURES,
  OWNER_LITE_FEATURES,
  PERMISSION_VALUES,
  PLAN_STATUS,
  PLATFORM_ROLE,
  PLATFORM_ROLE_LABEL,
  SCOPE,
  SYSTEM_FINANCE_CATEGORY,
  TENANT_ROLE,
  TENANT_ROLE_LABEL,
  type BillingMode,
  type Permission,
  type PlanLimitsJson,
  type SystemFinanceCategoryKey,
} from '@xeprime/types';
import { Prisma } from '../index';
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
 * Gói dịch vụ nền tảng (ADR 0041). Không phải dữ liệu demo: màn quản trị gói và màn chọn gói
 * của gian hàng cần danh mục này ở mọi môi trường.
 *
 * KHÔNG đổi mã đã phát hành — đổi mã là mồ côi mọi `tenant_subscriptions` đang trỏ tới; gói
 * hết vai trò thì lật `archived`, không xoá. Giá là DỮ LIỆU pilot cho admin chỉnh sau.
 *
 * ## Danh mục có BỐN hàng, và chúng không cùng một loại thứ
 *
 * `free` (`DEFAULT_COMMISSION_PLAN_CODE`) **không phải một SKU**. Nó là TUYẾN vào cửa: mọi
 * chủ xe cá nhân được gán nó lúc mở gian hàng, giá 0đ, không kỳ hạn nào để mua, không gì để
 * gia hạn. Backend giữ nó là duy nhất và không cho archive (`BillingService` —
 * `COMMISSION_PLAN_IS_SINGLETON` / `DEFAULT_PLAN_PROTECTED`), còn `listPlansForTenant` lọc nó
 * ra khỏi màn chọn gói. Phí dịch vụ 10% nằm PHÍA KHÁCH, cộng vào khoản giữ chỗ (ADR 0029
 * điều 2) — không phải khoản khấu trừ của chủ xe.
 *
 * Ba hàng còn lại là BA BẬC gian hàng (ADR 0041 điều 7), khác nhau ở QUY MÔ: trần xe, trần chi
 * nhánh, và giá.
 *
 * ## Vì sao BA bậc bây giờ, khi ADR 0029 chốt một
 *
 * Ở mô hình chỗ xe, quy mô là một con số người mua tự gõ, nên một hàng plan là đủ và ba hàng
 * chỉ khác nhau `months` sẽ là ba chỗ để giá trôi. ADR 0041 đổi thứ được bán: người mua chọn
 * một BẬC, và ba bậc khác nhau ở trần xe (3 / 10 / ∞), trần chi nhánh (1 / 3 / ∞) và bảng giá.
 * Đó là KHÁC BIỆT THẬT — đúng điều kiện mà bản trước của chú thích này đặt ra để một hàng plan
 * thứ hai xứng đáng ra đời.
 *
 * Bốn kỳ hạn của MỘT bậc thì vẫn là bốn lựa chọn MUA trong `limits.termPrices`, không phải bốn
 * hàng plan: chúng cùng trần, cùng cờ năng lực, cùng `graceDays`.
 *
 * ## Cả ba bậc mở CÙNG bộ tính năng
 *
 * Ranh giới năng lực là giữa hai TUYẾN (ADR 0027 · ADR 0038), không phải giữa ba bậc. Gian hàng
 * trả 100.000đ/tháng vẫn là gian hàng trả phí: họ có đủ bộ quản lý, chỉ nhỏ hơn về quy mô. Cắt
 * bớt tính năng theo bậc sẽ dựng một bậc thứ ba của ADR 0027 mà không ADR nào định nghĩa.
 */
const PLANS: ReadonlyArray<{
  code: string;
  name: string;
  description: string;
  billingMode: BillingMode;
  commissionPercent: number | null;
  limits: PlanLimitsJson;
  sortOrder: number;
  /** 'archived' = gói lịch sử, giữ hàng cho subscription cũ nhưng không bán nữa. */
  status?: 'active' | 'archived';
}> = [
  {
    code: DEFAULT_COMMISSION_PLAN_CODE,
    name: 'Tuyến hoa hồng mặc định',
    description:
      'TUYẾN vào cửa của mọi chủ xe cá nhân, không phải gói để mua: 0đ thuê bao, không hạn sử dụng. ' +
      'Nền tảng thu phí dịch vụ 10% ở PHÍA KHÁCH qua khoản giữ chỗ khi đặt xe. Tối đa 3 xe (Owner Lite).',
    billingMode: BILLING_MODE.COMMISSION,
    commissionPercent: 10,
    limits: {
      /*
       * `maxVehicles` NULL có chủ đích — và nó KHÔNG có nghĩa "không giới hạn" ở đây.
       *
       * Trần của tuyến hoa hồng là `OWNER_LITE_VEHICLE_LIMIT` = 3, một quy tắc SẢN PHẨM viết
       * trong code (ADR 0038 điều 12). `vehicleQuotaFor` nhận ra tuyến này trước khi đọc tới
       * `limits`, nên con số ở đây không bao giờ được dùng. Chép 3 vào đây là dựng một trần DỮ
       * LIỆU cạnh một trần QUY TẮC, và hai thứ đó sẽ trôi khỏi nhau ở lần đầu ai đó sửa một bên.
       */
      maxVehicles: null,
      maxBranches: null,
      maxMembers: null,
      /*
       * RỖNG có chủ đích: `termPrices` là bảng giá VÀ danh sách kỳ hạn ĐƯỢC BÁN (ADR 0041 điều
       * 2), và tuyến hoa hồng không bán gì cả — không hoá đơn, không gia hạn, không ngày hết gói
       * trong sản phẩm. Khai một bảng giá cho nó là bày một biểu giá cho thứ không có giá, và
       * màn quản trị sẽ hiện nó như một SKU.
       *
       * Dòng thuê bao kỹ thuật vẫn dài `COMMISSION_TRACK_TERM_MONTHS` (12 tháng) và được job
       * vòng đời nối liền từ `ends_at` — đó là chuyện của DỮ LIỆU, không phải của bảng giá.
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
    code: SHOP_PLAN_CODE.BASIC,
    name: 'Gói cơ bản',
    description: 'Phù hợp cho cá nhân hoặc cửa hàng nhỏ, dễ dàng bắt đầu và quản lý.',
    billingMode: BILLING_MODE.PACKAGE,
    commissionPercent: null,
    limits: {
      maxVehicles: 3,
      maxBranches: 1,
      maxMembers: null,
      // Giá TUYỆT ĐỐI từng kỳ (ADR 0041 điều 2) — % tiết kiệm hiển thị được tính ra từ chính
      // bảng này, không lưu ở đâu cả.
      termPrices: [
        { months: 1, price: '100000' },
        { months: 3, price: '250000' },
        { months: 6, price: '450000' },
        { months: 12, price: '800000' },
      ],
      salesOnly: false,
      recommended: false,
      graceDays: 7,
      features: FEATURES_BY_TIER.fullManage,
    },
    sortOrder: 1,
  },
  {
    code: SHOP_PLAN_CODE.ADVANCED,
    name: 'Gói nâng cao',
    description: 'Dành cho chủ xe quy mô nhỏ: nhiều xe hơn, nhiều chi nhánh hơn.',
    billingMode: BILLING_MODE.PACKAGE,
    commissionPercent: null,
    limits: {
      maxVehicles: 10,
      maxBranches: 3,
      maxMembers: null,
      termPrices: [
        { months: 1, price: '250000' },
        { months: 3, price: '650000' },
        { months: 6, price: '1200000' },
        { months: 12, price: '2000000' },
      ],
      salesOnly: false,
      recommended: true,
      graceDays: 7,
      features: FEATURES_BY_TIER.fullManage,
    },
    sortOrder: 2,
  },
  {
    code: SHOP_PLAN_CODE.PRO,
    name: 'Gói chuyên nghiệp',
    description:
      'Hệ thống quản lý quy mô lớn, không giới hạn xe và chi nhánh. Liên hệ để được tư vấn và báo giá riêng.',
    billingMode: BILLING_MODE.PACKAGE,
    commissionPercent: null,
    limits: {
      maxVehicles: null,
      maxBranches: null,
      maxMembers: null,
      /*
       * Không bảng giá VÀ `salesOnly` — hai thứ đi đôi (ADR 0041 điều 5).
       *
       * `salesOnly` là thứ backend đọc để từ chối `purchase()` (`PLAN_NOT_SELF_SERVE`) và để
       * bắt admin nhập giá đàm phán lúc gán. `termPrices` rỗng là hệ quả: một giá niêm yết cạnh
       * nút "Liên hệ tư vấn" là bày một con số rồi chặn người bấm vào nó.
       */
      termPrices: [],
      salesOnly: true,
      recommended: false,
      graceDays: 7,
      features: FEATURES_BY_TIER.fullManage,
    },
    sortOrder: 3,
  },
];

/** Tra gói theo `code` để gán thuê bao cho gian hàng demo (kèm snapshot chế độ — ADR 0024). */
export type PlanIds = Map<
  string,
  {
    id: string;
    billingMode: BillingMode;
    commissionPercent: number | null;
    /** Bảng giá cả kỳ (ADR 0041 điều 2) — gian hàng demo lấy đúng giá niêm yết của kỳ nó mua. */
    termPrices: PlanLimitsJson['termPrices'];
    /** Hạn mức SNAPSHOT lên dòng thuê bao demo — cùng hình dạng `BillingService.assign` ghi. */
    quota: { maxVehicles: number | null; maxBranches: number | null; maxMembers: number | null };
  }
>;

/**
 * Bậc gói của các mô hình TRƯỚC — `standard`/`pro` (phí nền, ADR 0015/0020) và `per-vehicle`
 * (giá theo chỗ, ADR 0029).
 *
 * Lý do gỡ khỏi danh mục là màn quản trị gói, không phải sự sạch sẽ: một bảng có sáu hàng trong
 * đó ba hàng thuộc hai mô hình định giá đã chết buộc admin phải đọc TÊN để đoán hàng nào còn
 * bán, và cột "Ngừng bán" bị đọc nhầm thành "thuê bao của gian hàng này đã bị huỷ".
 */
const RETIRED_PLAN_CODES = ['standard', 'pro', RETIRED_PER_VEHICLE_PLAN_CODE] as const;

/**
 * Gỡ hai bậc cũ khỏi danh mục — XOÁ khi không còn ai trỏ tới, ARCHIVE khi còn.
 *
 * Không bao giờ xoá cứng một bậc còn thuê bao: `tenant_subscriptions.plan_id` là
 * `ON DELETE RESTRICT`, và kể cả nếu không thì xoá nó là xoá mất mã gói mà một hoá đơn đã
 * phát hành đang nhắc tới. Ở DB đã reset thì nhánh xoá chạy; ở một môi trường còn thuê bao cũ
 * thì seed để lại bậc đó, lật `archived`, và NÓI RA — im lặng ở đây là admin mở màn gói ra
 * thấy một hàng mà tài liệu bảo là đã bỏ.
 */
async function retireLegacyPlans(): Promise<void> {
  for (const code of RETIRED_PLAN_CODES) {
    const plan = await prisma.plan.findUnique({
      where: { code },
      select: { id: true, _count: { select: { subscriptions: true } } },
    });
    if (!plan) continue;
    if (plan._count.subscriptions > 0) {
      await prisma.plan.update({
        where: { id: plan.id },
        data: { status: PLAN_STATUS.ARCHIVED },
      });
      log(
        `  ⚠️  gói cũ "${code}" còn ${plan._count.subscriptions} thuê bao trỏ tới — giữ lại và ` +
          'lật NGỪNG BÁN thay vì xoá. Chạy lại seed một lượt nữa: lượt này vừa dọn xong các dòng ' +
          'thuê bao lạc của gian hàng demo, nên lượt sau sẽ xoá được hàng gói cũ.',
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
    const fields = {
      name: plan.name,
      description: plan.description,
      billingMode: plan.billingMode,
      commissionPercent: plan.commissionPercent,
      /*
       * Cast sang `InputJsonObject`: `PlanLimitsJson` là một interface CÓ HÌNH DẠNG (đó là
       * điểm mạnh của nó — `parsePlanLimits` đọc lại đúng các khoá), còn Prisma đòi một kiểu
       * có index signature. Hai yêu cầu loại trừ nhau trong TypeScript; giữ hình dạng ở tầng
       * types và cast ở đúng một điểm ghi là đánh đổi rẻ hơn nới lỏng kiểu.
       */
      limitsJson: plan.limits as unknown as Prisma.InputJsonObject,
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
      billingMode: plan.billingMode,
      commissionPercent: plan.commissionPercent,
      termPrices: plan.limits.termPrices,
      quota: {
        maxVehicles: plan.limits.maxVehicles,
        maxBranches: plan.limits.maxBranches,
        maxMembers: plan.limits.maxMembers,
      },
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
