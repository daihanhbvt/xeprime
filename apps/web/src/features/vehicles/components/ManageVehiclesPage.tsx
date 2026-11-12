'use client';

import { VehiclesListView } from './VehiclesListView';

/**
 * Danh sách xe của gian hàng tuyến gói — vỏ mỏng của `VehiclesListView` (một màn cho hai tuyến,
 * 03/11/2026). Giữ tên này vì route `/vehicles` và phiên hỗ trợ (`SupportVehiclesRoute`) import nó.
 */
export function ManageVehiclesPage() {
  return <VehiclesListView scope="shop" />;
}
