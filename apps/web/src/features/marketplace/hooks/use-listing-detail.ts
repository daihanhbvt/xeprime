'use client';

import { useQuery } from '@tanstack/react-query';
import { ApiClientError } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import { fetchListingDetailClient } from '../api';

/** Tin đăng không đổi theo phút: khách vừa đứng ở trang xe thì nó đã nằm sẵn trong cache. */
const LISTING_DETAIL_STALE_MS = 5 * 60_000;

/**
 * Tin đăng công khai của MỘT xe, phía client — MỘT khoá cache (`marketplace.listing`) cho luồng đặt
 * xe, đặt xe hộ của gian hàng, thẻ ngữ cảnh trong ô chat và thẻ chuyến của chuyến chờ duyệt.
 *
 * Bốn nơi cùng đọc một thứ thì phải cùng luật: trước đây mỗi nơi tự khai `useQuery` với `staleTime`
 * và `retry` khác nhau, nên cùng một tin đăng hết hạn ở hai nhịp và một lần 404 bị hỏi lại ba lần ở
 * nơi này, một lần ở nơi kia.
 *
 * Thử lại CHỈ khi lỗi đáng thử (mạng, 5xx — tối đa hai lần). 404 là trạng thái HỢP LỆ — tin đã ẩn/gỡ,
 * xe nội bộ — và mọi nơi gọi đều có phần dự phòng: hỏi lại chỉ làm phần dự phòng đến muộn. Lỗi không
 * đi qua tầng HTTP thì không đoán, cũng không thử lại.
 */
export function useListingDetail(vehicleId: string | null, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.marketplace.listing(vehicleId ?? ''),
    queryFn: () => fetchListingDetailClient(vehicleId as string),
    enabled: Boolean(vehicleId) && (options.enabled ?? true),
    staleTime: LISTING_DETAIL_STALE_MS,
    retry: (failureCount, error) =>
      error instanceof ApiClientError &&
      (error.status === 0 || error.status >= 500) &&
      failureCount < 2,
  });
}
