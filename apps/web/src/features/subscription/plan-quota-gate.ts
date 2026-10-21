import {
  API_ERROR_CODE,
  PLAN_QUOTA_GATE_POINT,
  PLAN_VEHICLE_SCOPE,
  QUOTA_LIMIT_REASON,
  VEHICLE_TYPE,
  type PlanQuotaGatePoint,
  type VehicleType,
} from '@xeprime/types';
import { SHOP_SECTION, shopSectionPath, withPlanPurchaseIntent } from '@/constants/routes';

import { commissionPlanHref, planLaneHref, type PlanLaneScope } from './plan-lanes';

export { PLAN_QUOTA_GATE_POINT };
export type { PlanQuotaGatePoint };

/**
 * CỔNG HẠN MỨC XE của gói — đọc từ lỗi API, để màn xe nói ĐÚNG việc phải làm kèm một lối đi tiếp
 * (ADR 0065 điều 3–4 · ADR 0041 điều 4).
 *
 * Hai mã, và câu chữ chung của `Errors` không đủ cho cả hai:
 *  - `PLAN_SCOPE_REQUIRED` `{ vehicleType }` — gian hàng tuyến gói chưa có gói cho loại xe này.
 *    Lối đi tiếp: mua gói ĐÚNG loại xe đó.
 *  - `PLAN_LIMIT_REACHED` `{ scope, reason, vehicleType, countedScope, used, limit }` — đã dùng hết
 *    trần. Lối đi tiếp theo NGUỒN của trần: bậc đã mua ⇒ nâng bậc của làn đó; Owner Lite ⇒ nâng cấp
 *    lên gian hàng.
 *
 * Hàm THUẦN trên hình dạng lỗi (`{ code, details }` của `ApiClientError`), không đụng React: test
 * được, và mọi màn xe (tạo, sửa, gửi duyệt, bật lại trên chợ) đọc cùng một bảng.
 */
export const PLAN_QUOTA_GATE_KIND = {
  SCOPE_REQUIRED: 'scope_required',
  LIMIT_REACHED: 'limit_reached',
} as const;
export type PlanQuotaGateKind = (typeof PLAN_QUOTA_GATE_KIND)[keyof typeof PLAN_QUOTA_GATE_KIND];

/** Trần chặn đến từ đâu — quyết định lối đi tiếp. */
export const PLAN_QUOTA_GATE_SOURCE = {
  /** Trần của bậc gói theo LOẠI xe đã mua. */
  LANE_PLAN: 'lane_plan',
  /** Trần chung của bậc phủ cả hai loại (doanh nghiệp / bậc cũ). */
  SHARED_PLAN: 'shared_plan',
  /** Owner Lite — tuyến hoa hồng, TỔNG hai loại. */
  OWNER_LITE: 'owner_lite',
} as const;
export type PlanQuotaGateSource =
  (typeof PLAN_QUOTA_GATE_SOURCE)[keyof typeof PLAN_QUOTA_GATE_SOURCE];

export type PlanQuotaGate =
  | { kind: typeof PLAN_QUOTA_GATE_KIND.SCOPE_REQUIRED; vehicleType: PlanLaneScope }
  | {
      kind: typeof PLAN_QUOTA_GATE_KIND.LIMIT_REACHED;
      vehicleType: PlanLaneScope;
      point: PlanQuotaGatePoint;
      source: PlanQuotaGateSource;
      used: number;
      limit: number;
    };

interface ApiErrorLike {
  code?: unknown;
  details?: unknown;
}

function vehicleTypeOf(value: unknown): PlanLaneScope | null {
  return value === VEHICLE_TYPE.CAR || value === VEHICLE_TYPE.MOTORBIKE
    ? (value as VehicleType & PlanLaneScope)
    : null;
}

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * Lỗi → cổng hạn mức, hoặc `null` khi không phải một trong hai mã (hay `details` hỏng — khi đó nơi
 * gọi rơi về câu chung của `useErrorMessage`, không bao giờ in một câu thiếu số).
 */
export function planQuotaGateFrom(error: unknown): PlanQuotaGate | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code, details } = error as ApiErrorLike;
  const d = (details ?? {}) as Record<string, unknown>;

  if (code === API_ERROR_CODE.PLAN_SCOPE_REQUIRED) {
    const vehicleType = vehicleTypeOf(d.vehicleType);
    return vehicleType ? { kind: PLAN_QUOTA_GATE_KIND.SCOPE_REQUIRED, vehicleType } : null;
  }

  if (code === API_ERROR_CODE.PLAN_LIMIT_REACHED) {
    const vehicleType = vehicleTypeOf(d.vehicleType);
    const used = asNumber(d.used);
    const limit = asNumber(d.limit);
    if (!vehicleType || used == null || limit == null) return null;
    const source =
      d.reason === QUOTA_LIMIT_REASON.OWNER_LITE
        ? PLAN_QUOTA_GATE_SOURCE.OWNER_LITE
        : d.countedScope === PLAN_VEHICLE_SCOPE.ALL
          ? PLAN_QUOTA_GATE_SOURCE.SHARED_PLAN
          : PLAN_QUOTA_GATE_SOURCE.LANE_PLAN;
    return {
      kind: PLAN_QUOTA_GATE_KIND.LIMIT_REACHED,
      vehicleType,
      point:
        d.scope === PLAN_QUOTA_GATE_POINT.MARKETPLACE
          ? PLAN_QUOTA_GATE_POINT.MARKETPLACE
          : PLAN_QUOTA_GATE_POINT.FLEET,
      source,
      used,
      limit,
    };
  }

  return null;
}

/**
 * Lối đi tiếp của một cổng: làn gói của đúng loại xe (mở sẵn hộp thoại mua), section gói chung khi
 * trần là trần CHUNG của bậc doanh nghiệp (đổi bậc đó là chuyện tư vấn), hoặc luồng nâng cấp của
 * tuyến hoa hồng.
 */
export function planQuotaGateHref(gate: PlanQuotaGate): string {
  if (gate.kind === PLAN_QUOTA_GATE_KIND.SCOPE_REQUIRED) {
    return withPlanPurchaseIntent(planLaneHref(gate.vehicleType));
  }
  switch (gate.source) {
    case PLAN_QUOTA_GATE_SOURCE.OWNER_LITE:
      return commissionPlanHref();
    case PLAN_QUOTA_GATE_SOURCE.SHARED_PLAN:
      return shopSectionPath(SHOP_SECTION.PLAN);
    case PLAN_QUOTA_GATE_SOURCE.LANE_PLAN:
      return withPlanPurchaseIntent(planLaneHref(gate.vehicleType));
  }
}
