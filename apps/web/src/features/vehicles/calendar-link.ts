import { ROUTES } from '@/constants/routes';

/**
 * Đường dẫn "Xem lịch" của một xe.
 *
 * Chưa có route lịch riêng theo `vehicleId`; màn lịch dùng chung nhận `q` lọc theo tên/biển số
 * (`calendar.controller`). Nên lọc lịch về đúng xe đó thay vì bịa một route mới. Ưu tiên biển
 * số vì nó phân biệt tốt hơn tên xe trùng lặp.
 *
 * Dùng chung cho thẻ ở danh sách và nút "Xem lịch" ở Hồ sơ 360 — hai nơi lệch nhau là "Xem
 * lịch" dẫn tới hai kết quả khác nhau.
 */
export function vehicleSchedulePath(vehicle: {
  name: string;
  plateNumber?: string | null;
}): string {
  const query = new URLSearchParams({ q: vehicle.plateNumber || vehicle.name });
  return `${ROUTES.MANAGE.CALENDAR}?${query.toString()}`;
}
