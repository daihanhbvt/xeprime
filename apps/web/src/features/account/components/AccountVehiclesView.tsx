'use client';

import { VehiclesListView } from '@/features/vehicles/components/VehiclesListView';

/**
 * Danh sách xe của CHỦ XE tuyến hoa hồng — cùng màn với gian hàng (chốt 03/11/2026), khác ở bộ
 * lọc (dịch vụ + vận hành), lối thêm xe (luồng đăng xe của chủ xe) và nút "Quản lý xe".
 *
 * Hai thẻ "Cẩm nang cho thuê xe" / "Hợp đồng & chứng từ mẫu" từng đứng đầu màn này đã gỡ: cả hai
 * là mục của khối **Trợ giúp** trên menu (`docs/design/09_PARTNER_REDESIGN.md` §2.2).
 *
 * Được `OwnerGate` bọc ở trang: người không phải chủ gian hàng không tới được đây.
 */
export function AccountVehiclesView() {
  return <VehiclesListView scope="owner" />;
}
