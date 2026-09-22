'use client';

import { useQuery } from '@tanstack/react-query';
import { useBadgeRealtime } from '@/features/badges/BadgeRealtimeProvider';
import { useBranchScopeParams } from '@/features/branches/hooks/use-branch-scope';
import { queryKeys } from '@/services/query-keys';
import { fetchBookingRequests, filtersToParams } from '../api';
import { BOOKING_REQUEST_NEEDS_ACTION_STATUSES } from '../constants';

/**
 * Số yêu cầu đặt xe đang chờ gian hàng duyệt — nuôi huy hiệu trên menu điều hướng.
 *
 * Lấy `meta.total` của chính danh sách đã lọc theo HAI trạng thái của tab gộp "Cần xử lý"
 * (`pending_host_approval` + `hold_paid` LEGACY, xem `constants.ts`) với `limit: 1`: backend đếm ở SERVER nên
 * con số đúng kể cả khi có hàng trăm yêu cầu, còn thân phản hồi chỉ mang một bản ghi. Không
 * cộng ở client và không tải cả trang inbox chỉ để hiện một con số.
 *
 * PHẢI cùng bộ trạng thái với tab "Cần xử lý" — trước đây chỉ đếm `pending_host_approval` nên
 * huy hiệu và tab có thể nói hai con số khác nhau (yêu cầu đã cọc chờ duyệt không được đếm).
 *
 * Theo scope chi nhánh đang chọn, giống hệt inbox — nếu không thì huy hiệu báo 5 trong khi
 * danh sách mở ra chỉ có 2.
 *
 * `enabled` để nơi gọi tắt hẳn query khi tài khoản không có `booking_requests.view` (tránh 403
 * lặp lại ở mọi trang) hoặc khi đang ở scope nền tảng.
 */
export function usePendingBookingRequestCount(enabled = true) {
  const branchScope = useBranchScopeParams();
  const { live } = useBadgeRealtime();

  /*
   * Vì sao không đưa thẳng con số này vào bản chiếu huy hiệu: nó bị THU HẸP theo chi nhánh đang
   * chọn, một trạng thái chỉ tồn tại ở client (ADR 0034 điều 2). Một con số toàn tài khoản sẽ nói
   * khác danh sách mà người dùng mở ra. Nên bản chiếu chỉ làm TÍN HIỆU, còn con số vẫn đến từ
   * query đúng scope.
   *
   * Việc nghe tín hiệu đó nằm ở `BadgeRealtimeProvider`, KHÔNG ở đây: nhánh `bookingRequests`
   * là một trong những nhánh `notification-refresh.ts` làm mới, và con số này đọc từ chính
   * nhánh đó nên nó tự nhảy theo. Giữ thêm một lệnh invalidate ở đây là hai chỗ cùng quyết định
   * một việc.
   */
  const filters = {
    status: BOOKING_REQUEST_NEEDS_ACTION_STATUSES.join(','),
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
