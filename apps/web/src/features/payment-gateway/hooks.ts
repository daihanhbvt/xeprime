'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import {
  API_ERROR_CODE,
  isPaymentOrderViewStateSettling,
  PAYMENT_ORDER_POLL_MS,
  PAYMENT_ORDER_VIEW_STATE,
  type PaymentOrderViewState,
} from '@xeprime/types';
import { getErrorCode } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import { fetchGatewayMethods, fetchGatewayOrder, startGatewayCheckout } from './api';
import type { GatewayTarget, PaymentOrder, PaymentSurface, StartGatewayCheckoutInput } from './types';

/**
 * Còn hỏi lại bao lâu sau khi liên kết đã hết hạn dùng lại: một khoản trả ở phút cuối có IPN tới trễ
 * vài phút, và người đang nhìn màn hình đó xứng đáng thấy nó đổi mà không phải F5.
 */
const POLL_GRACE_AFTER_EXPIRY_MS = 5 * 60_000;

/** Cấu hình cổng gần như không đổi trong một phiên làm việc — đọc một lần là đủ. */
export function useGatewayMethods(surface: PaymentSurface, enabled = true) {
  return useQuery({
    queryKey: queryKeys.paymentGateway.methods(surface),
    queryFn: () => fetchGatewayMethods(surface),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Lượt này còn đáng hỏi lại không — còn đang chờ cổng/đang ghi nhận, và chưa quá hạn quá lâu. */
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
 * Có nên mời mở một phiên cổng MỚI khi trang đang nói về lượt `order` không.
 *
 * Không, khi lượt đó còn liên kết dùng được (nút "Tiếp tục thanh toán" ở thông báo đã làm việc đó),
 * đang ghi nhận, đã xong, hay đang chờ người xử lý — mở phiên mới lúc ấy là mời khách trả HAI lần.
 * Có, khi lượt đã thất bại/huỷ/hết hạn, hoặc liên kết đã quá hạn dùng lại. Đang tải thì chưa vẽ gì
 * để không chớp nút rồi tắt.
 */
export function canStartAnotherCheckout(
  order: PaymentOrder | undefined,
  { failedToLoad }: { failedToLoad: boolean },
): boolean {
  // Không đọc được lượt (ID gõ tay, lượt của người khác): server vẫn là chốt chặn trả trùng.
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

/**
 * Một lượt thanh toán qua cổng, TỰ HỎI LẠI khi còn chờ.
 *
 * Kết quả đến từ IPN (cổng gọi server) hoặc truy vấn phía server — không từ URL quay về. Nhịp hỏi
 * dừng ở mọi chặng kết thúc; tab ẩn thì thôi hỏi (mặc định của TanStack).
 *
 * Không thử lại khi `NOT_FOUND`: lượt của người khác hay một ID gõ tay sẽ không tự xuất hiện.
 */
export function useGatewayOrder(surface: PaymentSurface, orderId: string | null) {
  return useQuery({
    queryKey: queryKeys.paymentGateway.order(surface, orderId ?? ''),
    queryFn: () => fetchGatewayOrder(surface, orderId as string),
    enabled: Boolean(orderId),
    refetchInterval: (query) =>
      shouldPollGatewayOrder(query.state.data) ? PAYMENT_ORDER_POLL_MS : false,
    retry: (failureCount, error) =>
      getErrorCode(error) !== API_ERROR_CODE.NOT_FOUND && failureCount < 2,
  });
}

/** Mở phiên — nơi gọi chuyển trang sang `checkoutUrl` khi thành công. */
export function useStartGatewayCheckout(target: GatewayTarget) {
  return useMutation({
    mutationFn: (body: StartGatewayCheckoutInput) => startGatewayCheckout(target, body),
  });
}
