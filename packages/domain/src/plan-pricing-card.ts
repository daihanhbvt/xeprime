import {
  BILLING_MODE,
  isPlanSelfServe,
  parsePlanLimits,
  planTermPrice,
  planTermSavingPercent,
  planVehicleScopeOf,
  PLAN_VEHICLE_SCOPE,
  type PlanFeature,
  type PlanLimitsJson,
  type PlanVehicleScope,
} from '@xeprime/types';

/**
 * THẺ BẬC GÓI trên bảng giá — phép dẫn xuất THUẦN mà hộp thoại "Mua / gia hạn gói" của web
 * (`PlanPricingTable`) và email hướng dẫn gói (`plan-guide-email.ts` ở API) cùng đọc (ADR 0041).
 *
 * Một nguồn cho: bậc nào hiện (mọi bậc tuyến gói, KỂ CẢ bậc tư vấn `salesOnly`), thứ tự (thứ tự
 * danh mục đưa vào — server đã sắp theo `sortOrder`), biểu tượng theo vị trí, cờ "Được đề xuất",
 * các dòng quyền lợi, và giá tiêu đề (kỳ 1 tháng, hoặc kỳ đầu tiên được bán). Hai bản của luật này
 * là cách chắc chắn nhất để email hứa một thứ mà hộp thoại bán một thứ khác.
 *
 * Tiền là CHUỖI nguyên văn của `limits.termPrices` — không phép nhân, không `number` (ADR 0007 ·
 * ADR 0041 điều 2). `savingPercent` chỉ là phép so sánh hiển thị.
 */

/** Biểu tượng bậc theo VỊ TRÍ trên bảng giá: đường tăng → ngôi sao → vương miện. */
export const PLAN_TIER_ICON = {
  TREND: 'trend',
  STAR: 'star',
  CROWN: 'crown',
} as const;
export type PlanTierIcon = (typeof PLAN_TIER_ICON)[keyof typeof PLAN_TIER_ICON];

const TIER_ICON_ORDER: readonly PlanTierIcon[] = [
  PLAN_TIER_ICON.TREND,
  PLAN_TIER_ICON.STAR,
  PLAN_TIER_ICON.CROWN,
];

/**
 * Số dòng NĂNG LỰC in dưới dòng hạn mức xe — cắt ở 2 để các thẻ cao bằng nhau và so ngang được;
 * danh sách đầy đủ thuộc về trang bảng giá công khai.
 */
export const PLAN_CARD_FEATURE_LINES = 2;

/**
 * Một dòng quyền lợi — nơi vẽ tự dịch (web: `t()`, email: cùng file message).
 *
 * Dòng trần xe mang PHẠM VI của bậc (ADR 0065 điều 3): "Tối đa 5 xe máy", không phải "5 xe" chung
 * chung — đọc "5 xe" trên một bậc ô tô là tưởng được thêm xe máy. Không còn dòng chi nhánh: trần chi
 * nhánh thôi là hạn mức từ ADR 0065 điều 1, in nó ra là hứa một giới hạn không tồn tại.
 */
export type PlanBenefitLine =
  | { kind: 'vehicles'; count: number | null; scope: PlanVehicleScope }
  | { kind: 'feature'; feature: PlanFeature };

/**
 * Khoá message của dòng trần xe, trong `Subscription.purchase` (một file message cho web, app và
 * email hướng dẫn gói). Một bảng để mọi nơi vẽ không tự rẽ nhánh theo phạm vi.
 */
export const PLAN_VEHICLES_LINE_MESSAGE = {
  [PLAN_VEHICLE_SCOPE.MOTORBIKE]: {
    capped: 'limitMotorbikes',
    unlimited: 'limitMotorbikesUnlimited',
  },
  [PLAN_VEHICLE_SCOPE.CAR]: { capped: 'limitCars', unlimited: 'limitCarsUnlimited' },
  [PLAN_VEHICLE_SCOPE.ALL]: { capped: 'limitVehicles', unlimited: 'limitVehiclesUnlimited' },
} as const satisfies Record<PlanVehicleScope, { capped: string; unlimited: string }>;

