import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';

import { VEHICLE_EDIT_TAB, type VehicleEditTab } from '@/constants/routes';

/**
 * MỤC của menu trái màn sửa xe (design `23731:37932`, 03/11/2026). Khác `VehicleEditTab` ở đúng một
 * chỗ: "Dịch vụ xe" là MỘT mục mà ba giá trị `?tab=` (tự lái · có tài xế · dài hạn) cùng thuộc về.
 */
export const EDIT_MENU = {
  INFORMATION: VEHICLE_EDIT_TAB.INFORMATION,
  MEDIA: VEHICLE_EDIT_TAB.MEDIA,
  DOCUMENTS: VEHICLE_EDIT_TAB.DOCUMENTS,
  TRIP_HISTORY: VEHICLE_EDIT_TAB.TRIP_HISTORY,
  SERVICES: 'services',
  CONDITIONS: VEHICLE_EDIT_TAB.CONDITIONS,
  HANDOVER: VEHICLE_EDIT_TAB.HANDOVER,
  MAINTENANCE: VEHICLE_EDIT_TAB.MAINTENANCE,
  SOURCE: VEHICLE_EDIT_TAB.SOURCE,
} as const;
export type EditMenuKey = (typeof EDIT_MENU)[keyof typeof EDIT_MENU];

export const EDIT_MENU_GROUP = {
  PROFILE: 'profile',
  RENTAL: 'rental',
  ADVANCED: 'advanced',
} as const;
export type EditMenuGroup = (typeof EDIT_MENU_GROUP)[keyof typeof EDIT_MENU_GROUP];

/**
 * Ba nhóm, theo design:
 *
 * | Nhóm | Mục |
 * | --- | --- |
 * | Hồ sơ xe | Thông tin chung · Hình ảnh · Giấy tờ xe · Lịch sử chuyến (chỉ chủ xe tuyến hoa hồng) |
 * | Hình thức cho thuê | Dịch vụ xe · Điều kiện · Giao nhận |
 * | Vận hành nâng cao | Bảo dưỡng & số KM · Nguồn gốc & tài chính xe (tuyến gói) |
 *
 * Mục nào có mặt với NGƯỜI NÀY do nơi gọi quyết (quyền ∧ cờ gói ∧ tuyến ∧ phiên hỗ trợ); nhóm rỗng
 * thì không vẽ.
 */
export const EDIT_MENU_GROUPS: ReadonlyArray<{
  key: EditMenuGroup;
  items: readonly EditMenuKey[];
}> = [
  {
    key: EDIT_MENU_GROUP.PROFILE,
    items: [EDIT_MENU.INFORMATION, EDIT_MENU.MEDIA, EDIT_MENU.DOCUMENTS, EDIT_MENU.TRIP_HISTORY],
  },
  {
    key: EDIT_MENU_GROUP.RENTAL,
    items: [EDIT_MENU.SERVICES, EDIT_MENU.CONDITIONS, EDIT_MENU.HANDOVER],
  },
  { key: EDIT_MENU_GROUP.ADVANCED, items: [EDIT_MENU.MAINTENANCE, EDIT_MENU.SOURCE] },
];

/** Ba tab của mục "Dịch vụ xe", theo thứ tự trên màn. */
export const SERVICE_TABS: ReadonlyArray<{ tab: VehicleEditTab; service: ServiceType }> = [
  { tab: VEHICLE_EDIT_TAB.SELF_DRIVE, service: SERVICE_TYPE.SELF_DRIVE },
  { tab: VEHICLE_EDIT_TAB.WITH_DRIVER, service: SERVICE_TYPE.WITH_DRIVER },
  { tab: VEHICLE_EDIT_TAB.LONG_TERM, service: SERVICE_TYPE.LONG_TERM },
];

/** Dịch vụ của một tab — `null` khi tab không thuộc mục "Dịch vụ xe". */
export function serviceOfTab(tab: VehicleEditTab): ServiceType | null {
  return SERVICE_TABS.find((entry) => entry.tab === tab)?.service ?? null;
}

export function tabOfService(service: ServiceType): VehicleEditTab {
  return (
    SERVICE_TABS.find((entry) => entry.service === service)?.tab ?? VEHICLE_EDIT_TAB.SELF_DRIVE
  );
}

/** Mục menu sáng lên khi đang đứng ở `tab`. */
export function menuKeyOfTab(tab: VehicleEditTab): EditMenuKey {
  return serviceOfTab(tab) ? EDIT_MENU.SERVICES : (tab as EditMenuKey);
}

/** Bấm "Dịch vụ xe" mở tab của dịch vụ ĐẦU TIÊN xe đang phục vụ — xe chưa có dịch vụ nào thì tự lái. */
export function defaultServiceTab(services: readonly string[]): VehicleEditTab {
  return (
    SERVICE_TABS.find((entry) => services.includes(entry.service))?.tab ??
    VEHICLE_EDIT_TAB.SELF_DRIVE
  );
}

/** Tab mở khi bấm một mục menu. */
export function tabOfMenu(key: EditMenuKey, services: readonly string[]): VehicleEditTab {
  return key === EDIT_MENU.SERVICES ? defaultServiceTab(services) : key;
}

/**
 * Bí danh `?tab=` → mục thật, kèm dịch vụ cần cuộn tới ở mục Điều kiện. Link cũ (cảnh báo, Hồ sơ
 * 360, email, route `/pricing` · `/optimization`, menu 30/09) vẫn mở đúng chỗ.
 */
export function resolveEditTab(
  tab: VehicleEditTab,
  services: readonly string[],
): { tab: VehicleEditTab; termsOf: ServiceType | null } {
  switch (tab) {
    case VEHICLE_EDIT_TAB.PRICING:
      return { tab: defaultServiceTab(services), termsOf: null };
    case VEHICLE_EDIT_TAB.OPERATIONS:
    case VEHICLE_EDIT_TAB.HANDOVER_TIME:
      return { tab: VEHICLE_EDIT_TAB.HANDOVER, termsOf: null };
    case VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION:
      /*
       * Hành vi của route cũ `/optimization`: xe chỉ có dịch vụ có tài xế thì mở thẳng tab đó —
       * không thả người dùng vào tab tự lái đang tắt.
       */
      return {
        tab:
          !services.includes(SERVICE_TYPE.SELF_DRIVE) && services.includes(SERVICE_TYPE.WITH_DRIVER)
            ? VEHICLE_EDIT_TAB.WITH_DRIVER
            : VEHICLE_EDIT_TAB.SELF_DRIVE,
        termsOf: null,
      };
    case VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION:
    case VEHICLE_EDIT_TAB.WITH_DRIVER_SURCHARGES:
      return { tab: VEHICLE_EDIT_TAB.WITH_DRIVER, termsOf: null };
    case VEHICLE_EDIT_TAB.SELF_DRIVE_TERMS:
      return { tab: VEHICLE_EDIT_TAB.CONDITIONS, termsOf: SERVICE_TYPE.SELF_DRIVE };
    case VEHICLE_EDIT_TAB.WITH_DRIVER_TERMS:
      return { tab: VEHICLE_EDIT_TAB.CONDITIONS, termsOf: SERVICE_TYPE.WITH_DRIVER };
    default:
      return { tab, termsOf: null };
  }
}
