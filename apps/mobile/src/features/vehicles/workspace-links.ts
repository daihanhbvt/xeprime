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
 * Chỗ DUY NHẤT biết cặp đôi này.
 */
export const EDIT_TAB_TO_SECTION: Readonly<Record<VehicleEditTab, VehicleManageSection>> = {
  [VEHICLE_EDIT_TAB.INFORMATION]: VEHICLE_MANAGE_SECTION.INFORMATION,
  [VEHICLE_EDIT_TAB.MEDIA]: VEHICLE_MANAGE_SECTION.IMAGES,
  [VEHICLE_EDIT_TAB.DOCUMENTS]: VEHICLE_MANAGE_SECTION.DOCUMENTS,
  [VEHICLE_EDIT_TAB.PRICING]: VEHICLE_MANAGE_SECTION.SELF_DRIVE_PRICING,
  /*
   * Bảo dưỡng và Nguồn xe KHÔNG có mục ở khu tài khoản — web ẩn chúng ở đó (bảo dưỡng là tính
   * năng của gói, nguồn xe là sổ sách gian hàng). Mọi lối vào hai mục này đều bị gác bằng
   * `!customerScope`; ô này chỉ để bản đồ không có chỗ trống.
   */
  [VEHICLE_EDIT_TAB.MAINTENANCE]: VEHICLE_MANAGE_SECTION.INFORMATION,
  [VEHICLE_EDIT_TAB.SOURCE]: VEHICLE_MANAGE_SECTION.INFORMATION,
  /* Vận hành gộp bốn mục của khu tài khoản — trỏ về mục đầu (thời gian giao nhận), khối web mở sẵn. */
  [VEHICLE_EDIT_TAB.OPERATIONS]: VEHICLE_MANAGE_SECTION.SELF_DRIVE_HANDOVER_TIME,
};

/** Một tab của form sửa xe (quản lý) ↔ một mục của không gian quản lý xe (tài khoản). */
export function vehicleEditHref(
  vehicleId: string,
  tab: VehicleEditTab,
  customerScope: boolean,
): Href {
  return customerScope
    ? ROUTES.account.vehicleManageSection(vehicleId, EDIT_TAB_TO_SECTION[tab])
    : ROUTES.manage.vehicleEditTab(vehicleId, tab);
}

/** Nút "Chỉnh sửa xe": hub sửa xe (quản lý) ↔ mục lục không gian quản lý xe (tài khoản). */
export function vehicleEditHubHref(vehicleId: string, customerScope: boolean): Href {
  return customerScope
    ? ROUTES.account.vehicleManage(vehicleId)
    : ROUTES.manage.vehicleEdit(vehicleId);
}

/** "Giá & chính sách": màn giá (quản lý) ↔ giá tự lái (tài khoản) — đúng mục `pricing` của web. */
export function vehiclePricingHref(vehicleId: string, customerScope: boolean): Href {
  return customerScope
    ? ROUTES.account.vehicleManageSection(vehicleId, VEHICLE_MANAGE_SECTION.SELF_DRIVE_PRICING)
    : ROUTES.manage.vehiclePricing(vehicleId);
}

/**
 * "Tối ưu nhận chuyến": màn tối ưu (quản lý) ↔ mục tối ưu CỦA DỊCH VỤ xe đang đăng (tài khoản —
 * mỗi dịch vụ một mục). Tự lái trước, vì đó là dịch vụ phổ biến và là mục đứng đầu mục lục.
 */
export function vehicleOptimizationHref(
  vehicle: { id: string; serviceTypes: readonly string[] },
  customerScope: boolean,
): Href {
  if (!customerScope) return ROUTES.manage.vehicleOptimization(vehicle.id);
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
