import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BOOKING_REQUEST_STATUS, type BookingRequestStatus } from '@xeprime/types';
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
  readonly labelKey: 'needsAction' | 'converted' | 'rejected' | 'cancelled' | 'expired' | 'all';
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
  const params = bookingRequestFiltersToParams(filters);

  return useQuery({
    queryKey: queryKeys.bookingRequests.list(params),
    queryFn: () => bookingRequestsApi.list(filters),
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
