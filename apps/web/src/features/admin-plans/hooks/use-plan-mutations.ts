'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PLAN_STATUS, type PlanStatus } from '@xeprime/types';
import { adminTenantQueryKeys } from '@/features/admin-tenants/hooks/use-admin-tenants';
import { adminPartnerKeys } from '@/features/admin-tenants/partner-detail/hooks';
import { queryKeys } from '@/services/query-keys';
import {
  activatePlan,
  archivePlan,
  assignSubscription,
  cancelSubscription,
  createPlan,
  deletePlan,
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

/**
 * Bật/tắt bán một bậc gói — MỘT mutation cho cả hai chiều, vì màn quản trị điều khiển nó bằng
 * MỘT công tắc: `variables.id` cho biết đúng hàng nào đang chờ, bất kể chiều nào.
 *
 * Làm mới cả khi LỖI (`onSettled`), không chỉ khi thành công: backend lật trạng thái bằng
 * compare-and-set, nên lượt thua một admin khác (hay một tab cũ) nhận `INVALID_STATUS_TRANSITION`.
 * Chiều lật được suy từ hàng ĐANG HIỂN THỊ — không làm mới thì công tắc kẹt ở vị trí sai và mọi
 * lượt bấm sau cứ gửi lại đúng chiều đã sai.
 */
export function useSetPlanStatus() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: PlanStatus }) =>
      status === PLAN_STATUS.ACTIVE ? activatePlan(id) : archivePlan(id),
    onSettled: () => invalidate(),
  });
}

/**
 * Xoá hẳn một gói NHÁP. Làm mới cả khi lỗi: `PLAN_IN_USE` nghĩa là cờ `deletable` đang hiện đã
 * cũ (vừa có ai mua/gán), và danh sách phải đọc lại để nút "Xoá gói" biến mất.
 */
export function useDeletePlan() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: (id: string) => deletePlan(id),
    onSettled: () => invalidate(),
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
