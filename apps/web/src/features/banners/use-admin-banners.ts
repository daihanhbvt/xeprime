'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import type { AdminBanner } from './types';

export interface BannerInput {
  title: string;
  imageUrl: string;
  mobileImageUrl?: string | null;
  altText: string;
  linkUrl?: string | null;
  active?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
}

export function useAdminBanners() {
  return useQuery({
    queryKey: queryKeys.banners.admin(),
    queryFn: () => apiGet<AdminBanner[]>('/platform/banners'),
  });
}

/** Mọi mutation xoá cache CẢ nhánh `banners` — gồm luôn bản public mà trang chủ đọc. */
function useBannerMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.banners.all }),
  });
}

export function useCreateBanner() {
  return useBannerMutation((body: BannerInput) => apiPost<AdminBanner>('/platform/banners', body));
}

export function useUpdateBanner() {
  return useBannerMutation(({ id, ...body }: Partial<BannerInput> & { id: string }) =>
    apiPatch<AdminBanner>(`/platform/banners/${id}`, body),
  );
}

export function useDeleteBanner() {
  return useBannerMutation((id: string) => apiDelete<void>(`/platform/banners/${id}`));
}

export function useReorderBanners() {
  return useBannerMutation((ids: string[]) =>
    apiPost<AdminBanner[]>('/platform/banners/reorder', { ids }),
  );
}
