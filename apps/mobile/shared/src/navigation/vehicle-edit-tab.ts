/**
 * Mục của khu SỬA XE — cùng bộ giá trị mà `?tab=` của web dùng
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
  /**
   * Vận hành & điều kiện thuê — tab cũ của web, nay là BÍ DANH của "Thời gian giao nhận"
   * (`resolveEditTab`). Link cũ/thông báo mang giá trị này vẫn tới đúng chỗ.
   */
  OPERATIONS: 'operations',
  /*
   * Mục bổ ra từ tab "Vận hành & điều kiện thuê" (web 29/09/2026). Hai giá trị `*-terms` là BÍ
   * DANH trỏ về "Nhận chuyến & thủ tục" của dịch vụ đó, kèm cuộn tới khối thủ tục.
   */
  HANDOVER_TIME: 'handover-time',
  SELF_DRIVE_OPTIMIZATION: 'self-drive-optimization',
  SELF_DRIVE_TERMS: 'self-drive-terms',
  WITH_DRIVER_OPTIMIZATION: 'with-driver-optimization',
  WITH_DRIVER_SURCHARGES: 'with-driver-surcharges',
  WITH_DRIVER_TERMS: 'with-driver-terms',
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

/**
 * Bí danh → mục thật — web `resolveEditTab` (`vehicle-edit-nav.ts`). Link cũ (`operations`,
 * `*-terms`) mở đúng mục của menu mới.
 */
const TAB_ALIAS: Partial<Record<VehicleEditTab, VehicleEditTab>> = {
  [VEHICLE_EDIT_TAB.OPERATIONS]: VEHICLE_EDIT_TAB.HANDOVER_TIME,
  [VEHICLE_EDIT_TAB.SELF_DRIVE_TERMS]: VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION,
  [VEHICLE_EDIT_TAB.WITH_DRIVER_TERMS]: VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION,
};

export function resolveEditTab(tab: VehicleEditTab): VehicleEditTab {
  return TAB_ALIAS[tab] ?? tab;
}

/** Bí danh trỏ tới khối THỦ TỤC — mục đích cuộn tới card thủ tục (web `RENTAL_TERMS_ANCHOR`). */
export function isTermsAlias(tab: VehicleEditTab): boolean {
  return tab === VEHICLE_EDIT_TAB.SELF_DRIVE_TERMS || tab === VEHICLE_EDIT_TAB.WITH_DRIVER_TERMS;
}
