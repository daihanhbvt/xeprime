'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DriverTripTab } from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';
import {
  acceptDriverLink,
  acceptDriverTrip,
  declineDriverLink,
  declineDriverTrip,
  fetchDriverPendingCounts,
  fetchDriverTrip,
  fetchDriverTrips,
  fetchMyDriverLinks,
  leaveDriverLink,
} from './api';
import type { DriverLinkScope } from './types';

export function useMyDriverLinks(scope: DriverLinkScope, page: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.driving.links(scope, page),
    queryFn: () => fetchMyDriverLinks(scope, page),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useDriverPendingCounts(enabled = true) {
  return useQuery({
    queryKey: queryKeys.driving.pendingCounts,
    queryFn: fetchDriverPendingCounts,
    staleTime: 30_000,
    enabled,
  });
}

export function useDriverTrips(tab: DriverTripTab, page: number) {
  return useQuery({
    queryKey: queryKeys.driving.trips(tab, page),
    queryFn: () => fetchDriverTrips(tab, page),
    placeholderData: keepPreviousData,
  });
}

export function useDriverTrip(id: string) {
  return useQuery({
    queryKey: queryKeys.driving.trip(id),
    queryFn: () => fetchDriverTrip(id),
    enabled: id.length > 0,
  });
}

/** Mọi thao tác tài xế đổi cả danh sách lẫn huy hiệu — làm mới cả nhánh `driving`. */
function useDrivingMutation<TData>(fn: (id: string) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.driving.all }),
  });
}

export const useAcceptDriverLink = () => useDrivingMutation(acceptDriverLink);
export const useDeclineDriverLink = () => useDrivingMutation(declineDriverLink);
export const useLeaveDriverLink = () => useDrivingMutation(leaveDriverLink);
export const useAcceptDriverTrip = () => useDrivingMutation(acceptDriverTrip);
export const useDeclineDriverTrip = () => useDrivingMutation(declineDriverTrip);
