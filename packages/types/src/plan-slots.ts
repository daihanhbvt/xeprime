import {
  packageTermCovering,
  resolveActivePackageTerms,
  type EffectiveBilling,
  type EffectiveSubscriptionRow,
} from './effective-billing';
import {
  OWNER_LITE_VEHICLE_LIMIT,
  PLAN_VEHICLE_SCOPE,
  VEHICLE_QUOTA_KIND,
  parsePlanLimits,
  parsePlanQuota,
  type PlanVehicleScope,
  type VehicleQuotaKind,
} from './plan-billing';
import { BILLING_MODE } from './status/billing';
import { VEHICLE_TYPE, type VehicleType } from './status/vehicle';

/**
 * SUẤT TRÊN CHỢ ở một lần đổi tuyến / đổi gói (ADR 0085 điều 5) — lõi THUẦN, dùng chung cho api (xem
 * trước khi mua, lượt áp lúc tiền về) và worker (đầu kỳ hạ bậc, hết ân hạn). Không Prisma, không Nest.
 *
 * Xe "chiếm suất" là xe đang chờ duyệt hoặc đã công khai VÀ công tắc hiển thị đang bật (ADR 0085
 * điều 4); phép đếm xe nằm ở nơi gọi (nó cần DB), ở đây chỉ có luật chia nhóm và luật lựa chọn.
 */

/** Lát cắt của hạn mức MỘT loại xe mà phép chia nhóm cần. */
export interface SlotQuota {
  kind: VehicleQuotaKind;
  limit: number | null;
  countedScope: PlanVehicleScope;
}

/** MỘT nhóm suất: các xe đếm chung một trần. */
export interface PlanSlotGroup {
  /** Đếm trong phạm vi nào: một loại xe, hoặc `all` khi trần dùng chung cho cả hai loại. */
  countedScope: PlanVehicleScope;
  /** Số suất. `0` = tuyến gói nhưng loại xe này không có gói (ADR 0065 điều 4). */
  limit: number;
}

/** Dòng thuê bao đủ để đọc trần: snapshot `quota_json` thắng bậc gói (ADR 0041 điều 3). */
export type SlotSubscriptionRow = EffectiveSubscriptionRow & { quotaJson?: unknown };

/**
 * Hạn mức suất của MỘT loại xe từ các dòng hiệu lực — CÙNG luật với cổng chặn của api
 * (`BillingService.quotaForVehicleType`, nơi trả thêm thông tin kỳ gói để hiển thị):
 *
 *  - ngoài tuyến gói (hoa hồng, `unconfigured`) → trần Owner Lite, đếm TỔNG hai loại;
 *  - tuyến gói, có kỳ phủ loại xe → trần của kỳ đó (snapshot trước, bậc gói sau, biểu thức tường minh);
 *  - tuyến gói, không kỳ nào phủ → `scope_required` (trần 0).
 */
export function planSlotQuotaFor(
  rows: readonly SlotSubscriptionRow[],
  billing: EffectiveBilling,
  vehicleType: VehicleType,
  now: Date,
): SlotQuota {
  if (billing.billingMode !== BILLING_MODE.PACKAGE) {
    return {
      kind: VEHICLE_QUOTA_KIND.TOTAL,
      limit: OWNER_LITE_VEHICLE_LIMIT,
      countedScope: PLAN_VEHICLE_SCOPE.ALL,
    };
  }
  const term = packageTermCovering(resolveActivePackageTerms(rows, now), vehicleType);
  if (!term) {
    return { kind: VEHICLE_QUOTA_KIND.SCOPE_REQUIRED, limit: null, countedScope: vehicleType };
  }
  const quota = parsePlanQuota(term.row.quotaJson);
  const limit = quota ? quota.maxVehicles : parsePlanLimits(term.row.plan.limitsJson).maxVehicles;
  return {
    kind: limit === null ? VEHICLE_QUOTA_KIND.UNLIMITED : VEHICLE_QUOTA_KIND.TOTAL,
    limit,
    countedScope: term.vehicleScope === PLAN_VEHICLE_SCOPE.ALL ? PLAN_VEHICLE_SCOPE.ALL : vehicleType,
  };
}

/**
 * Hạn mức hai loại xe → các nhóm suất phải gác, mỗi `countedScope` MỘT lần.
 *
 *  - trần theo loại (`total`, `countedScope` = loại đó) → một nhóm cho loại đó;
 *  - trần dùng chung (bậc `all` có trần, Owner Lite) → MỘT nhóm `all` dù hai loại cùng trả về nó;
 *  - loại chưa có gói ở tuyến gói (`scope_required`) → nhóm trần 0 của loại đó;
 *  - không giới hạn → không có nhóm nào để gác.
 */
export function planSlotGroups(quotas: Readonly<Record<VehicleType, SlotQuota>>): PlanSlotGroup[] {
  const groups = new Map<PlanVehicleScope, PlanSlotGroup>();
  for (const vehicleType of [VEHICLE_TYPE.CAR, VEHICLE_TYPE.MOTORBIKE] as const) {
    const quota = quotas[vehicleType];
    if (quota.kind === VEHICLE_QUOTA_KIND.SCOPE_REQUIRED) {
      groups.set(vehicleType, { countedScope: vehicleType, limit: 0 });
      continue;
    }
    if (quota.kind !== VEHICLE_QUOTA_KIND.TOTAL || quota.limit === null) continue;
    if (!groups.has(quota.countedScope)) {
      groups.set(quota.countedScope, { countedScope: quota.countedScope, limit: quota.limit });
    }
  }
  return [...groups.values()];
}

/** Kết quả kiểm lựa chọn "xe giữ lại" của người bán. */
export interface SlotSelectionCheck {
  /** Danh sách giữ lại đã lọc về đúng các xe đang vượt (bỏ id lạ / xe không thuộc nhóm vượt). */
  keepVehicleIds: string[];
  /** Nhóm có số xe giữ lại vượt trần của nó — lựa chọn không hợp lệ. */
  overLimitScopes: PlanVehicleScope[];
}

/**
 * Kiểm lựa chọn "xe giữ lại" so với các nhóm đang vượt suất (ADR 0085 điều 5): mỗi nhóm giữ tối đa
 * đúng số suất của nó. Hệ thống KHÔNG chọn thay: giữ ít hơn trần là quyền của người bán, và xe không
 * được chọn sẽ tạm ẩn lúc áp.
 */
export function checkSlotSelection(
  overflow: readonly { countedScope: PlanVehicleScope; limit: number; vehicleIds: readonly string[] }[],
  requested: readonly string[],
): SlotSelectionCheck {
  const wanted = new Set(requested);
  const keepVehicleIds: string[] = [];
  const overLimitScopes: PlanVehicleScope[] = [];
  for (const group of overflow) {
    const kept = group.vehicleIds.filter((id) => wanted.has(id));
    if (kept.length > group.limit) overLimitScopes.push(group.countedScope);
    keepVehicleIds.push(...kept);
  }
  return { keepVehicleIds: [...new Set(keepVehicleIds)], overLimitScopes };
}

/** Phạm vi đếm → loại xe của truy vấn (`all` = mọi loại ⇒ `null`). */
export function slotScopeVehicleType(countedScope: PlanVehicleScope): VehicleType | null {
  return countedScope === PLAN_VEHICLE_SCOPE.ALL ? null : (countedScope as VehicleType);
}
