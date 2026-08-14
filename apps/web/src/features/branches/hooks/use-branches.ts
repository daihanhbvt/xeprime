'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { apiRequest, getErrorMessage, type QueryParams } from '@/services/api-client';
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
  return useMutation({
    mutationFn: async (input: CreateBranchInput): Promise<Branch> => {
      const res = await apiRequest<Branch>('/branches', { method: 'POST', body: input });
      return res.data;
    },
    onSuccess: (branch) => {
      message.success(`Đã tạo chi nhánh ${branch.name}`);
      invalidate();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
}

export function useUpdateBranch() {
  const invalidate = useInvalidateBranchSurfaces();
  const { message } = App.useApp();
  return useMutation({
    mutationFn: async (input: UpdateBranchInput & { id: string }): Promise<Branch> => {
      const { id, ...body } = input;
      const res = await apiRequest<Branch>(`/branches/${id}`, { method: 'PATCH', body });
      return res.data;
    },
    onSuccess: () => {
      message.success('Đã cập nhật chi nhánh');
      invalidate();
    },
    onError: (error) => message.error(getErrorMessage(error)),
  });
}

/**
 * Ba thao tác vòng đời dùng chung một mutation: chúng chỉ khác nhau ở đoạn đường và câu thông
 * báo. Tách thành ba hook gần như giống hệt nhau chỉ tạo chỗ để chúng lệch nhau về sau.
 */
export function useBranchAction() {
  const invalidate = useInvalidateBranchSurfaces();
  const { message } = App.useApp();
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
          ? 'Đã đặt làm chi nhánh mặc định'
          : input.action === 'activate'
            ? 'Đã bật lại chi nhánh'
            : 'Đã ngừng hoạt động chi nhánh',
      );
      invalidate();
    },
    // Lỗi xung đột (còn xe/đơn) mang thông điệp nêu rõ phải xử lý gì — hiện nguyên văn.
    onError: (error) => message.error(getErrorMessage(error)),
  });
}
