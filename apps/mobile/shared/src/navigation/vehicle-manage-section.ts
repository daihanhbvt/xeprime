import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';
import type { useTranslations } from 'use-intl';

/**
 * Mục của màn SỬA XE của chủ xe tuyến hoa hồng (Owner Lite) trong app Partner — GIÁ TRỊ đoạn đường
 * dẫn dưới `/manage/vehicles/<id>/manage/`.
 *
 * Từ 03/11/2026 web cho hai tuyến dùng CHUNG màn sửa xe (`VehicleEditWorkspace`, sổ cái §3.6 E24):
 * menu ba nhóm "Hồ sơ xe · Hình thức cho thuê · Vận hành nâng cao". App giữ cây route riêng cho
 * Owner Lite (không đi qua hub sửa xe của gian hàng), nhưng mục và nội dung trùng web 1-1 — xem
 * `features/vehicle-manage/owner-edit-nav.ts`.
 *
 * Bốn giá trị cuối là mục CŨ của không gian "Quản lý xe" (trước 03/11/2026). Chúng không còn trên
 * menu; route của chúng chỉ còn chuyển hướng (web `editTabOfLegacyManageSection`). Giữ trong hằng
 * vì vỏ `VehicleManageShell` của vài màn cũ còn dùng ở cổng quản lý.
 */
export const VEHICLE_MANAGE_SECTION = {
  INFORMATION: 'information',
  /** Hình ảnh — web `VEHICLE_EDIT_TAB.MEDIA`; đường dẫn giữ `images` cho link cũ. */
  IMAGES: 'images',
  DOCUMENTS: 'documents',
  TRIP_HISTORY: 'trip-history',
  /** "Dịch vụ & giá" — web `EDIT_MENU.SERVICES` (`ServicesPane`). Tham số `service` = tab mở sẵn. */
  SERVICES: 'services',
  /** "Chính sách thuê" — web `EDIT_MENU.POLICY` (`PolicyPane`). */
  POLICY: 'policy',
  /** CŨ — "Giá & chính sách"; route chuyển về `SERVICES`. */
  PRICING: 'pricing',
  /** CŨ — thời gian giao nhận / thời gian chết; route chuyển về `POLICY`. */
  HANDOVER_TIME: 'handover-time',
  /** CŨ — "Nhận chuyến & thủ tục" tự lái; route chuyển về tab tự lái của `SERVICES`. */
  SELF_DRIVE_OPTIMIZATION: 'self-drive/optimization',
  /** CŨ — "Nhận chuyến & thủ tục" có tài xế; route chuyển về tab có tài xế của `SERVICES`. */
  WITH_DRIVER_OPTIMIZATION: 'with-driver/optimization',
} as const;

export type VehicleManageSection =
  (typeof VEHICLE_MANAGE_SECTION)[keyof typeof VEHICLE_MANAGE_SECTION];

/** Tên tham số mang dịch vụ (tab mở sẵn ở `SERVICES`, khối điều khoản cần cuộn tới ở `POLICY`). */
export const VEHICLE_MANAGE_SERVICE_PARAM = 'service';

/**
 * Neo của khối "Điều khoản" — cùng giá trị với web `RENTAL_TERMS_ANCHOR`. Native không có `#hash`:
 * route truyền nó qua tham số `anchor`, kèm `service` để biết khối của dịch vụ nào.
 */
export const RENTAL_TERMS_ANCHOR = 'rental-terms';

/** Đọc tham số `service` của route — chỉ nhận một dịch vụ thật, còn lại `undefined`. */
export function parseServiceParam(value: string | string[] | undefined): ServiceType | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return (Object.values(SERVICE_TYPE) as string[]).includes(raw ?? '')
    ? (raw as ServiceType)
    : undefined;
}

/**
 * Khoá nhãn trong `VehicleManage.menu` — nhãn của các mục CŨ (tiêu đề màn cũ còn dùng ở cổng quản
 * lý). Union đóng, gõ sai là lỗi biên dịch.
 */
export type VehicleManageMenuKey = Parameters<
  ReturnType<typeof useTranslations<'VehicleManage.menu'>>
>[0];

/** Khoá nhãn trong `Vehicles.editor.menu.items` — CÙNG nhãn với menu trái web (`VehicleEditMenu`). */
export type VehicleEditMenuItemKey = Parameters<
  ReturnType<typeof useTranslations<'Vehicles.editor.menu.items'>>
>[0];

/** Mục của menu mới → nhãn web. Mục cũ không có (dùng `sectionLabelKeyOf`). */
const SECTION_EDIT_MENU_KEY: Partial<Record<VehicleManageSection, VehicleEditMenuItemKey>> = {
  [VEHICLE_MANAGE_SECTION.INFORMATION]: 'information',
  [VEHICLE_MANAGE_SECTION.IMAGES]: 'media',
  [VEHICLE_MANAGE_SECTION.DOCUMENTS]: 'documents',
  [VEHICLE_MANAGE_SECTION.TRIP_HISTORY]: 'trip-history',
  [VEHICLE_MANAGE_SECTION.SERVICES]: 'services',
  [VEHICLE_MANAGE_SECTION.POLICY]: 'policy',
};

/** Nhãn menu web của một mục — tiêu đề màn con nói đúng tên mục đã chạm trên menu. */
export function sectionEditMenuKeyOf(section: VehicleManageSection): VehicleEditMenuItemKey | null {
  return SECTION_EDIT_MENU_KEY[section] ?? null;
}

/** Nhãn cũ của các mục không còn trên menu (màn cũ còn mở được ở cổng quản lý). */
const LEGACY_SECTION_LABEL: Partial<Record<VehicleManageSection, VehicleManageMenuKey>> = {
  [VEHICLE_MANAGE_SECTION.PRICING]: 'items.pricing',
  [VEHICLE_MANAGE_SECTION.HANDOVER_TIME]: 'items.turnaround',
  [VEHICLE_MANAGE_SECTION.SELF_DRIVE_OPTIMIZATION]: 'items.bookingTerms',
  [VEHICLE_MANAGE_SECTION.WITH_DRIVER_OPTIMIZATION]: 'items.bookingTerms',
};

export function sectionLabelKeyOf(section: VehicleManageSection): VehicleManageMenuKey | null {
  return LEGACY_SECTION_LABEL[section] ?? null;
}

/**
 * Dịch vụ mà một màn mục thuộc về — `null` với mục áp cho cả xe. Chỉ hai màn "Nhận chuyến & thủ
 * tục" cũ (còn dựng ở cổng quản lý) thuộc một dịch vụ: tắt dịch vụ thì vỏ mời bật lại.
 */
export function sectionServiceType(section: VehicleManageSection): ServiceType | null {
  if (section === VEHICLE_MANAGE_SECTION.SELF_DRIVE_OPTIMIZATION) return SERVICE_TYPE.SELF_DRIVE;
  if (section === VEHICLE_MANAGE_SECTION.WITH_DRIVER_OPTIMIZATION) return SERVICE_TYPE.WITH_DRIVER;
  return null;
}
