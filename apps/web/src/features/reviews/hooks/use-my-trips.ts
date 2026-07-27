'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchMyTrips, tripsToParams } from '../api';

/** Các chuyến của khách (server data). Phân trang server-side; `page` là state của trang. */
export function useMyTrips(page: number) {
  return useQuery({
    queryKey: queryKeys.reviews.myTrips(tripsToParams(page)),
    queryFn: () => fetchMyTrips(page),
    placeholderData: keepPreviousData,
  });
}
