import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BOOKING_REQUEST_STATUS, type BookingRequestStatus } from '@xeprime/types';
import { useBranchScopeParams } from '@/features/branches/hooks/use-branch-scope';
import { keepPageData } from '@/queries/keep-page-data';
import { queryKeys } from '@/queries/query-keys';
import type { StatusCounts } from './use-status-counts';
import {
  bookingRequestFiltersToParams,
  bookingRequestsApi,
  BOOKING_REQUEST_STATUS_ALL,
  type ApproveBookingRequestInput,
  type BookingRequestFilters,
  type BookingRequestListResult,
} from '../api';

export interface RequestInboxTab {
  /** Giá trị đi vào `?status=`. */
  readonly value: string;
  /** Khoá message trong namespace `BookingRequests.tabs` — DÙNG CHUNG với web. */
  readonly labelKey:
    | 'needsAction'
    | 'paidNeedsAction'
    | 'converted'
    | 'rejected'
    | 'cancelled'
    | 'expired'
    | 'all';
}

/**
 * Tab của hộp thư — theo VIỆC PHẢI LÀM. Gương `BOOKING_REQUEST_TABS` của
 * `apps/web/src/features/booking-requests/constants.ts`.
 *
 * `approved_by_host` không có tab riêng: duyệt tạo đơn + giữ chỗ lịch trong cùng một transaction
 * nên trạng thái đi thẳng sang `converted_to_booking`, tab cho nó sẽ luôn rỗng (vẫn đếm ở "Tất cả").
 *
 * `labelKey` riêng thay vì nhãn trạng thái: nhãn tab phải đọc lướt được ở bề ngang hẹp
 * ("Cần xử lý", không phải "Chờ gian hàng duyệt").
 */
export const REQUEST_INBOX_TABS: readonly RequestInboxTab[] = [
  { value: BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL, labelKey: 'needsAction' },
  /*
   * ĐÃ CỌC, CHỜ DUYỆT (ADR 0039) — tab riêng vì đây là việc khẩn nhất trong cả hộp thư: tiền của
   * khách đang nằm ở XePrime, chỗ xe đang bị giữ, và hết hạn phản hồi là hệ thống tự hoàn rồi huỷ
   * chuyến. Để nó lẫn trong "Tất cả" nghĩa là người trực phải tự đi tìm.
   */
  { value: BOOKING_REQUEST_STATUS.HOLD_PAID, labelKey: 'paidNeedsAction' },
  { value: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING, labelKey: 'converted' },
  { value: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST, labelKey: 'rejected' },
  { value: BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER, labelKey: 'cancelled' },
  { value: BOOKING_REQUEST_STATUS.EXPIRED, labelKey: 'expired' },
  { value: BOOKING_REQUEST_STATUS_ALL, labelKey: 'all' },
];

/** Tab mặc định: việc cần làm ngay. */
export const DEFAULT_REQUEST_TAB: string = BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL;

/**
 * MỘT trang hộp thư yêu cầu.
 *
 * Trả nguyên `BookingRequestListResult` để giữ `meta.statusCounts`: đếm không suy được từ trang
 * đang mở vì trang chỉ có tối đa `limit` bản ghi.
 *
 * Khoá CÓ `page` — `keepPageData` giữ dữ liệu cũ khi đổi trang nhưng không khi đổi tab/bộ lọc.
 */
export function useBookingRequestsPage(filters: BookingRequestFilters) {
  /*
   * Scope chi nhánh ghép ở đây, cùng chỗ web ghép — và cùng chỗ huy hiệu "chờ duyệt" đọc
   * (`useManageNavBadges`). Hai bên lệch nhau là huy hiệu báo 5 trong khi hộp thư mở ra có 2.
   */
  const branchScope = useBranchScopeParams();
  const scoped = { ...filters, ...branchScope };
  const params = bookingRequestFiltersToParams(scoped);

  /*
   * KHÔNG poll màn này — cố ý, và giống web.
   *
   * Bản web (`useBookingRequests`) không khai `refetchInterval` lẫn `refetchOnWindowFocus`:
   * thứ theo dõi "có yêu cầu mới chưa" là HUY HIỆU trên menu (`usePendingBookingRequestCount`,
   * nhịp 60s), còn danh sách chỉ nạp lại khi người dùng mở màn hoặc tự kéo làm mới. Cho màn này
   * một nhịp poll riêng là hai client đọc ra hai sản phẩm khác nhau — và là một lượt gọi API
   * mỗi phút cho dữ liệu đã có huy hiệu canh hộ.
   */
  return useQuery({
    queryKey: queryKeys.bookingRequests.list(params),
    queryFn: () => bookingRequestsApi.list(scoped),
    placeholderData: keepPageData<BookingRequestListResult>(params),
  });
}

/**
 * Duyệt yêu cầu — tạo đơn + giữ chỗ lịch trong MỘT transaction ở server.
 *
 * Phải invalidate cả `bookings` và `calendar`, không chỉ `bookingRequests`: chiếc xe vừa bị chiếm
 * chỗ, bỏ sót `calendar` là lịch còn hiện một ô trống vừa được bán mất.
 */
export function useApproveBookingRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { id: string; body?: ApproveBookingRequestInput }) =>
      bookingRequestsApi.approve(input.id, input.body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookingRequests.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      /*
       * Danh sách CHUYẾN cũng đổi: tab 'Chuyến của tôi' trộn cả chuyến mình cho thuê, và từ đợt
       * này hai quyết định duyệt/từ chối bấm được ngay trên thẻ ở đó. Thiếu dòng này, thẻ vừa
       * duyệt vẫn bày hai nút cho tới khi người dùng tự kéo làm mới.
       */
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
    },
  });
}

export function useRejectBookingRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { id: string; reason: string }) =>
      bookingRequestsApi.reject(input.id, input.reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookingRequests.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
    },
  });
}

/**
 * Số yêu cầu của một trạng thái.
 *
 * Nhận thẳng MẢNG ĐẾM chứ không nhận `result`: nguồn của nó là `useStickyStatusCounts`, không
 * phải truy vấn đang chạy — nhận `result` thì mỗi lần đổi tab cả dải tab lại về 0 một nhịp.
 */
export function statusCountOf(counts: StatusCounts, status: string): number {
  if (status === BOOKING_REQUEST_STATUS_ALL) {
    return counts.reduce((sum, row) => sum + row.count, 0);
  }
  return counts.find((row) => row.status === (status as BookingRequestStatus))?.count ?? 0;
}
