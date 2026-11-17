import type { Href } from 'expo-router';
import { PERMISSION, type Permission } from '@xeprime/types';
import type { IconName } from '@/components/ui/Chip';
import { ROUTES } from '@/navigation/routes';
import type { VehicleCapabilities } from './hooks/use-vehicle-capabilities';
import { vehicleBookingsHref, vehicleEditHubHref } from './workspace-links';

/**
 * Nút "Chỉnh sửa" trên Hồ sơ 360 — bản native của `vehiclePaths.profile(id)` web. Từ 03/11/2026 web
 * mở MÀN SỬA XE ở cả hai tuyến (`profile: vehiclePath.edit`): gian hàng → hub sửa xe, chủ xe tuyến
 * hoa hồng → menu sửa xe Owner Lite.
 */
export function vehicleProfileHref(vehicleId: string, customerScope: boolean): Href {
  return vehicleEditHubHref(vehicleId, customerScope);
}

/** Khoá của một mục — cũng là khoá nhãn dưới `Vehicles.overview.links`. */
export type VehicleModuleLinkKey = 'bookings' | 'receipts' | 'maintenanceCenter';

export interface VehicleModuleLink {
  key: VehicleModuleLinkKey;
  icon: IconName;
  href: Href;
}

/**
 * "Lối tắt" của hồ sơ xe — bản native của `ModuleLinks` trong `Vehicle360Aside` web (chốt
 * 03/11/2026): CHỈ những đích không có lối nào khác trên màn — đơn thuê của xe (`BOOKING_VIEW`),
 * sổ Thu-Chi của xe (cổng quản lý ∧ `can.money`), trung tâm bảo dưỡng (cổng quản lý ∧
 * `can.maintenance`). Thông tin · ảnh · giá · giấy tờ · nguồn xe · bảo dưỡng đã có ở màn sửa
 * ("Chỉnh sửa"), lịch đã có nút "Xem lịch xe" — liệt kê lại ở đây là hai lối cho một chỗ.
 *
 * `can` là `useVehicleCapabilities()` — quyền ∧ cờ gói (ADR 0027 điều 2). Chỉ đọc permission thì
 * tuyến hoa hồng (cùng vai `shop_owner`) thấy mục dẫn tới màn họ nhận 403.
 *
 * Hàm THUẦN (không hook) để cả ma trận khu × năng lực kiểm được bằng test. `canEdit` giữ trong
 * chữ ký cho nơi gọi cũ - không còn mục nào gác bằng nó.
 */
export function vehicleModuleLinks({
  vehicle,
  customerScope,
  has,
  can,
}: {
  vehicle: { id: string; name: string; plateNumber?: string | null };
  canEdit?: boolean;
  customerScope: boolean;
  has: (permission: Permission) => boolean;
  can: VehicleCapabilities;
}): VehicleModuleLink[] {
  const links: VehicleModuleLink[] = [];
  if (has(PERMISSION.BOOKING_VIEW)) {
    links.push({ key: 'bookings', icon: 'receipt-outline', href: vehicleBookingsHref(vehicle.id) });
  }
  if (!customerScope && can.money) {
    links.push({
      key: 'receipts',
      icon: 'cash-outline',
      href: ROUTES.manage.receipts({ vehicleId: vehicle.id }),
    });
  }
  /* Trung tâm bảo dưỡng là màn TOÀN ĐỘI XE của cổng quản lý — không thuộc một chiếc xe. */
  if (!customerScope && can.maintenance) {
    links.push({
      key: 'maintenanceCenter',
      icon: 'build-outline',
      href: ROUTES.manage.maintenance(),
    });
  }
  return links;
}

/** Bốn tab của Hồ sơ 360 — khoá cũng là khoá nhãn dưới `Vehicles.overview.tabs` (web `OVERVIEW_VIEW`). */
export const OVERVIEW_VIEW = {
  OVERVIEW: 'overview',
  SPECS: 'specs',
  FINANCE: 'finance',
  FEATURES: 'features',
  MAINTENANCE: 'maintenance',
} as const;
export type OverviewView = (typeof OVERVIEW_VIEW)[keyof typeof OVERVIEW_VIEW];

/**
 * Tab hiện được, ĐÚNG thứ tự web (03/11/2026): Tổng quan · Thông số luôn có; Tài chính chỉ khi
 * `can.money`; Tiện ích xe luôn có (ledger §3.6 D14–D15); Bảo dưỡng chỉ khi `can.maintenance`
 * (quyền ∧ cờ gói — tuyến hoa hồng không thấy Tài chính và Bảo dưỡng).
 */
export function overviewViews(can: { money: boolean; maintenance: boolean }): OverviewView[] {
  return [
    OVERVIEW_VIEW.OVERVIEW,
    OVERVIEW_VIEW.SPECS,
    ...(can.money ? [OVERVIEW_VIEW.FINANCE] : []),
    OVERVIEW_VIEW.FEATURES,
    ...(can.maintenance ? [OVERVIEW_VIEW.MAINTENANCE] : []),
  ];
}
