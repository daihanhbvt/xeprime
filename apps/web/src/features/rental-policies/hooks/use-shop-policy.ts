'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchShopPolicy, saveShopPolicy } from '../api';
import type { SaveRentalPolicyInput } from '../types';

export function useShopPolicy(vehicleType: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.rentalPolicies.shop(vehicleType),
    queryFn: () => fetchShopPolicy(vehicleType),
    enabled,
  });
}

/** Lưu chính sách shop theo loại xe — invalidate cả nhánh pricing theo xe (kế thừa đổi theo). */
export function useSaveShopPolicy(vehicleType: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveRentalPolicyInput) => saveShopPolicy(body, vehicleType),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.rentalPolicies.shop(vehicleType), data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    },
  });
}
