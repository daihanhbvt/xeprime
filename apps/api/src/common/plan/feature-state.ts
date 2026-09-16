import type { Prisma } from '@xeprime/prisma';
import {
  PLAN_FEATURE_VALUES,
  SUBSCRIPTION_STATUS,
  featureState,
  isPlanFeature,
  parsePlanLimits,
  isSubscriptionTrack,
  resolveEffectiveBilling,
  type BillingMode,
  type BillingPhase,
  type EffectiveBilling,
  type EffectiveSubscriptionRow,
  type FeatureState,
  type PlanFeature,
} from '@xeprime/types';

/**
 * Trục NĂNG LỰC theo gói — ADR 0027. Hàm thuần dùng chung cho guard, `AuthService.me()` và
 * `BillingService`, để không nơi nào tự diễn giải lại "gói hiện hành" hay "cờ nào đang bật".
 *
 * ⚠️ Đây là trục THỨ HAI, độc lập với `PERMISSION` (ADR 0027 điều 2). Không hàm nào ở đây trả
 * lời câu "người này được xem không" — đó là việc của RBAC, và hai câu trả lời kiểm tra nối tiếp.
 */

/**
 * Điều kiện "gói còn hạn" — HẸP, chỉ dùng ở nơi thật sự cần một gói đang chạy.
 *
 * ⚠️ KHÔNG dùng vị từ này để quyết định tuyến hay năng lực. Nó loại bỏ dòng thuê bao vừa hết
 * hạn, nên trong cửa sổ ân hạn nó trả về rỗng — và một tenant "không có gói" thì mọi phép
 * `?? PACKAGE` ở nơi gọi sẽ lặng lẽ biến họ thành tuyến gói 0đ. Xem `effectiveSubscriptionWhere`.
 */
export function currentSubscriptionWhere(now: Date): Prisma.TenantSubscriptionWhereInput {
  return {
    status: SUBSCRIPTION_STATUS.ACTIVE,
    startsAt: { lte: now },
    endsAt: { gt: now },
  };
}

/**
 * Điều kiện dòng thuê bao HIỆU LỰC — rộng hơn `currentSubscriptionWhere` đúng một chỗ: nó
 * KHÔNG loại dòng đã hết hạn.
 *
 * Dùng kèm `orderBy: { endsAt: 'desc' }, take: 1` để lấy dòng gần nhất đã bắt đầu, rồi đưa cho
 * `resolveEffectiveBilling` chấm pha. Ba lý do phải là một truy vấn chứ không phải hai:
 *
 *  1. Nó chạy trong `TenantScopeGuard` cho MỌI request tenant-scoped.
 *  2. Dòng "gói đã gia hạn cho kỳ sau" có `starts_at` ở tương lai và bị `startsAt: { lte: now }`
 *     loại đúng lúc cần loại; khi tới kỳ nó tự trở thành dòng có `endsAt` lớn nhất.
 *  3. `orderBy endsAt desc` cho ra dòng đang chạy khi có, và dòng vừa hết hạn khi không —
 *     chính xác hai đầu vào mà phép chấm pha cần.
 */
export function effectiveSubscriptionWhere(now: Date): Prisma.TenantSubscriptionWhereInput {
  return {
    status: SUBSCRIPTION_STATUS.ACTIVE,
    startsAt: { lte: now },
  };
}

/**
 * `select`/`orderBy`/`take` khớp `EffectiveSubscriptionRow` — khai một chỗ, dùng ở mọi nested
 * select.
 *
 * `plans.name` đọc kèm vì NHÃN tài khoản cần nó ("Chủ gian hàng · Gian hàng theo chỗ xe"), và
 * nó đã nằm trên đúng hàng mà truy vấn này chạm tới — một cột thêm vào một hàng đã đọc rẻ hơn
 * một round-trip thứ hai chỉ để lấy một cái tên, và rẻ hơn hẳn việc web tự dịch `planCode`
 * thành nhãn (bản dịch đó trôi khỏi danh mục ngay lần admin đổi tên gói).
 *
 * ⚠️ KHÔNG đọc `commission_percent` ở đây: xem docblock `EffectiveBilling` — số nhân ra tiền
 * nằm ở `fee_policies`, không ở dòng thuê bao.
 */
export const EFFECTIVE_SUBSCRIPTION_ARGS = {
  orderBy: { endsAt: 'desc' },
  take: 1,
  select: {
    endsAt: true,
    billingMode: true,
    plan: { select: { code: true, name: true, limitsJson: true } },
  },
} as const;

/**
 * Cờ tính năng của một bậc gói, đọc từ `plans.limits_json.features` (ADR 0027 điều 4).
 *
 * PHÒNG THỦ tuyệt đối: jsonb NULL, hỏng, sai kiểu, hay chứa chuỗi lạ đều cho ra tập RỖNG hoặc bỏ
 * phần tử lạ — KHÔNG BAO GIỜ ném. Lý do: hàm này chạy trong guard toàn cục, và một `limits_json`
 * hỏng của một tenant không được phép làm mọi request của họ thành 500.
 */
export function planFeatureFlags(limitsJson: unknown): Set<PlanFeature> {
  return new Set(parsePlanLimits(limitsJson).features);
}

