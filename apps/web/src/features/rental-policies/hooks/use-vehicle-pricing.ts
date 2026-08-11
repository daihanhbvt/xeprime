'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchVehiclePricing, saveVehiclePricing } from '../api';
import type { SaveVehiclePricingInput } from '../types';

export function useVehiclePricing(vehicleId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.vehicles.pricing(vehicleId ?? ''),
    queryFn: () => fetchVehiclePricing(vehicleId!),
    enabled: Boolean(vehicleId),
  });
}

/**
 * Lưu giá & chính sách theo xe. Invalidate cả nhánh `vehicles` (giá đổi → thẻ danh sách,
 * chi tiết 360 và listing preview đều lệch) + số đếm kế thừa/ghi đè ở trang chính sách shop.
 */
export function useSaveVehiclePricing(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveVehiclePricingInput) => saveVehiclePricing(vehicleId, body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.vehicles.pricing(vehicleId), data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.rentalPolicies.all });
    },
  });
}
