import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BOOKING_REQUEST_STATUS, type BookingRequestStatus } from '@xeprime/types';
import { useBranchScopeParams } from '@/features/branches/hooks/use-branch-scope';
import { keepPageData } from '@/queries/keep-page-data';
import { queryKeys } from '@/queries/query-keys';
import type { StatusCounts } from './use-status-counts';
import {
  bookingRequestFiltersToParams,
  bookingRequestsApi,
  BOOKING_REQUEST_NEEDS_ACTION_STATUSES,
  BOOKING_REQUEST_STATUS_ALL,
  BOOKING_REQUEST_TAB_NEEDS_ACTION,
  type ApproveBookingRequestInput,
  type BookingRequestFilters,
  type BookingRequestListResult,
} from '../api';

export interface RequestInboxTab {
  /** Giá trị đi vào `?status=`. */
  readonly value: string;
  /** Trạng thái để tra `statusCounts` (cộng dồn nếu nhiều); `null` = tab "Tất cả". */
  readonly statuses: readonly BookingRequestStatus[] | null;
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
  /*
   * Tab GỘP: `pending_host_approval` + `hold_paid` (ADR 0039). Hai trạng thái này đều CẦN gian
   * hàng quyết định và thẻ đã đối xử với chúng như nhau từ lâu (`needsDecision`), nên tách hai
   * tab chỉ bắt người trực nhìn hai chỗ cho cùng một việc — phản hồi người dùng 19/09/2026.
   */
  {
    value: BOOKING_REQUEST_TAB_NEEDS_ACTION,
    statuses: BOOKING_REQUEST_NEEDS_ACTION_STATUSES,
    labelKey: 'needsAction',
  },
  /*
   * `awaiting_hold` (hold đã sinh, khách CHƯA chuyển khoản) CỐ Ý không có tab riêng: chưa có gì
   * để quyết định, và một tab cho trạng thái không-hành-động-được chỉ thêm rối. Nó vẫn xem được
   * ở tab "Tất cả", và thẻ tự nói lý do không có nút Duyệt (`awaitingHold.footerHint`).
   */
  {
    value: BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING,
    statuses: [BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING],
    labelKey: 'converted',
  },
  {
    value: BOOKING_REQUEST_STATUS.REJECTED_BY_HOST,
    statuses: [BOOKING_REQUEST_STATUS.REJECTED_BY_HOST],
    labelKey: 'rejected',
  },
  {
    value: BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER,
    statuses: [BOOKING_REQUEST_STATUS.CANCELLED_BY_CUSTOMER],
    labelKey: 'cancelled',
  },
  { value: BOOKING_REQUEST_STATUS.EXPIRED, statuses: [BOOKING_REQUEST_STATUS.EXPIRED], labelKey: 'expired' },
  { value: BOOKING_REQUEST_STATUS_ALL, statuses: null, labelKey: 'all' },
];

/** Tab mặc định: việc cần làm ngay (gộp cả yêu cầu đã cọc chờ duyệt). */
export const DEFAULT_REQUEST_TAB: string = BOOKING_REQUEST_TAB_NEEDS_ACTION;

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
  /*
   * Tab GỘP đếm CỘNG DỒN hai trạng thái của nó — không phải một mã thật để tra thẳng, và tra
   * hụt thì tab "Cần xử lý" báo 0 trong khi danh sách bên dưới có việc.
   */
  const statuses: readonly string[] =
    status === BOOKING_REQUEST_TAB_NEEDS_ACTION ? BOOKING_REQUEST_NEEDS_ACTION_STATUSES : [status];
  return counts
    .filter((row) => statuses.includes(row.status))
    .reduce((sum, row) => sum + row.count, 0);
}