/**
 * Ba trạng thái cho ĐỦ 8 cờ — ADR 0027 điều 3, **như đã sửa 15/09/2026**.
 *
 * `allowReadOnly` là điều mới, và nó tách hai chuyện trước đây bị gộp:
 *
 *  - **Hạ bậc gói khi VẪN Ở TUYẾN GÓI** (`allowReadOnly = true`, cờ vắng, đã có dữ liệu)
 *    ⇒ `read_only`. Đây là mục đích gốc của ADR 0027 điều 3 và nó GIỮ NGUYÊN: không ai mất
 *    quyền xem sổ sách của chính mình vì đổi sang một bậc gói nhỏ hơn.
 *  - **Đang ở TUYẾN HOA HỒNG** (`allowReadOnly = false`) ⇒ **`hidden` hết**, kể cả tính năng đã
 *    từng dùng. Tuyến đó không có bộ quản lý nâng cao ở bất kỳ chế độ nào — kể cả chỉ-xem. Thứ
 *    chủ xe vẫn phải xem và xử lý được (đơn đang chạy, chứng từ, ví, thuế) **không nằm sau cờ
 *    nào**, nên nó không bị ảnh hưởng.
 *
 * ⚠️ Trục này là TUYẾN, không phải PHA. Lấy pha làm mốc thì mốc "sau khi worker nối dòng hoa
 * hồng" lại thành `current` và `read_only` mọc lại — tức là hành vi phụ thuộc việc job vòng đời
 * đã chạy hay chưa, đúng loại cửa sổ mà cả đợt sửa này xoá bỏ.
 *
 * Luôn trả đủ 8 mục, kể cả `hidden`: client phân biệt "cờ này hidden" với "backend cũ chưa biết
 * cờ này", và một mục vắng mặt không nói được điều nào trong hai.
 */
export function featureStatesFrom(
  flags: ReadonlySet<PlanFeature>,
  usedFeatures: readonly string[],
  allowReadOnly: boolean,
): Record<PlanFeature, FeatureState> {
  const used = new Set(usedFeatures.filter(isPlanFeature));
  return Object.fromEntries(
    PLAN_FEATURE_VALUES.map((feature) => [
      feature,
      /*
       * `allowReadOnly` chỉ tắt trạng thái GIỮA, không tắt `enabled`.
       *
       * Gói hoa hồng có `features: []` nên kết quả là `hidden` hết — nhưng nếu một ngày admin
       * cấu hình một bậc hoa hồng CÓ cờ, cờ đó vẫn phải mở. Trả thẳng `hidden` cho mọi thứ là
       * gộp hai câu hỏi ("có cờ không" và "được xem lại dữ liệu cũ không") vào một chỗ tắt.
       */
      featureState(flags.has(feature), allowReadOnly && used.has(feature)),
    ]),
  ) as Record<PlanFeature, FeatureState>;
}

/** Hình dạng dòng gói hiệu lực mà guard/`me()` cần — `select` khai ở nơi gọi phải khớp cái này. */
export type CurrentPlanFeatureRow = EffectiveSubscriptionRow;

/** Thứ mà guard và `me()` cần biết về gói của một tenant, giải đúng MỘT lần cho mỗi request. */
export interface TenantPlanContext {
  features: Record<PlanFeature, FeatureState>;
  planCode: string | null;
  /** Tên hiển thị của gói đang xét — nhãn tài khoản (`resolveAccountTrack`) đọc nó. */
  planName: string | null;
  planEndsAt: Date | null;
  /** `null` khi `phase = unconfigured` — nơi gọi phải xử lý, không được `?? PACKAGE`. */
  billingMode: BillingMode | null;
  phase: BillingPhase;
  graceEndsAt: Date | null;
  billing: EffectiveBilling;
}

/**
 * Dòng thuê bao hiệu lực + `used_features` → toàn bộ ngữ cảnh gói của một tenant.
 *
 * Gộp thành một hàm vì cả `TenantScopeGuard` lẫn `AuthService.me()` cần **đúng những giá trị
 * này** từ **đúng hai đầu vào này** — tách ra là mời hai nơi tính lệch nhau.
 */
export function resolveTenantFeatures(
  subscription: CurrentPlanFeatureRow | null,
  usedFeatures: readonly string[],
  now: Date = new Date(),
): TenantPlanContext {
  const billing = resolveEffectiveBilling(subscription, now);
  return {
    features: featureStatesFrom(
      // Cờ chỉ đọc được khi gói còn hiệu lực (`current` hoặc `grace`); hết ân hạn thì bậc gói cũ
      // không nói gì nữa. `allowReadOnly` là câu hỏi KHÁC — xem docblock `featureStatesFrom`.
      planFeatureFlags(billing.featuresActive ? (subscription?.plan.limitsJson ?? null) : null),
      usedFeatures,
      isSubscriptionTrack(billing),
    ),
    planCode: billing.planCode,
    planName: billing.planName,
    planEndsAt: billing.planEndsAt,
    billingMode: billing.billingMode,
    phase: billing.phase,
    graceEndsAt: billing.graceEndsAt,
    billing,
  };
}
