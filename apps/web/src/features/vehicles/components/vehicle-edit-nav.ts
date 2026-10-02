import {
  CarOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  FileTextOutlined,
  PictureOutlined,
  SafetyOutlined,
  TableOutlined,
  ToolOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import type { useTranslations } from 'next-intl';
import { SERVICE_TYPE, type ServiceType } from '@xeprime/types';

import { VEHICLE_EDIT_TAB, type VehicleEditTab } from '@/constants/routes';
import type {
  VehicleSectionNavGroup,
  VehicleSectionNavItem,
} from '@/features/vehicle-manage/components/VehicleSectionNav';

/** Bộ dịch của `VehicleManage.menu` — nhãn của menu sửa xe. */
type MenuTranslator = ReturnType<typeof useTranslations<'VehicleManage.menu'>>;
type MenuKey = Parameters<MenuTranslator>[0];

export type EditNavItem = Omit<VehicleSectionNavItem, 'key'> & { key: VehicleEditTab };
export type EditNavGroup = Omit<VehicleSectionNavGroup, 'items'> & {
  items: EditNavItem[];
  /** Dịch vụ của nhóm — nhóm dịch vụ có công tắc bật/tắt trên tiêu đề; `null` = nhóm chung. */
  serviceType: ServiceType | null;
};

/**
 * MENU TRÁI của màn sửa xe ở cổng quản lý (30/09/2026) — MƯỜI mục, sáu nhóm:
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
 * Mọi khối của `develop` vẫn còn, cùng cách lưu:
 * - "Giá & chính sách" là MỘT màn, MỘT nút Lưu (`VehiclePricingWorkspace` chế độ `full`) — giá
 *   của mọi dịch vụ + nguồn chính sách + cọc · giao xe · km · quá giờ · ưu đãi.
 * - Năm khối của tab "Vận hành & điều kiện thuê" cũ (giao nhận · tối ưu × 2 · thủ tục × 2 · phụ
 *   phí) nay đứng dưới đúng dịch vụ của chúng; "Nhận chuyến & thủ tục" gom hai card (Tối ưu nhận
 *   chuyến, Thủ tục cho thuê), mỗi card vẫn tự lưu như cũ.
 * - KHÔNG có "Lịch sử chuyến": cổng quản lý đã có Hồ sơ 360 và màn Đơn thuê lọc theo xe.
 */
export function editNavGroups({
  t,
  enabled,
  services,
  moneyHidden,
}: {
  t: MenuTranslator;
  /** Mục có mặt với người này không — quyền ∧ cờ gói ∧ phiên hỗ trợ. */
  enabled: (tab: VehicleEditTab) => boolean;
  /** Dịch vụ chiếc xe đang phục vụ — nhóm của dịch vụ đã tắt vẫn hiện nhưng mờ đi. */
  services: readonly string[];
  /** Phiên hỗ trợ không mở khu TIỀN — phụ phí có tài xế (ADR 0050 §13). */
  moneyHidden: boolean;
}): EditNavGroup[] {
  const item = (
    key: VehicleEditTab,
    labelKey: MenuKey,
    icon: EditNavItem['icon'],
  ): EditNavItem => ({ key, label: t(labelKey), icon });
  const service = (
    key: string,
    labelKey: MenuKey,
    serviceType: ServiceType,
    items: EditNavItem[],
  ): EditNavGroup => ({
    key,
    label: t(labelKey),
    serviceType,
    dimmed: !services.includes(serviceType),
    items,
  });

  const groups: EditNavGroup[] = [
    {
      key: 'info',
      label: t('groups.info'),
      serviceType: null,
      items: [
        item(VEHICLE_EDIT_TAB.INFORMATION, 'items.information', CarOutlined),
        item(VEHICLE_EDIT_TAB.MEDIA, 'items.images', PictureOutlined),
        item(VEHICLE_EDIT_TAB.DOCUMENTS, 'items.documents', FileTextOutlined),
      ],
    },
    {
      /*
       * Giá và khung giờ giao nhận áp cho CẢ chiếc xe, mọi dịch vụ — nên chúng không nằm dưới
       * công tắc của một dịch vụ nào và không mờ đi khi một dịch vụ tắt.
       */
      key: 'pricingHandover',
      label: t('groups.pricingHandover'),
      serviceType: null,
      items: [
        item(VEHICLE_EDIT_TAB.PRICING, 'items.pricing', DollarOutlined),
        item(VEHICLE_EDIT_TAB.HANDOVER_TIME, 'items.handoverTime', ClockCircleOutlined),
      ],
    },
    service('selfDrive', 'groups.selfDrive', SERVICE_TYPE.SELF_DRIVE, [
      item(VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION, 'items.bookingTerms', SafetyOutlined),
    ]),
    service('withDriver', 'groups.withDriver', SERVICE_TYPE.WITH_DRIVER, [
      item(VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION, 'items.bookingTerms', SafetyOutlined),
      ...(moneyHidden
        ? []
        : [item(VEHICLE_EDIT_TAB.WITH_DRIVER_SURCHARGES, 'items.surcharges', TableOutlined)]),
    ]),
    // Dài hạn không có thiết lập vận hành nào — nhóm chỉ mang công tắc (nơi gọi gắn lời nhắc).
    service('longTerm', 'groups.longTerm', SERVICE_TYPE.LONG_TERM, []),
    {
      key: 'advanced',
      label: t('groups.advanced'),
      serviceType: null,
      items: [
        item(VEHICLE_EDIT_TAB.SOURCE, 'items.source', WalletOutlined),
        item(VEHICLE_EDIT_TAB.MAINTENANCE, 'items.maintenance', ToolOutlined),
      ],
    },
  ];

  // Lọc theo năng lực. Nhóm rỗng giữ lại NẾU là nhóm dịch vụ — nơi gọi quyết định nó có công
  // tắc hay không; không có công tắc thì `VehicleSectionNav` tự bỏ qua nhóm rỗng.
  return groups
    .map((group) => ({ ...group, items: group.items.filter((entry) => enabled(entry.key)) }))
    .filter((group) => group.items.length > 0 || group.serviceType !== null);
}

/**
 * Bí danh `?tab=` → mục thật. Link cũ (tab `operations` của develop, cảnh báo, Hồ sơ 360, route
 * `/optimization`) vẫn mở đúng chỗ; thủ tục thì mở mục "Nhận chuyến & thủ tục" của dịch vụ đó.
 */
const TAB_ALIAS: Partial<Record<VehicleEditTab, VehicleEditTab>> = {
  [VEHICLE_EDIT_TAB.OPERATIONS]: VEHICLE_EDIT_TAB.HANDOVER_TIME,
  [VEHICLE_EDIT_TAB.SELF_DRIVE_TERMS]: VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION,
  [VEHICLE_EDIT_TAB.WITH_DRIVER_TERMS]: VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION,
};

export function resolveEditTab(tab: VehicleEditTab): VehicleEditTab {
  return TAB_ALIAS[tab] ?? tab;
}

/** Mục dựng từ section của khu tài khoản thuộc khối VẬN HÀNH cũ — đòi `canOperate` trong phiên hỗ trợ. */
export const OPERATIONS_TABS: readonly VehicleEditTab[] = [
  VEHICLE_EDIT_TAB.HANDOVER_TIME,
  VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION,
  VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION,
  VEHICLE_EDIT_TAB.WITH_DRIVER_SURCHARGES,
];

const SERVICE_OF_TAB: Partial<Record<VehicleEditTab, ServiceType>> = {
  [VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION]: SERVICE_TYPE.SELF_DRIVE,
  [VEHICLE_EDIT_TAB.WITH_DRIVER_OPTIMIZATION]: SERVICE_TYPE.WITH_DRIVER,
  [VEHICLE_EDIT_TAB.WITH_DRIVER_SURCHARGES]: SERVICE_TYPE.WITH_DRIVER,
};

/** Dịch vụ mà một mục thuộc về — `null` với nhóm chung. Dịch vụ tắt thì mục thay bằng lời mời bật. */
export function editTabServiceType(tab: VehicleEditTab): ServiceType | null {
  return SERVICE_OF_TAB[tab] ?? null;
}
