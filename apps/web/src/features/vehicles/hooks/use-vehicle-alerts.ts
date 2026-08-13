'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchVehicleAlerts } from '../api';
import type { VehicleAlertGroup } from '../types';

/**
 * Việc cần làm + KM hiện tại của các xe đang hiện trên trang (Wave 8).
 *
 * Cùng nguyên tắc với `useVehicleCardStats`: chỉ hỏi id của TRANG hiện tại, key ôm danh sách id
 * đã sắp xếp.
 *
 * Wave 8.1: hook TRẢ RA cả `isLoading`/`isError`/`refetch` và nơi gọi phải truyền tiếp xuống
 * thẻ xe. Trước đó chỉ có giá trị được truyền đi, nên "gọi API hỏng" trông y hệt "xe này không
 * có việc gì" — trên một bề mặt vận hành, đó là sự im lặng nguy hiểm nhất.
 */
export function useVehicleAlerts(ids: string[]) {
  const key = [...ids].sort();

  const query = useQuery({
    queryKey: queryKeys.vehicles.alerts(key),
    queryFn: () => fetchVehicleAlerts(key),
    enabled: key.length > 0,
    staleTime: 30_000,
  });

  const byId = new Map<string, VehicleAlertGroup>();
  for (const row of query.data ?? []) byId.set(row.vehicleId, row);

  return {
    byId,
    isLoading: query.isLoading && key.length > 0,
    isError: query.isError,
    /** Thử lại dùng đúng lớp query sẵn có — không tự dựng cơ chế retry riêng. */
    refetch: () => void query.refetch(),
  };
}

/**
 * Làm mới MỌI bề mặt của xe sau một mutation ở miền khác (bàn giao, bảo dưỡng, giấy tờ).
 *
 * Tồn tại vì cảnh báo và KM hiện lên ở bốn chỗ cùng lúc — thẻ xe, Hồ sơ 360, tab bảo dưỡng,
 * Trung tâm bảo dưỡng. Trước Wave 8 mỗi feature tự nhớ invalidate cái gì, nên sửa xong một
 * chỗ thì ba chỗ còn lại vẫn kể chuyện cũ. Một hàm, một danh sách, dùng key factory chung.
 */
export function useInvalidateVehicleSurfaces() {
  const queryClient = useQueryClient();
  return (vehicleId?: string) => {
    // Nhánh `vehicles` gồm list + stats + alerts + summary + maintenance của từng xe.
    void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.maintenance.all });
    if (vehicleId) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.detail(vehicleId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.summary(vehicleId) });
    }
  };
}
