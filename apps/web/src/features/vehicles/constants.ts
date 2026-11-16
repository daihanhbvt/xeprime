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

/**
 * Đội xe DƯỚI số này dùng danh sách một xe một hàng (Figma `23655:36959`); từ số này trở lên là
 * hai thẻ một hàng (`23655:38521`). Chốt 16/11/2026 — bỏ lưới thẻ gọn và nút chuyển kiểu xem.
 *
 * Đếm TỔNG xe của gian hàng trong chi nhánh đang chọn (`fleet-summary`), KHÔNG theo các ô lọc
 * khác — gõ tìm kiếm hay lọc trạng thái không làm bố cục nhảy (chốt 03/11/2026).
 */
export const VEHICLE_LIST_PAIRS_FROM = 4;
