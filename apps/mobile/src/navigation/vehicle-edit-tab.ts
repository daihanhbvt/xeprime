/**
 * Sáu mục của khu SỬA XE — cùng bộ giá trị mà `?tab=` của web dùng
 * (`apps/web/src/constants/routes.ts` → `VEHICLE_EDIT_TAB`).
 *
 * Chép chứ không đưa vào package dùng chung: bên web đây là giá trị query string, bên app nó là
 * một đoạn đường dẫn — hai vai khác nhau của cùng một từ vựng. Phần THẬT SỰ phải khớp là chuỗi,
 * và nó khớp vì cả hai đọc từ danh sách này. Gõ lệch một chữ thì link không chết, nó âm thầm rơi
 * về "Thông tin" — đúng lý do web gom chúng thành hằng ngay từ đầu.
 */
export const VEHICLE_EDIT_TAB = {
  INFORMATION: 'information',
  /** Thư viện ảnh — giá trị chuẩn là `media` (không phải `images`). */
  MEDIA: 'media',
  PRICING: 'pricing',
  SOURCE: 'source',
  DOCUMENTS: 'documents',
  MAINTENANCE: 'maintenance',
} as const;

export type VehicleEditTab = (typeof VEHICLE_EDIT_TAB)[keyof typeof VEHICLE_EDIT_TAB];

/**
 * Thứ tự SÁU mục hiện trên dải tab — chép đúng `tabItems` của `VehicleEditWorkspace` bên web.
 *
 * Tách khỏi `VEHICLE_EDIT_TAB` vì object hằng không hứa thứ tự cho người đọc, mà thứ tự ở đây là
 * thứ tự người dùng nhìn thấy: nó phải khớp web, không phải khớp cách ai đó gõ object.
 */
export const VEHICLE_EDIT_TAB_ORDER = [
  VEHICLE_EDIT_TAB.INFORMATION,
  VEHICLE_EDIT_TAB.MEDIA,
  VEHICLE_EDIT_TAB.PRICING,
  VEHICLE_EDIT_TAB.SOURCE,
  VEHICLE_EDIT_TAB.DOCUMENTS,
  VEHICLE_EDIT_TAB.MAINTENANCE,
] as const;
