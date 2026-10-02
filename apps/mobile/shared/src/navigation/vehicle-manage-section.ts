import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';
import type { useTranslations } from 'use-intl';
import type { IconName } from '@/components/ui/Chip';

/**
 * Chín mục của không gian "Quản lý xe" — GIÁ TRỊ đường dẫn, cùng bộ với
 * `apps/web/src/constants/routes.ts` (`VEHICLE_MANAGE_SECTION`, 30/09/2026).
 *
 * Chép chứ không đưa vào package dùng chung: bên web đây là đoạn đường dẫn của Next, bên app là
 * đoạn đường dẫn của expo-router — hai vai của cùng một từ vựng. Phần THẬT SỰ phải khớp là chuỗi,
 * nên một liên kết sâu do web hay thông báo đẩy sinh ra vẫn tới đúng chỗ.
 *
 * Đường dẫn CŨ (giá tự lái/có tài xế, giao xe tận nơi, thời gian giao nhận tự lái, thủ tục) không
 * còn là mục: route của chúng chỉ còn chuyển hướng sang mục mới (như trang redirect bên web).
 */
export const VEHICLE_MANAGE_SECTION = {
  INFORMATION: 'information',
  IMAGES: 'images',
  DOCUMENTS: 'documents',
  TRIP_HISTORY: 'trip-history',
  /** Giá & chính sách — giá mọi dịch vụ + cọc · giao xe · km, một nút Lưu. */
  PRICING: 'pricing',
  /** Thời gian giao nhận — áp cho CẢ chiếc xe, không thuộc dịch vụ nào. */
  HANDOVER_TIME: 'handover-time',
  /** "Nhận chuyến & thủ tục" của tự lái (tối ưu nhận chuyến + thủ tục cho thuê). */
  SELF_DRIVE_OPTIMIZATION: 'self-drive/optimization',
  /** "Nhận chuyến & thủ tục" của có tài xế. */
  WITH_DRIVER_OPTIMIZATION: 'with-driver/optimization',
  WITH_DRIVER_SURCHARGES: 'with-driver/surcharges',
} as const;

export type VehicleManageSection =
  (typeof VEHICLE_MANAGE_SECTION)[keyof typeof VEHICLE_MANAGE_SECTION];

/**
 * Neo của card "Thủ tục cho thuê" trong mục "Nhận chuyến & thủ tục" — cùng giá trị với web
 * `RENTAL_TERMS_ANCHOR`. Native không có `#hash`: route cũ truyền nó qua tham số `anchor`.
 */
export const RENTAL_TERMS_ANCHOR = 'rental-terms';

/**
 * Khoá nhãn trong `VehicleManage.menu` — CÙNG bộ nhãn với menu bên web. Union đóng, gõ sai là lỗi
 * biên dịch.
 */
export type VehicleManageMenuKey = Parameters<
  ReturnType<typeof useTranslations<'VehicleManage.menu'>>
>[0];

export interface VehicleManageNavItem {
  readonly section: VehicleManageSection;
  readonly labelKey: VehicleManageMenuKey;
  readonly icon: IconName;
}

export interface VehicleManageNavGroup {
  readonly key: 'info' | 'pricingHandover' | 'selfDrive' | 'withDriver' | 'longTerm';
  readonly labelKey: VehicleManageMenuKey;
  /** Nhóm gắn với một DỊCH VỤ của xe — có công tắc bật/tắt trên tiêu đề; `null` = nhóm chung. */
  readonly serviceType: ServiceType | null;
  readonly items: readonly VehicleManageNavItem[];
}

/**
 * Năm nhóm, đúng thứ tự và đúng nhãn của menu trái bên web (`vehicle-manage/navigation.ts`):
 *
 * | Nhóm | Mục |
 * | --- | --- |
 * | Thông tin xe | Thông tin xe & tiện ích · Hình ảnh · Giấy tờ xe · Lịch sử chuyến |
 * | Giá & giao nhận | Giá & chính sách · Thời gian giao nhận |
 * | Cho thuê tự lái [công tắc] | Nhận chuyến & thủ tục |
 * | Cho thuê có tài xế [công tắc] | Nhận chuyến & thủ tục · Phụ phí |
 * | Cho thuê dài hạn [công tắc] | — (giá tháng ở Giá & chính sách) |
 *
 * Giá và giờ giao nhận áp cho CẢ chiếc xe, nên không khoá theo dịch vụ.
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
        icon: 'car-outline',
      },
      { section: VEHICLE_MANAGE_SECTION.IMAGES, labelKey: 'items.images', icon: 'images-outline' },
      {
        section: VEHICLE_MANAGE_SECTION.DOCUMENTS,
        labelKey: 'items.documents',
        icon: 'document-text-outline',
      },
      {
        section: VEHICLE_MANAGE_SECTION.TRIP_HISTORY,
        labelKey: 'items.tripHistory',
        icon: 'time-outline',
      },
    ],
  },
  {
    key: 'pricingHandover',
    labelKey: 'groups.pricingHandover',
    serviceType: null,
    items: [
      { section: VEHICLE_MANAGE_SECTION.PRICING, labelKey: 'items.pricing', icon: 'cash-outline' },
      {
        section: VEHICLE_MANAGE_SECTION.HANDOVER_TIME,
        labelKey: 'items.handoverTime',
        icon: 'alarm-outline',
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
        icon: 'shield-checkmark-outline',
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
        icon: 'shield-checkmark-outline',
      },
      {
        section: VEHICLE_MANAGE_SECTION.WITH_DRIVER_SURCHARGES,
        labelKey: 'items.surcharges',
        icon: 'grid-outline',
      },
    ],
  },
  /*
   * Thuê dài hạn — nhóm chỉ mang công tắc; giá tháng nằm ở 'Giá & chính sách' (mục lục gắn lời
   * nhắc `menu.longTermNote` dẫn tới đó, như sidebar web).
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

/** Khoá nhãn của MỘT mục — tiêu đề màn con đọc nó để nói đúng tên mục đang mở. */
export function sectionLabelKeyOf(section: VehicleManageSection): VehicleManageMenuKey | null {
  for (const group of VEHICLE_MANAGE_NAV) {
    const item = group.items.find((candidate) => candidate.section === section);
    if (item) return item.labelKey;
  }
  return null;
}
