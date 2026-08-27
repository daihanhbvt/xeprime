'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CatalogType } from '@xeprime/types';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import type { CatalogItem, CatalogItemAdmin } from './types';

export interface CatalogItemInput {
  label: string;
  description?: string | null;
  iconUrl?: string | null;
  active?: boolean;
}

/** Danh mục đầy đủ của MỘT chiều, kèm mục đã tắt và số xe đang dùng. */
export function useAdminCatalog(type: CatalogType) {
  return useQuery({
    queryKey: queryKeys.catalog.admin({ type }),
    queryFn: () => apiGet<CatalogItemAdmin[]>('/platform/catalog', { type }),
  });
}

/**
 * Mọi mutation danh mục đều xoá cache CẢ nhánh `catalog` — nhánh đó gồm luôn danh mục công khai
 * mà form tạo xe và bộ lọc đang đọc, nên admin sửa xong là ba màn thấy ngay mà không phải F5.
 */
function useCatalogMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all }),
  });
}

export function useCreateCatalogItem() {
  return useCatalogMutation((body: CatalogItemInput & { type: CatalogType; key: string }) =>
    apiPost<CatalogItem>('/platform/catalog', body),
  );
}

export function useUpdateCatalogItem() {
  return useCatalogMutation(({ id, ...body }: CatalogItemInput & { id: string }) =>
    apiPatch<CatalogItem>(`/platform/catalog/${id}`, body),
  );
}

export function useDeleteCatalogItem() {
  return useCatalogMutation((id: string) => apiDelete<void>(`/platform/catalog/${id}`));
}

/** Đổi thứ tự: gửi trọn danh sách id của một chiều, backend ghi lại trong một transaction. */
export function useReorderCatalog() {
  return useCatalogMutation((vars: { type: CatalogType; ids: string[] }) =>
    apiPost<CatalogItemAdmin[]>('/platform/catalog/reorder', vars),
  );
}
