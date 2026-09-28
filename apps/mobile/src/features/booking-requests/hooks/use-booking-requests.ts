import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BOOKING_REQUEST_STATUS, type BookingRequestStatus } from '@xeprime/types';
import { useBranchScopeParams } from '@/features/branches/hooks/use-branch-scope';
import { keepPageData } from '@/queries/keep-page-data';
import { queryKeys } from '@/queries/query-keys';
import type { StatusCounts } from './use-status-counts';
import {
  bookingRequestFiltersToParams,
  bookingRequestsApi,
  BOOKING_REQUEST_CLOSED_STATUSES,
  BOOKING_REQUEST_NEEDS_ACTION_STATUSES,
  BOOKING_REQUEST_TAB_CLOSED,
  BOOKING_REQUEST_TAB_NEEDS_ACTION,
  type ApproveBookingRequestInput,
  type CancelBookingRequestInput,
  type BookingRequestFilters,
  type BookingRequestListResult,
} from '../api';

export interface RequestInboxTab {
  /** Giá trị đi vào bộ lọc `status`. */
  readonly value: string;
  /** Trạng thái để tra `statusCounts` (cộng dồn nếu nhiều). */
  readonly statuses: readonly BookingRequestStatus[];
  /** Khoá message trong namespace `BookingRequests.tabs` — DÙNG CHUNG với web. */
  readonly labelKey: 'needsAction' | 'awaitingPayment' | 'closed';
}

/**
 * ĐÚNG BA TAB (ADR 0047) — gương `BOOKING_REQUEST_TABS` của
 * `apps/web/src/features/booking-requests/constants.ts`. Mỗi tab trả lời đúng MỘT câu hỏi vận
 * hành, không câu nào chồng lấn câu nào:
 *
 *   1. Cần xử lý            — gian hàng phải bấm một quyết định.
 *   2. Chờ khách thanh toán — quả bóng đã sang chân khách, gian hàng chỉ còn theo dõi/liên hệ.
 *   3. Đã đóng              — mọi kết cục không-thành-đơn, gộp một chỗ nhưng mỗi thẻ giữ nhãn
 *      riêng của nó.
 *
 * `converted_to_booking` không còn tab riêng: nó là lịch sử của một ĐƠN THUÊ đang sống, và danh
 * sách đơn thuê mới là nơi đúng để tra cứu. Tab "Tất cả" bỏ cùng lý do — ba tab trên đã phủ hết
 * 11 trạng thái, một tab tổng hợp chỉ đếm lại đúng ba con số đã hiện.
 *
 * ⚠️ Tab "Chờ khách thanh toán" từng KHÔNG tồn tại (phản hồi người dùng 19/09/2026: "một tab
 * riêng cho một trạng thái không-hành-động-được chỉ thêm rối"). Đảo ngược 23/09/2026: lúc đó
 * vẫn còn tab "Tất cả" để xem `awaiting_hold`, nay không còn, nên nó sẽ không có chỗ nào để xem
 * riêng nếu không có tab của chính nó.
 *
 * `labelKey` riêng thay vì nhãn trạng thái: nhãn tab phải đọc lướt được ở bề ngang hẹp
 * ("Cần xử lý", không phải "Chờ gian hàng duyệt").
 */
export const REQUEST_INBOX_TABS: readonly RequestInboxTab[] = [
  /*
   * Tab GỘP: `pending_host_approval` + `hold_paid` (LEGACY ADR 0039). Hai trạng thái này đều
   * CẦN gian hàng quyết định và thẻ đã đối xử với chúng như nhau từ lâu (`needsDecision`), nên
   * tách hai tab chỉ bắt người trực nhìn hai chỗ cho cùng một việc.
   */
  {
    value: BOOKING_REQUEST_TAB_NEEDS_ACTION,
    statuses: BOOKING_REQUEST_NEEDS_ACTION_STATUSES,
    labelKey: 'needsAction',
  },
  {
    value: BOOKING_REQUEST_STATUS.AWAITING_HOLD,
    statuses: [BOOKING_REQUEST_STATUS.AWAITING_HOLD],
    labelKey: 'awaitingPayment',
  },
  {
    value: BOOKING_REQUEST_TAB_CLOSED,
    statuses: BOOKING_REQUEST_CLOSED_STATUSES,
    labelKey: 'closed',
  },
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
 * HUỶ một chuyến đã nhận (ADR 0045 điều 1) — dọn đúng những nhánh mà lượt DUYỆT đã đụng vào.
 *
 * Lượt duyệt chiếm lịch, sinh khoản giữ chỗ và đổi số liệu bảng điều khiển; huỷ gỡ lại đúng
 * từng thứ đó. Chỉ invalidate `bookingRequests` sẽ để lại một vệt bận trên lịch cho một chiếc
 * xe đã rảnh — và người trực sẽ từ chối khách tiếp theo vì tin vào vệt bận đó.
 */
export function useCancelBookingRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { id: string; body: CancelBookingRequestInput }) =>
      bookingRequestsApi.cancel(input.id, input.body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookingRequests.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
    },
  });
}

/**
 * Mở (hoặc lấy lại) hội thoại với khách của một yêu cầu — bản native của
 * `useStartBookingRequestConversation` bên web.
 *
 * Tiền tố `chat` phủ cả hai bề mặt: thread vừa mở nằm ở inbox gian hàng, nhưng cùng tài khoản đó
 * có thể đang giữ cache hộp thư khách.
 */
export function useStartBookingRequestConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => bookingRequestsApi.conversation(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
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
  /*
   * Tab GỘP đếm CỘNG DỒN các trạng thái của nó — chúng không phải một mã thật để tra thẳng, và
   * tra hụt thì tab báo 0 trong khi danh sách bên dưới có việc. Sau ADR 0047 có HAI tab gộp:
   * "Cần xử lý" (2 mã) và "Đã đóng" (6 mã).
   */
  const statuses: readonly string[] =
    status === BOOKING_REQUEST_TAB_NEEDS_ACTION
      ? BOOKING_REQUEST_NEEDS_ACTION_STATUSES
      : status === BOOKING_REQUEST_TAB_CLOSED
        ? BOOKING_REQUEST_CLOSED_STATUSES
        : [status];
  return counts
    .filter((row) => statuses.includes(row.status))
    .reduce((sum, row) => sum + row.count, 0);
}
