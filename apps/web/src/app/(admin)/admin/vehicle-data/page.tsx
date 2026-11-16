'use client';

import { VehicleDataView } from '@/features/vehicle-data/components/VehicleDataView';

/**
 * Dữ liệu xe chuẩn (ADR 0090): mỗi dòng một xe với thông số, tiện ích, giá bán và giá thuê tham khảo;
 * dữ liệu tự ghi nhận từ xe của chủ xe chờ duyệt trong cùng danh sách; nhập/xuất file.
 */
export default function AdminVehicleDataPage() {
  return <VehicleDataView />;
}
