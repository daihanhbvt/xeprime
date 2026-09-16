'use client';

import { useState } from 'react';
import {
  BILLING_MODE,
  SUBSCRIPTION_TERM_MONTHS,
  parsePlanLimits,
  subscriptionTermTotalPreview,
  termDiscountPercent,
  type PlanLimitsJson,
  type SubscriptionTermMonths,
} from '@xeprime/types';

import type { PurchaseSubscriptionInput, TenantPlan } from './types';

/**
 * BỘ CHỌN MUA GÓI — state + phép tính tiền, tách khỏi phần vẽ.
 *
 * ## Vì sao tồn tại
 *
 * Từ ADR 0040 có HAI màn bán đúng một thứ: `PurchaseModal` (gia hạn/mua thêm, mở từ trang Cửa
 * hàng và `/account/subscription`) và bước 2 của onboarding gian hàng trả phí. Hai bản của cùng
 * bộ chọn nghĩa là hai bản của công thức giá — luật "không dưới số chỗ gồm sẵn", danh sách kỳ
 * hạn ĐƯỢC BÁN của gói, `subscriptionTermTotalPreview` — và hai bản giá là cách chắc chắn nhất
 * để một màn hiện một con số mà server tính ra con số khác.
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
  /** Tổng cả kỳ (VND, số nguyên) — chỉ để HIỂN THỊ; server tính lại và đó là số quyết định. */
  total: number;
}

/** Một thẻ kỳ hạn: lựa chọn mua đầy đủ với tổng thật của số chỗ đang chọn. */
export interface PlanTermChoice {
  months: SubscriptionTermMonths;
  discountPercent: number;
  total: number | null;
  perMonth: number | null;
}

export interface PlanPurchaseState {
  /** Bậc gói BÁN ĐƯỢC (đã lọc `billingMode = package`). Rỗng ⇒ không có gì để mua. */
  purchasable: readonly TenantPlan[];
  planId: string | null;
  selected: TenantPlan | undefined;
  limits: PlanLimitsJson | null;
  termMonths: SubscriptionTermMonths | null;
  /** Số chỗ ĐÃ nâng lên mức gồm sẵn — cùng luật mà backend áp. */
  slots: { car: number; motorbike: number };
  termChoices: readonly PlanTermChoice[];
  /** Có hiện dòng giá/tháng không — chỉ khi ba thẻ thật sự khác nhau. */
  showPerMonth: boolean;
  total: number | null;
  /** `null` = chưa đủ để mua (chưa chọn kỳ hạn, hoặc danh mục rỗng). */
  selection: PlanPurchaseSelection | null;
  selectPlan: (id: string) => void;
  setTermMonths: (months: SubscriptionTermMonths) => void;
  setCarSlots: (value: number | null) => void;
  setMotorbikeSlots: (value: number | null) => void;
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
  const [carSlots, setCarSlots] = useState<number | null>(null);
  const [motorbikeSlots, setMotorbikeSlots] = useState<number | null>(null);

  /*
   * Lọc theo CHẾ ĐỘ THU PHÍ — PHÒNG THỦ TẦNG HAI, không phải luật.
   *
   * `listPlansForTenant` đã lọc `billingMode = package` ở SERVER (15/09/2026), nên bậc tuyến hoa
   * hồng không bao giờ tới được đây. Giữ bộ lọc để một backend cũ hơn — hoặc một cache còn nóng
   * sau khi deploy — không đẩy tuyến mặc định vào màn mua, nơi `purchase()` sẽ từ chối nó với
   * "không có khoản phải trả" mà người dùng không hiểu vì sao lựa chọn đó lại hiện ra.
   *
   * Bản cũ lọc `basePriceMonthly > 0` vì mọi gói bán được đều có phí nền. ADR 0029 gỡ phí nền
   * (gói pilot 100k/chỗ có nền 0đ, tiền nằm hết ở chỗ xe), nên vị từ đó loại đúng gói đang bán
   * — không ai mua được gì.
   */
  const purchasable = plans.filter((p) => p.billingMode === BILLING_MODE.PACKAGE);
  const selected = purchasable.find((p) => p.id === planId);
  /*
   * Các giá trị dẫn xuất dưới đây KHÔNG bọc `useMemo`, có chủ đích.
   *
   * `selected` đến từ `purchasable.find(...)` trên một mảng `.filter()` dựng mới mỗi lần render,
   * nên React Compiler không chứng minh được nó ổn định và **bỏ tối ưu cả component** (lỗi
   * `react-hooks/preserve-manual-memoization`). Đây là một lần parse JSON và vài phép `Math.max`
   * — bỏ memo tay để trình biên dịch tự lo lại rẻ hơn giữ memo tay rồi mất tối ưu ở mọi thứ
   * còn lại.
   */
  const limits: PlanLimitsJson | null = selected ? parsePlanLimits(selected.limits) : null;

