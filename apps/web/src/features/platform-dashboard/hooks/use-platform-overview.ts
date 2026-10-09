import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchPlatformOverview } from '../api';

/** Số liệu tháng của nền tảng — đổi theo phút là đủ; không cần nhịp làm mới riêng. */
export function usePlatformOverview() {
  return useQuery({
    queryKey: queryKeys.platformDashboard.overview(),
    queryFn: fetchPlatformOverview,
    staleTime: 60_000,
  });
}
