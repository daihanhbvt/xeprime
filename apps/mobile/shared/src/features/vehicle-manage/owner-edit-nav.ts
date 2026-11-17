import AppstoreOutlined from '@ant-design/icons-svg/es/asn/AppstoreOutlined';
import CarOutlined from '@ant-design/icons-svg/es/asn/CarOutlined';
import FileTextOutlined from '@ant-design/icons-svg/es/asn/FileTextOutlined';
import HistoryOutlined from '@ant-design/icons-svg/es/asn/HistoryOutlined';
import PictureOutlined from '@ant-design/icons-svg/es/asn/PictureOutlined';
import SafetyCertificateOutlined from '@ant-design/icons-svg/es/asn/SafetyCertificateOutlined';
import SettingOutlined from '@ant-design/icons-svg/es/asn/SettingOutlined';
import WalletOutlined from '@ant-design/icons-svg/es/asn/WalletOutlined';
import type { Href } from 'expo-router';
import { SERVICE_TYPE } from '@xeprime/types';
import type { AntIconDefinition } from '@/components/icons/AntIcon';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import {
  RENTAL_TERMS_ANCHOR,
  VEHICLE_MANAGE_SECTION,
  type VehicleEditMenuItemKey,
} from '@/navigation/vehicle-manage-section';

/**
 * MỤC của menu sửa xe Owner Lite — CÙNG khoá với web `EDIT_MENU`
 * (`apps/web/src/features/vehicles/components/vehicle-edit-nav.ts`). Khoá cũng là khoá nhãn dưới
 * `Vehicles.editor.menu.items`.
 */
export const OWNER_EDIT_MENU = {
  INFORMATION: 'information',
  MEDIA: 'media',
  DOCUMENTS: 'documents',
  TRIP_HISTORY: 'trip-history',
  SERVICES: 'services',
  POLICY: 'policy',
  MAINTENANCE: 'maintenance',
  SOURCE: 'source',
} as const satisfies Record<string, VehicleEditMenuItemKey>;

export type OwnerEditMenuKey = (typeof OWNER_EDIT_MENU)[keyof typeof OWNER_EDIT_MENU];

/** Khoá nhóm dưới `Vehicles.editor.menu.groups` — web `EDIT_MENU_GROUP`. */
export type OwnerEditMenuGroupKey = 'profile' | 'rental' | 'advanced';

export interface OwnerEditMenuItem {
  readonly key: OwnerEditMenuKey;
  /** CÙNG glyph AntD với web `VehicleEditMenu` (`ICON`). */
  readonly icon: AntIconDefinition;
}

export interface OwnerEditMenuGroup {
  readonly key: OwnerEditMenuGroupKey;
  readonly items: readonly OwnerEditMenuItem[];
}

/**
 * Ba nhóm, đúng thứ tự web `EDIT_MENU_GROUPS`:
 *
 * | Nhóm | Mục |
 * | --- | --- |
 * | Hồ sơ xe | Thông tin chung · Hình ảnh · Giấy tờ xe · Lịch sử chuyến |
 * | Hình thức cho thuê | Dịch vụ & giá · Chính sách thuê |
 * | Vận hành nâng cao | Bảo dưỡng & số KM · Nguồn gốc & tài chính xe |
 */
const OWNER_EDIT_MENU_GROUPS: readonly OwnerEditMenuGroup[] = [
  {
    key: 'profile',
    items: [
      { key: OWNER_EDIT_MENU.INFORMATION, icon: CarOutlined },
      { key: OWNER_EDIT_MENU.MEDIA, icon: PictureOutlined },
      { key: OWNER_EDIT_MENU.DOCUMENTS, icon: FileTextOutlined },
      { key: OWNER_EDIT_MENU.TRIP_HISTORY, icon: HistoryOutlined },
    ],
  },
  {
    key: 'rental',
    items: [
      { key: OWNER_EDIT_MENU.SERVICES, icon: AppstoreOutlined },
      { key: OWNER_EDIT_MENU.POLICY, icon: SafetyCertificateOutlined },
    ],
  },
  {
    key: 'advanced',
    items: [
      { key: OWNER_EDIT_MENU.MAINTENANCE, icon: SettingOutlined },
      { key: OWNER_EDIT_MENU.SOURCE, icon: WalletOutlined },
    ],
  },
];

/**
 * Năng lực của NGƯỜI NÀY — đúng `menuEnabled` của web `VehicleEditWorkspace` khi
 * `isManage === false` (app Partner không có phiên hỗ trợ):
 *
 * - Giấy tờ xe: `can.documents` (permission giấy tờ).
 * - Lịch sử chuyến: luôn có ở tuyến hoa hồng (gian hàng đã có màn Đơn thuê lọc theo xe).
 * - Bảo dưỡng / Nguồn xe: `can.maintenance` / `can.source` — quyền ∧ cờ gói, nên tuyến hoa hồng
 *   (không có gói) thực tế không thấy nhóm "Vận hành nâng cao".
 * - Còn lại: luôn có.
 */
