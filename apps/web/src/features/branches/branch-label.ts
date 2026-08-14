import type { Branch } from './types';

/**
 * Nhãn một dòng của chi nhánh: `Tên · Tỉnh`.
 *
 * Dùng chung cho bộ chọn ở form xe, bộ chọn ở thanh trên và thẻ xe — ba nơi từng có ba cách ghép
 * chuỗi khác nhau là ba cách để cùng một chi nhánh hiện ba kiểu tên.
 *
 * Chi nhánh chưa có tỉnh nói thẳng ra, vì đó là việc người dùng cần xử lý (xe của nó không lên
 * chợ được), không phải chi tiết để giấu đi.
 */
export function branchLabel(branch: Pick<Branch, 'name' | 'provinceName'>): string {
  return branch.provinceName
    ? `${branch.name} · ${branch.provinceName}`
    : `${branch.name} · chưa có tỉnh/thành`;
}
