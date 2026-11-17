import { useQuery } from '@tanstack/react-query';
import { keepPageData } from '@/queries/keep-page-data';
import { queryKeys } from '@/queries/query-keys';
import { bookingsApi, historyFiltersToParams, type BookingHistoryFilters } from '../api';

/** "Đơn đã kết thúc" — một trang, lọc/phân trang ở server (bản native của web `useBookingHistory`). */
export function useBookingHistory(
  filters: BookingHistoryFilters,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const params = historyFiltersToParams(filters);
  return useQuery({
    enabled,
    queryKey: queryKeys.bookings.history(params),
    queryFn: () => bookingsApi.history(filters),
    placeholderData: keepPageData<Awaited<ReturnType<typeof bookingsApi.history>>>(params),
  });
}
