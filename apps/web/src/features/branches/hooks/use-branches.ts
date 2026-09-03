'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { useTranslations } from 'next-intl';
import { apiRequest, type QueryParams } from '@/services/api-client';
import { useErrorMessage } from '@/i18n/use-error-message';
import { queryKeys } from '@/services/query-keys';
import type { Branch, BranchList, CreateBranchInput, UpdateBranchInput } from '../types';

/**
 * Chi nhánh của gian hàng hiện tại. `tenantId` KHÔNG đi trên query — backend lấy từ phiên.
 *
 * Mọi mutation ở đây làm mới CẢ ba nhánh: `branches` (danh sách + bộ chọn ở thanh trên),
 * `vehicles` (thẻ xe hiển thị tên chi nhánh) và `shop` (hồ sơ mang tỉnh của chi nhánh mặc định).
 * Bỏ sót một nhánh là màn hình nói một đằng, dữ liệu một nẻo.
 */
export function useBranches(params: QueryParams = {}) {
  return useQuery({
    queryKey: queryKeys.branches.list(params),
    queryFn: async (): Promise<BranchList> => {
      const res = await apiRequest<BranchList>('/branches', { query: params });
      return res.data;
    },
  });
}

/** Chi nhánh ĐANG HOẠT ĐỘNG — dùng cho bộ chọn ở form xe và thanh trên. */
export function useActiveBranches() {
  return useBranches({ status: 'active' });
}

function useInvalidateBranchSurfaces() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: queryKeys.branches.all });
    void qc.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    void qc.invalidateQueries({ queryKey: queryKeys.shop.all });
  };
}

export function useCreateBranch() {
  const invalidate = useInvalidateBranchSurfaces();
  const { message } = App.useApp();
  const t = useTranslations('Branches');
  const errorMessage = useErrorMessage();
  return useMutation({
    mutationFn: async (input: CreateBranchInput): Promise<Branch> => {
      const res = await apiRequest<Branch>('/branches', { method: 'POST', body: input });
      return res.data;
    },
    onSuccess: (branch) => {
      message.success(t('toast.created', { name: branch.name }));
      invalidate();
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

export function useUpdateBranch() {
  const invalidate = useInvalidateBranchSurfaces();
  const { message } = App.useApp();
  const t = useTranslations('Branches');
  const errorMessage = useErrorMessage();
  return useMutation({
    mutationFn: async (input: UpdateBranchInput & { id: string }): Promise<Branch> => {
      const { id, ...body } = input;
      const res = await apiRequest<Branch>(`/branches/${id}`, { method: 'PATCH', body });
      return res.data;
    },
    onSuccess: () => {
      message.success(t('toast.updated'));
      invalidate();
    },
    onError: (error) => message.error(errorMessage(error)),
  });
}

/**
 * Ba thao tác vòng đời dùng chung một mutation: chúng chỉ khác nhau ở đoạn đường và câu thông
 * báo. Tách thành ba hook gần như giống hệt nhau chỉ tạo chỗ để chúng lệch nhau về sau.
 */
export function useBranchAction() {
  const invalidate = useInvalidateBranchSurfaces();
  const { message } = App.useApp();
  const t = useTranslations('Branches');
  const errorMessage = useErrorMessage();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      action: 'set-default' | 'activate' | 'deactivate';
    }): Promise<Branch> => {
      const res = await apiRequest<Branch>(`/branches/${input.id}/${input.action}`, {
        method: 'POST',
      });
      return res.data;
    },
    onSuccess: (_branch, input) => {
      message.success(
        input.action === 'set-default'
          ? t('toast.setDefault')
          : input.action === 'activate'
            ? t('toast.activated')
            : t('toast.deactivated'),
      );
      invalidate();
    },
    // Lỗi xung đột (còn xe/đơn) dịch từ MÃ như mọi lỗi khác (ADR 0012) — `message` của backend
    // là tiếng Việt và không bao giờ lên màn hình tiếng Anh.
    onError: (error) => message.error(errorMessage(error)),
  });
}
