import AppstoreOutlined from '@ant-design/icons-svg/es/asn/AppstoreOutlined';
import CarOutlined from '@ant-design/icons-svg/es/asn/CarOutlined';
import FileTextOutlined from '@ant-design/icons-svg/es/asn/FileTextOutlined';
import HistoryOutlined from '@ant-design/icons-svg/es/asn/HistoryOutlined';
import PictureOutlined from '@ant-design/icons-svg/es/asn/PictureOutlined';
import SafetyCertificateOutlined from '@ant-design/icons-svg/es/asn/SafetyCertificateOutlined';
import SettingOutlined from '@ant-design/icons-svg/es/asn/SettingOutlined';
import WalletOutlined from '@ant-design/icons-svg/es/asn/WalletOutlined';
import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';
import type { AntIconDefinition } from '@/components/icons/AntIcon';
import { VEHICLE_EDIT_TAB, type VehicleEditTab } from '@/navigation/vehicle-edit-tab';

/** Khoá dưới `Vehicles.editor.menu.items` - CÙNG nhãn với menu trái web (`VehicleEditMenu`). */
export type EditMenuLabelKey =
  | 'information'
  | 'media'
  | 'documents'
  | 'trip-history'
  | 'services'
  | 'policy'
  | 'maintenance'
  | 'source';

export interface EditNavItem {
  readonly tab: VehicleEditTab;
  readonly labelKey: EditMenuLabelKey;
  /** CÙNG glyph AntD với web `EDIT_MENU_ICON`. */
  readonly icon: AntIconDefinition;
}

export interface EditNavGroup {
  /** Khoá dưới `Vehicles.editor.menu.groups` - CÙNG ba nhóm với menu trái web. */
  readonly key: 'profile' | 'rental' | 'advanced';
  readonly items: readonly EditNavItem[];
}

const item = (
  tab: VehicleEditTab,
  labelKey: EditMenuLabelKey,
  icon: AntIconDefinition,
): EditNavItem => ({ tab, labelKey, icon });

/**
 * MENU của màn sửa xe ở app Partner - bản native của `EDIT_MENU_GROUPS` web
 * (`apps/web/src/features/vehicles/components/vehicle-edit-nav.ts`, ledger §3.6 E1), BA nhóm:
 *
 * | Nhóm | Mục |
 * | --- | --- |
 * | Hồ sơ xe | Thông tin chung · Hình ảnh · Giấy tờ xe · Lịch sử chuyến |
 * | Hình thức cho thuê | Dịch vụ & giá · Chính sách thuê |
 * | Vận hành nâng cao | Bảo dưỡng & số KM · Nguồn gốc & tài chính xe |
 *
 * "Dịch vụ & giá" gồm tab dịch vụ, công tắc, nhận chuyến tự động, giá (web `ServicesPane`);
 * "Chính sách thuê" gồm nguồn chính sách, giao nhận, thời gian chết, điều kiện thuê (web
 * `PolicyPane`). `enabled` là năng lực của NGƯỜI NÀY; nhóm rỗng bị bỏ. Hàm THUẦN để test được.
 */
export function vehicleEditNavGroups({
  enabled,
}: {
  enabled: (tab: VehicleEditTab) => boolean;
}): EditNavGroup[] {
  const groups: EditNavGroup[] = [
    {
      key: 'profile',
      items: [
        item(VEHICLE_EDIT_TAB.INFORMATION, 'information', CarOutlined),
        item(VEHICLE_EDIT_TAB.MEDIA, 'media', PictureOutlined),
        item(VEHICLE_EDIT_TAB.DOCUMENTS, 'documents', FileTextOutlined),
        item(VEHICLE_EDIT_TAB.TRIP_HISTORY, 'trip-history', HistoryOutlined),
      ],
    },
    {
      key: 'rental',
      items: [
        item(VEHICLE_EDIT_TAB.PRICING, 'services', AppstoreOutlined),
        item(VEHICLE_EDIT_TAB.POLICY, 'policy', SafetyCertificateOutlined),
      ],
    },
    {
      key: 'advanced',
      items: [
        // Bảo dưỡng TRƯỚC nguồn xe - đúng thứ tự nhóm bên web.
        item(VEHICLE_EDIT_TAB.MAINTENANCE, 'maintenance', SettingOutlined),
        item(VEHICLE_EDIT_TAB.SOURCE, 'source', WalletOutlined),
      ],
    },
  ];

  return groups
    .map((group) => ({ ...group, items: group.items.filter((entry) => enabled(entry.tab)) }))
    .filter((group) => group.items.length > 0);
}

/** Dịch vụ mà một mục thuộc về — web `editTabServiceType`. `null` = nhóm chung. */
const SERVICE_OF_TAB: Partial<Record<VehicleEditTab, ServiceType>> = {
  [VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION]: SERVICE_TYPE.SELF_DRIVE,
  [VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION]: SERVICE_TYPE.WITH_DRIVER,
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
