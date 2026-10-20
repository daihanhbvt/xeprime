import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DriverTripTab } from '@xeprime/types';
import { queryKeys } from '@/queries/query-keys';
import { drivingApi, type DriverLinkScope } from './api';

/*
 * Cùng khoá `queryKeys.driving` với web — hai app gọi cùng endpoint thì `invalidateQueries` sau
 * một lần ghi phải chạm đúng cùng một nhánh. Trang trên native là CUỘN VÔ HẠN: phần tử "trang"
 * của khoá là 0 (một bộ trang), không trùng khoá một-trang của web vì hình dạng data khác.
 */
const INFINITE = 0;

const nextPage = (last: { meta: { hasNext: boolean; page: number } }) =>
  last.meta.hasNext ? last.meta.page + 1 : undefined;

/** Lời mời + liên kết của tài khoản này — cuộn vô hạn, cắt trang ở server. */
export function useMyDriverLinks(scope: DriverLinkScope) {
  return useInfiniteQuery({
    queryKey: queryKeys.driving.links(scope, INFINITE),
    queryFn: ({ pageParam }) => drivingApi.links(scope, pageParam),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

export function useDriverPendingCounts(enabled = true) {
  return useQuery({
    queryKey: queryKeys.driving.pendingCounts,
    queryFn: drivingApi.pendingCounts,
    staleTime: 30_000,
    enabled,
  });
}

export function useDriverTrips(tab: DriverTripTab) {
  return useInfiniteQuery({
    queryKey: queryKeys.driving.trips(tab, INFINITE),
    queryFn: ({ pageParam }) => drivingApi.trips(tab, pageParam),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
}

export function useDriverTrip(id: string) {
  return useQuery({
    queryKey: queryKeys.driving.trip(id),
    queryFn: () => drivingApi.trip(id),
    enabled: id.length > 0,
  });
}

/** Mọi thao tác tài xế đổi cả danh sách lẫn huy hiệu — làm mới cả nhánh `driving`. */
function useDrivingMutation<TData>(fn: (id: string) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fn(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.driving.all }),
  });
}

export const useAcceptDriverLink = () => useDrivingMutation(drivingApi.acceptLink);
export const useDeclineDriverLink = () => useDrivingMutation(drivingApi.declineLink);
export const useLeaveDriverLink = () => useDrivingMutation(drivingApi.leaveLink);
export const useAcceptDriverTrip = () => useDrivingMutation(drivingApi.acceptTrip);
export const useDeclineDriverTrip = () => useDrivingMutation(drivingApi.declineTrip);
