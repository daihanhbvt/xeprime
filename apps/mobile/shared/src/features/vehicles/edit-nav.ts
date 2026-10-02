import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';
import type { IconName } from '@/components/ui/Chip';
import { VEHICLE_EDIT_TAB, type VehicleEditTab } from '@/navigation/vehicle-edit-tab';
import type { VehicleManageMenuKey } from '@/navigation/vehicle-manage-section';

export interface EditNavItem {
  readonly tab: VehicleEditTab;
  /** Khoá dưới `VehicleManage.menu` — CÙNG nhãn với menu trái bên web. */
  readonly labelKey: VehicleManageMenuKey;
  readonly icon: IconName;
}

export interface EditNavGroup {
  readonly key: 'info' | 'pricingHandover' | 'selfDrive' | 'withDriver' | 'longTerm' | 'advanced';
  readonly labelKey: VehicleManageMenuKey;
  /** Dịch vụ của nhóm — nhóm dịch vụ có công tắc bật/tắt trên tiêu đề; `null` = nhóm chung. */
  readonly serviceType: ServiceType | null;
  /** Dịch vụ của nhóm đang TẮT trên xe — nhóm vẫn hiện nhưng mờ đi. */
  readonly dimmed: boolean;
  readonly items: readonly EditNavItem[];
}

const item = (
  tab: VehicleEditTab,
  labelKey: VehicleManageMenuKey,
  icon: IconName,
): EditNavItem => ({
  tab,
  labelKey,
  icon,
});

/**
 * MENU của màn sửa xe ở app Partner — bản native của `editNavGroups` bên web
 * (`apps/web/src/features/vehicles/components/vehicle-edit-nav.ts`), cùng sáu nhóm, cùng thứ tự:
 *
 * | Nhóm | Mục |
 * | --- | --- |
 * | Thông tin xe | Thông tin xe & tiện ích · Hình ảnh · Giấy tờ xe |
 * | Giá & giao nhận | Giá & chính sách · Thời gian giao nhận |
 * | Cho thuê tự lái [công tắc] | Nhận chuyến & thủ tục |
 * | Cho thuê có tài xế [công tắc] | Nhận chuyến & thủ tục · Phụ phí |
 * | Cho thuê dài hạn [công tắc] | — (giá tháng nằm ở Giá & chính sách) |
 * | Nâng cao | Nguồn xe & tài chính · Bảo dưỡng & KM |
 *
 * `enabled` là năng lực của NGƯỜI NÀY (web `tabEnabled`: giấy tờ/nguồn xe/bảo dưỡng theo
 * `useVehicleCapabilities`). Nhóm rỗng bị bỏ, TRỪ nhóm dịch vụ — nó mang công tắc.
 *
 * Hàm THUẦN để thứ tự và luật lọc kiểm được bằng test.
 */
export function vehicleEditNavGroups({
  enabled,
  services,
}: {
  enabled: (tab: VehicleEditTab) => boolean;
  services: readonly string[];
}): EditNavGroup[] {
  const service = (
    key: EditNavGroup['key'],
    labelKey: VehicleManageMenuKey,
    serviceType: ServiceType,
    items: EditNavItem[],
  ): EditNavGroup => ({
    key,
    labelKey,
    serviceType,
    dimmed: !services.includes(serviceType),
    items,
  });

  const groups: EditNavGroup[] = [
    {
      key: 'info',
      labelKey: 'groups.info',
      serviceType: null,
      dimmed: false,
      items: [
        item(VEHICLE_EDIT_TAB.INFORMATION, 'items.information', 'car-outline'),
        item(VEHICLE_EDIT_TAB.MEDIA, 'items.images', 'images-outline'),
        item(VEHICLE_EDIT_TAB.DOCUMENTS, 'items.documents', 'document-text-outline'),
      ],
    },
    {
      // Giá và khung giờ giao nhận áp cho CẢ chiếc xe — không nằm dưới công tắc dịch vụ nào.
      key: 'pricingHandover',
      labelKey: 'groups.pricingHandover',
      serviceType: null,
      dimmed: false,
      items: [
        item(VEHICLE_EDIT_TAB.PRICING, 'items.pricing', 'cash-outline'),
        item(VEHICLE_EDIT_TAB.HANDOVER_TIME, 'items.handoverTime', 'alarm-outline'),
      ],
    },
    service('selfDrive', 'groups.selfDrive', SERVICE_TYPE.SELF_DRIVE, [
      item(
        VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION,
        'items.bookingTerms',
        'shield-checkmark-outline',
      ),
    ]),
    service('withDriver', 'groups.withDriver', SERVICE_TYPE.WITH_DRIVER, [
      item(
        VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION,
        'items.bookingTerms',
        'shield-checkmark-outline',
      ),
      item(VEHICLE_EDIT_TAB.WITH_DRIVER_SURCHARGES, 'items.surcharges', 'list-outline'),
    ]),
    // Dài hạn không có thiết lập vận hành nào — nhóm chỉ mang công tắc + lời nhắc giá tháng.
    service('longTerm', 'groups.longTerm', SERVICE_TYPE.LONG_TERM, []),
    {
      key: 'advanced',
      labelKey: 'groups.advanced',
      serviceType: null,
      dimmed: false,
      items: [
        item(VEHICLE_EDIT_TAB.SOURCE, 'items.source', 'wallet-outline'),
        item(VEHICLE_EDIT_TAB.MAINTENANCE, 'items.maintenance', 'construct-outline'),
      ],
    },
  ];

  return groups
    .map((group) => ({ ...group, items: group.items.filter((entry) => enabled(entry.tab)) }))
    .filter((group) => group.items.length > 0 || group.serviceType !== null);
}

/** Dịch vụ mà một mục thuộc về — web `editTabServiceType`. `null` = nhóm chung. */
const SERVICE_OF_TAB: Partial<Record<VehicleEditTab, ServiceType>> = {
  [VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION]: SERVICE_TYPE.SELF_DRIVE,
  [VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION]: SERVICE_TYPE.WITH_DRIVER,
  [VEHICLE_EDIT_TAB.WITH_DRIVER_SURCHARGES]: SERVICE_TYPE.WITH_DRIVER,
};

export function editTabServiceType(tab: VehicleEditTab): ServiceType | null {
  return SERVICE_OF_TAB[tab] ?? null;
}

/**
 * Mục "Nhận chuyến & thủ tục" nên mở khi được gọi là mục TỰ LÁI — web `VehicleEditWorkspace`
 * (route `/optimization` cũ): xe chỉ có dịch vụ có tài xế thì mở thẳng mục có tài xế, không để
 * người dùng rơi vào mục tự lái đang tắt.
 */
export function selfDriveOptimizationTarget(services: readonly string[]): VehicleEditTab {
  return !services.includes(SERVICE_TYPE.SELF_DRIVE) && services.includes(SERVICE_TYPE.WITH_DRIVER)
    ? VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION
    : VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION;
}
