'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminTenantQueryKeys } from '@/features/admin-tenants/hooks/use-admin-tenants';
import { adminPartnerKeys } from '@/features/admin-tenants/partner-detail/hooks';
import { queryKeys } from '@/services/query-keys';
import {
  archivePlan,
  assignSubscription,
  cancelSubscription,
  createPlan,
  updatePlan,
} from '../api';
import type { AssignSubscriptionInput, CreatePlanInput, UpdatePlanInput } from '../types';

/**
 * Mọi thay đổi billing invalidate cả nhánh; gán/huỷ thuê bao làm mới thêm chi tiết gian hàng VÀ
 * hai danh sách đối tác — gán gói cho một chủ xe cá nhân là chuyển họ sang "Gian hàng gói".
 */
function useInvalidateBilling() {
  const queryClient = useQueryClient();
  return (tenantId?: string) => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.billing.all });
    if (tenantId) {
      void queryClient.invalidateQueries({ queryKey: adminTenantQueryKeys.detail(tenantId) });
      void queryClient.invalidateQueries({ queryKey: adminTenantQueryKeys.lists });
      // Gói, hạn mức, loại đối tác trong drawer chi tiết đều đổi theo.
      void queryClient.invalidateQueries({ queryKey: adminPartnerKeys.tenant(tenantId) });
    }
  };
}

export function useCreatePlan() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: (body: CreatePlanInput) => createPlan(body),
    onSuccess: () => invalidate(),
  });
}

export function useUpdatePlan() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & UpdatePlanInput) => updatePlan(id, body),
    onSuccess: () => invalidate(),
  });
}

export function useArchivePlan() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: (id: string) => archivePlan(id),
    onSuccess: () => invalidate(),
  });
}

export function useAssignSubscription(tenantId: string) {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: (body: AssignSubscriptionInput) => assignSubscription(tenantId, body),
    onSuccess: () => invalidate(tenantId),
  });
}

export function useCancelSubscription(tenantId: string) {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: (id: string) => cancelSubscription(tenantId, id),
    onSuccess: () => invalidate(tenantId),
  });
}
