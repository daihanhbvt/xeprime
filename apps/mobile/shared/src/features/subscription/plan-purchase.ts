import { useState } from 'react';
import {
  BILLING_MODE,
  isPlanSelfServe,
  parsePlanLimits,
  planTermPrice,
  planTermSavingPercent,
  type PlanLimitsJson,
  type SubscriptionTermMonths,
} from '@xeprime/types';

import type { PurchaseSubscriptionInput, TenantPlan } from '@/api/subscription/api';

/**
 * BỘ CHỌN MUA GÓI — state + phép đọc bảng giá, tách khỏi phần vẽ (ADR 0041).
 *
 * Bản native của `apps/web/src/features/subscription/plan-purchase.ts`; cùng hình dạng state,
 * cùng luật, và đọc CÙNG bộ helper ở `@xeprime/types` (`planTermPrice`, `planTermSavingPercent`,
 * `isPlanSelfServe`) — nên hai client không thể hiện hai con số khác nhau cho cùng một bậc.
 *
 * ## Vì sao KHÔNG còn một module dùng chung ở `packages/types`
 *
 * Trước ADR 0041, giá gói là một phép TÍNH (đơn giá × số chỗ × số tháng × (1 − %giảm)), và phép
 * tính đó đáng được viết một lần cho cả hai client. Nay giá là một con số admin gõ thẳng vào bảng
 * `termPrices`, nên thứ dùng chung còn lại chỉ là mấy hàm ĐỌC bảng đó — chúng đã ở `plan-billing`.
 * Phần còn lại của file này là `useState`, thứ duy nhất không đi chung được giữa hai client.
 *
 * ## Vì sao là HOOK, không phải một component có `onChange`
 *
 * Nơi gọi cần `selection` để bật/khoá nút "Tạo hoá đơn" của chính nó. Một component con báo lên
 * bằng `onChange` thì hoặc gọi trong render, hoặc gọi trong `useEffect` — lúc đó nút mờ/sáng TRỄ
 * một nhịp so với thứ người dùng vừa chạm.
 */

/** Lựa chọn ĐÃ ĐỦ để gửi lên server, kèm tổng tiền để nút bấm nói được con số. */
export interface PlanPurchaseSelection {
  /** Đúng hình dạng `PurchaseSubscriptionDto` — nơi gọi không nhào nặn gì. */
  body: PurchaseSubscriptionInput;
  /** Tiền cả kỳ (VND) — chỉ để HIỂN THỊ; server đọc lại bảng giá và đó là số quyết định. */
  total: number;
}

/** Một thẻ kỳ hạn của bậc đang xem: giá cả kỳ + % tiết kiệm so với mua từng tháng. */
export interface PlanTermChoice {
  months: SubscriptionTermMonths;
  total: number;
  savingPercent: number;
}

/**
 * Một BẬC trên bảng giá — đủ để vẽ một thẻ mà không parse lại `limits` ở tầng view.
 *
 * `selfServe: false` (bậc tư vấn) vẫn nằm trong danh sách: giấu hẳn bậc doanh nghiệp là giấu luôn
 * lối nâng cấp của gian hàng lớn nhất. Thẻ của nó hiện nút "Liên hệ tư vấn" thay cho giá, và
 * `purchase()` ở server từ chối bằng `PLAN_NOT_SELF_SERVE` nếu ai đó gọi thẳng API.
 */
export interface PlanTier {
  plan: TenantPlan;
  limits: PlanLimitsJson;
  /** Tự mua được không — `false` = bậc `salesOnly`, hoặc bậc chưa khai bảng giá. */
  selfServe: boolean;
  terms: readonly PlanTermChoice[];
}

