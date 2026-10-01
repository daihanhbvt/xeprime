import {
  CarOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  FileTextOutlined,
  HistoryOutlined,
  PictureOutlined,
  SafetyOutlined,
  TableOutlined,
} from '@ant-design/icons';
import type { ComponentType } from 'react';
import type { useTranslations } from 'next-intl';
import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';

import { VEHICLE_MANAGE_SECTION, type VehicleManageSection } from '@/constants/routes';

/**
 * Khoá nhãn trong `VehicleManage.menu` — CÙNG bộ nhãn với menu sửa xe ở cổng quản lý, để một mục
 * mang một tên ở cả hai khu. Union đóng lấy từ bó tiếng Việt, gõ sai là lỗi biên dịch.
 */
export type VehicleManageMenuKey = Parameters<
  ReturnType<typeof useTranslations<'VehicleManage.menu'>>
>[0];

export interface VehicleManageNavItem {
  readonly section: VehicleManageSection;
  readonly labelKey: VehicleManageMenuKey;
  readonly icon: ComponentType<{ className?: string }>;
}

export interface VehicleManageNavGroup {
  readonly key: 'info' | 'pricingHandover' | 'selfDrive' | 'withDriver' | 'longTerm';
  readonly labelKey: VehicleManageMenuKey;
  /** Nhóm gắn với một DỊCH VỤ của xe — có công tắc bật/tắt trên tiêu đề; `null` = nhóm chung. */
  readonly serviceType: ServiceType | null;
  readonly items: readonly VehicleManageNavItem[];
}

/**
 * Menu trái của không gian "Quản lý xe" ở khu tài khoản (30/09/2026) — BỐN nhóm, TÁM mục.
 *
 * Đây là menu của màn sửa xe ở cổng quản lý (`vehicle-edit-nav.ts`) BỎ phần nâng cao mà tuyến hoa
 * hồng không có (thuê dài hạn, nguồn xe & tài chính, bảo dưỡng & KM), cộng "Lịch sử chuyến" — thứ
 * cổng quản lý đã có ở Hồ sơ 360 và màn Đơn thuê lọc theo xe:
 *
 * | Nhóm | Mục |
 * | --- | --- |
 * | Thông tin xe | Thông tin xe & tiện ích · Hình ảnh · Giấy tờ xe · Lịch sử chuyến |
 * | Giá & giao nhận | Giá & chính sách · Thời gian giao nhận |
 * | Cho thuê tự lái [công tắc] | Nhận chuyến & thủ tục |
 * | Cho thuê có tài xế [công tắc] | Nhận chuyến & thủ tục · Phụ phí |
 * | Cho thuê dài hạn [công tắc] | — (giá tháng ở Giá & chính sách) |
 *
 * Mục nào thuộc dịch vụ nào khai ở đây MỘT lần; trang con dùng `sectionServiceType()` để biết mình
 * có bị khoá khi dịch vụ tắt hay không. Giá và giờ giao nhận áp cho CẢ chiếc xe, nên không khoá.
 */
export const VEHICLE_MANAGE_NAV: readonly VehicleManageNavGroup[] = [
  {
    key: 'info',
    labelKey: 'groups.info',
    serviceType: null,
    items: [
      {
        section: VEHICLE_MANAGE_SECTION.INFORMATION,
        labelKey: 'items.information',
        icon: CarOutlined,
      },
      { section: VEHICLE_MANAGE_SECTION.IMAGES, labelKey: 'items.images', icon: PictureOutlined },
      {
        section: VEHICLE_MANAGE_SECTION.DOCUMENTS,
        labelKey: 'items.documents',
        icon: FileTextOutlined,
      },
      {
        section: VEHICLE_MANAGE_SECTION.TRIP_HISTORY,
        labelKey: 'items.tripHistory',
        icon: HistoryOutlined,
      },
    ],
  },
  {
    key: 'pricingHandover',
    labelKey: 'groups.pricingHandover',
    serviceType: null,
    items: [
      { section: VEHICLE_MANAGE_SECTION.PRICING, labelKey: 'items.pricing', icon: DollarOutlined },
      {
        section: VEHICLE_MANAGE_SECTION.HANDOVER_TIME,
        labelKey: 'items.handoverTime',
        icon: ClockCircleOutlined,
      },
    ],
  },
  {
    key: 'selfDrive',
    labelKey: 'groups.selfDrive',
    serviceType: SERVICE_TYPE.SELF_DRIVE,
    items: [
      {
        section: VEHICLE_MANAGE_SECTION.SELF_DRIVE_OPTIMIZATION,
        labelKey: 'items.bookingTerms',
        icon: SafetyOutlined,
      },
    ],
  },
  {
    key: 'withDriver',
    labelKey: 'groups.withDriver',
    serviceType: SERVICE_TYPE.WITH_DRIVER,
    items: [
      {
        section: VEHICLE_MANAGE_SECTION.WITH_DRIVER_OPTIMIZATION,
        labelKey: 'items.bookingTerms',
        icon: SafetyOutlined,
      },
      {
        section: VEHICLE_MANAGE_SECTION.WITH_DRIVER_SURCHARGES,
        labelKey: 'items.surcharges',
        icon: TableOutlined,
      },
    ],
  },
  /*
   * Thuê dài hạn (30/09/2026) — backend nhận `long_term` ở CẢ hai tuyến, menu chủ xe chỉ thiếu vì
   * mockup 08/09 không vẽ. Không có thiết lập vận hành riêng: nhóm chỉ mang công tắc, giá tháng
   * nằm ở 'Giá & chính sách' (sidebar gắn lời nhắc dẫn tới đó).
   */
  {
    key: 'longTerm',
    labelKey: 'groups.longTerm',
    serviceType: SERVICE_TYPE.LONG_TERM,
    items: [],
  },
];

/** Dịch vụ mà một mục thuộc về — `null` với nhóm chung. */
export function sectionServiceType(section: VehicleManageSection): ServiceType | null {
  for (const group of VEHICLE_MANAGE_NAV) {
    if (group.items.some((item) => item.section === section)) return group.serviceType;
  }
  return null;
}

/** Khoá nhãn của MỘT mục — breadcrumb đọc nó để nói đúng tên mục đang mở. */
export function sectionLabelKeyOf(section: VehicleManageSection): VehicleManageMenuKey | null {
  for (const group of VEHICLE_MANAGE_NAV) {
    const item = group.items.find((candidate) => candidate.section === section);
    if (item) return item.labelKey;
  }
  return null;
}
