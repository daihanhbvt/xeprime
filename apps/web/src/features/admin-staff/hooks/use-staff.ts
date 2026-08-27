'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchStaff, filtersToParams } from '../api';
import type { StaffFilters } from '../types';

export function useStaff(filters: StaffFilters) {
  return useQuery({
    queryKey: queryKeys.platformStaff.list(filtersToParams(filters)),
    queryFn: () => fetchStaff(filters),
    placeholderData: keepPreviousData,
  });
}
