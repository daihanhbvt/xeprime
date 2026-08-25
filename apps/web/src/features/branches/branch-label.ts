import type { Branch } from './types';

/**
 * Nhãn một dòng của chi nhánh: `Tên · Tỉnh`.
 *
 * Dùng chung cho bộ chọn ở form xe, bộ chọn ở thanh trên và thẻ xe — ba nơi từng có ba cách ghép
 * chuỗi khác nhau là ba cách để cùng một chi nhánh hiện ba kiểu tên.
 *
 * Chi nhánh chưa có tỉnh nói thẳng ra, vì đó là việc người dùng cần xử lý (xe của nó không lên
 * chợ được), không phải chi tiết để giấu đi.
 *
 * `noProvinceLabel` truyền vào chứ không gọi `t()` ở đây: file này là hàm thuần, dùng được cả
 * trong Server Component lẫn client, và nó không được biết `next-intl` tồn tại. Nơi gọi lấy
 * chuỗi từ `Branches.labels.noProvince`.
 */
export function branchLabel(
  branch: Pick<Branch, 'name' | 'provinceName'>,
  noProvinceLabel: string,
): string {
  return branch.provinceName
    ? `${branch.name} · ${branch.provinceName}`
    : `${branch.name} · ${noProvinceLabel}`;
}
