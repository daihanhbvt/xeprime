import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchPlatformSummary } from '../api';

export function usePlatformSummary() {
  return useQuery({
    queryKey: queryKeys.platformDashboard.summary(),
    queryFn: fetchPlatformSummary,
  });
}
