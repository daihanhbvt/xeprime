import { PAYMENT_GATEWAY_MIN_HOLD_WINDOW_MINUTES } from '@xeprime/types';
import { isNegativeMoney, subtractMoney } from '@xeprime/domain';
import type { PaymentGatewayMethod } from '@/api/payment-gateway/api';

/** Luật đọc lượt cổng dùng chung với web — `@xeprime/domain` (`payment-order.ts`). */
export {
  canStartAnotherCheckout,
  POLL_GRACE_AFTER_EXPIRY_MS,
  shouldPollGatewayOrder,
} from '@xeprime/domain';

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
