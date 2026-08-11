'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchShopPolicy, saveShopPolicy } from '../api';
import type { SaveRentalPolicyInput } from '../types';

export function useShopPolicy(enabled = true) {
  return useQuery({
    queryKey: queryKeys.rentalPolicies.shop(),
    queryFn: fetchShopPolicy,
    enabled,
  });
}

/** Lưu chính sách shop — invalidate cả nhánh pricing theo xe (kế thừa đổi theo). */
export function useSaveShopPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveRentalPolicyInput) => saveShopPolicy(body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.rentalPolicies.shop(), data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    },
  });
}
