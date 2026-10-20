import type { ReactNode } from 'react';

/**
 * Layout của nhánh `/trips`.
 *
 * Vỏ `AccountShell` (menu trái) áp dụng cho trang danh sách `/trips` (trong `trips/page.tsx`).
 * Chi tiết chuyến `/trips/[id]` hiển thị độc lập không có menu trái theo đúng chuẩn thiết kế Figma v2.
 */
export default function TripsLayout({ children }: { children: ReactNode }) {
  return children;
}
