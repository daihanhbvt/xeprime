import {
  isPaymentOrderViewStateSettling,
  PAYMENT_GATEWAY_MIN_HOLD_WINDOW_MINUTES,
  PAYMENT_ORDER_VIEW_STATE,
  type PaymentOrderViewState,
} from '@xeprime/types';
import { isNegativeMoney, subtractMoney } from '@xeprime/domain';
import type { PaymentGatewayMethod, PaymentOrder } from '@/api/payment-gateway/api';

/** Bản native của luật trong `apps/web/src/features/payment-gateway/hooks.ts` — giữ nguyên nghĩa. */
export const POLL_GRACE_AFTER_EXPIRY_MS = 5 * 60_000;

/** Còn hỏi lại không — đang chờ cổng/đang ghi nhận, và chưa quá hạn quá lâu. */
export function shouldPollGatewayOrder(order: PaymentOrder | undefined, now: number = Date.now()) {
  if (!order) return false;
  const state = order.viewState as PaymentOrderViewState;
  if (!isPaymentOrderViewStateSettling(state)) return false;
  if (state === PAYMENT_ORDER_VIEW_STATE.AWAITING) {
    return now < new Date(order.expiresAt).getTime() + POLL_GRACE_AFTER_EXPIRY_MS;
  }
  return true;
}

/**
 * Có mời mở phiên MỚI không khi đang theo dõi lượt `order` — không, khi lượt còn liên kết dùng được,
 * đang ghi nhận, đã xong hay chờ hỗ trợ (mở thêm là mời khách trả HAI lần).
 */
export function canStartAnotherCheckout(
  order: PaymentOrder | undefined,
  { failedToLoad }: { failedToLoad: boolean },
): boolean {
  if (!order) return failedToLoad;
  switch (order.viewState as PaymentOrderViewState) {
    case PAYMENT_ORDER_VIEW_STATE.FAILED:
      return true;
    case PAYMENT_ORDER_VIEW_STATE.AWAITING:
      return order.checkoutUrl === null;
    default:
      return false;
  }
}

/** Số tiền ngoài hạn mức mỗi giao dịch của cổng — chỉ để báo trước; server mới quyết. */
export function isOutOfRange(method: PaymentGatewayMethod, amount: string): boolean {
  return (
    (method.minAmount != null && isNegativeMoney(subtractMoney(amount, method.minAmount))) ||
    (method.maxAmount != null && isNegativeMoney(subtractMoney(method.maxAmount, amount)))
  );
}

/** Hạn của khoản còn quá ngắn để mời mở phiên cổng (server vẫn chặn bằng mã lỗi riêng). */
export function isHoldWindowTooShort(deadline: string | null | undefined, now: number = Date.now()) {
  return (
    deadline != null &&
    new Date(deadline).getTime() - now < PAYMENT_GATEWAY_MIN_HOLD_WINDOW_MINUTES * 60_000
  );
}
