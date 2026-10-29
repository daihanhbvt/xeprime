import { useCallback } from 'react';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  PLAN_QUOTA_GATE_POINT,
  PLAN_VEHICLE_SCOPE,
  QUOTA_LIMIT_REASON,
  VEHICLE_TYPE,
  type PlanQuotaGatePoint,
} from '@xeprime/types';
import { useErrorMessage } from '@/i18n/use-error-message';

/**
 * CỔNG HẠN MỨC XE của gói đọc từ lỗi API (ADR 0065 điều 3–4 · ADR 0041 điều 4) — bản native của
 * `apps/web/src/features/subscription/plan-quota-gate.ts` + `use-plan-quota-gate-message.ts`.
 *
 * App Partner chỉ mang phần CÂU CHỮ: lỗi `PLAN_SCOPE_REQUIRED` / `PLAN_LIMIT_REACHED` ra câu nói
 * đúng loại xe và con số thay cho câu chung của `Errors`. Phần "lối đi tiếp" (dải có nút tới làn
 * gói) cố ý KHÔNG dựng ở đây — người dùng đã chốt app Partner giữ nguyên luồng IAP và không nhắc
 * mua/nâng gói (sổ đồng bộ 27/10).
 */
type GateVehicleType = typeof VEHICLE_TYPE.CAR | typeof VEHICLE_TYPE.MOTORBIKE;

const SOURCE = {
  LANE_PLAN: 'lane_plan',
  SHARED_PLAN: 'shared_plan',
  OWNER_LITE: 'owner_lite',
} as const;

type PlanQuotaGate =
  | { kind: 'scope_required'; vehicleType: GateVehicleType }
  | {
      kind: 'limit_reached';
      vehicleType: GateVehicleType;
      point: PlanQuotaGatePoint;
      source: (typeof SOURCE)[keyof typeof SOURCE];
      used: number;
      limit: number;
    };

function vehicleTypeOf(value: unknown): GateVehicleType | null {
  return value === VEHICLE_TYPE.CAR || value === VEHICLE_TYPE.MOTORBIKE ? value : null;
}

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** Lỗi → cổng hạn mức, hoặc `null` (khi đó nơi gọi rơi về câu chung — không in câu thiếu số). */
export function planQuotaGateFrom(error: unknown): PlanQuotaGate | null {
  if (typeof error !== 'object' || error === null) return null;
  const { code, details } = error as { code?: unknown; details?: unknown };
  const d = (details ?? {}) as Record<string, unknown>;

  if (code === API_ERROR_CODE.PLAN_SCOPE_REQUIRED) {
    const vehicleType = vehicleTypeOf(d.vehicleType);
    return vehicleType ? { kind: 'scope_required', vehicleType } : null;
  }

  if (code === API_ERROR_CODE.PLAN_LIMIT_REACHED) {
    const vehicleType = vehicleTypeOf(d.vehicleType);
    const used = asNumber(d.used);
    const limit = asNumber(d.limit);
    if (!vehicleType || used == null || limit == null) return null;
    const source =
      d.reason === QUOTA_LIMIT_REASON.OWNER_LITE
        ? SOURCE.OWNER_LITE
        : d.countedScope === PLAN_VEHICLE_SCOPE.ALL
          ? SOURCE.SHARED_PLAN
          : SOURCE.LANE_PLAN;
    return {
      kind: 'limit_reached',
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
 * `useErrorMessage` hiểu cổng hạn mức xe — câu "Đã dùng hết 5/5 suất xe máy…" thay cho câu chung.
 * Cùng bảng câu (`Subscription.quotaGate`) với web `usePlanAwareErrorMessage`.
 */
export function usePlanAwareErrorMessage(): (error: unknown) => string {
  const t = useTranslations('Subscription.quotaGate');
  const errorMessage = useErrorMessage();
  return useCallback(
    (error: unknown) => {
      const gate = planQuotaGateFrom(error);
      if (!gate) return errorMessage(error);
      const type = gate.vehicleType;
      if (gate.kind === 'scope_required') return t(`scopeRequired.${type}`);
      const values = { used: gate.used, limit: gate.limit };
      switch (gate.source) {
        case SOURCE.OWNER_LITE:
          return t('ownerLite', values);
        case SOURCE.SHARED_PLAN:
          return t(`shared.${gate.point}`, values);
        case SOURCE.LANE_PLAN:
          return t(`lane.${gate.point}.${type}`, values);
      }
    },
    [errorMessage, t],
  );
}