export interface PlanPurchaseState {
  /** Mọi bậc tuyến gói đang bán, kể cả bậc tư vấn — dùng để VẼ bảng giá. */
  tiers: readonly PlanTier[];
  planId: string | null;
  selected: PlanTier | undefined;
  termMonths: SubscriptionTermMonths | null;
  total: number | null;
  /** `null` = chưa đủ để mua (chưa chọn bậc/kỳ hạn, hoặc bậc đang chọn bán bằng tư vấn). */
  selection: PlanPurchaseSelection | null;
  selectPlan: (id: string) => void;
  setTermMonths: (months: SubscriptionTermMonths) => void;
  /**
   * Xoá sạch lựa chọn — cho vỏ dùng lại được instance này (tấm trượt mở/đóng nhiều lần).
   *
   * `PurchaseSheet` sống suốt vòng đời màn, nên không có lần remount nào dọn hộ. Giữ lựa chọn cũ
   * nghĩa là mở tấm LẦN SAU đã thấy sẵn một bậc và một kỳ hạn chưa ai chọn trong lượt này. Tệ
   * hơn sau một lượt mua thành công: form trở lại đầy đủ, cách một cú chạm với hoá đơn thứ hai.
   *
   * Khác với `selectPlan`, thứ MANG THEO kỳ hạn giữa các bậc trong CÙNG một lượt chọn: ở đó
   * người dùng vừa tự tay chạm vào kỳ đó, còn ở đây lượt chọn đã khép lại.
   */
  reset: () => void;
}

export function usePlanPurchase(plans: readonly TenantPlan[]): PlanPurchaseState {
  const [planId, setPlanId] = useState<string | null>(null);
  const [termMonths, setTermMonths] = useState<SubscriptionTermMonths | null>(null);

  /*
   * Lọc theo CHẾ ĐỘ THU PHÍ — PHÒNG THỦ TẦNG HAI, không phải luật.
   *
   * `listPlansForTenant` đã lọc `billingMode = package` ở SERVER, nên bậc tuyến hoa hồng không bao
   * giờ tới được đây. Giữ bộ lọc để một backend cũ hơn — hoặc một app đang chạy bản cũ sau khi
   * deploy — không đẩy tuyến mặc định vào bảng giá, nơi `purchase()` sẽ từ chối nó với "không có
   * khoản phải trả" mà người dùng không hiểu vì sao lựa chọn đó lại hiện ra.
   */
  const tiers: PlanTier[] = plans
    .filter((p) => p.billingMode === BILLING_MODE.PACKAGE)
    .map((plan) => {
      const limits = parsePlanLimits(plan.limits);
      return {
        plan,
        limits,
        selfServe: isPlanSelfServe(limits),
        terms: limits.termPrices.map((term) => ({
          months: term.months as SubscriptionTermMonths,
          total: Number(planTermPrice(limits, term.months) ?? 0),
          savingPercent: planTermSavingPercent(limits, term.months),
        })),
      };
    });

  const selected = tiers.find((tier) => tier.plan.id === planId);

  function selectPlan(id: string): void {
    setPlanId(id);
    /*
     * Đổi bậc thì GIỮ kỳ hạn người dùng đã chọn — miễn là bậc mới cũng bán kỳ đó.
     *
     * Phân biệt hai thứ dễ lẫn. Tự MẶC ĐỊNH một kỳ hạn là sai: nó khiến có người trả trước 12
     * tháng vì đó là thứ đang sáng lên, không vì họ chọn nó. Nhưng MANG THEO một kỳ hạn họ đã
     * tự tay chạm thì ngược lại — đó chính là ý định họ vừa nói ra, và bắt chọn lại ở mỗi lần
     * so sánh hai bậc là bắt lặp lại một câu trả lời không đổi.
     *
     * Bậc mới KHÔNG bán kỳ đó thì mới bỏ chọn: server kiểm `limits.termPrices` và sẽ từ chối,
     * nên giữ lại là dựng sẵn một lỗi ở bước cuối.
     */
    const next = tiers.find((tier) => tier.plan.id === id);
    const keeps = next?.terms.some((term) => term.months === termMonths) ?? false;
    if (!keeps) setTermMonths(null);
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
    // "Tạo hoá đơn" (ADR 0041 điều 5).
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
