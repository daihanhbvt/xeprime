'use client';

import { useQuery } from '@tanstack/react-query';
import { BOOKING_REQUEST_STATUS } from '@xeprime/types';
import { useBranchScopeParams } from '@/features/branches/hooks/use-branch-scope';
import { queryKeys } from '@/services/query-keys';
import { fetchBookingRequests, filtersToParams } from '../api';

/**
 * Số yêu cầu đặt xe đang chờ gian hàng duyệt — nuôi huy hiệu trên menu điều hướng.
 *
 * Lấy `meta.total` của chính danh sách đã lọc `pending_host_approval` với `limit: 1`: backend
 * đếm ở SERVER nên con số đúng kể cả khi có hàng trăm yêu cầu, còn thân phản hồi chỉ mang một
 * bản ghi. Không cộng ở client và không tải cả trang inbox chỉ để hiện một con số.
 *
 * Theo scope chi nhánh đang chọn, giống hệt inbox — nếu không thì huy hiệu báo 5 trong khi
 * danh sách mở ra chỉ có 2.
 *
 * `enabled` để nơi gọi tắt hẳn query khi tài khoản không có `booking_requests.view` (tránh 403
 * lặp lại ở mọi trang) hoặc khi đang ở scope nền tảng.
 */
export function usePendingBookingRequestCount(enabled = true) {
  const branchScope = useBranchScopeParams();
  const filters = {
    status: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL,
    limit: 1,
    page: 1,
    ...branchScope,
  };

  return useQuery({
    queryKey: queryKeys.bookingRequests.list(filtersToParams(filters)),
    queryFn: async () => (await fetchBookingRequests(filters)).meta.total,
    enabled,
    // Yêu cầu mới tới bất cứ lúc nào, nhưng đây là con số phụ trợ: nhịp thưa và làm mới khi
    // người dùng quay lại tab là đủ, không cần poll dày như tin nhắn.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
