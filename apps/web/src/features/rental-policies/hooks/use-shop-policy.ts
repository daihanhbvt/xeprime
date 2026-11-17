'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  fetchShopInsuranceImpact,
  fetchShopOperationDefaults,
  fetchShopPolicy,
  saveShopOperationDefaults,
  saveShopPolicy,
} from '../api';
import type { SaveRentalPolicyInput, SaveShopOperationDefaultsInput } from '../types';

export function useShopPolicy(vehicleType: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.rentalPolicies.shop(vehicleType),
    queryFn: () => fetchShopPolicy(vehicleType),
    enabled,
  });
}

/** Xe kế thừa mà thiếu dữ liệu bảo hiểm — cảnh báo đổi sang Bắt buộc (ADR 0091 điều 1). */
export function useShopInsuranceImpact(vehicleType: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.rentalPolicies.insuranceImpact(vehicleType),
    queryFn: () => fetchShopInsuranceImpact(vehicleType),
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
      void queryClient.invalidateQueries({
        queryKey: queryKeys.rentalPolicies.insuranceImpact(vehicleType),
      });
    },
  });
}

export function useShopOperationDefaults(vehicleType: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.rentalPolicies.operationDefaults(vehicleType),
    queryFn: () => fetchShopOperationDefaults(vehicleType),
    enabled,
  });
}

/** Xe đang theo mặc định đổi số hiệu lực ⇒ thiết lập vận hành theo xe phải đọc lại. */
export function useSaveShopOperationDefaults(vehicleType: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveShopOperationDefaultsInput) =>
      saveShopOperationDefaults(body, vehicleType),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.rentalPolicies.operationDefaults(vehicleType), data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    },
  });
}
