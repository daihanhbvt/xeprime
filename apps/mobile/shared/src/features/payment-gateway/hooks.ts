import { useMutation, useQuery } from '@tanstack/react-query';
import { API_ERROR_CODE, PAYMENT_ORDER_POLL_MS } from '@xeprime/types';
import { getErrorCode, STALE_TIME } from '@xeprime/api-client';
import { queryKeys } from '@/queries/query-keys';
import {
  paymentGatewayApi,
  type PaymentSurface,
  type StartGatewayCheckoutInput,
} from '@/api/payment-gateway/api';
import { shouldPollGatewayOrder } from './order-state';

/** Cấu hình cổng gần như không đổi trong một phiên — đọc một lần là đủ. */
export function useGatewayMethods(surface: PaymentSurface, enabled = true) {
  return useQuery({
    queryKey: queryKeys.paymentGateway.methods(surface),
    queryFn: () => paymentGatewayApi.methods(surface),
    enabled,
    staleTime: STALE_TIME.REFERENCE,
  });
}

/** Một lượt, TỰ HỎI LẠI khi còn chờ — kết quả chỉ đến từ server (IPN/truy vấn), không từ URL. */
export function useGatewayOrder(surface: PaymentSurface, orderId: string | null) {
  return useQuery({
    queryKey: queryKeys.paymentGateway.order(surface, orderId ?? ''),
    queryFn: () => paymentGatewayApi.order(surface, orderId as string),
    enabled: Boolean(orderId),
    refetchInterval: (query) =>
      shouldPollGatewayOrder(query.state.data) ? PAYMENT_ORDER_POLL_MS : false,
    retry: (failureCount, error) =>
      getErrorCode(error) !== API_ERROR_CODE.NOT_FOUND && failureCount < 2,
    // Quay về từ app ví/ngân hàng ⇒ hỏi lại lượt ngay, không đợi hết một nhịp poll
    // (focusManager nối AppState ở `query-client.ts`).
    refetchOnWindowFocus: 'always',
  });
}

export function useStartTripGatewayCheckout(tripId: string) {
  return useMutation({
    mutationFn: (body: StartGatewayCheckoutInput) =>
      paymentGatewayApi.startTripCheckout(tripId, body),
  });
}
