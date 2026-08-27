import type { VehicleSort } from './types';

/**
 * Thứ tự sắp xếp danh sách xe — GIÁ TRỊ, không nhãn.
 *
 * Nhãn của từng lựa chọn nằm ở `Vehicles.list.sort.*` và được dựng lúc chạy bởi
 * `useVehicleOptions()`: một hằng ở module scope chỉ tính một lần cho cả tiến trình, nên nhãn
 * nằm trong đó sẽ dính lại ngôn ngữ của request đầu tiên (ADR 0012).
 *
 * Đây cũng là lý do bốn danh sách option còn lại (loại xe, dịch vụ, vận hành, công khai) đã rời
 * khỏi file này: chúng sinh từ `*_VALUES` của `@xeprime/types` + `Domain.*` trong hook đó.
 */
export const VEHICLE_SORT_VALUES: readonly VehicleSort[] = [
  'newest',
  'name_asc',
  'code_asc',
  'price_asc',
  'price_desc',
];
