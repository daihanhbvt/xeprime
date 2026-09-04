'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  fetchInvoices,
  fetchPaymentInfo,
  fetchMySubscription,
  fetchTenantPlans,
  purchaseSubscription,
} from '../api';
import type { PurchaseSubscriptionInput } from '../types';

export function useMySubscription() {
  return useQuery({ queryKey: queryKeys.subscription.me(), queryFn: fetchMySubscription });
}

export function useTenantPlans(enabled = true) {
  return useQuery({
    queryKey: queryKeys.subscription.plans(),
    queryFn: fetchTenantPlans,
    enabled,
  });
}

/** Thông tin nhận tiền của nền tảng — đổi khi ops đổi tài khoản, tức gần như không bao giờ. */
export function usePaymentInfo(enabled = true) {
  return useQuery({
    queryKey: queryKeys.subscription.paymentInfo(),
    queryFn: fetchPaymentInfo,
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useSubscriptionInvoices(page: number) {
  return useQuery({
    queryKey: queryKeys.subscription.invoices(page),
    queryFn: () => fetchInvoices(page),
  });
}

/** Mua/gia hạn — invalidate cả nhánh: hoá đơn mới đổi lịch sử, và hoá đơn chờ cũ bị void. */
export function usePurchaseSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: PurchaseSubscriptionInput) => purchaseSubscription(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
    },
  });
}
