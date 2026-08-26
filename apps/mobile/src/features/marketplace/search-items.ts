import { SERVICE_TYPE, VEHICLE_TYPE, type ServiceType, type VehicleType } from '@xeprime/types';
import type { IconName } from '@/components/ui/Chip';

/**
 * Biểu tượng và khoá nhãn cho hai tầng lựa chọn của thẻ tìm kiếm — bản native của
 * `search/search-items.tsx` bên web.
 *
 * Sống ở một chỗ vì có BA bề mặt đọc chúng: thẻ ở hero, thanh thu gọn, và chip nhanh ở màn kết
 * quả. Mỗi nơi tự khai một map ba phần tử thì thêm dịch vụ thứ tư là ba nơi lệch nhau, mà lệch
 * kiểu đó không có gì báo — chỉ là một bề mặt thiếu mất một lựa chọn.
 *
 * Thứ tự dịch vụ và luật "xe máy không có tài xế" KHÔNG ở đây: chúng thuộc
 * `serviceTypesFor()` của `@xeprime/api-client`, dùng chung với web và backend.
 */

export const VEHICLE_ICON: Record<VehicleType, IconName> = {
  [VEHICLE_TYPE.CAR]: 'car-sport',
  [VEHICLE_TYPE.MOTORBIKE]: 'bicycle',
};

export const SERVICE_ICON: Record<ServiceType, IconName> = {
  [SERVICE_TYPE.SELF_DRIVE]: 'key-outline',
  [SERVICE_TYPE.WITH_DRIVER]: 'person-outline',
  [SERVICE_TYPE.LONG_TERM]: 'calendar-outline',
};

/**
 * Nhãn NGẮN cho cả ba bề mặt native.
 *
 * Web dùng nhãn dài ở hero và nhãn ngắn ở thanh thu gọn vì hero desktop có chỗ; bề ngang điện
 * thoại thì không, nên native dùng nhãn ngắn ở mọi nơi. Đây là khác biệt TRÌNH BÀY, nội dung
 * vẫn là cùng bộ chuỗi trong `HomeSearch.service`.
 */
export const SERVICE_LABEL_KEY: Record<ServiceType, string> = {
  [SERVICE_TYPE.SELF_DRIVE]: 'selfDriveShort',
  [SERVICE_TYPE.WITH_DRIVER]: 'withDriverShort',
  [SERVICE_TYPE.LONG_TERM]: 'longTermShort',
};
