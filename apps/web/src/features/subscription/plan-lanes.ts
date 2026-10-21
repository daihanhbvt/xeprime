import {
  BILLING_MODE,
  PLAN_VEHICLE_SCOPE,
  PLAN_VEHICLE_SCOPE_DISPLAY_ORDER,
  VEHICLE_QUOTA_KIND,
  VEHICLE_TYPE,
  isPlanVehicleScope,
  planVehicleScopeOf,
  type PlanVehicleScope,
  type VehicleType,
} from '@xeprime/types';

export { VEHICLE_QUOTA_KIND };
import {
  ACCOUNT_SECTION,
  SHOP_SECTION,
  accountSectionPath,
  shopSectionPath,
} from '@/constants/routes';

import type {
  CurrentPlan,
  MySubscription,
  SubscriptionInvoice,
  TenantPlan,
  VehicleTypeQuota,
} from './types';

/**
 * LÀN GÓI THEO LOẠI XE — ADR 0065.
 *
 * Gian hàng mua gói theo từng loại xe: tối đa MỘT gói xe máy và MỘT gói ô tô chạy song song, còn
 * bậc doanh nghiệp (`all`) phủ cả hai và loại trừ chúng. Mọi màn bán gói (trang gói, onboarding
 * tuyến gói, luồng nâng cấp từ tuyến hoa hồng) và màn quản trị đọc chung các phép chọn ở đây —
 * hai bản của "kỳ nào thuộc làn nào" là hai chỗ để một làn hiện gói của làn kia.
 *
 * Hàm THUẦN, không React: test được trực tiếp, và phép chọn là của dữ liệu server trả về
 * (`currentPlans`, `vehicleQuotas`, `invoices`) — client không tự chấm pha hay tự tính trần.
 */

/** Một làn TỰ MUA — mọi phạm vi trừ `all` (bậc doanh nghiệp bán bằng tư vấn). */
export type PlanLaneScope = Exclude<PlanVehicleScope, typeof PLAN_VEHICLE_SCOPE.ALL>;

export function isPlanLaneScope(value: unknown): value is PlanLaneScope {
  return isPlanVehicleScope(value) && value !== PLAN_VEHICLE_SCOPE.ALL;
}

/**
 * Hai làn TỰ MUA, theo thứ tự hiển thị chung `PLAN_VEHICLE_SCOPE_DISPLAY_ORDER` (`@xeprime/types` —
 * cùng thứ tự với danh mục `GET /subscription/plan-catalog` và màn quản trị): xe máy trước, ô tô sau.
 */
export const PLAN_LANE_SCOPES: readonly PlanLaneScope[] =
  PLAN_VEHICLE_SCOPE_DISPLAY_ORDER.filter(isPlanLaneScope);

/** Làn đầu tiên — đích mặc định khi không nói làn nào (hộp thoại đóng, "Xem gói cao hơn"). */
export const FIRST_PLAN_LANE: PlanLaneScope = PLAN_LANE_SCOPES[0] ?? PLAN_VEHICLE_SCOPE.MOTORBIKE;

/** Loại xe của một làn — hai mã trùng nhau có chủ đích (`car`/`motorbike`). */
export function laneVehicleType(scope: PlanLaneScope): VehicleType {
  return scope === PLAN_VEHICLE_SCOPE.CAR ? VEHICLE_TYPE.CAR : VEHICLE_TYPE.MOTORBIKE;
}

/** Bậc GÓI (không phải tuyến hoa hồng) của đúng một phạm vi, giữ thứ tự danh mục (`sortOrder`). */
export function packagePlansForScope<P extends Pick<TenantPlan, 'billingMode' | 'vehicleScope'>>(
  plans: readonly P[],
  scope: PlanVehicleScope,
): P[] {
  return plans.filter(
    (plan) =>
      plan.billingMode === BILLING_MODE.PACKAGE && planVehicleScopeOf(plan.vehicleScope) === scope,
  );
}

