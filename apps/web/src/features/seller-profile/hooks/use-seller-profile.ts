'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchSellerProfile, saveSellerProfile, submitSellerProfile } from '../api';
import type { SaveSellerProfileInput } from '../types';

export function useSellerProfile() {
  return useQuery({
    queryKey: queryKeys.sellerProfile.me(),
    queryFn: fetchSellerProfile,
  });
}

function useInvalidateSellerProfile() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.sellerProfile.all });
}

export function useSaveSellerProfile() {
  const invalidate = useInvalidateSellerProfile();
  return useMutation({
    mutationFn: (body: SaveSellerProfileInput) => saveSellerProfile(body),
    onSuccess: invalidate,
  });
}

export function useSubmitSellerProfile() {
  const invalidate = useInvalidateSellerProfile();
  return useMutation({
    mutationFn: submitSellerProfile,
    onSuccess: invalidate,
  });
}
