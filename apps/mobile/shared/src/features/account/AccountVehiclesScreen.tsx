import { VehicleListScreen } from '@/features/vehicles/VehicleListScreen';

/**
 * Danh sách xe của CHỦ XE tuyến hoa hồng (Owner Lite) — từ 05/11/2026 là CÙNG màn với gian hàng,
 * đúng web `AccountVehiclesView` → `VehiclesListView scope="owner"` (chốt 03/11/2026).
 *
 * Khác biệt theo tuyến nằm trong `VehicleListScreen scope="owner"`: lọc dịch vụ + vận hành + sắp
 * xếp, "Thêm xe" mở luồng đăng xe của chủ xe, "Quản lý xe" / "Xem chi tiết" đi `account.*`, dải tuyến
 * Owner Lite ở đầu danh sách. Hai thẻ Cẩm nang / Hợp đồng đã về menu Trợ giúp.
 *
 * Giữ export này cho nơi gọi cũ (`OwnerLiteVehiclesScreen`, bọc `OwnerGate`).
 */
export function AccountVehiclesScreen(_props: { shell?: 'account' | 'manage' } = {}) {
  return <VehicleListScreen scope="owner" />;
}
