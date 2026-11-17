import { useCallback } from 'react';
import type { Href } from 'expo-router';
import {
  MAINTENANCE_BOARD_FILTER,
  VEHICLE_ALERT_KIND,
  type VehicleAlertKind,
} from '@xeprime/types';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB, type VehicleEditTab } from '@/navigation/vehicle-edit-tab';
import {
  VEHICLE_MANAGE_SECTION,
  type VehicleManageSection,
} from '@/navigation/vehicle-manage-section';
import type { VehicleAlertItem } from '../api';
import { useVehicleCapabilities } from './use-vehicle-capabilities';

/** Một cảnh báo đã lọc cho người đọc, kèm đích CỦA APP (`null` = không có lối xử lý ở khu này). */
export type VehicleAlertView = VehicleAlertItem & { target: Href | null };

/**
 * Đích của từng loại cảnh báo trong CẢ HAI hệ toạ độ — bản native của `ALERT_TARGET` bên web
 * (`hooks/use-vehicle-alert-view.ts`). `section: null` = việc đó chỉ xử lý được ở cổng quản lý.
 *
 * App không dùng `alert.href` của server làm route: đó là đường dẫn web (`/manage/...`). Cảnh báo
 * ngoài bảng (nghĩa vụ nguồn xe) không có đích tương đương chắc chắn nên giữ câu cảnh báo, bỏ lối đi.
 * Riêng "Thiếu KM trả" (PR #280): server đã quyết người xem VÀO ĐƯỢC hàng đợi hay không (`href`
 * khác null) và có kèm `resolve=<bookingId>` hay không — app chỉ dịch đúng quyết định đó sang
 * route của Trung tâm bảo dưỡng (`missingReturnOdometerTarget`).
 */
const ALERT_TARGET: Partial<
  Record<VehicleAlertKind, { tab: VehicleEditTab; section: VehicleManageSection | null }>
> = {
  [VEHICLE_ALERT_KIND.DOCUMENT_EXPIRED]: {
    tab: VEHICLE_EDIT_TAB.DOCUMENTS,
    section: VEHICLE_MANAGE_SECTION.DOCUMENTS,
  },
  [VEHICLE_ALERT_KIND.DOCUMENT_EXPIRING]: {
    tab: VEHICLE_EDIT_TAB.DOCUMENTS,
    section: VEHICLE_MANAGE_SECTION.DOCUMENTS,
  },
  [VEHICLE_ALERT_KIND.MISSING_VEHICLE_INFO]: {
    tab: VEHICLE_EDIT_TAB.INFORMATION,
    section: VEHICLE_MANAGE_SECTION.INFORMATION,
  },
  [VEHICLE_ALERT_KIND.PUBLIC_ACTION_REQUIRED]: {
    tab: VEHICLE_EDIT_TAB.INFORMATION,
    section: VEHICLE_MANAGE_SECTION.INFORMATION,
  },
  [VEHICLE_ALERT_KIND.MAINTENANCE_OVERDUE]: { tab: VEHICLE_EDIT_TAB.MAINTENANCE, section: null },
  [VEHICLE_ALERT_KIND.MAINTENANCE_DUE_SOON]: { tab: VEHICLE_EDIT_TAB.MAINTENANCE, section: null },
  [VEHICLE_ALERT_KIND.MAINTENANCE_IN_PROGRESS]: {
    tab: VEHICLE_EDIT_TAB.MAINTENANCE,
    section: null,
  },
  [VEHICLE_ALERT_KIND.MISSING_ODOMETER]: { tab: VEHICLE_EDIT_TAB.MAINTENANCE, section: null },
};

/**
 * Đích của cảnh báo "Thiếu KM trả" ở app Partner — hàng đợi Thiếu KM trả của Trung tâm bảo dưỡng,
 * kèm `resolve` khi server gắn (đúng một biên bản + có quyền xem đơn). `href` null = không lối đi.
 */
export function missingReturnOdometerTarget(href: string | null | undefined): Href | null {
  if (!href) return null;
  const resolve = /[?&]resolve=([^&#]+)/.exec(href)?.[1];
  return ROUTES.manage.maintenance({
    filter: MAINTENANCE_BOARD_FILTER.MISSING_RETURN_KM,
    ...(resolve ? { resolve: decodeURIComponent(resolve) } : {}),
  });
}

/** Cảnh báo chỉ có nghĩa khi người đọc CÓ module bảo dưỡng (tuyến gói — ADR 0027 điều 1). */
export const MAINTENANCE_ALERTS: readonly string[] = [
  VEHICLE_ALERT_KIND.MAINTENANCE_OVERDUE,
  VEHICLE_ALERT_KIND.MAINTENANCE_DUE_SOON,
  VEHICLE_ALERT_KIND.MAINTENANCE_IN_PROGRESS,
  VEHICLE_ALERT_KIND.MISSING_ODOMETER,
];

/**
 * Cảnh báo của server → cảnh báo hiện ra được cho KHU và NĂNG LỰC của người đọc. Hàm THUẦN để
 * ma trận khu × năng lực kiểm được bằng test.
 *
 * 1. Bỏ việc không làm được: `VehicleAlertsService` chỉ kiểm permission, mà hai tuyến dùng chung
 *    vai `shop_owner` — tuyến hoa hồng nhận cả cảnh báo bảo dưỡng cho module họ không có.
 * 2. Trỏ về đúng khu. Việc có đích `null` vẫn HIỆN, chỉ mất lối đi.
 *
 * Không thêm, không sắp lại — thứ tự server đã tất định.
 */
export function vehicleAlertView(
  vehicleId: string,
  alerts: readonly VehicleAlertItem[],
  { canMaintenance, customerScope }: { canMaintenance: boolean; customerScope: boolean },
): VehicleAlertView[] {
  return alerts
    .filter((alert) => canMaintenance || !MAINTENANCE_ALERTS.includes(alert.kind))
    .map((alert) => {
      if (alert.kind === VEHICLE_ALERT_KIND.MISSING_RETURN_ODOMETER) {
        // Trung tâm bảo dưỡng chỉ ở app Partner — khu tài khoản không có đích.
        return { ...alert, target: customerScope ? null : missingReturnOdometerTarget(alert.href) };
      }
      const target = ALERT_TARGET[alert.kind as VehicleAlertKind];
      if (!target) return { ...alert, target: null };
      if (!customerScope) {
        return { ...alert, target: ROUTES.manage.vehicleEditTab(vehicleId, target.tab) };
      }
      return {
        ...alert,
        target: target.section
          ? ROUTES.account.vehicleManageSection(vehicleId, target.section)
          : null,
      };
    });
}

export function useVehicleAlertView(
  customerScope: boolean,
): (vehicleId: string, alerts: readonly VehicleAlertItem[]) => VehicleAlertView[] {
  const can = useVehicleCapabilities();
  return useCallback(
    (vehicleId, alerts) =>
      vehicleAlertView(vehicleId, alerts, { canMaintenance: can.maintenance, customerScope }),
    [can.maintenance, customerScope],
  );
}
