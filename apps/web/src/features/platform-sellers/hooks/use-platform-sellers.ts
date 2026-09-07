'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  fetchPlatformSeller,
  fetchPlatformSellers,
  filtersToParams,
  rejectSeller,
  requestSellerChanges,
  verifySeller,
} from '../api';
import type { PlatformSellerFilters, ReviewSellerProfileInput } from '../types';

export function usePlatformSellers(filters: PlatformSellerFilters) {
  return useQuery({
    queryKey: queryKeys.platformSellers.list(filtersToParams(filters)),
    queryFn: () => fetchPlatformSellers(filters),
    placeholderData: keepPreviousData,
  });
}

export function usePlatformSeller(id: string | null) {
  return useQuery({
    queryKey: queryKeys.platformSellers.detail(id ?? ''),
    queryFn: () => fetchPlatformSeller(id!),
    enabled: Boolean(id),
  });
}

function useInvalidatePlatformSellers() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.platformSellers.all });
}

export function useVerifySeller() {
  const invalidate = useInvalidatePlatformSellers();
  return useMutation({
    mutationFn: (id: string) => verifySeller(id),
    onSuccess: invalidate,
  });
}

export function useRequestSellerChanges() {
  const invalidate = useInvalidatePlatformSellers();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & ReviewSellerProfileInput) =>
      requestSellerChanges(id, body),
    onSuccess: invalidate,
  });
}

export function useRejectSeller() {
  const invalidate = useInvalidatePlatformSellers();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & ReviewSellerProfileInput) => rejectSeller(id, body),
    onSuccess: invalidate,
  });
}
