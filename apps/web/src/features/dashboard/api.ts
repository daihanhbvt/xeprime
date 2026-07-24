import { fetchVehicles } from '@/features/vehicles/api';
import { VEHICLE_OPERATION_STATUS } from '@xeprime/types';

export interface VehicleStats {
  total: number;
  available: number;
  renting: number;
}

/**
 * Đếm xe theo tình trạng vận hành — mỗi số là `meta.total` của một truy vấn `limit=1`,
 * nên đếm ở server (chuẩn khi có phân trang) mà không kéo cả danh sách về.
 */
export async function fetchVehicleStats(): Promise<VehicleStats> {
  const [all, available, renting] = await Promise.all([
    fetchVehicles({ limit: 1 }),
    fetchVehicles({ operationStatus: VEHICLE_OPERATION_STATUS.AVAILABLE, limit: 1 }),
    fetchVehicles({ operationStatus: VEHICLE_OPERATION_STATUS.RENTING, limit: 1 }),
  ]);
  return {
    total: all.meta.total,
    available: available.meta.total,
    renting: renting.meta.total,
  };
}