type VehiclesLineKeys = (typeof PLAN_VEHICLES_LINE_MESSAGE)[PlanVehicleScope];
export type PlanVehiclesLineMessageKey = VehiclesLineKeys['capped'] | VehiclesLineKeys['unlimited'];

/** Dòng trần xe → khoá message + biến (`{count}` chỉ có ở khoá có trần). */
export function planVehiclesLineMessage(line: Extract<PlanBenefitLine, { kind: 'vehicles' }>): {
  key: PlanVehiclesLineMessageKey;
  values: { count: number } | undefined;
} {
  const keys = PLAN_VEHICLES_LINE_MESSAGE[line.scope];
  return line.count == null
    ? { key: keys.unlimited, values: undefined }
    : { key: keys.capped, values: { count: line.count } };
}

export interface PlanCardTerm {
  months: number;
  /** Giá CẢ KỲ, chuỗi tiền nguyên văn. */
  price: string;
  savingPercent: number;
}

/** Giá tiêu đề của thẻ: `months === 1` ⇒ "/ tháng", khác ⇒ "/ N tháng". */
export interface PlanCardHeadline {
  months: number;
  price: string;
}

export interface PlanPricingCard<P> {
  plan: P;
  limits: PlanLimitsJson;
  /** `false` = bậc tư vấn (hoặc chưa khai bảng giá) — hiện "Liên hệ báo giá" + nút liên hệ. */
  selfServe: boolean;
  recommended: boolean;
  icon: PlanTierIcon;
  benefits: readonly PlanBenefitLine[];
  terms: readonly PlanCardTerm[];
  /** `null` khi bậc không tự mua được — nơi vẽ hiện "Liên hệ báo giá". */
  headline: PlanCardHeadline | null;
}

export interface PlanCardSource {
  billingMode: string;
  limits: unknown;
  /** Phạm vi loại xe của bậc (ADR 0065) — thiếu/lạ đọc là `all` (`planVehicleScopeOf`). */
  vehicleScope?: unknown;
}

export function planTierIcon(index: number): PlanTierIcon {
  return TIER_ICON_ORDER[Math.min(index, TIER_ICON_ORDER.length - 1)] ?? PLAN_TIER_ICON.CROWN;
}

export function planBenefitLines(
  limits: PlanLimitsJson,
  scope: PlanVehicleScope = PLAN_VEHICLE_SCOPE.ALL,
): PlanBenefitLine[] {
  return [
    { kind: 'vehicles', count: limits.maxVehicles, scope },
    ...limits.features
      .slice(0, PLAN_CARD_FEATURE_LINES)
      .map((feature): PlanBenefitLine => ({ kind: 'feature', feature })),
  ];
}

/**
 * Danh mục gói → thẻ bảng giá. Lọc `billingMode = package` là phòng thủ tầng hai (server đã lọc);
 * thứ tự giữ nguyên thứ tự đầu vào.
 */
export function buildPlanPricingCards<P extends PlanCardSource>(
  plans: readonly P[],
): PlanPricingCard<P>[] {
  return plans
    .filter((p) => p.billingMode === BILLING_MODE.PACKAGE)
    .map((plan, index) => {
      const limits = parsePlanLimits(plan.limits);
      const selfServe = isPlanSelfServe(limits);
      const terms: PlanCardTerm[] = limits.termPrices.map((term) => ({
        months: term.months,
        price: planTermPrice(limits, term.months) ?? '0',
        savingPercent: planTermSavingPercent(limits, term.months),
      }));
      const monthly = terms.find((term) => term.months === 1) ?? terms[0];
      return {
        plan,
        limits,
        selfServe,
        recommended: limits.recommended,
        icon: planTierIcon(index),
        benefits: planBenefitLines(limits, planVehicleScopeOf(plan.vehicleScope)),
        terms,
        headline: selfServe && monthly ? { months: monthly.months, price: monthly.price } : null,
      };
    });
}
