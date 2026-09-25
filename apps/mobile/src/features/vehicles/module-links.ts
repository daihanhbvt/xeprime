import type { Href } from 'expo-router';
import { PERMISSION, type Permission } from '@xeprime/types';
import type { IconName } from '@/components/ui/Chip';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB, type VehicleEditTab } from '@/navigation/vehicle-edit-tab';
import { vehicleSchedulePath } from './calendar-link';
import { vehicleBookingsHref, vehicleEditHref, vehiclePricingHref } from './workspace-links';

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
 * Cùng danh sách, cùng thứ tự, cùng điều kiện quyền và cùng phép chọn khu (`isManage`):
 *
 * | Mục | Cổng quản lý | Khu tài khoản (`customerScope`) |
 * | --- | --- | --- |
 * | thông tin · ảnh · giá · giấy tờ | tab form sửa xe | mục không gian quản lý xe |
 * | nguồn xe · sổ Thu-Chi | có (`FINANCE_VIEW`) | KHÔNG — sổ sách gian hàng |
 * | bảo dưỡng · trung tâm bảo dưỡng | có (`VEHICLE_MAINTENANCE_VIEW`) | KHÔNG — tính năng của gói |
 * | lịch | `/manage/calendar?q=` | `/account/calendar?q=` |
 * | đơn thuê | `/manage/bookings?vehicleId=` | `/trips` (Chuyến của tôi) |
 *
 * Hàm THUẦN (không hook) để cả ma trận khu × quyền kiểm được bằng test mà không dựng cả màn.
 */
export function vehicleModuleLinks({
  vehicle,
  canEdit,
  customerScope,
  has,
}: {
  vehicle: { id: string; name: string; plateNumber?: string | null };
  canEdit: boolean;
  customerScope: boolean;
  has: (permission: Permission) => boolean;
}): VehicleModuleLink[] {
  const links: VehicleModuleLink[] = [];
  /* Cùng một mục, hai đích: khu tài khoản đi vào không gian quản lý xe của chính nó. */
  const tab = (value: VehicleEditTab) => vehicleEditHref(vehicle.id, value, customerScope);

  if (canEdit) {
    links.push(
      { key: 'information', icon: 'car-outline', href: tab(VEHICLE_EDIT_TAB.INFORMATION) },
      { key: 'media', icon: 'images-outline', href: tab(VEHICLE_EDIT_TAB.MEDIA) },
      {
        key: 'pricing',
        icon: 'pricetag-outline',
        href: vehiclePricingHref(vehicle.id, customerScope),
      },
    );
    /*
     * TỐI ƯU NHẬN CHUYẾN KHÔNG nằm ở đây, và đó là chủ đích (24/09/2026): nó là một thẻ riêng
     * trên hồ sơ — `AutomationCard`, đúng như web. Đặt cả hai nơi là hai lối vào cùng một màn.
     */
    if (!customerScope && has(PERMISSION.FINANCE_VIEW)) {
      links.push({ key: 'source', icon: 'wallet-outline', href: tab(VEHICLE_EDIT_TAB.SOURCE) });
    }
  }
  if (has(PERMISSION.VEHICLE_DOCUMENT_VIEW)) {
    links.push({
      key: 'documents',
      icon: 'document-text-outline',
      href: tab(VEHICLE_EDIT_TAB.DOCUMENTS),
    });
  }
  // Bảo dưỡng là tính năng của GÓI (ADR 0027 điều 1) — web chỉ bày hai mục này ở cổng quản lý
  // (`isManage && has(VEHICLE_MAINTENANCE_VIEW)`). Ở khu tài khoản không có mục nào để tới.
  if (!customerScope && has(PERMISSION.VEHICLE_MAINTENANCE_VIEW)) {
    links.push(
      { key: 'maintenance', icon: 'construct-outline', href: tab(VEHICLE_EDIT_TAB.MAINTENANCE) },
      /* Trung tâm bảo dưỡng là màn TOÀN ĐỘI XE của cổng quản lý — không thuộc một chiếc xe. */
      { key: 'maintenanceCenter', icon: 'build-outline', href: ROUTES.manage.maintenance() },
    );
  }
  if (has(PERMISSION.CALENDAR_VIEW)) {
    // Lịch ĐÃ LỌC SẴN theo chính chiếc xe này (`?q=<biển số || tên>`), ở lịch CỦA KHU đang đứng —
    // web: `vehicleSchedulePath(vehicle, { basePath: paths.calendar })`.
    links.push({
      key: 'calendar',
      icon: 'calendar-outline',
      href: vehicleSchedulePath(vehicle, { back: true, customerScope }),
    });
  }
  if (has(PERMISSION.BOOKING_VIEW)) {
    // Cổng quản lý: đơn CỦA XE NÀY (`?vehicleId=`). Khu tài khoản: `paths.bookings` của web =
    // "Chuyến của tôi" — danh sách gồm cả hai phía, không lọc theo xe.
    links.push({
      key: 'bookings',
      icon: 'receipt-outline',
      href: vehicleBookingsHref(vehicle.id, customerScope),
    });
  }
  if (!customerScope && has(PERMISSION.FINANCE_VIEW)) {
    // Sổ Thu-Chi ĐÃ LỌC theo chính chiếc xe này — cùng tham số `?vehicleId=` web đặt trên URL.
    links.push({
      key: 'receipts',
      icon: 'cash-outline',
      href: ROUTES.manage.receipts({ vehicleId: vehicle.id }),
    });
  }
  return links;
}
