'use client';

import { useState } from 'react';
import { buildPlanPricingCards, sumMoney, type PlanPricingCard } from '@xeprime/domain';
import {
  PLAN_VEHICLE_SCOPE,
  type MoneyString,
  type PlanLimitsJson,
  type SubscriptionTermMonths,
} from '@xeprime/types';

import { PLAN_LANE_SCOPES, packagePlansForScope, type PlanLaneScope } from './plan-lanes';
import type { PurchaseSubscriptionInput, TenantPlan } from './types';

/**
 * BỘ CHỌN MUA GÓI - state + phép đọc bảng giá, tách khỏi phần vẽ.
 *
 * ## Vì sao tồn tại
 *
 * Từ ADR 0040 có HAI màn bán đúng một thứ: `PurchaseModal` (gia hạn/nâng bậc, mở từ section gói
 * của trang Cửa hàng / "Hồ sơ chủ xe") và bước 2 của onboarding gian hàng trả phí. Hai bản của cùng
 * bộ chọn nghĩa là hai bản của luật đọc bảng giá - kỳ hạn nào được bán, bậc nào tự mua được - và
 * hai bản là cách chắc chắn nhất để một màn hiện một con số mà server tính ra con số khác.
 *
 * ## Vì sao là HOOK, không phải một component có `onChange`
 *
 * Nơi gọi cần `selection` để bật/khoá nút "Tạo hoá đơn" của chính nó. Một component con báo lên
 * bằng `onChange` thì hoặc gọi trong render (React cảnh báo, và một cú bấm nhanh có thể gửi lựa
 * chọn của frame trước), hoặc gọi trong `useEffect` - lúc đó nút mờ/sáng TRỄ một nhịp so với
 * thứ người dùng vừa bấm. State ở nơi gọi giải cả hai: `selection` luôn là hàm thuần của cùng
 * một lần render đang vẽ ra nút đó.
 */

/** Lựa chọn ĐÃ ĐỦ để gửi lên server, kèm tổng tiền để nút bấm nói được con số. */
export interface PlanPurchaseSelection {
  /** Đúng hình dạng `PurchaseSubscriptionDto` - nơi gọi không nhào nặn gì. */
  body: PurchaseSubscriptionInput;
  /**
   * Tiền cả kỳ - CHUỖI tiền nguyên văn của bảng giá (ADR 0007), chỉ để HIỂN THỊ; server đọc lại bảng
   * giá và đó là số quyết định.
   */
  total: MoneyString;
}

/** Một thẻ kỳ hạn của bậc đang xem: giá cả kỳ + % tiết kiệm so với mua từng tháng. */
export interface PlanTermChoice {
  months: SubscriptionTermMonths;
  total: MoneyString;
  savingPercent: number;
}

/**
 * Một BẬC trên bảng giá - đủ để vẽ một thẻ mà không parse lại `limits` ở tầng view.
 *
 * `selfServe: false` (bậc tư vấn) vẫn nằm trong danh sách: giấu hẳn bậc doanh nghiệp là giấu
 * luôn lối nâng cấp của gian hàng lớn nhất. Thẻ của nó hiện nút "Liên hệ tư vấn" thay cho giá,
 * và `purchase()` ở server từ chối bằng `PLAN_NOT_SELF_SERVE` nếu ai đó gọi thẳng API.
 */
export interface PlanTier {
  plan: TenantPlan;
  limits: PlanLimitsJson;
  /** Tự mua được không - `false` = bậc `salesOnly`, hoặc bậc chưa khai bảng giá. */
  selfServe: boolean;
  terms: readonly PlanTermChoice[];
  /**
   * Thẻ dẫn xuất DÙNG CHUNG với email hướng dẫn gói (`@xeprime/domain` - `buildPlanPricingCards`):
   * biểu tượng, cờ đề xuất, dòng quyền lợi, giá tiêu đề. Bảng giá vẽ từ đây để hai nơi không lệch.
   */
  card: PlanPricingCard<TenantPlan>;
}

