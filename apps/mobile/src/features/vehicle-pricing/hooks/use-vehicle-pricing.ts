import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import { vehiclesApi, type SaveVehiclePricingInput } from '../api';

export function useVehiclePricing(vehicleId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.vehicles.pricing(vehicleId ?? ''),
    queryFn: () => vehiclesApi.pricing(vehicleId as string),
    enabled: Boolean(vehicleId) && enabled,
  });
}

/**
 * Lưu giá & chính sách theo xe.
 *
 * Invalidate cả nhánh `vehicles` (giá đổi → thẻ danh sách, hồ sơ 360 và bản xem trước listing
 * đều lệch) lẫn `rentalPolicies` (số đếm kế thừa/ghi đè ở màn chính sách gian hàng).
 */
export function useSaveVehiclePricing(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveVehiclePricingInput) => vehiclesApi.savePricing(vehicleId, body),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.vehicles.pricing(vehicleId), data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.rentalPolicies.all });
    },
  });
}
