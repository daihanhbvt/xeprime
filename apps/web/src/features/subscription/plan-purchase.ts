'use client';

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

import type { PurchaseSubscriptionInput, TenantPlan } from './types';

/**
 * BỘ CHỌN MUA GÓI — state + phép đọc bảng giá, tách khỏi phần vẽ.
 *
 * ## Vì sao tồn tại
 *
 * Từ ADR 0040 có HAI màn bán đúng một thứ: `PurchaseModal` (gia hạn/nâng bậc, mở từ trang Cửa
 * hàng và `/account/subscription`) và bước 2 của onboarding gian hàng trả phí. Hai bản của cùng
 * bộ chọn nghĩa là hai bản của luật đọc bảng giá — kỳ hạn nào được bán, bậc nào tự mua được — và
 * hai bản là cách chắc chắn nhất để một màn hiện một con số mà server tính ra con số khác.
 *
 * ## Vì sao là HOOK, không phải một component có `onChange`
 *
 * Nơi gọi cần `selection` để bật/khoá nút "Tạo hoá đơn" của chính nó. Một component con báo lên
 * bằng `onChange` thì hoặc gọi trong render (React cảnh báo, và một cú bấm nhanh có thể gửi lựa
 * chọn của frame trước), hoặc gọi trong `useEffect` — lúc đó nút mờ/sáng TRỄ một nhịp so với
 * thứ người dùng vừa bấm. State ở nơi gọi giải cả hai: `selection` luôn là hàm thuần của cùng
 * một lần render đang vẽ ra nút đó.
 */

/** Lựa chọn ĐÃ ĐỦ để gửi lên server, kèm tổng tiền để nút bấm nói được con số. */
export interface PlanPurchaseSelection {
  /** Đúng hình dạng `PurchaseSubscriptionDto` — nơi gọi không nhào nặn gì. */
  body: PurchaseSubscriptionInput;
  /** Tiền cả kỳ (VND, số nguyên) — chỉ để HIỂN THỊ; server đọc lại bảng giá và đó là số quyết định. */
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
 * `selfServe: false` (bậc tư vấn) vẫn nằm trong danh sách: giấu hẳn bậc doanh nghiệp là giấu
 * luôn lối nâng cấp của gian hàng lớn nhất. Thẻ của nó hiện nút "Liên hệ tư vấn" thay cho giá,
 * và `purchase()` ở server từ chối bằng `PLAN_NOT_SELF_SERVE` nếu ai đó gọi thẳng API.
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
   * Xoá sạch lựa chọn — cho vỏ dùng lại được instance này (hộp thoại mở/đóng nhiều lần).
   *
   * `PurchaseModal` sống suốt vòng đời trang, nên không có lần remount nào dọn hộ. Giữ lựa chọn
   * cũ nghĩa là mở lại hộp thoại thấy một kỳ hạn ĐÃ SÁNG — đúng thứ `selectPlan` đang chống
   * ("mặc định sẵn một kỳ hạn nghĩa là có người trả trước 12 tháng vì đó là thứ đang sáng lên").
   * Tệ hơn sau một lượt mua thành công: form trở lại đầy đủ, cách một cú bấm với hoá đơn thứ hai.
   */
  reset: () => void;
}

export function usePlanPurchase(plans: readonly TenantPlan[]): PlanPurchaseState {
  const [planId, setPlanId] = useState<string | null>(null);
  const [termMonths, setTermMonths] = useState<SubscriptionTermMonths | null>(null);

  /*
   * Lọc theo CHẾ ĐỘ THU PHÍ — PHÒNG THỦ TẦNG HAI, không phải luật.
   *
   * `listPlansForTenant` đã lọc `billingMode = package` ở SERVER (15/09/2026), nên bậc tuyến hoa
   * hồng không bao giờ tới được đây. Giữ bộ lọc để một backend cũ hơn — hoặc một cache còn nóng
   * sau khi deploy — không đẩy tuyến mặc định vào bảng giá, nơi `purchase()` sẽ từ chối nó với
   * "không có khoản phải trả" mà người dùng không hiểu vì sao lựa chọn đó lại hiện ra.
   *
   * Các giá trị dẫn xuất dưới đây KHÔNG bọc `useMemo`, có chủ đích: chúng đến từ một `.filter()`
   * dựng mới mỗi lần render, nên React Compiler không chứng minh được chúng ổn định và sẽ **bỏ
   * tối ưu cả component** (`react-hooks/preserve-manual-memoization`). Đây là vài lần parse JSON
   * trên một danh mục ba dòng — bỏ memo tay rẻ hơn giữ memo tay rồi mất tối ưu ở mọi thứ khác.
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
     * Kỳ đang chọn có thể không được bậc MỚI bán — bỏ chọn thay vì giữ một lựa chọn mà server sẽ
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