export interface PlanPurchaseState {
  /** Mọi bậc tuyến gói đang bán, kể cả bậc tư vấn - dùng để VẼ bảng giá. */
  tiers: readonly PlanTier[];
  planId: string | null;
  selected: PlanTier | undefined;
  termMonths: SubscriptionTermMonths | null;
  total: MoneyString | null;
  /** `null` = chưa đủ để mua (chưa chọn bậc/kỳ hạn, hoặc bậc đang chọn bán bằng tư vấn). */
  selection: PlanPurchaseSelection | null;
  selectPlan: (id: string) => void;
  setTermMonths: (months: SubscriptionTermMonths) => void;
  /**
   * Xoá sạch lựa chọn - cho vỏ dùng lại được instance này (hộp thoại mở/đóng nhiều lần).
   *
   * `PurchaseModal` sống suốt vòng đời trang, nên không có lần remount nào dọn hộ. Giữ lựa chọn
   * cũ nghĩa là mở lại hộp thoại thấy một kỳ hạn ĐÃ SÁNG - đúng thứ `selectPlan` đang chống
   * ("mặc định sẵn một kỳ hạn nghĩa là có người trả trước 12 tháng vì đó là thứ đang sáng lên").
   * Tệ hơn sau một lượt mua thành công: form trở lại đầy đủ, cách một cú bấm với hoá đơn thứ hai.
   */
  reset: () => void;
}

export function usePlanPurchase(plans: readonly TenantPlan[]): PlanPurchaseState {
  const [planId, setPlanId] = useState<string | null>(null);
  const [termMonths, setTermMonths] = useState<SubscriptionTermMonths | null>(null);

  /*
   * Lọc theo CHẾ ĐỘ THU PHÍ - PHÒNG THỦ TẦNG HAI, không phải luật.
   *
   * `listPlansForTenant` đã lọc `billingMode = package` ở SERVER (15/09/2026), nên bậc tuyến hoa
   * hồng không bao giờ tới được đây. Giữ bộ lọc để một backend cũ hơn - hoặc một cache còn nóng
   * sau khi deploy - không đẩy tuyến mặc định vào bảng giá, nơi `purchase()` sẽ từ chối nó với
   * "không có khoản phải trả" mà người dùng không hiểu vì sao lựa chọn đó lại hiện ra.
   *
   * Các giá trị dẫn xuất dưới đây KHÔNG bọc `useMemo`, có chủ đích: chúng đến từ một `.filter()`
   * dựng mới mỗi lần render, nên React Compiler không chứng minh được chúng ổn định và sẽ **bỏ
   * tối ưu cả component** (`react-hooks/preserve-manual-memoization`). Đây là vài lần parse JSON
   * trên một danh mục ba dòng - bỏ memo tay rẻ hơn giữ memo tay rồi mất tối ưu ở mọi thứ khác.
   */
  const tiers: PlanTier[] = buildPlanPricingCards(plans).map((card) => ({
    plan: card.plan,
    limits: card.limits,
    selfServe: card.selfServe,
    terms: card.terms.map((term) => ({
      months: term.months as SubscriptionTermMonths,
      total: term.price,
      savingPercent: term.savingPercent,
    })),
    card,
  }));

  const selected = tiers.find((tier) => tier.plan.id === planId);

  function selectPlan(id: string): void {
    setPlanId(id);
    /*
     * Kỳ đang chọn có thể không được bậc MỚI bán - bỏ chọn thay vì giữ một lựa chọn mà server sẽ
     * từ chối (`purchase()` kiểm `limits.termPrices`). `null` = chưa chọn kỳ nào, và nút tạo hoá
     * đơn khoá cho tới khi người dùng bấm một thẻ: mặc định sẵn một kỳ hạn nghĩa là có người trả
     * trước 12 tháng vì đó là thứ đang sáng lên, không vì họ chọn nó.
     */
    setTermMonths(null);
  }

  const chosenTerm =
    selected && termMonths != null
      ? selected.terms.find((term) => term.months === termMonths)
      : undefined;
  const total = chosenTerm?.total ?? null;

  return {
    tiers,
    planId,
    selected,
    termMonths,
    total,
    // Bậc tư vấn không bao giờ dựng được `selection`: nút của nó là "Liên hệ tư vấn", không phải
    // "Tạo hoá đơn" (ADR 0041 điều 5). Không có `timing`: server suy gia hạn / nâng ngay / đổi từ
    // kỳ sau theo bậc được chọn (ADR 0084).
    selection:
      selected?.selfServe && termMonths != null && total != null
        ? { body: { planId: selected.plan.id, termMonths }, total }
        : null,
    selectPlan,
    setTermMonths,
    reset: () => {
      setPlanId(null);
      setTermMonths(null);
    },
  };
}

