'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import { queryKeys } from '@/services/query-keys';
import {
  createPromoCode,
  deletePromoCode,
  duplicatePromoCode,
  fetchAdminPromoCodes,
  fetchPromoRedemptions,
  togglePromoCode,
  updatePromoCode,
} from '../api';
import type { AdminPromoFilters, UpsertPromoCodeInput } from '../types';

/**
 * Bộ lọc màn quản trị mã khuyến mãi — ở URL searchParams (ADR 0004).
 *
 * `'all'` là sentinel không-lọc của `useUrlFilters`: chọn "Tất cả" xoá hẳn tham số khỏi URL thay
 * vì để lại `?state=all`.
 */
export function useAdminPromoFilters() {
  return useUrlFilters<AdminPromoFilters>((sp) => ({
    q: sp.get('q') ?? undefined,
    discountType: sp.get('discountType') ?? 'all',
    state: sp.get('state') ?? 'all',
    dateFrom: sp.get('dateFrom') ?? undefined,
    dateTo: sp.get('dateTo') ?? undefined,
    page: positiveIntParam(sp, 'page') ?? 1,
  }));
}

export function useAdminPromoCodes(filters: AdminPromoFilters) {
  return useQuery({
    queryKey: queryKeys.promoCodes.list({
      q: filters.q ?? null,
      discountType: filters.discountType,
      state: filters.state,
      dateFrom: filters.dateFrom ?? null,
      dateTo: filters.dateTo ?? null,
      page: filters.page,
    }),
    queryFn: () => fetchAdminPromoCodes(filters),
    /*
     * Thẻ thống kê và trạng thái suy ra đều phụ thuộc ĐỒNG HỒ ("sắp hết hạn", "đã hết hạn"), nên
     * dữ liệu cũ quá lâu sẽ nói sai. 30 giây đủ để một lượt lọc qua lại không gọi lại server, và
     * ngắn hơn hẳn mọi mốc ngày mà các trạng thái đó quan tâm.
     */
    staleTime: 30_000,
  });
}

export function usePromoRedemptions(promoCodeId: string | null, page: number) {
  return useQuery({
    queryKey: queryKeys.promoCodes.redemptions(promoCodeId ?? '', page),
    queryFn: () => fetchPromoRedemptions(promoCodeId!, page),
    enabled: Boolean(promoCodeId),
  });
}

/**
 * Sau mỗi lượt ghi, làm mới TOÀN BỘ nhánh mã khuyến mãi — không chỉ trang đang xem.
 *
 * Lý do: một lượt tạo/bật/tắt đổi luôn các thẻ thống kê (đếm trên toàn bộ chiến dịch) và có thể
 * đổi tư cách của một hàng trước bộ lọc đang bật. Invalidate hẹp theo đúng khoá trang hiện tại
 * sẽ để lại thẻ thống kê nói con số của trước lúc bấm.
 */
function useInvalidatePromoCodes() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.promoCodes.all });
}

export function useCreatePromoCode() {
  const invalidate = useInvalidatePromoCodes();
  return useMutation({
    mutationFn: (body: UpsertPromoCodeInput) => createPromoCode(body),
    onSuccess: invalidate,
  });
}

export function useUpdatePromoCode() {
  const invalidate = useInvalidatePromoCodes();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpsertPromoCodeInput }) =>
      updatePromoCode(id, body),
    onSuccess: invalidate,
  });
}

export function useTogglePromoCode() {
  const invalidate = useInvalidatePromoCodes();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      togglePromoCode(id, isActive),
    onSuccess: invalidate,
  });
}

export function useDuplicatePromoCode() {
  const invalidate = useInvalidatePromoCodes();
  return useMutation({
    mutationFn: (id: string) => duplicatePromoCode(id),
    onSuccess: invalidate,
  });
}

export function useDeletePromoCode() {
  const invalidate = useInvalidatePromoCodes();
  return useMutation({
    mutationFn: (id: string) => deletePromoCode(id),
    onSuccess: invalidate,
  });
}
