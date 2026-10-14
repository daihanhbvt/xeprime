/**
 * Ý định "mở luồng mua / gia hạn gói" (`?purchase=1` — link email hướng dẫn gói qua `/subscription`)
 * → việc section gói làm, khi dữ liệu gói đã nạp. Hàm thuần để test được bảng quyết định.
 *
 * | Điều kiện | Việc |
 * | --- | --- |
 * | thiếu quyền `subscription.purchase` | không mở gì — chỉ đứng ở section |
 * | chủ xe tuyến hoa hồng được nâng cấp | cuộn + đặt tiêu điểm vào khối nâng cấp ngay trên trang |
 * | còn lại (tuyến gói, có quyền) | mở hộp thoại "Mua / gia hạn gói" |
 *
 * Phiên hỗ trợ gian hàng (ADR 0050 §10) không bao giờ mở luồng MUA.
 */
export const PLAN_PURCHASE_INTENT_ACTION = {
  NONE: 'none',
  OPEN_DIALOG: 'open_dialog',
  FOCUS_UPGRADE: 'focus_upgrade',
} as const;
export type PlanPurchaseIntentAction =
  (typeof PLAN_PURCHASE_INTENT_ACTION)[keyof typeof PLAN_PURCHASE_INTENT_ACTION];

export function planPurchaseIntentAction(input: {
  canPurchase: boolean;
  upgrading: boolean;
  inSupport: boolean;
}): PlanPurchaseIntentAction {
  if (!input.canPurchase || input.inSupport) return PLAN_PURCHASE_INTENT_ACTION.NONE;
  return input.upgrading
    ? PLAN_PURCHASE_INTENT_ACTION.FOCUS_UPGRADE
    : PLAN_PURCHASE_INTENT_ACTION.OPEN_DIALOG;
}
