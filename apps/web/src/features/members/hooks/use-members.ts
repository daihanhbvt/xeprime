'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchMembers, filtersToParams } from '../api';
import type { MemberFilters } from '../types';

/** Danh sách thành viên gian hàng — server data (TanStack Query), phân trang server-side. */
export function useMembers(filters: MemberFilters) {
  return useQuery({
    queryKey: queryKeys.members.list(filtersToParams(filters)),
    queryFn: () => fetchMembers(filters),
    placeholderData: keepPreviousData,
  });
}
