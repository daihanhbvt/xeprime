import type { Href } from 'expo-router';
import { SERVICE_TYPE } from '@xeprime/types';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB, type VehicleEditTab } from '@/navigation/vehicle-edit-tab';
import {
  VEHICLE_MANAGE_SECTION,
  type VehicleManageSection,
} from '@/navigation/vehicle-manage-section';

/**
 * Đích của MỘT chiếc xe theo KHU đang đứng — bản native của phép `isManage ? … : …` mà
 * `Vehicle360Overview` bên web làm qua `useWorkspace()`.
 *
 * Hồ sơ 360 hiện ở CẢ HAI khu: cổng quản lý (`/manage/vehicles/:id`) và khu tài khoản của chủ xe
 * tuyến hoa hồng (`/account/vehicles/:id`). Cùng một mục dẫn tới hai nơi: ở cổng quản lý là tab
 * của form sửa xe, ở khu tài khoản là mục trong không gian "Quản lý xe". Chủ xe tuyến hoa hồng
 * KHÔNG vào được cổng quản lý (ADR 0038 điều 4), nên mọi lối đi đóng cứng vào `/manage` là một
 * nút đẩy họ ra khỏi khu của chính mình.
 *
 * `customerScope` = màn đang mở ở khu tài khoản (route `/account/vehicles/[id]` truyền cờ này).
 */

/**
 * Tab của form sửa xe → mục tương ứng trong không gian QUẢN LÝ XE của khu tài khoản.
 *
 * Chỗ DUY NHẤT biết cặp đôi này. `null` = khu tài khoản KHÔNG có mục đó (web `part(id, tab,
 * null)` trả `null` và nơi gọi ẩn lối vào): bảo dưỡng là tính năng của gói, nguồn xe là sổ sách
 * gian hàng.
 */
export const EDIT_TAB_TO_SECTION: Readonly<Record<VehicleEditTab, VehicleManageSection | null>> = {
  [VEHICLE_EDIT_TAB.INFORMATION]: VEHICLE_MANAGE_SECTION.INFORMATION,
  [VEHICLE_EDIT_TAB.MEDIA]: VEHICLE_MANAGE_SECTION.IMAGES,
  [VEHICLE_EDIT_TAB.DOCUMENTS]: VEHICLE_MANAGE_SECTION.DOCUMENTS,
  [VEHICLE_EDIT_TAB.PRICING]: VEHICLE_MANAGE_SECTION.PRICING,
  [VEHICLE_EDIT_TAB.MAINTENANCE]: null,
  [VEHICLE_EDIT_TAB.SOURCE]: null,
  /* Bí danh `operations` (tab cũ) → thời gian giao nhận, như `resolveEditTab`. */
  [VEHICLE_EDIT_TAB.OPERATIONS]: VEHICLE_MANAGE_SECTION.HANDOVER_TIME,
  [VEHICLE_EDIT_TAB.HANDOVER_TIME]: VEHICLE_MANAGE_SECTION.HANDOVER_TIME,
  [VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION]: VEHICLE_MANAGE_SECTION.SELF_DRIVE_OPTIMIZATION,
  [VEHICLE_EDIT_TAB.SELF_DRIVE_TERMS]: VEHICLE_MANAGE_SECTION.SELF_DRIVE_OPTIMIZATION,
  [VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION]: VEHICLE_MANAGE_SECTION.WITH_DRIVER_OPTIMIZATION,
  [VEHICLE_EDIT_TAB.WITH_DRIVER_TERMS]: VEHICLE_MANAGE_SECTION.WITH_DRIVER_OPTIMIZATION,
  [VEHICLE_EDIT_TAB.WITH_DRIVER_SURCHARGES]: VEHICLE_MANAGE_SECTION.WITH_DRIVER_SURCHARGES,
};

/**
 * Một tab của form sửa xe (quản lý) ↔ một mục của không gian quản lý xe (tài khoản) — bản native
 * của web `workspaceVehiclePaths().part`. `null` = khu tài khoản không có mục đó: nơi gọi ẨN lối vào.
 */
export function vehicleEditPartHref(
  vehicleId: string,
  tab: VehicleEditTab,
  customerScope: boolean,
): Href | null {
  if (!customerScope) return ROUTES.manage.vehicleEditTab(vehicleId, tab);
  const section = EDIT_TAB_TO_SECTION[tab];
  return section ? ROUTES.account.vehicleManageSection(vehicleId, section) : null;
}

/** Nút "Chỉnh sửa xe": hub sửa xe (quản lý) ↔ mục lục không gian quản lý xe (tài khoản). */
export function vehicleEditHubHref(vehicleId: string, customerScope: boolean): Href {
  return customerScope
    ? ROUTES.account.vehicleManage(vehicleId)
    : ROUTES.manage.vehicleEdit(vehicleId);
}

/**
 * "Giá & chính sách": MỤC giá của màn sửa xe (quản lý) ↔ mục "Giá & chính sách" (tài khoản) — web
 * `paths.pricing`. Không trỏ route `/pricing` cũ: nó chỉ còn là một lần chuyển hướng tới mục này.
 */
export function vehiclePricingHref(vehicleId: string, customerScope: boolean): Href {
  return customerScope
    ? ROUTES.account.vehicleManageSection(vehicleId, VEHICLE_MANAGE_SECTION.PRICING)
    : ROUTES.manage.vehicleEditTab(vehicleId, VEHICLE_EDIT_TAB.PRICING);
}

/**
 * "Tối ưu nhận chuyến": màn tối ưu (quản lý) ↔ mục tối ưu CỦA DỊCH VỤ xe đang đăng (tài khoản —
 * mỗi dịch vụ một mục). Tự lái trước, vì đó là dịch vụ phổ biến và là mục đứng đầu mục lục.
 */
export function vehicleOptimizationHref(
  vehicle: { id: string; serviceTypes: readonly string[] },
  customerScope: boolean,
): Href {
  // Cổng quản lý: mục tự lái — route của mục đó tự đổi sang có tài xế khi xe chỉ có dịch vụ ấy (web).
  if (!customerScope) {
    return ROUTES.manage.vehicleEditTab(vehicle.id, VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION);
  }
  const section = vehicle.serviceTypes.includes(SERVICE_TYPE.SELF_DRIVE)
    ? VEHICLE_MANAGE_SECTION.SELF_DRIVE_OPTIMIZATION
    : VEHICLE_MANAGE_SECTION.WITH_DRIVER_OPTIMIZATION;
  return ROUTES.account.vehicleManageSection(vehicle.id, section);
}

/**
 * "Đơn thuê" của xe: đơn đã lọc theo xe (quản lý) ↔ "Chuyến của tôi" (tài khoản).
 *
 * Web (`paths.bookings` = `ROUTES.TRIPS`): ở khu tài khoản "đơn của xe này" là Chuyến của tôi —
 * danh sách gồm cả hai phía và KHÔNG lọc theo xe, nên không gắn tham số lọc mà màn kia không đọc.
 */
export function vehicleBookingsHref(vehicleId: string, customerScope: boolean): Href {
  return customerScope ? ROUTES.booking.list() : ROUTES.manage.bookings({ vehicleId });
}
