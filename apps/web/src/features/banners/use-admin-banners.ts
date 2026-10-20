'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { API_ERROR_CODE, type BannerPlacement } from '@xeprime/types';
import { useErrorMessage } from '@/i18n/use-error-message';
import { apiDelete, apiGet, apiPatch, apiPost, getErrorCode } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import type { AdminBanner } from './types';

/**
 * Trần số banner được TRÙNG thời gian hiển thị — khớp `MAX_CONCURRENT_VISIBLE_BANNERS` của API
 * (`banners.service.ts`), nơi chặn thật. Web chỉ dùng để nói đúng con số với admin.
 */
export const MAX_CONCURRENT_VISIBLE_BANNERS = 10;

export interface BannerInput {
  /** Chỉ khi TẠO — vị trí không đổi được sau đó (API bỏ qua ở PATCH). */
  placement?: BannerPlacement;
  title: string;
  imageUrl: string;
  tabletImageUrl?: string | null;
  mobileImageUrl?: string | null;
  altText: string;
  linkUrl?: string | null;
  active?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
}

export function useAdminBanners(placement: BannerPlacement) {
  return useQuery({
    queryKey: queryKeys.banners.admin(placement),
    queryFn: () => apiGet<AdminBanner[]>('/platform/banners', { placement }),
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

/** Thứ tự tính RIÊNG từng vị trí — gửi trọn danh sách id của đúng vị trí đó. */
export function useReorderBanners(placement: BannerPlacement) {
  return useBannerMutation((ids: string[]) =>
    apiPost<AdminBanner[]>('/platform/banners/reorder', { placement, ids }),
  );
}

/**
 * Lỗi khi TẠO / SỬA / BẬT banner → câu theo ngôn ngữ đang dùng.
 *
 * Vượt trần banner trùng lịch có mã riêng (`BANNER_VISIBLE_LIMIT_EXCEEDED`): câu riêng kèm con số
 * trần — admin không thể tự đoán ra nó. Mọi mã khác đi đường chung `useErrorMessage()`.
 */
export function useBannerSaveErrorMessage(): (error: unknown) => string {
  const t = useTranslations('AdminBanners.toast');
  const errorMessage = useErrorMessage();
  return useCallback(
    (error: unknown) =>
      getErrorCode(error) === API_ERROR_CODE.BANNER_VISIBLE_LIMIT_EXCEEDED
        ? t('capacityExceeded', { max: MAX_CONCURRENT_VISIBLE_BANNERS })
        : errorMessage(error),
    [t, errorMessage],
  );
}