/** Kỳ gói ĐANG hiệu lực của đúng phạm vi đó (`current`/`grace`), `null` nếu không có. */
export function currentPlanForScope(
  currentPlans: readonly CurrentPlan[],
  scope: PlanVehicleScope,
): CurrentPlan | null {
  return currentPlans.find((plan) => planVehicleScopeOf(plan.vehicleScope) === scope) ?? null;
}

/** Kỳ doanh nghiệp đang chạy — phủ cả hai loại xe, nên hai làn tự mua đóng lại (ADR 0065 điều 2). */
export function enterprisePlanOf(currentPlans: readonly CurrentPlan[]): CurrentPlan | null {
  return currentPlanForScope(currentPlans, PLAN_VEHICLE_SCOPE.ALL);
}

/** Hoá đơn còn nhận tiền của một phạm vi — server giữ tối đa MỘT mỗi phạm vi. */
export function pendingInvoiceForScope(
  invoices: readonly SubscriptionInvoice[],
  scope: PlanVehicleScope,
): SubscriptionInvoice | null {
  return invoices.find((invoice) => planVehicleScopeOf(invoice.vehicleScope) === scope) ?? null;
}

/** Hạn mức của loại xe ứng với một làn. */
export function quotaForLane(
  quotas: MySubscription['vehicleQuotas'],
  scope: PlanLaneScope,
): VehicleTypeQuota {
  return scope === PLAN_VEHICLE_SCOPE.CAR ? quotas.car : quotas.motorbike;
}

/**
 * Hai loại xe dùng CHUNG một trần (tuyến hoa hồng: Owner Lite 3 xe TỔNG; bậc doanh nghiệp/bậc cũ
 * phạm vi `all`) ⇒ màn hình vẽ MỘT ô trần, không phải hai ô cùng nói "3 xe" — đọc hai ô đó là
 * tưởng được 3 ô tô + 3 xe máy.
 */
export function quotasShareOneCap(quotas: MySubscription['vehicleQuotas']): boolean {
  return (
    quotas.car.countedScope === PLAN_VEHICLE_SCOPE.ALL &&
    quotas.motorbike.countedScope === PLAN_VEHICLE_SCOPE.ALL
  );
}

/** Đã dùng hết trần có số (`total`) chưa — `scope_required`/`unlimited` không bao giờ "đầy". */
export function quotaIsFull(quota: VehicleTypeQuota): boolean {
  return (
    quota.kind === VEHICLE_QUOTA_KIND.TOTAL && quota.limit != null && quota.used >= quota.limit
  );
}

// ── Tham số URL `?lane=` — đích của CTA "mua gói cho loại xe này" ─────────────────────────────

/**
 * `?lane=car|motorbike` trên section gói: cuộn tới đúng làn đó (và mở hộp thoại mua khi đi kèm
 * `?purchase=1`). Đặt bởi lỗi `PLAN_SCOPE_REQUIRED`/`PLAN_LIMIT_REACHED` ở màn xe — người vừa bị
 * chặn đăng xe máy phải tới đúng làn xe máy, không phải đầu một trang có hai làn.
 */
export const PLAN_LANE_PARAM = 'lane';

export function parsePlanLane(value: string | null | undefined): PlanLaneScope | null {
  return isPlanVehicleScope(value) && isPlanLaneScope(value) ? value : null;
}

/** Section gói của gian hàng tuyến gói, trỏ thẳng tới một làn. */
export function planLaneHref(scope: PlanLaneScope): string {
  // Cùng cách nối với `withPlanPurchaseIntent`: không giả định đường dẫn section đã có `?`.
  const path = shopSectionPath(SHOP_SECTION.PLAN);
  return `${path}${path.includes('?') ? '&' : '?'}${PLAN_LANE_PARAM}=${encodeURIComponent(scope)}`;
}

/** Section gói của chủ xe tuyến hoa hồng — nơi luồng nâng cấp sống. */
export function commissionPlanHref(): string {
  return accountSectionPath(ACCOUNT_SECTION.PLAN);
}

/** Id DOM của một làn — đích cuộn/tiêu điểm của `?lane=`. */
export function planLaneElementId(scope: PlanLaneScope): string {
  return `xp-plan-lane-${scope}`;
}
