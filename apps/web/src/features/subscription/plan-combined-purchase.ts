'use client';

import { useMemo, useState } from 'react';
import { buildPlanPricingCards, moneyPerPart, sumMoney } from '@xeprime/domain';
import { type MoneyString, type SubscriptionTermMonths } from '@xeprime/types';

import {
  PLAN_LANE_SCOPES,
  SHOP_PLAN_LANE_ORDER,
  currentPlanForScope,
  packagePlansForScope,
  type PlanLaneScope,
} from './plan-lanes';
import type { PlanTier } from './plan-purchase';
import type { CurrentPlan, PurchaseSubscriptionInput, TenantPlan } from './types';

/** Một làn loại xe của hộp "Mua hoặc gia hạn gói" — bậc đang bán + kỳ đang chạy của loại đó. */
export interface CombinedPlanLane {
  scope: PlanLaneScope;
  tiers: readonly PlanTier[];
  current: CurrentPlan | null;
  /** Bậc đang chọn ở làn này; `null` = không mua gói cho loại xe này lần này. */
  selected: PlanTier | null;
}

/** Một kỳ hạn chọn được — `savingPercent` là phép SO SÁNH hiển thị (ADR 0041 điều 2). */
export interface CombinedTermOption {
  months: SubscriptionTermMonths;
  savingPercent: number;
}

/**
 * Một gói sẽ vào hoá đơn — đủ để dựng dòng tóm tắt và body gửi lên. KHÔNG có ngày: mua mới / gia
 * hạn / nâng ngay / đổi từ kỳ sau và kỳ dự kiến là việc của server (`usePurchasePreview`, ADR 0084)
 * — client chỉ thấy kỳ đang chạy, không thấy kỳ đã xếp lịch.
 */
export interface CombinedPlanSelection {
  scope: PlanLaneScope;
  tier: PlanTier;
  /** Vị trí của bậc trong làn (0 = bậc đầu theo `sortOrder` của admin) — nhãn bậc theo vị trí. */
  rank: number;
  body: PurchaseSubscriptionInput;
  total: MoneyString;
  perMonth: MoneyString;
}

export interface CombinedPlanPurchaseState {
  lanes: readonly CombinedPlanLane[];
  termOptions: readonly CombinedTermOption[];
  termMonths: SubscriptionTermMonths | null;
  selections: readonly CombinedPlanSelection[];
  total: MoneyString | null;
  select: (scope: PlanLaneScope, planId: string) => void;
  setTermMonths: (months: SubscriptionTermMonths) => void;
  /** Giá MỘT THÁNG của một bậc ở kỳ hạn đang chọn — `null` khi bậc không bán kỳ đó. */
  perMonthOf: (tier: PlanTier) => MoneyString | null;
  reset: () => void;
}

/**
 * Trạng thái của hộp mua GỘP (design 06/11/2026): mỗi loại xe tối đa một bậc và MỘT kỳ hạn chung
 * cho cả lượt. Hai bậc ⇒ phiếu thanh toán gộp (ADR 0083); một bậc ⇒ hoá đơn đơn lẻ như cũ.
 *
 * Kỳ hạn chọn được là kỳ mà MỌI bậc đang chọn đều bán (`limits.termPrices` của từng bậc là bảng giá
 * VÀ danh sách kỳ được bán — ADR 0041 điều 2); chưa chọn bậc nào thì là mọi kỳ có bán ở các làn.
 * % tiết kiệm của một kỳ lấy mức THẤP nhất giữa các bậc đang chọn — một nhãn chung không được hứa
 * nhiều hơn bậc nào.
 *
 * Không có lựa chọn "thời điểm áp dụng" (ADR 0084): cùng bậc = gia hạn nối tiếp, trần cao hơn =
 * nâng ngay, còn lại = nối tiếp — server suy.
 */