/**
 * Một lựa chọn đã đủ để mua, kèm phạm vi của nó - mỗi phạm vi sinh MỘT hoá đơn riêng (ADR 0065).
 */
export interface ScopedPlanSelection extends PlanPurchaseSelection {
  scope: PlanLaneScope;
  planName: string;
}

export interface ScopedPlanLane {
  scope: PlanLaneScope;
  state: PlanPurchaseState;
}

/**
 * BỘ CHỌN HAI LÀN - tối đa một bậc xe máy VÀ một bậc ô tô (ADR 0065 điều 2), dùng ở onboarding
 * tuyến gói và luồng nâng cấp từ tuyến hoa hồng.
 *
 * Mỗi làn chọn BẬC riêng (hai `usePlanPurchase`, số hook cố định nên thứ tự hook ổn định), nhưng
 * KỲ HẠN là MỘT cho cả lượt - cùng luật với hộp "Mua hoặc gia hạn gói" (`useCombinedPlanPurchase`):
 * hai gói mua cùng lúc đi chung một phiếu thanh toán gộp (ADR 0083), và một phiếu mà hai gói hết hạn
 * lệch nhau là hai lần gia hạn cho một quyết định. Kỳ của từng `usePlanPurchase` bị bỏ qua ở đây.
 *
 * Kỳ chọn được là kỳ mà MỌI bậc đang chọn đều bán (`limits.termPrices` vừa là bảng giá vừa là danh
 * sách kỳ được bán - ADR 0041 điều 2). % tiết kiệm của một kỳ lấy mức THẤP nhất giữa các bậc - một
 * nhãn chung không hứa nhiều hơn bậc nào. KHÔNG chọn sẵn kỳ nào: mặc định sẵn một kỳ là có người
 * trả trước 12 tháng vì đó là thứ đang sáng lên.
 *
 * Bậc doanh nghiệp (`all`, `salesOnly`) KHÔNG nằm trong làn nào: nó không tự mua được, nên nơi vẽ
 * dựng một thẻ "Liên hệ tư vấn" riêng từ `enterprise`.
 */
export interface ScopedPlanPurchaseState {
  lanes: readonly ScopedPlanLane[];
  /** Bậc tư vấn phủ cả hai loại xe - `undefined` khi danh mục không bán bậc đó. */
  enterprise: PlanTier | undefined;
  /** Các bậc tự mua đang chọn, theo thứ tự làn - chưa xét kỳ hạn. */
  pickedTiers: readonly PlanTier[];
  /**
   * Kỳ hạn chung chọn được cho các bậc đang chọn; `total` là TỔNG của mọi bậc ở kỳ đó. Rỗng khi
   * chưa chọn bậc nào, hoặc các bậc đang chọn không có kỳ nào chung.
   */
  termOptions: readonly PlanTermChoice[];
  /** Kỳ hạn chung đang chọn - `null` khi chưa chọn, hoặc kỳ cũ không còn được mọi bậc bán. */
  termMonths: SubscriptionTermMonths | null;
  setTermMonths: (months: SubscriptionTermMonths) => void;
  /** Các làn đã chọn đủ (bậc tự mua + kỳ hạn chung), theo thứ tự làn. Rỗng = chưa có gì để mua. */
  selections: readonly ScopedPlanSelection[];
  /** Tổng mọi làn đã chọn (`sumMoney`, không qua `Number`) - chỉ để HIỂN THỊ; server đọc lại bảng giá của từng hoá đơn. */
  total: MoneyString | null;
  /** Đã chọn bậc nhưng chưa có kỳ hạn chung - nút mua phải khoá. */
  incomplete: boolean;
  /** Có ít nhất một bậc tự mua được trong danh mục - `false` = danh mục rỗng (lỗi cấu hình). */
  hasSellable: boolean;
  reset: () => void;
}

