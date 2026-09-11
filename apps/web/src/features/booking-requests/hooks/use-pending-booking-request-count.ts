'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useBadgeRealtime } from '@/features/badges/BadgeRealtimeProvider';
import { useOnBadgeChange } from '@/features/badges/hooks/use-on-badge-change';
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
  const { counts, live } = useBadgeRealtime();
  const queryClient = useQueryClient();

  /*
   * Yêu cầu thuê mới LUÔN đi kèm một thông báo cho thành viên gian hàng, nên `notificationsUnread`
   * đổi là tín hiệu đủ tốt để tải lại con số này ngay — thay vì đợi hết nhịp một phút.
   *
   * Vì sao không đưa thẳng con số này vào bản chiếu huy hiệu: nó bị THU HẸP theo chi nhánh đang
   * chọn, một trạng thái chỉ tồn tại ở client (ADR 0034 điều 2). Một con số toàn tài khoản sẽ nói
   * khác danh sách mà người dùng mở ra. Nên bản chiếu chỉ làm TÍN HIỆU, còn con số vẫn đến từ
   * query đúng scope.
   *
   * Invalidate cả nhánh `bookingRequests`: hộp thư yêu cầu cũng cần nhảy theo, không riêng huy hiệu.
   */
  useOnBadgeChange(counts.notificationsUnread, () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookingRequests.all });
  });
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
    // Nghe được bản chiếu thì nhịp này chỉ còn là LƯỚI AN TOÀN — tín hiệu ở trên đã lo phần
    // "nhảy số ngay". Không nghe được thì giữ nhịp một phút như trước.
    refetchInterval: live ? 180_000 : 60_000,
    refetchOnWindowFocus: true,
  });
}
