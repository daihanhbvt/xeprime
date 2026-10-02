import type { Href } from 'expo-router';
import { PERMISSION, type Permission } from '@xeprime/types';
import type { IconName } from '@/components/ui/Chip';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB, type VehicleEditTab } from '@/navigation/vehicle-edit-tab';
import { vehicleSchedulePath } from './calendar-link';
import type { VehicleCapabilities } from './hooks/use-vehicle-capabilities';
import { vehicleBookingsHref, vehicleEditPartHref, vehiclePricingHref } from './workspace-links';

/**
 * Nút "Chỉnh sửa" trên Hồ sơ 360 — bản native của `vehiclePaths.profile(id)` web: cổng quản lý
 * mở màn sửa xe (hub), khu tài khoản mở thẳng mục "Thông tin xe" của không gian quản lý xe.
 */
export function vehicleProfileHref(vehicleId: string, customerScope: boolean): Href {
  return customerScope
    ? (vehicleEditPartHref(vehicleId, VEHICLE_EDIT_TAB.INFORMATION, true) as Href)
    : ROUTES.manage.vehicleEdit(vehicleId);
}

/** Khoá của một mục — cũng là khoá nhãn dưới `Vehicles.overview.links`. */
export type VehicleModuleLinkKey =
  | 'information'
  | 'media'
  | 'pricing'
  | 'source'
  | 'documents'
  | 'maintenance'
  | 'maintenanceCenter'
  | 'calendar'
  | 'bookings'
  | 'receipts';

export interface VehicleModuleLink {
  key: VehicleModuleLinkKey;
  icon: IconName;
  href: Href;
}

/**
 * Dải LIÊN KẾT NHANH của hồ sơ xe — bản native của `ModuleLinks` trong `Vehicle360Overview` web.
 *
 * Cùng danh sách, cùng thứ tự, cùng điều kiện: thông tin · ảnh · giá (cần sửa) → nguồn xe (cần sửa
 * ∧ `can.source`, chỉ cổng quản lý) → giấy tờ (`can.documents`) → bảo dưỡng (`can.maintenance`,
 * chỉ cổng quản lý) + trung tâm bảo dưỡng → lịch (`CALENDAR_VIEW`) → đơn thuê (`BOOKING_VIEW`) →
 * sổ Thu-Chi (cổng quản lý ∧ `can.money`).
 *
 * `can` là `useVehicleCapabilities()` — quyền ∧ cờ gói (ADR 0027 điều 2). Chỉ đọc permission thì
 * tuyến hoa hồng (cùng vai `shop_owner`) thấy mục dẫn tới màn họ nhận 403.
 *
 * Hàm THUẦN (không hook) để cả ma trận khu × năng lực kiểm được bằng test.
 */
export function vehicleModuleLinks({
  vehicle,
  canEdit,
  customerScope,
  has,
  can,
}: {
  vehicle: { id: string; name: string; plateNumber?: string | null };
  canEdit: boolean;
  customerScope: boolean;
  has: (permission: Permission) => boolean;
  can: VehicleCapabilities;
}): VehicleModuleLink[] {
  const links: VehicleModuleLink[] = [];
  const push = (key: VehicleModuleLinkKey, icon: IconName, href: Href | null) => {
    if (href) links.push({ key, icon, href });
  };
  const part = (tab: VehicleEditTab) => vehicleEditPartHref(vehicle.id, tab, customerScope);

  if (canEdit) {
    push('information', 'car-outline', part(VEHICLE_EDIT_TAB.INFORMATION));
    push('media', 'images-outline', part(VEHICLE_EDIT_TAB.MEDIA));
    push('pricing', 'pricetag-outline', vehiclePricingHref(vehicle.id, customerScope));
    // Tối ưu nhận chuyến KHÔNG nằm ở đây — nó là thẻ riêng `AutomationCard`, đúng như web.
    if (can.source) push('source', 'wallet-outline', part(VEHICLE_EDIT_TAB.SOURCE));
  }
  if (can.documents) {
    push('documents', 'document-text-outline', part(VEHICLE_EDIT_TAB.DOCUMENTS));
  }
  if (can.maintenance) {
    push('maintenance', 'construct-outline', part(VEHICLE_EDIT_TAB.MAINTENANCE));
    /* Trung tâm bảo dưỡng là màn TOÀN ĐỘI XE của cổng quản lý — không thuộc một chiếc xe. */
    if (!customerScope) push('maintenanceCenter', 'build-outline', ROUTES.manage.maintenance());
  }
  if (has(PERMISSION.CALENDAR_VIEW)) {
    // Lịch ĐÃ LỌC SẴN theo chính chiếc xe này, ở lịch CỦA KHU đang đứng.
    push(
      'calendar',
      'calendar-outline',
      vehicleSchedulePath(vehicle, { back: true, customerScope }),
    );
  }
  if (has(PERMISSION.BOOKING_VIEW)) {
    // Cổng quản lý: đơn CỦA XE NÀY. Khu tài khoản: "Chuyến của tôi" — không lọc theo xe.
    push('bookings', 'receipt-outline', vehicleBookingsHref(vehicle.id, customerScope));
  }
  if (!customerScope && can.money) {
    push('receipts', 'cash-outline', ROUTES.manage.receipts({ vehicleId: vehicle.id }));
  }
  return links;
}

/** Bốn tab của Hồ sơ 360 — khoá cũng là khoá nhãn dưới `Vehicles.overview.tabs` (web `OVERVIEW_VIEW`). */
export const OVERVIEW_VIEW = {
  OVERVIEW: 'overview',
  SPECS: 'specs',
  FINANCE: 'finance',
  MAINTENANCE: 'maintenance',
} as const;
export type OverviewView = (typeof OVERVIEW_VIEW)[keyof typeof OVERVIEW_VIEW];

/**
 * Tab hiện được, ĐÚNG thứ tự web: Tổng quan · Thông số luôn có; Tài chính chỉ khi `can.money`,
 * Bảo dưỡng chỉ khi `can.maintenance` (quyền ∧ cờ gói — tuyến hoa hồng không thấy hai tab đó).
 */
export function overviewViews(can: { money: boolean; maintenance: boolean }): OverviewView[] {
  return [
    OVERVIEW_VIEW.OVERVIEW,
    OVERVIEW_VIEW.SPECS,
    ...(can.money ? [OVERVIEW_VIEW.FINANCE] : []),
    ...(can.maintenance ? [OVERVIEW_VIEW.MAINTENANCE] : []),
  ];
}
