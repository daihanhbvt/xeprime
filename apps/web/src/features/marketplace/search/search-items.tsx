import { CarOutlined, IdcardOutlined, ScheduleOutlined } from '@ant-design/icons';
import {
  SERVICE_TYPE,
  VEHICLE_TYPE_LABEL,
  VEHICLE_TYPE_VALUES,
  vehicleServiceTypesFor,
  type ServiceType,
  type VehicleType,
} from '@xeprime/types';
import { VEHICLE_TYPE_ICON } from '@/components/data-display/VehicleTypeIcon';
import type { DomainLabel } from '@/i18n/domain';
import type { ServiceLabelKey } from '@/i18n/keys';
import { SERVICE_TABS } from '../constants';
import type { SegmentedTabItem } from './SegmentedTabs';

/**
 * Hai tầng lựa chọn của thẻ tìm kiếm, dựng MỘT lần cho cả hero lẫn thanh thu gọn.
 *
 * Hero và thanh thu gọn đọc cùng một trạng thái; nếu mỗi bên tự map ra danh sách nút thì hai
 * bề mặt có thể trôi ra hai bộ nhãn (hoặc hai thứ tự) khác nhau mà không có gì chặn lại.
 *
 * Hai hàm này nhận HÀM DỊCH qua tham số thay vì gọi hook: chúng dựng dữ liệu, không render, và
 * nơi gọi đã memo hoá theo `vehicleType` — truyền vào giữ chúng thuần và test được.
 */

/**
 * Loại xe phục vụ được dịch vụ đang chọn. Biểu tượng lấy từ `VEHICLE_TYPE_ICON` — kho chỉ có MỘT
 * nơi vẽ ô tô và xe máy.
 *
 * Chiều ngược của {@link serviceItems}: xe máy không có "có tài xế" ({@link vehicleServiceTypesFor}),
 * nên đang ở dịch vụ đó thì lựa chọn "Xe máy" biến mất — chỉ còn "Ô tô". Hai chiều cùng đọc một
 * bảng nên không bao giờ dựng ra được một tổ hợp không tồn tại.
 */
export function vehicleItems(
  domainLabel: DomainLabel,
  serviceType?: ServiceType,
): ReadonlyArray<SegmentedTabItem<VehicleType>> {
  const values = serviceType
    ? VEHICLE_TYPE_VALUES.filter((value) => vehicleServiceTypesFor(value).includes(serviceType))
    : VEHICLE_TYPE_VALUES;
  return values.map((value) => {
    const IconComponent = VEHICLE_TYPE_ICON[value];
    return {
      value,
      label: domainLabel('vehicleType', value, VEHICLE_TYPE_LABEL[value]),
      icon: <IconComponent />,
    };
  });
}

/** Icon từng dịch vụ — ReactNode nên sống ở đây, không nhét vào `constants.ts`. */
const SERVICE_ICON: Readonly<Record<ServiceType, React.ReactNode>> = {
  [SERVICE_TYPE.SELF_DRIVE]: <CarOutlined />,
  [SERVICE_TYPE.WITH_DRIVER]: <IdcardOutlined />,
  [SERVICE_TYPE.LONG_TERM]: <ScheduleOutlined />,
};

/**
 * Dịch vụ khả dụng cho MỘT loại xe.
 *
 * Xe máy không có "có tài xế" ({@link vehicleServiceTypesFor}) nên tab đó biến mất hẳn thay vì
 * hiện rồi báo lỗi hoặc trả về danh sách rỗng. Thứ tự bám `SERVICE_TABS` để đổi loại xe không
 * làm các tab còn lại nhảy chỗ.
 *
 * `withIcons` là khác biệt DUY NHẤT giữa hai bề mặt: hero có chỗ cho icon, panel thu gọn thì
 * không — nhãn và thứ tự vẫn là một.
 */
export function serviceItems(
  vehicleType: VehicleType,
  withIcons: boolean,
  t: (key: ServiceLabelKey) => string,
): ReadonlyArray<SegmentedTabItem<ServiceType>> {
  const allowed = vehicleServiceTypesFor(vehicleType);
  return SERVICE_TABS.filter((tab) => allowed.includes(tab.key)).map((tab) => ({
    value: tab.key,
    label: t(tab.labelKey),
    shortLabel: t(tab.shortLabelKey),
    icon: withIcons ? SERVICE_ICON[tab.key] : undefined,
  }));
}
