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
import { SERVICE_TABS } from '../constants';
import type { SegmentedTabItem } from './SegmentedTabs';

/**
 * Hai tầng lựa chọn của thẻ tìm kiếm, dựng MỘT lần cho cả hero lẫn thanh thu gọn.
 *
 * Hero và thanh thu gọn đọc cùng một trạng thái; nếu mỗi bên tự map ra danh sách nút thì hai
 * bề mặt có thể trôi ra hai bộ nhãn (hoặc hai thứ tự) khác nhau mà không có gì chặn lại.
 */

/** Loại xe. Biểu tượng lấy từ `VEHICLE_TYPE_ICON` — kho chỉ có MỘT nơi vẽ ô tô và xe máy. */
export const VEHICLE_ITEMS: ReadonlyArray<SegmentedTabItem<VehicleType>> = VEHICLE_TYPE_VALUES.map(
  (value) => {
    const IconComponent = VEHICLE_TYPE_ICON[value];
    return { value, label: VEHICLE_TYPE_LABEL[value], icon: <IconComponent /> };
  },
);

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
): ReadonlyArray<SegmentedTabItem<ServiceType>> {
  const allowed = vehicleServiceTypesFor(vehicleType);
  return SERVICE_TABS.filter((tab) => allowed.includes(tab.key)).map((tab) => ({
    value: tab.key,
    label: tab.label,
    shortLabel: tab.shortLabel,
    icon: withIcons ? SERVICE_ICON[tab.key] : undefined,
  }));
}
