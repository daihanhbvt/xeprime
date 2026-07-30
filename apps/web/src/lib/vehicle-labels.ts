import { FUEL_TYPE_LABEL } from '@xeprime/types';

/**
 * Nhãn nhiên liệu — key chuẩn từ `FUEL_TYPE_LABEL` (@xeprime/types); dữ liệu cũ có thể chứa
 * key lạ thì hiển thị nguyên văn thay vì vỡ. Dùng chung cho card + trang chi tiết.
 */
export function fuelLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return (FUEL_TYPE_LABEL as Record<string, string>)[key] ?? key;
}
