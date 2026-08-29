import type { Prisma } from '@xeprime/prisma';
import {
  PLAN_FEATURE_VALUES,
  SUBSCRIPTION_STATUS,
  featureState,
  isPlanFeature,
  parsePlanLimits,
  type FeatureState,
  type PlanFeature,
} from '@xeprime/types';

/**
 * Trục NĂNG LỰC theo gói — ADR 0027. Ba hàm thuần dùng chung cho guard, `AuthService.me()` và
 * `BillingService`, để không nơi nào tự diễn giải lại "gói hiện hành" hay "cờ nào đang bật".
 *
 * ⚠️ Đây là trục THỨ HAI, độc lập với `PERMISSION` (ADR 0027 điều 2). Không hàm nào ở đây trả
 * lời câu "người này được xem không" — đó là việc của RBAC, và hai câu trả lời kiểm tra nối tiếp.
 */

/**
 * Điều kiện "gói HIỆN HÀNH" — MỘT định nghĩa cho cả `BillingService.findCurrent` lẫn guard.
 *
 * Hai định nghĩa trôi khỏi nhau là lỗi chờ sẵn: guard nói còn hạn, billing nói hết, và tenant
 * thấy menu mở nhưng mọi thao tác đều 403 (hoặc ngược lại). Trả `where` chứ không trả kết quả để
 * mỗi nơi tự chọn `select` của mình — guard cần `limitsJson`, billing cần cả dòng snapshot.
 */
export function currentSubscriptionWhere(now: Date): Prisma.TenantSubscriptionWhereInput {
  return {
    status: SUBSCRIPTION_STATUS.ACTIVE,
    startsAt: { lte: now },
    endsAt: { gt: now },
  };
}

/**
 * Cờ tính năng của một bậc gói, đọc từ `plans.limits_json.features` (ADR 0027 điều 4).
 *
 * PHÒNG THỦ tuyệt đối: jsonb NULL, hỏng, sai kiểu, hay chứa chuỗi lạ đều cho ra tập RỖNG hoặc bỏ
 * phần tử lạ — KHÔNG BAO GIỜ ném. Lý do: hàm này chạy trong guard toàn cục, và một `limits_json`
 * hỏng của một tenant không được phép làm mọi request của họ thành 500. `parsePlanLimits` (dùng
 * chung với web/mobile) đã lọc `features` qua `isPlanFeature`; lớp lọc ở đây là dây an toàn thứ
 * hai cho trường hợp caller truyền thẳng một mảng.
 *
 * `null` (không có gói hiện hành) và "có gói nhưng không cờ nào" cố ý cho cùng kết quả: cả hai
 * đều là "không có năng lực nâng cao", và ADR 0027 điều 3 phân biệt tiếp bằng `usedFeatures`.
 */
export function planFeatureFlags(limitsJson: unknown): Set<PlanFeature> {
  return new Set(parsePlanLimits(limitsJson).features);
}

/**
 * Ba trạng thái cho ĐỦ 8 cờ — ADR 0027 điều 3.
 *
 * Luôn trả đủ 8 mục, kể cả `hidden`: client phân biệt "cờ này hidden" với "backend cũ chưa biết
 * cờ này", và một mục vắng mặt không nói được điều nào trong hai.
 */
export function featureStatesFrom(
  flags: ReadonlySet<PlanFeature>,
  usedFeatures: readonly string[],
): Record<PlanFeature, FeatureState> {
  const used = new Set(usedFeatures.filter(isPlanFeature));
  return Object.fromEntries(
    PLAN_FEATURE_VALUES.map((feature) => [
      feature,
      featureState(flags.has(feature), used.has(feature)),
    ]),
  ) as Record<PlanFeature, FeatureState>;
}

/** Hình dạng dòng gói hiện hành mà guard/`me()` cần — `select` khai ở nơi gọi phải khớp cái này. */
export interface CurrentPlanFeatureRow {
  endsAt: Date;
  plan: { code: string; limitsJson: unknown };
}

/**
 * Gói hiện hành (hoặc `null`) + `used_features` → ba trạng thái, mã gói và ngày hết hạn.
 *
 * Gộp thành một hàm vì cả `TenantScopeGuard` lẫn `AuthService.me()` cần **đúng ba giá trị này**
 * từ **đúng hai đầu vào này** — tách ra là mời hai nơi tính lệch nhau.
 */
export function resolveTenantFeatures(
  subscription: CurrentPlanFeatureRow | null,
  usedFeatures: readonly string[],
): {
  features: Record<PlanFeature, FeatureState>;
  planCode: string | null;
  planEndsAt: Date | null;
} {
  return {
    features: featureStatesFrom(
      planFeatureFlags(subscription?.plan.limitsJson ?? null),
      usedFeatures,
    ),
    planCode: subscription?.plan.code ?? null,
    planEndsAt: subscription?.endsAt ?? null,
  };
}
