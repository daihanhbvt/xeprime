'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DriverTripTab } from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';
import {
  acceptDriverLink,
  acceptDriverTrip,
  declineDriverLink,
  declineDriverTrip,
  dropDriverTrip,
  fetchDriverPendingCounts,
  fetchDriverTrip,
  fetchDriverTrips,
  fetchMyDriverLinks,
  leaveDriverLink,
} from './api';
import type { DriverLinkScope, DropDriverTripBody } from './types';

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

export function useDriverTrips(tab: DriverTripTab, page: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.driving.trips(tab, page),
    queryFn: () => fetchDriverTrips(tab, page),
    placeholderData: keepPreviousData,
    enabled,
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
function useDrivingMutation<TData, TVars = string>(fn: (vars: TVars) => Promise<TData>) {
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
export const useDropDriverTrip = () =>
  useDrivingMutation(({ id, body }: { id: string; body: DropDriverTripBody }) =>
    dropDriverTrip(id, body),
  );
