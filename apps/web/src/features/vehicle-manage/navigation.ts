import {
  CarOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  HistoryOutlined,
  PictureOutlined,
  SafetyOutlined,
  TableOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { ComponentType } from 'react';
import type { useTranslations } from 'next-intl';
import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';

import { VEHICLE_MANAGE_SECTION, type VehicleManageSection } from '@/constants/routes';

/** Khoá nhãn trong `VehicleManage.nav` — union đóng lấy từ bó tiếng Việt, gõ sai là lỗi biên dịch. */
export type VehicleManageNavKey = Parameters<
  ReturnType<typeof useTranslations<'VehicleManage.nav'>>
>[0];

export interface VehicleManageNavItem {
  readonly section: VehicleManageSection;
  readonly labelKey: VehicleManageNavKey;
  readonly icon: ComponentType<{ className?: string }>;
}

export interface VehicleManageNavGroup {
  readonly key: 'general' | 'selfDrive' | 'withDriver';
  readonly labelKey: VehicleManageNavKey;
  /** Nhóm gắn với một DỊCH VỤ của xe — có công tắc bật/tắt trên tiêu đề; `null` = nhóm chung. */
  readonly serviceType: ServiceType | null;
  readonly items: readonly VehicleManageNavItem[];
}

/**
 * Menu trái của không gian "Quản lý xe" (mockup 08/09/2026) — ba nhóm, mục nào thuộc dịch vụ nào
 * khai ở đây MỘT lần; trang con dùng `sectionServiceType()` để biết mình có bị khoá khi dịch vụ
 * tắt hay không. Không có mục "Tiện ích bổ sung": phụ phí mặc định đã nằm ở "Phụ phí".
 */
export const VEHICLE_MANAGE_NAV: readonly VehicleManageNavGroup[] = [
  {
    key: 'general',
    labelKey: 'general',
    serviceType: null,
    items: [
      { section: VEHICLE_MANAGE_SECTION.INFORMATION, labelKey: 'information', icon: CarOutlined },
      { section: VEHICLE_MANAGE_SECTION.IMAGES, labelKey: 'images', icon: PictureOutlined },
      { section: VEHICLE_MANAGE_SECTION.DOCUMENTS, labelKey: 'documents', icon: FileTextOutlined },
      {
        section: VEHICLE_MANAGE_SECTION.TRIP_HISTORY,
        labelKey: 'tripHistory',
        icon: HistoryOutlined,
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
        icon: DollarOutlined,
      },
      {
        section: VEHICLE_MANAGE_SECTION.SELF_DRIVE_OPTIMIZATION,
        labelKey: 'selfDriveOptimization',
        icon: ThunderboltOutlined,
      },
      {
        section: VEHICLE_MANAGE_SECTION.SELF_DRIVE_DELIVERY,
        labelKey: 'selfDriveDelivery',
        icon: EnvironmentOutlined,
      },
      {
        section: VEHICLE_MANAGE_SECTION.SELF_DRIVE_HANDOVER_TIME,
        labelKey: 'selfDriveHandoverTime',
        icon: ClockCircleOutlined,
      },
      {
        section: VEHICLE_MANAGE_SECTION.SELF_DRIVE_TERMS,
        labelKey: 'selfDriveTerms',
        icon: SafetyOutlined,
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
        icon: DollarOutlined,
      },
      {
        section: VEHICLE_MANAGE_SECTION.WITH_DRIVER_OPTIMIZATION,
        labelKey: 'withDriverOptimization',
        icon: ThunderboltOutlined,
      },
      {
        section: VEHICLE_MANAGE_SECTION.WITH_DRIVER_SURCHARGES,
        labelKey: 'withDriverSurcharges',
        icon: TableOutlined,
      },
      {
        section: VEHICLE_MANAGE_SECTION.WITH_DRIVER_TERMS,
        labelKey: 'withDriverTerms',
        icon: SafetyOutlined,
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
