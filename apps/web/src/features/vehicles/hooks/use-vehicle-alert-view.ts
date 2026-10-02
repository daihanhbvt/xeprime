'use client';

import { useCallback } from 'react';
import { VEHICLE_ALERT_KIND, type VehicleAlertKind } from '@xeprime/types';

import {
  VEHICLE_EDIT_TAB,
  VEHICLE_MANAGE_SECTION,
  type VehicleEditTab,
  type VehicleManageSection,
} from '@/constants/routes';
import { useAvailableHref } from '@/features/tenant-support/support-session';
import { useWorkspace } from '@/hooks/use-workspace';

import type { VehicleAlertItem } from '../types';
import { useVehicleCapabilities } from './use-vehicle-capabilities';

/**
 * Đích của từng loại cảnh báo, trong CẢ HAI hệ toạ độ. `null` ở vế `section` = việc đó chỉ xử lý
 * được ở cổng quản lý.
 *
 * Vì sao web tự dựng đường dẫn thay vì dùng `alert.href` của server: `VehicleAlertsService` ghim
 * cứng `/manage/vehicles/:id/edit?tab=…` cho MỌI tuyến, nên một chủ xe tuyến hoa hồng bấm vào
 * cảnh báo là bị `AppShell` đá về `/account`. Server biết CÓ việc gì; nó không biết người đang
 * đọc đứng ở khu nào — đó là câu hỏi của client, và bản đồ trình bày này vốn đã sống ở web
 * (xem `publication.ts`).
 *
 * Cảnh báo không có trong bảng thì giữ nguyên `href` server trả: chúng dẫn ra ngoài module xe
 * (bàn giao, nguồn xe) và không phải việc của bảng này.
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

/** Cảnh báo chỉ có nghĩa khi người đọc CÓ module bảo dưỡng (tuyến gói — ADR 0027 điều 1). */
const MAINTENANCE_ALERTS: readonly VehicleAlertKind[] = [
  VEHICLE_ALERT_KIND.MAINTENANCE_OVERDUE,
  VEHICLE_ALERT_KIND.MAINTENANCE_DUE_SOON,
  VEHICLE_ALERT_KIND.MAINTENANCE_IN_PROGRESS,
  VEHICLE_ALERT_KIND.MISSING_ODOMETER,
];

/**
 * Cảnh báo của server → cảnh báo hiện ra được, cho KHU và NĂNG LỰC của người đang đọc.
 *
 * Hai việc, và cả hai đều thuần trình bày — không suy thêm cảnh báo nào, không sắp xếp lại
 * (thứ tự ưu tiên đã tất định ở `VEHICLE_ALERT_PRIORITY`, server sắp sẵn):
 *
 * 1. **Bỏ việc không làm được.** `VehicleAlertsService.alertScope` chỉ kiểm PERMISSION, mà hai
 *    tuyến dùng chung vai `shop_owner` — nên chủ xe tuyến hoa hồng nhận cả cảnh báo bảo dưỡng
 *    cho một module mà `@SubscriptionTrackOnly` đã khoá với họ ở mọi URL. Một việc cần làm mà
 *    không có chỗ nào làm được thì không phải việc cần làm.
 * 2. **Trỏ về đúng khu.** Xem `ALERT_TARGET`.
 *
 * Việc còn đích `null` (khu này không có màn đó) vẫn HIỆN, chỉ mất cái link — người dùng cần
 * biết tình trạng xe của mình kể cả khi lối xử lý nằm ở nơi khác.
 */
export function useVehicleAlertView(): (
  vehicleId: string,
  alerts: readonly VehicleAlertItem[],
) => VehicleAlertItem[] {
  const { vehicles: vehiclePaths, isManage } = useWorkspace();
  const available = useAvailableHref();
  const can = useVehicleCapabilities();

  return useCallback(
    (vehicleId, alerts) =>
      alerts
        .filter(
          (alert) =>
            can.maintenance || !MAINTENANCE_ALERTS.includes(alert.kind as VehicleAlertKind),
        )
        .map((alert) => {
          const target = ALERT_TARGET[alert.kind as VehicleAlertKind];
          if (target) {
            return {
              ...alert,
              href: available(vehiclePaths.part(vehicleId, target.tab, target.section)),
            };
          }
          /*
           * Cảnh báo ngoài bảng (bàn giao thiếu KM trả, nghĩa vụ nguồn xe) trỏ ra ngoài module
           * xe — `/manage/bookings?booking=…`, `/manage/vehicles/:id/edit?tab=source`. Ở khu
           * tài khoản không có đích tương đương chính xác, nên **bỏ link, giữ nguyên câu cảnh
           * báo**: đúng nguyên tắc mà chính `VehicleAlertsService` đã viết ra — *"không có đích
           * nào hợp lệ → `href: null`. Thà không có lối đi còn hơn một link 403"*.
           */
          if (!isManage && alert.href?.startsWith('/manage')) return { ...alert, href: null };
          // Phiên hỗ trợ: đích ngoài bảng cũng phải đi qua cổng — viết lại vào phiên, hoặc bỏ link
          // nếu màn đó không mở trong phiên (ADR 0050).
          return { ...alert, href: available(alert.href ?? null) };
        }),
    [available, can.maintenance, isManage, vehiclePaths],
  );
}
