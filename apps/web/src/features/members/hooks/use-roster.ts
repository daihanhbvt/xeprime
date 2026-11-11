'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchMemberActivity, fetchMemberRoles, fetchRoster, rosterFiltersToParams } from '../api';
import type { RosterFilters } from '../types';

/** Danh sách gộp thành viên + lời mời còn chờ — phân trang, lọc ở server (ADR 0086 điều 5). */
export function useRoster(filters: RosterFilters) {
  return useQuery({
    queryKey: queryKeys.members.roster(rosterFiltersToParams(filters)),
    queryFn: () => fetchRoster(filters),
    placeholderData: keepPreviousData,
  });
}

/** Bốn vai kèm khoá quyền + số người — nuôi ma trận "Vai trò & quyền" (ADR 0086 điều 1). */
export function useMemberRoles() {
  return useQuery({
    queryKey: queryKeys.members.roles(),
    queryFn: fetchMemberRoles,
  });
}

/** Việc gần đây của một thành viên — chỉ tải khi ngăn chi tiết đang mở người đó. */
export function useMemberActivity(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.members.activity(userId ?? ''),
    queryFn: () => fetchMemberActivity(userId!),
    enabled: Boolean(userId),
  });
}
