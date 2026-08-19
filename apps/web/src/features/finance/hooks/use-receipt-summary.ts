'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchReceiptSummary, summaryParams } from '../api';
import type { ReceiptFilters } from '../types';

/**
 * Thẻ tổng của ĐÚNG bộ lọc đang xem.
 *
 * `keepPreviousData` để đổi trang không làm bốn thẻ nháy về skeleton — con số không đổi khi sang
 * trang (key đã bỏ `page`/`limit`), nhưng lần đổi filter kế tiếp vẫn phải giữ số cũ trong lúc tải
 * thay vì nhảy về 0 đ rồi nhảy lại.
 */
export function useReceiptSummary(filters: ReceiptFilters) {
  return useQuery({
    queryKey: queryKeys.receipts.summary(summaryParams(filters)),
    queryFn: () => fetchReceiptSummary(filters),
    placeholderData: keepPreviousData,
  });
}