export function useCombinedPlanPurchase(
  plans: readonly TenantPlan[],
  currentPlans: readonly CurrentPlan[],
): CombinedPlanPurchaseState {
  const [picked, setPicked] = useState<Partial<Record<PlanLaneScope, string>>>({});
  const [chosenTerm, setChosenTerm] = useState<SubscriptionTermMonths | null>(null);

  const tiersByScope = useMemo(
    () =>
      new Map(
        PLAN_LANE_SCOPES.map((scope) => [
          scope,
          buildPlanPricingCards(packagePlansForScope(plans, scope)).map((card): PlanTier => ({
            plan: card.plan,
            limits: card.limits,
            selfServe: card.selfServe,
            terms: card.terms.map((term) => ({
              months: term.months as SubscriptionTermMonths,
              total: term.price,
              savingPercent: term.savingPercent,
            })),
            card,
          })),
        ]),
      ),
    [plans],
  );

  const lanes: CombinedPlanLane[] = SHOP_PLAN_LANE_ORDER.map((scope) => {
    const tiers = tiersByScope.get(scope) ?? [];
    return {
      scope,
      tiers,
      current: currentPlanForScope(currentPlans, scope),
      selected: tiers.find((tier) => tier.plan.id === picked[scope] && tier.selfServe) ?? null,
    };
  }).filter((lane) => lane.tiers.length > 0);

  const selectedTiers = lanes.flatMap((lane) => (lane.selected ? [lane.selected] : []));
  const pool = selectedTiers.length
    ? selectedTiers
    : lanes.flatMap((lane) => lane.tiers.filter((tier) => tier.selfServe));
  const termOptions: CombinedTermOption[] = [
    ...new Set(pool.flatMap((tier) => tier.terms.map((term) => term.months))),
  ]
    .filter(
      (months) =>
        selectedTiers.length === 0 ||
        selectedTiers.every((tier) => tier.terms.some((term) => term.months === months)),
    )
    .sort((a, b) => a - b)
    .map((months) => ({
      months,
      savingPercent: Math.min(
        ...pool.map(
          (tier) => tier.terms.find((term) => term.months === months)?.savingPercent ?? 0,
        ),
      ),
    }));

  // Kỳ đã chọn không còn hợp lệ (đổi bậc) ⇒ rơi về kỳ ngắn nhất — design chọn sẵn "Gói 1 tháng".
  const termMonths =
    chosenTerm != null && termOptions.some((option) => option.months === chosenTerm)
      ? chosenTerm
      : (termOptions[0]?.months ?? null);

  const selections: CombinedPlanSelection[] =
    termMonths == null
      ? []
      : lanes.flatMap((lane) => {
          const term = lane.selected?.terms.find((choice) => choice.months === termMonths);
          if (!lane.selected || !term) return [];
          return [
            {
              scope: lane.scope,
              tier: lane.selected,
              rank: lane.tiers.indexOf(lane.selected),
              body: { planId: lane.selected.plan.id, termMonths },
              total: term.total,
              perMonth: moneyPerPart(term.total, termMonths),
            },
          ];
        });

  return {
    lanes,
    termOptions,
    termMonths,
    selections,
    total: selections.length ? sumMoney(selections.map((item) => item.total)) : null,
    // Bấm lại đúng bậc đang chọn là BỎ chọn — "không mua gói cho loại xe này lần này".
    select: (scope, planId) =>
      setPicked((current) => ({
        ...current,
        [scope]: current[scope] === planId ? undefined : planId,
      })),
    setTermMonths: setChosenTerm,
    perMonthOf: (tier) => {
      const term = termMonths == null ? undefined : tier.terms.find((t) => t.months === termMonths);
      return term ? moneyPerPart(term.total, term.months) : null;
    },
    reset: () => {
      setPicked({});
      setChosenTerm(null);
    },
  };
}

/** Bậc gói CHỌN SẴN khi mở hộp từ một làn: bậc đang dùng (gia hạn) — không thì bậc đề xuất. */
export function defaultTierFor(lane: CombinedPlanLane): PlanTier | null {
  const sellable = lane.tiers.filter((tier) => tier.selfServe);
  return (
    sellable.find((tier) => tier.plan.id === lane.current?.planId) ??
    sellable.find((tier) => tier.card.recommended) ??
    sellable[0] ??
    null
  );
}
