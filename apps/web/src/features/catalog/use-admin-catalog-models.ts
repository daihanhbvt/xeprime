'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { components } from '@xeprime/types';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';

/** Shape từ OpenAPI (ADR 0007) — không viết tay lại DTO. */
export type CatalogModelAdmin = components['schemas']['CatalogModelAdminDto'];

export interface CatalogModelInput {
  label: string;
  marketStatus?: string;
  motorbikeCategory?: string | null;
  fuelTypes?: string[];
  transmissions?: string[];
  engineDisplacementCc?: number | null;
  seatCount?: number | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  sourceUrl?: string | null;
  active?: boolean;
}

/**
 * Mẫu xe của một loại phương tiện (và một hãng nếu đã chọn), kèm mẫu đã tắt và số xe đang gắn.
 *
 * `vehicleType` bắt buộc vì mẫu xe LUÔN thuộc một loại — một danh sách trộn cả ô tô lẫn xe máy
 * không trả lời được câu hỏi nào mà người quản trị đang hỏi.
 */
export function useAdminCatalogModels(vehicleType: string, brandKey?: string) {
  return useQuery({
    queryKey: queryKeys.catalog.admin({ models: '1', vehicleType, brandKey: brandKey ?? '' }),
    queryFn: () =>
      apiGet<CatalogModelAdmin[]>('/platform/catalog/models', {
        vehicleType,
        ...(brandKey ? { brandKey } : {}),
      }),
  });
}

/**
 * Mọi mutation mẫu xe xoá cache CẢ nhánh `catalog` — nhánh đó gồm luôn danh sách mẫu công khai
 * mà form đăng xe đang đọc, nên admin sửa xong là form thấy ngay mà không phải tải lại trang.
 */
function useModelMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all }),
  });
}

export function useCreateCatalogModel() {
  return useModelMutation(
    (body: CatalogModelInput & { brandKey: string; vehicleType: string }) =>
      apiPost<CatalogModelAdmin>('/platform/catalog/models', body),
  );
}

export function useUpdateCatalogModel() {
  return useModelMutation(({ id, ...body }: CatalogModelInput & { id: string }) =>
    apiPatch<CatalogModelAdmin>(`/platform/catalog/models/${id}`, body),
  );
}

export function useDeleteCatalogModel() {
  return useModelMutation((id: string) => apiDelete<void>(`/platform/catalog/models/${id}`));
}