  function selectPlan(id: string): void {
    setPlanId(id);
    const plan = purchasable.find((p) => p.id === id);
    const planLimits = plan ? parsePlanLimits(plan.limits) : null;
    setCarSlots(planLimits?.includedCars ?? 0);
    setMotorbikeSlots(planLimits?.includedMotorbikes ?? 0);
    /*
     * Kỳ đang chọn có thể không được bậc gói MỚI bán — bỏ chọn thay vì giữ một lựa chọn mà
     * server sẽ từ chối (`purchase()` kiểm `limits.terms`). `null` = chưa chọn kỳ nào, và nút
     * tạo hoá đơn khoá cho tới khi người dùng bấm một thẻ: mặc định sẵn một kỳ hạn nghĩa là có
     * người trả trước 12 tháng vì đó là thứ đang sáng lên, không vì họ chọn nó.
     */
    setTermMonths(null);
  }

  /*
   * Danh mục một bậc thì tự chọn luôn — không bày ra một `<Select>` một lựa chọn.
   *
   * Chạy trong render (không `useEffect`): `purchasable` dựng lại mỗi lần render, nên một
   * effect phụ thuộc nó sẽ chạy lại vô ích mỗi vòng. Điều kiện `!planId` làm phép gán này
   * idempotent, và `setState` trong render của CHÍNH component đang render là khuôn React hỗ trợ
   * chính thức (derived state) — nó render lại ngay, không đợi một frame.
   */
  if (!planId && purchasable.length === 1 && purchasable[0]) {
    selectPlan(purchasable[0].id);
  }

  /** Không dưới mức gồm sẵn — cùng luật backend nâng lên. */
  const slots = {
    car: Math.max(carSlots ?? 0, limits?.includedCars ?? 0),
    motorbike: Math.max(motorbikeSlots ?? 0, limits?.includedMotorbikes ?? 0),
  };

  const total =
    selected && limits && termMonths != null
      ? subscriptionTermTotalPreview(selected.basePriceMonthly, limits, slots, termMonths)
      : null;

  /*
   * Kỳ hạn lấy từ `limits.terms` của GÓI (ADR 0029: đó là danh sách kỳ được bán, không chỉ là
   * bảng giảm giá) — gói pilot bán tối thiểu 3 tháng thì lựa chọn 1 tháng không được hiện ra.
   * Plan cũ chưa khai terms → rơi về bộ kỳ hạn toàn cục. Server vẫn là lớp chặn thật.
   */
  const allowedTerms: readonly SubscriptionTermMonths[] = limits?.terms.length
    ? SUBSCRIPTION_TERM_MONTHS.filter((m) => limits.terms.some((term) => term.months === m))
    : SUBSCRIPTION_TERM_MONTHS;

  /*
   * Mỗi kỳ hạn là một LỰA CHỌN MUA đầy đủ: tổng cả kỳ của đúng số chỗ đang chọn, cộng giá quy
   * về tháng để so sánh được giữa các thẻ. Tính ở đây thay vì trong thẻ để cả ba dùng chung một
   * phép tính với `total` của lựa chọn đang chọn — hai phép tính là hai cơ hội lệch nhau.
   */
  const termChoices: PlanTermChoice[] = allowedTerms.map((months) => {
    const amount =
      selected && limits
        ? subscriptionTermTotalPreview(selected.basePriceMonthly, limits, slots, months)
        : null;
    return {
      months,
      discountPercent: limits ? termDiscountPercent(limits, months) : 0,
      total: amount,
      perMonth: amount == null ? null : amount / months,
    };
  });

  /*
   * Giá quy về tháng chỉ có ích khi các thẻ KHÁC nhau.
   *
   * Với danh mục hiện tại cả ba kỳ hạn đều `discountPercent = 0`, nên ba thẻ sẽ hiện ba con số
   * /tháng giống hệt nhau — một dòng chữ nhắc lại chính nó ba lần, đứng chắn trước con số thật sự
   * quyết định (tổng cả kỳ). Nó chỉ xuất hiện khi một kỳ hạn thật sự rẻ hơn theo tháng.
   */
  const perMonthValues = termChoices.map((c) => c.perMonth).filter((v): v is number => v != null);
  const showPerMonth =
    perMonthValues.length > 1 && new Set(perMonthValues.map((v) => Math.round(v))).size > 1;

  return {
    purchasable,
    planId,
    selected,
    limits,
    termMonths,
    slots,
    termChoices,
    showPerMonth,
    total,
    selection:
      selected && termMonths != null && total != null
        ? { body: { planId: selected.id, termMonths, slots }, total }
        : null,
    selectPlan,
    setTermMonths,
    setCarSlots,
    setMotorbikeSlots,
    reset: () => {
      setPlanId(null);
      setTermMonths(null);
      setCarSlots(null);
      setMotorbikeSlots(null);
    },
  };
}
