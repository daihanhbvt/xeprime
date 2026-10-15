import {
  isPaymentOrderViewStateSettling,
  PAYMENT_ORDER_VIEW_STATE,
  type components,
  type PaymentOrderViewState,
} from '@xeprime/types';

/**
 * Luật đọc MỘT lượt thanh toán qua cổng (MoMo/VNPAY — ADR 0058), dùng chung web và app.
 *
 * Chỉ đọc các trường cần — nơi gọi truyền nguyên `PaymentOrderDto` của bản api của mình.
 */
type GatewayOrderView = Pick<
  components['schemas']['PaymentOrderDto'],
  'viewState' | 'noTransaction' | 'expiresAt' | 'checkoutUrl'
>;

/**
 * Còn hỏi lại bao lâu sau khi liên kết đã hết hạn dùng lại: một khoản trả ở phút cuối có IPN tới trễ
 * vài phút, và người đang nhìn màn hình đó xứng đáng thấy nó đổi mà không phải tải lại.
 */
export const POLL_GRACE_AFTER_EXPIRY_MS = 5 * 60_000;

/** Lượt này còn đáng hỏi lại không — còn đang chờ cổng/đang ghi nhận, và chưa quá hạn quá lâu. */
export function shouldPollGatewayOrder(
  order: Pick<GatewayOrderView, 'viewState' | 'noTransaction' | 'expiresAt'> | undefined,
  now: number = Date.now(),
): boolean {
  if (!order) return false;
  const state = order.viewState as PaymentOrderViewState;
  if (!isPaymentOrderViewStateSettling(state)) return false;
  /*
   * Cổng đã xác nhận không có giao dịch (khách huỷ ở cổng): không còn gì để chờ trên lượt này. Nếu
   * tiền vẫn về, đích (khoản giữ chỗ / hoá đơn) đổi và trang biết qua thông báo realtime của nó.
   */
  if (order.noTransaction) return false;
  if (state === PAYMENT_ORDER_VIEW_STATE.AWAITING) {
    return now < new Date(order.expiresAt).getTime() + POLL_GRACE_AFTER_EXPIRY_MS;
  }
  return true;
}

/**
 * Có nên mời mở một phiên cổng MỚI khi trang đang nói về lượt `order` không.
 *
 * Không, khi lượt đó còn liên kết dùng được (nút "Tiếp tục thanh toán" ở thông báo đã làm việc đó),
 * đang ghi nhận, đã xong, hay đang chờ người xử lý — mở phiên mới lúc ấy là mời khách trả HAI lần.
 * Có, khi lượt đã thất bại/huỷ/hết hạn, hoặc liên kết đã quá hạn dùng lại. Đang tải thì chưa vẽ gì
 * để không chớp nút rồi tắt.
 */
export function canStartAnotherCheckout(
  order: Pick<GatewayOrderView, 'viewState' | 'noTransaction' | 'checkoutUrl'> | undefined,
  { failedToLoad }: { failedToLoad: boolean },
): boolean {
  // Không đọc được lượt (ID gõ tay, lượt của người khác): server vẫn là chốt chặn trả trùng.
  if (!order) return failedToLoad;
  switch (order.viewState as PaymentOrderViewState) {
    case PAYMENT_ORDER_VIEW_STATE.FAILED:
      return true;
    case PAYMENT_ORDER_VIEW_STATE.AWAITING:
      // Liên kết đã hết hạn dùng, hoặc cổng xác nhận phiên này không có giao dịch (khách đã huỷ).
      return order.noTransaction || order.checkoutUrl === null;
    default:
      return false;
  }
}
