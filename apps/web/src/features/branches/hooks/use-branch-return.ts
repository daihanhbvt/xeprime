'use client';

import { useSearchParams } from 'next/navigation';
import { withBranchParam } from '../branch-link';

/**
 * Dựng link "Quay lại" của một màn CHI TIẾT sao cho danh sách mở ra đúng chi nhánh người dùng
 * đang lọc lúc rời đi — ADR 0052. Đọc mẩu đường về mà `withBranchReturn` gắn vào URL.
 *
 * Không có mẩu đó (mở thẳng bằng link/bookmark) thì trả lại đúng `listHref` trần: đường dẫn nói
 * gì thì thấy nấy, không đoán hộ.
 */
export function useBranchReturnHref(listHref: string): string {
  const branchId = useSearchParams()?.get('branchId') ?? null;
  return withBranchParam(listHref, branchId);
}

/** Chi nhánh đang lọc, đọc từ URL — để gắn tiếp vào link rời khỏi danh sách. */
export function useBranchCrumb(): string | null {
  return useSearchParams()?.get('branchId') ?? null;
}
