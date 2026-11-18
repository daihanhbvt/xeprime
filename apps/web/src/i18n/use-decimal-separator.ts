'use client';

import { useLocale } from 'next-intl';

/**
 * Dấu thập phân của ô nhập số theo ngôn ngữ đang xem — `,` cho tiếng Việt (`4,5%`), `.` cho tiếng
 * Anh. Chỉ đổi cách HIỂN THỊ trong ô; giá trị trong form và trên dây vẫn là số / chuỗi dấu chấm.
 */
export function useDecimalSeparator(): string {
  return useLocale() === 'vi' ? ',' : '.';
}