export interface OwnerEditCapabilities {
  documents: boolean;
  maintenance: boolean;
  source: boolean;
}

export function ownerEditMenuEnabled(key: OwnerEditMenuKey, can: OwnerEditCapabilities): boolean {
  switch (key) {
    case OWNER_EDIT_MENU.DOCUMENTS:
      return can.documents;
    /*
     * Tuyến hoa hồng không có cờ gói nên web luôn ẩn hai mục này; đích của chúng là route sửa xe
     * của GIAN HÀNG mà khu Owner Lite không cho vào - ẩn cứng để không có lối dẫn ra ngoài.
     */
    case OWNER_EDIT_MENU.MAINTENANCE:
    case OWNER_EDIT_MENU.SOURCE:
      return false;
    default:
      return true;
  }
}

/** Menu đã lọc theo năng lực — nhóm rỗng bị bỏ (web: "nhóm rỗng thì không vẽ"). Hàm THUẦN. */
export function ownerEditMenuGroups(can: OwnerEditCapabilities): OwnerEditMenuGroup[] {
  return OWNER_EDIT_MENU_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => ownerEditMenuEnabled(item.key, can)),
  })).filter((group) => group.items.length > 0);
}

/**
 * Đích của một mục menu. Sáu mục của Owner Lite là route của cây `/manage/vehicles/<id>/manage/`.
 * Bảo dưỡng / Nguồn xe (chỉ khi người này có năng lực gói) không có bản Owner Lite riêng — đi tới
 * màn mục tương ứng của cổng quản lý, đúng như web dùng chung một màn cho hai tuyến.
 */
export function ownerEditMenuHref(vehicleId: string, key: OwnerEditMenuKey): Href {
  switch (key) {
    case OWNER_EDIT_MENU.MEDIA:
      return ROUTES.account.vehicleManageSection(vehicleId, VEHICLE_MANAGE_SECTION.IMAGES);
    case OWNER_EDIT_MENU.DOCUMENTS:
      return ROUTES.account.vehicleManageSection(vehicleId, VEHICLE_MANAGE_SECTION.DOCUMENTS);
    case OWNER_EDIT_MENU.TRIP_HISTORY:
      return ROUTES.account.vehicleManageSection(vehicleId, VEHICLE_MANAGE_SECTION.TRIP_HISTORY);
    case OWNER_EDIT_MENU.SERVICES:
      return ROUTES.account.vehicleManageSection(vehicleId, VEHICLE_MANAGE_SECTION.SERVICES);
    case OWNER_EDIT_MENU.POLICY:
      return ROUTES.account.vehicleManageSection(vehicleId, VEHICLE_MANAGE_SECTION.POLICY);
    case OWNER_EDIT_MENU.MAINTENANCE:
      return ROUTES.manage.vehicleEditTab(vehicleId, VEHICLE_EDIT_TAB.MAINTENANCE);
    case OWNER_EDIT_MENU.SOURCE:
      return ROUTES.manage.vehicleEditTab(vehicleId, VEHICLE_EDIT_TAB.SOURCE);
    default:
      return ROUTES.account.vehicleManageSection(vehicleId, VEHICLE_MANAGE_SECTION.INFORMATION);
  }
}

/** "Dịch vụ & giá" mở sẵn tab của một dịch vụ — web `?tab=self-drive|with-driver|long-term`. */
export function ownerServicesHref(vehicleId: string, service?: string): Href {
  return ROUTES.account.vehicleManageSection(
    vehicleId,
    VEHICLE_MANAGE_SECTION.SERVICES,
    service ? { service } : undefined,
  );
}

/**
 * "Chính sách thuê" cuộn tới khối điều khoản của một dịch vụ — web `resolveEditTab` → `termsOf`
 * (`?tab=self-drive-terms|with-driver-terms`).
 */
export function ownerPolicyHref(vehicleId: string, termsOf?: string): Href {
  return ROUTES.account.vehicleManageSection(
    vehicleId,
    VEHICLE_MANAGE_SECTION.POLICY,
    termsOf ? { anchor: RENTAL_TERMS_ANCHOR, service: termsOf } : undefined,
  );
}

/**
 * Bí danh `self-drive-optimization` của web: xe chỉ có dịch vụ có tài xế thì mở thẳng tab đó —
 * không thả người dùng vào tab tự lái đang tắt.
 */
export function ownerOptimizationService(services: readonly string[]): string {
  return !services.includes(SERVICE_TYPE.SELF_DRIVE) && services.includes(SERVICE_TYPE.WITH_DRIVER)
    ? SERVICE_TYPE.WITH_DRIVER
    : SERVICE_TYPE.SELF_DRIVE;
}
