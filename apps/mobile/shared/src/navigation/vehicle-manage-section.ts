import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';
import type { useTranslations } from 'use-intl';
import type { IconName } from '@/components/ui/Chip';

/**
 * 13 mục của không gian "Quản lý xe" — GIÁ TRỊ đường dẫn, cùng bộ với
 * `apps/web/src/constants/routes.ts` (`VEHICLE_MANAGE_SECTION`).
 *
 * Chép chứ không đưa vào package dùng chung: bên web đây là đoạn đường dẫn của Next, bên app là
 * đoạn đường dẫn của expo-router — hai vai của cùng một từ vựng. Phần THẬT SỰ phải khớp là chuỗi,
 * và nó khớp vì cả hai đọc từ danh sách này, nên một liên kết sâu do web hay thông báo đẩy sinh ra
 * vẫn tới đúng chỗ.
 *
 * Nhóm "có tài xế" KHÔNG có mục "Tiện ích bổ sung": mockup có nó nhưng nghiệp vụ không — phụ phí
 * mặc định đã nằm ở "Phụ phí".
 */
export const VEHICLE_MANAGE_SECTION = {
  INFORMATION: 'information',
  IMAGES: 'images',
  DOCUMENTS: 'documents',
  TRIP_HISTORY: 'trip-history',
  SELF_DRIVE_PRICING: 'self-drive/pricing',
  SELF_DRIVE_OPTIMIZATION: 'self-drive/optimization',
  SELF_DRIVE_DELIVERY: 'self-drive/delivery',
  SELF_DRIVE_HANDOVER_TIME: 'self-drive/handover-time',
  SELF_DRIVE_TERMS: 'self-drive/terms',
  WITH_DRIVER_PRICING: 'with-driver/pricing',
  WITH_DRIVER_OPTIMIZATION: 'with-driver/optimization',
  WITH_DRIVER_SURCHARGES: 'with-driver/surcharges',
  WITH_DRIVER_TERMS: 'with-driver/terms',
} as const;

export type VehicleManageSection =
  (typeof VEHICLE_MANAGE_SECTION)[keyof typeof VEHICLE_MANAGE_SECTION];

/** Khoá nhãn trong `VehicleManage.nav` — union đóng, gõ sai là lỗi biên dịch. */
export type VehicleManageNavKey = Parameters<
  ReturnType<typeof useTranslations<'VehicleManage.nav'>>
>[0];

export interface VehicleManageNavItem {
  readonly section: VehicleManageSection;
  readonly labelKey: VehicleManageNavKey;
  readonly icon: IconName;
}

export interface VehicleManageNavGroup {
  readonly key: 'general' | 'selfDrive' | 'withDriver';
  readonly labelKey: VehicleManageNavKey;
  /** Nhóm gắn với một DỊCH VỤ của xe — có công tắc bật/tắt trên tiêu đề; `null` = nhóm chung. */
  readonly serviceType: ServiceType | null;
  readonly items: readonly VehicleManageNavItem[];
}

/**
 * Ba nhóm, đúng thứ tự và đúng nhãn của menu trái bên web (`vehicle-manage/navigation.ts`).
 *
 * Mục nào thuộc dịch vụ nào khai ở đây MỘT lần; màn con đọc `sectionServiceType()` để biết mình
 * có bị khoá khi dịch vụ tắt hay không.
 */
export const VEHICLE_MANAGE_NAV: readonly VehicleManageNavGroup[] = [
  {
    key: 'general',
    labelKey: 'general',
    serviceType: null,
    items: [
      {
        section: VEHICLE_MANAGE_SECTION.INFORMATION,
        labelKey: 'information',
        icon: 'car-outline',
      },
      { section: VEHICLE_MANAGE_SECTION.IMAGES, labelKey: 'images', icon: 'images-outline' },
      {
        section: VEHICLE_MANAGE_SECTION.DOCUMENTS,
        labelKey: 'documents',
        icon: 'document-text-outline',
      },
      {
        section: VEHICLE_MANAGE_SECTION.TRIP_HISTORY,
        labelKey: 'tripHistory',
        icon: 'time-outline',
      },
    ],
  },
  {
    key: 'selfDrive',
    labelKey: 'selfDrive',
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    items: [
      {
        section: VEHICLE_MANAGE_SECTION.SELF_DRIVE_PRICING,
        labelKey: 'selfDrivePricing',
        icon: 'cash-outline',
      },
      {
        section: VEHICLE_MANAGE_SECTION.SELF_DRIVE_OPTIMIZATION,
        labelKey: 'selfDriveOptimization',
        icon: 'flash-outline',
      },
      {
        section: VEHICLE_MANAGE_SECTION.SELF_DRIVE_DELIVERY,
        labelKey: 'selfDriveDelivery',
        icon: 'location-outline',
      },
      {
        section: VEHICLE_MANAGE_SECTION.SELF_DRIVE_HANDOVER_TIME,
        labelKey: 'selfDriveHandoverTime',
        icon: 'time-outline',
      },
      {
        section: VEHICLE_MANAGE_SECTION.SELF_DRIVE_TERMS,
        labelKey: 'selfDriveTerms',
        icon: 'shield-checkmark-outline',
      },
    ],
  },
  {
    key: 'withDriver',
    labelKey: 'withDriver',
    serviceType: SERVICE_TYPE.WITH_DRIVER,
    items: [
      {
        section: VEHICLE_MANAGE_SECTION.WITH_DRIVER_PRICING,
        labelKey: 'withDriverPricing',
        icon: 'cash-outline',
      },
      {
        section: VEHICLE_MANAGE_SECTION.WITH_DRIVER_OPTIMIZATION,
        labelKey: 'withDriverOptimization',
        icon: 'flash-outline',
      },
      {
        section: VEHICLE_MANAGE_SECTION.WITH_DRIVER_SURCHARGES,
        labelKey: 'withDriverSurcharges',
        icon: 'grid-outline',
      },
      {
        section: VEHICLE_MANAGE_SECTION.WITH_DRIVER_TERMS,
        labelKey: 'withDriverTerms',
        icon: 'shield-checkmark-outline',
      },
    ],
  },
];

/** Dịch vụ mà một mục thuộc về — `null` với nhóm Thông tin chung. */
export function sectionServiceType(section: VehicleManageSection): ServiceType | null {
  for (const group of VEHICLE_MANAGE_NAV) {
    if (group.items.some((item) => item.section === section)) return group.serviceType;
  }
  return null;
}
