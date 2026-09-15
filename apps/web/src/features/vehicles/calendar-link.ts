import { ROUTES } from '@/constants/routes';
import { isSafeNextPath } from '@/features/auth/safe-next';

/**
 * Tham số mang ĐƯỜNG QUAY LẠI trên màn lịch.
 *
 * Cố ý KHÔNG dùng tên `from`: màn lịch đã dùng `from` cho NGÀY bắt đầu khoảng xem
 * (`use-calendar-filters`), nên đặt trùng sẽ khiến một đường dẫn quay lại bị đọc thành một
 * ngày không hợp lệ và lịch nhảy về hôm nay.
 */
export const CALENDAR_BACK_PARAM = 'back';

/**
 * Đường dẫn "Xem lịch" của một xe.
 *
 * Chưa có route lịch riêng theo `vehicleId`; màn lịch dùng chung nhận `q` lọc theo tên/biển số
 * (`calendar.controller`). Nên lọc lịch về đúng xe đó thay vì bịa một route mới. Ưu tiên biển
 * số vì nó phân biệt tốt hơn tên xe trùng lặp.
 *
 * Dùng chung cho thẻ ở danh sách, nút "Xem lịch" ở Hồ sơ 360 và hộp thư yêu cầu thuê — ba nơi
 * lệch nhau là "Xem lịch" dẫn tới ba kết quả khác nhau.
 *
 * `options.back` là đường quay lại (pathname + query của màn đang đứng). Nó đi qua
 * `isSafeNextPath` y như `?next=` của luồng đăng nhập: giá trị này rồi sẽ thành `href` của một
 * nút, nên một `//evil.example` lọt vào đây là biến chính domain mình thành bàn đạp phishing.
 * Không an toàn ⇒ BỎ HẲN tham số, không rơi về một mặc định đoán mò.
 *
 * `options.basePath` là màn lịch của KHU đang đứng (`workspacePaths(...).calendar`). Mặc định là
 * lịch của cổng quản lý để mọi nơi gọi cũ giữ nguyên hành vi; màn nào sống ở `/account` phải
 * truyền vào, nếu không nút "Xem lịch" sẽ ném chủ xe tuyến hoa hồng vào cổng quản lý.
 */
export function vehicleSchedulePath(
  vehicle: { name: string; plateNumber?: string | null },
  options?: { back?: string | null; basePath?: string },
): string {
  const query = new URLSearchParams({ q: vehicle.plateNumber || vehicle.name });
  if (isSafeNextPath(options?.back)) query.set(CALENDAR_BACK_PARAM, options.back as string);
  return `${options?.basePath ?? ROUTES.MANAGE.CALENDAR}?${query.toString()}`;
}
