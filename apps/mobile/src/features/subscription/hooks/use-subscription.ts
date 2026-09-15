import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import { subscriptionApi, type PurchaseSubscriptionInput } from '@/api/subscription/api';

/** Bản native của `features/subscription/hooks/use-subscription.ts` — cùng khoá, cùng luật. */
export function useMySubscription(enabled = true) {
  return useQuery({
    queryKey: queryKeys.subscription.me(),
    queryFn: () => subscriptionApi.me(),
    enabled,
  });
}

export function useTenantPlans(enabled = true) {
  return useQuery({
    queryKey: queryKeys.subscription.plans(),
    queryFn: () => subscriptionApi.plans(),
    enabled,
  });
}

/** Thông tin nhận tiền của nền tảng — đổi khi ops đổi tài khoản, tức gần như không bao giờ. */
export function usePaymentInfo(enabled = true) {
  return useQuery({
    queryKey: queryKeys.subscription.paymentInfo(),
    queryFn: () => subscriptionApi.paymentInfo(),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useSubscriptionInvoices(page: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.subscription.invoices(page),
    queryFn: () => subscriptionApi.invoices(page),
    enabled,
  });
}

/** Mua/gia hạn — invalidate cả nhánh: hoá đơn mới đổi lịch sử, và hoá đơn chờ cũ bị void. */
export function usePurchaseSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PurchaseSubscriptionInput) => subscriptionApi.purchase(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
    },
  });
}
