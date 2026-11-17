import type { Href } from 'expo-router';
import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';
import { ownerOptimizationService } from '@/features/vehicle-manage/owner-edit-nav';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB, type VehicleEditTab } from '@/navigation/vehicle-edit-tab';
import {
  RENTAL_TERMS_ANCHOR,
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
 * Tab của form sửa xe → mục tương ứng trong màn SỬA XE của Owner Lite (cây
 * `/manage/vehicles/<id>/manage/`), kèm dịch vụ cần mở / cuộn tới — bản native của web
 * `resolveEditTab` khi `isManage === false` (03/11/2026, hai tuyến chung một màn sửa trên web).
 *
 * Chỗ DUY NHẤT biết cặp đôi này. `null` = Owner Lite KHÔNG có mục đó (web `part(id, tab, null)` trả
 * `null` và nơi gọi ẩn lối vào): bảo dưỡng là tính năng của gói, nguồn xe là sổ sách gian hàng.
 *
 * - `pricing` / `*-optimization` / phụ phí tài xế → "Dịch vụ & giá" (tab của dịch vụ đó).
 * - `policy` / `operations` / `handover-time` → "Chính sách thuê".
 * - `*-terms` → "Chính sách thuê", cuộn tới khối điều khoản của dịch vụ đó (`termsOf`).
 */
export interface OwnerEditTarget {
  section: VehicleManageSection;
  /** Tab dịch vụ mở sẵn (`SERVICES`) hoặc khối điều khoản cần cuộn tới (`POLICY`). */
  service?: ServiceType;
  /** Chỉ `*-terms`: cuộn tới khối điều khoản. */
  terms?: boolean;
}

export const EDIT_TAB_TO_SECTION: Readonly<Record<VehicleEditTab, OwnerEditTarget | null>> = {
  [VEHICLE_EDIT_TAB.INFORMATION]: { section: VEHICLE_MANAGE_SECTION.INFORMATION },
  [VEHICLE_EDIT_TAB.MEDIA]: { section: VEHICLE_MANAGE_SECTION.IMAGES },
  [VEHICLE_EDIT_TAB.DOCUMENTS]: { section: VEHICLE_MANAGE_SECTION.DOCUMENTS },
  [VEHICLE_EDIT_TAB.TRIP_HISTORY]: { section: VEHICLE_MANAGE_SECTION.TRIP_HISTORY },
  // Web `PRICING` → tab của dịch vụ đầu tiên xe đang phục vụ (màn giá tự chọn khi không có `service`).
  [VEHICLE_EDIT_TAB.PRICING]: { section: VEHICLE_MANAGE_SECTION.SERVICES },
  [VEHICLE_EDIT_TAB.MAINTENANCE]: null,
  [VEHICLE_EDIT_TAB.SOURCE]: null,
  [VEHICLE_EDIT_TAB.POLICY]: { section: VEHICLE_MANAGE_SECTION.POLICY },
  [VEHICLE_EDIT_TAB.OPERATIONS]: { section: VEHICLE_MANAGE_SECTION.POLICY },
  [VEHICLE_EDIT_TAB.HANDOVER_TIME]: { section: VEHICLE_MANAGE_SECTION.POLICY },
  /*
   * `self-drive-optimization` cố định tab tự lái ở bảng này; `vehicleEditPartHref` đổi sang tab có
   * tài xế khi xe chỉ phục vụ có tài xế (web `resolveEditTab`).
   */
  [VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION]: {
    section: VEHICLE_MANAGE_SECTION.SERVICES,
    service: SERVICE_TYPE.SELF_DRIVE,
  },
  [VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION]: {
    section: VEHICLE_MANAGE_SECTION.SERVICES,
    service: SERVICE_TYPE.WITH_DRIVER,
  },
  // Phụ phí tài xế đã gỡ (ADR 0075) — bí danh về tab có tài xế.
  [VEHICLE_EDIT_TAB.WITH_DRIVER_SURCHARGES]: {
    section: VEHICLE_MANAGE_SECTION.SERVICES,
    service: SERVICE_TYPE.WITH_DRIVER,
  },
  [VEHICLE_EDIT_TAB.SELF_DRIVE_TERMS]: {
    section: VEHICLE_MANAGE_SECTION.POLICY,
    service: SERVICE_TYPE.SELF_DRIVE,
    terms: true,
  },
  [VEHICLE_EDIT_TAB.WITH_DRIVER_TERMS]: {
    section: VEHICLE_MANAGE_SECTION.POLICY,
    service: SERVICE_TYPE.WITH_DRIVER,
    terms: true,
  },
};

/** Đích Owner Lite của một mục — dựng route kèm `service` / `anchor`. */
function ownerTargetHref(vehicleId: string, target: OwnerEditTarget): Href {
  return ROUTES.account.vehicleManageSection(vehicleId, target.section, {
    ...(target.service ? { service: target.service } : {}),
    ...(target.terms ? { anchor: RENTAL_TERMS_ANCHOR } : {}),
  });
}

/**
 * Một tab của form sửa xe (gian hàng) ↔ một mục của màn sửa xe Owner Lite — bản native của web
 * `workspaceVehiclePaths().part`. `null` = Owner Lite không có mục đó: nơi gọi ẨN lối vào.
 * `services` (dịch vụ xe đang phục vụ) chỉ cần cho bí danh `self-drive-optimization`.
 */
export function vehicleEditPartHref(
  vehicleId: string,
  tab: VehicleEditTab,
  customerScope: boolean,
  services?: readonly string[],
): Href | null {
  if (!customerScope) return ROUTES.manage.vehicleEditTab(vehicleId, tab);
  const target = EDIT_TAB_TO_SECTION[tab];
  if (!target) return null;
  if (tab === VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION && services) {
    return ownerTargetHref(vehicleId, {
      ...target,
      service: ownerOptimizationService(services) as ServiceType,
    });
  }
  return ownerTargetHref(vehicleId, target);
}

/** Nút "Chỉnh sửa xe": hub sửa xe (gian hàng) ↔ menu sửa xe Owner Lite. */
export function vehicleEditHubHref(vehicleId: string, customerScope: boolean): Href {
  return customerScope
    ? ROUTES.account.vehicleManage(vehicleId)
    : ROUTES.manage.vehicleEdit(vehicleId);
}

/**
 * "Giá & chính sách" — web `paths.pricing` = `?tab=pricing`, tức mục "Dịch vụ & giá" ở cả hai
 * tuyến. Không trỏ route `/pricing` cũ: nó chỉ còn là một lần chuyển hướng tới mục này.
 */
export function vehiclePricingHref(vehicleId: string, customerScope: boolean): Href {
  return customerScope
    ? ROUTES.account.vehicleManageSection(vehicleId, VEHICLE_MANAGE_SECTION.SERVICES)
    : ROUTES.manage.vehicleEditTab(vehicleId, VEHICLE_EDIT_TAB.PRICING);
}

/**
 * "Tối ưu nhận chuyến" — web `paths.optimization` = `?tab=self-drive-optimization`: tab TỰ LÁI của
 * "Dịch vụ & giá", đổi sang tab có tài xế khi xe chỉ phục vụ có tài xế.
 */
export function vehicleOptimizationHref(
  vehicle: { id: string; serviceTypes: readonly string[] },
  customerScope: boolean,
): Href {
  return vehicleEditPartHref(
    vehicle.id,
    VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION,
    customerScope,
    vehicle.serviceTypes,
  ) as Href;
}

/**
 * "Đơn thuê" của xe — đơn đã lọc theo xe ở khu quản lý, CHO CẢ HAI TUYẾN.
 *
 * Từ ADR 0053 Owner Lite sống ở site/app partner và dùng CHUNG trang đơn thuê với tuyến gói (web
 * `workspacePaths` của Owner Lite: `bookings: ROUTES.MANAGE.BOOKINGS`). "Chuyến của tôi" là chuyến
 * ĐI THUÊ của tài khoản khách — không có ở app Partner.
 */
export function vehicleBookingsHref(vehicleId: string): Href {
  return ROUTES.manage.bookings({ vehicleId });
}