export function useScopedPlanPurchase(
  plans: readonly TenantPlan[],
  /** Chỉ dựng các làn này - vd onboarding thêm gói cho loại xe CÒN LẠI sau khi đã có hoá đơn một làn. */
  scopes: readonly PlanLaneScope[] = PLAN_LANE_SCOPES,
): ScopedPlanPurchaseState {
  const motorbike = usePlanPurchase(packagePlansForScope(plans, PLAN_VEHICLE_SCOPE.MOTORBIKE));
  const car = usePlanPurchase(packagePlansForScope(plans, PLAN_VEHICLE_SCOPE.CAR));
  const [chosenTerm, setChosenTerm] = useState<SubscriptionTermMonths | null>(null);
  const enterprise = enterpriseTierOf(plans);

  const byScope: Record<PlanLaneScope, PlanPurchaseState> = {
    [PLAN_VEHICLE_SCOPE.MOTORBIKE]: motorbike,
    [PLAN_VEHICLE_SCOPE.CAR]: car,
  };
  const lanes = PLAN_LANE_SCOPES.filter((scope) => scopes.includes(scope))
    .map((scope) => ({ scope, state: byScope[scope] }))
    .filter((lane) => lane.state.tiers.length > 0);

  const picked = lanes.flatMap(({ scope, state }) =>
    state.selected?.selfServe ? [{ scope, tier: state.selected }] : [],
  );
  const pickedTiers = picked.map((item) => item.tier);
  const termOptions = sharedTermOptions(pickedTiers);
  // Đổi bậc làm kỳ đã chọn hết được bán ⇒ bỏ chọn, KHÔNG tự nhảy sang kỳ khác.
  const termMonths =
    chosenTerm != null && termOptions.some((option) => option.months === chosenTerm)
      ? chosenTerm
      : null;

  const selections: ScopedPlanSelection[] =
    termMonths == null
      ? []
      : picked.flatMap(({ scope, tier }) => {
          const term = tier.terms.find((choice) => choice.months === termMonths);
          return term
            ? [
                {
                  body: { planId: tier.plan.id, termMonths },
                  total: term.total,
                  scope,
                  planName: tier.plan.name,
                },
              ]
            : [];
        });
  const total = selections.length > 0 ? sumMoney(selections.map((item) => item.total)) : null;

  return {
    lanes,
    enterprise,
    pickedTiers,
    termOptions,
    termMonths,
    setTermMonths: setChosenTerm,
    selections,
    total,
    incomplete: pickedTiers.length > 0 && selections.length === 0,
    hasSellable: lanes.some(({ state }) => state.tiers.some((tier) => tier.selfServe)),
    reset: () => {
      motorbike.reset();
      car.reset();
      setChosenTerm(null);
    },
  };
}

/** Kỳ mà MỌI bậc đều bán, tăng dần - tổng tiền cộng các bậc, % tiết kiệm lấy mức thấp nhất. */
function sharedTermOptions(tiers: readonly PlanTier[]): PlanTermChoice[] {
  const [first, ...rest] = tiers;
  if (!first) return [];
  return first.terms
    .filter((term) => rest.every((tier) => tier.terms.some((t) => t.months === term.months)))
    .map((term) => {
      const matching = tiers.map((tier) => tier.terms.find((t) => t.months === term.months)!);
      return {
        months: term.months,
        total: sumMoney(matching.map((t) => t.total)),
        savingPercent: Math.min(...matching.map((t) => t.savingPercent)),
      };
    })
    .sort((a, b) => a.months - b.months);
}

/**
 * Bậc doanh nghiệp (`all`, bán bằng tư vấn) của danh mục - `undefined` khi không bán. Thẻ của nó
 * không có kỳ hạn nào để chọn (`terms: []`), chỉ có lối "Liên hệ tư vấn".
 */
export function enterpriseTierOf(plans: readonly TenantPlan[]): PlanTier | undefined {
  const card = buildPlanPricingCards(packagePlansForScope(plans, PLAN_VEHICLE_SCOPE.ALL))[0];
  return card
    ? { plan: card.plan, limits: card.limits, selfServe: card.selfServe, terms: [], card }
    : undefined;
}
