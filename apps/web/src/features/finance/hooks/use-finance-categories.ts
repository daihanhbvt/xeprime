'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { createCategory, deleteCategory, fetchCategories } from '../api';
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
