import type { PaginationMeta } from '@xeprime/types';

/**
 * Số thứ tự (cột "STT") của dòng thứ `index` trên trang hiện tại — đếm TIẾP qua các trang, không
 * bắt đầu lại từ 1 ở mỗi trang: trang 2 của bảng 10 dòng mở đầu bằng 11.
 */
export function rowNumberOf(meta: Pick<PaginationMeta, 'page' | 'limit'>, index: number): number {
  return (meta.page - 1) * meta.limit + index + 1;
}
