'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { createCategory, deleteCategory, fetchCategories, updateCategory } from '../api';
import type { CreateCategoryInput } from '../types';

/** Danh mục thu/chi dùng được cho tenant (hệ thống + riêng). `type` lọc income/expense. */
export function useFinanceCategories(type?: string) {
  return useQuery({
    queryKey: queryKeys.receipts.categories({ type: type ?? null }),
    queryFn: () => fetchCategories(type),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCategoryInput) => createCategory(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['receipts', 'categories'] }),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['receipts', 'categories'] }),
  });
}

/**
 * Đổi tên danh mục riêng của gian hàng. Làm mới CẢ sổ thu chi (không chỉ danh sách danh mục):
 * cột "Danh mục" và cơ cấu theo danh mục đọc tên từ server, để tên cũ treo trên bảng sau khi vừa
 * đổi là trông như lưu hỏng.
 */
export function useUpdateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateCategory(id, name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.receipts.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.finance.all });
    },
  });
}
