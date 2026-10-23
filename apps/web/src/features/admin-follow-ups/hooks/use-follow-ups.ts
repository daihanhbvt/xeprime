'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FOLLOW_UP_LOST_REASON_VALUES,
  FOLLOW_UP_STATUS,
  FOLLOW_UP_STATUS_VALUES,
} from '@xeprime/types';
import { ALL_FILTER } from '@/constants/filters';
import { enumParam, positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import { queryKeys } from '@/services/query-keys';
import {
  fetchFollowUpAssignees,
  fetchFollowUps,
  filtersToParams,
  revealFollowUpContact,
  updateFollowUp,
} from '../api';
import type { FollowUpFilters, UpdateFollowUpInput } from '../types';

/** Giá trị URL của lựa chọn "mọi trạng thái chăm sóc". */
export const FOLLOW_UP_STATUS_ANY = 'any';

/**
 * Bộ lọc tab "Cần chăm sóc" ở URL (ADR 0004). Mặc định là VIỆC CẦN LÀM — mục chưa liên hệ; giá trị
 * lạ (link cũ, gõ tay) rơi về mặc định thay vì thành một lỗi 400.
 */
export function useFollowUpFilters() {
  return useUrlFilters<FollowUpFilters>((sp) => ({
    q: sp.get('q')?.trim() || undefined,
    phone: sp.get('phone')?.trim() || undefined,
    reason: enumParam(sp, 'reason', FOLLOW_UP_LOST_REASON_VALUES) ?? ALL_FILTER,
    // `any` = mọi trạng thái: `all` bị `useUrlFilters` xoá khỏi URL, mà thiếu tham số là mặc định NEW.
    followUpStatus:
      sp.get('followUpStatus') === FOLLOW_UP_STATUS_ANY
        ? ALL_FILTER
        : (enumParam(sp, 'followUpStatus', FOLLOW_UP_STATUS_VALUES) ?? FOLLOW_UP_STATUS.NEW),
    mine: sp.get('mine') === 'true',
    dateFrom: sp.get('dateFrom') ?? undefined,
    dateTo: sp.get('dateTo') ?? undefined,
    page: positiveIntParam(sp, 'page'),
    limit: positiveIntParam(sp, 'limit'),
    open: sp.get('open') ?? undefined,
  }));
}

export function useFollowUps(filters: FollowUpFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.platformFollowUps.list(filtersToParams(filters)),
    queryFn: () => fetchFollowUps(filters),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Số khách CHƯA liên hệ — cho ô đếm trên tab và Tổng quan nền tảng. `limit: 1` vì chỉ cần total. */
export function useNewFollowUpCount(enabled = true) {
  const filters: FollowUpFilters = { followUpStatus: FOLLOW_UP_STATUS.NEW, page: 1, limit: 1 };
  return useQuery({
    queryKey: queryKeys.platformFollowUps.list(filtersToParams(filters)),
    queryFn: () => fetchFollowUps(filters),
    enabled,
    select: (page) => page.meta.total,
  });
}

export function useUpdateFollowUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateFollowUpInput }) =>
      updateFollowUp(id, body),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: queryKeys.platformFollowUps.all }),
  });
}

/** Mutation chứ không phải query: mỗi lần gọi ghi một dòng audit — phải do người dùng bấm. */
export function useRevealFollowUpContact(id: string) {
  return useMutation({ mutationFn: () => revealFollowUpContact(id) });
}

/** Danh sách phụ trách — đổi rất ít, giữ 5 phút; chỉ gọi khi người xem ghi được kết quả. */
export function useFollowUpAssignees(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.platformFollowUps.assignees,
    queryFn: fetchFollowUpAssignees,
    enabled,
    staleTime: 5 * 60_000,
  });
}
