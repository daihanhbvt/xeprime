import type { Href } from 'expo-router';
import { ROUTES } from '@/navigation/routes';

/**
 * Đường dẫn "Xem lịch" của một xe — bản native của `vehicleSchedulePath` bên web.
 *
 * Chưa có route lịch riêng theo `vehicleId`; màn lịch dùng chung nhận `q` lọc theo tên/biển số.
 * Nên lọc lịch về đúng xe đó thay vì bịa một route mới. Ưu tiên biển số vì nó phân biệt tốt hơn
 * tên xe trùng lặp.
 *
 * Dùng chung cho Hồ sơ 360 (thẻ nhanh + `ModuleLinks`), sổ xe, hộp thư yêu cầu thuê (thẻ + chi
 * tiết) và màn giá — sáu nơi lệch nhau là "Xem lịch" dẫn tới sáu kết quả khác nhau, đúng lỗi
 * web đã ghi lại lý do gộp hàm này lại một chỗ.
 */
export function vehicleSchedulePath(
  vehicle: { name: string; plateNumber?: string | null },
  options?: {
    back?: boolean;
    /**
     * Mở từ khu TÀI KHOẢN ⇒ lịch của khu tài khoản (`/account/calendar`), đúng
     * `basePath: paths.calendar` bên web. Bỏ trống = lịch cổng quản lý.
     */
    customerScope?: boolean;
  },
): Href {
  const filters = {
    q: vehicle.plateNumber || vehicle.name,
    ...(options?.back ? { back: true } : {}),
  };
  return options?.customerScope
    ? ROUTES.account.calendar(filters)
    : ROUTES.manage.calendar(filters);
}
