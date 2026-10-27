import { useCallback } from 'react';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  HOLD_POLL_FALLBACK_MS,
  HOLD_POLL_LIVE_MS,
  isAwaitingPayment,
  type BookingHoldStatus,
  type CustomerCancellationReason,
} from '@xeprime/types';
import { useAppActive, useRefetchOnForeground } from '@/hooks/use-app-active';
import { useBadgeRealtimeLive } from '@/features/badges/BadgeRealtimeProvider';
import { queryKeys } from '@/queries/query-keys';
import {
  reviewsApi,
  tripsApi,
  TRIPS_DEFAULT_LIMIT,
  type CreateReviewInput,
  type UpdateReviewInput,
  type CustomerTripDetail,
  type CustomerTripHandoverEvidence,
  type ProvideRefundAccountInput,
  type PrivateFileTicket,
  type TripsResult,
} from '../api';

/**
 * Server data của "Chuyến của tôi" — TanStack Query (ADR 0004), key dùng chung với web.
 * Phần GỌI nằm ở `tripsApi` (`@xeprime/api-client`); ở đây chỉ còn cache và invalidation.
 *
 * Danh sách tải dần theo cuộn. `queryFn` trả NGUYÊN `TripsResult` (kể cả `counts`), nên mỗi
 * trang giữ được số đếm của tab — con số trên tab và danh sách vì thế luôn đến từ cùng một lần
 * đọc. Bóc `items` ra ở đây thì `counts` rơi mất và tab phải gọi API thứ hai để tự đếm.
 */
export function useTripsInfinite(filter: string, role?: string, enabled = true) {
  return useInfiniteQuery({
    // KHÔNG có `page` trong khoá — page là `pageParam` của TanStack, đúng quy ước của các
    // nhánh `*Infinite` ở `queryKeys`. Có `page` trong khoá thì mỗi trang là một cache riêng
    // và danh sách không bao giờ nối lại được.
    // `role` PHẢI nằm trong khoá: hai vai là hai tập khác nhau, và dùng chung cache sẽ hiện
    // danh sách của vai kia trong một khung hình trước khi dữ liệu đúng về.
    queryKey: queryKeys.trips.list({
      filter,
      limit: TRIPS_DEFAULT_LIMIT,
      ...(role ? { role } : {}),
    }),
    queryFn: ({ pageParam }) => tripsApi.list(filter, pageParam, role),
    initialPageParam: 1,
    getNextPageParam: (last: TripsResult) => (last.meta.hasNext ? last.meta.page + 1 : undefined),
    /*
     * Giữ dữ liệu của tab TRƯỚC trong lúc tab mới đang tải.
     *
     * Đổi tab là đổi `queryKey`, và mặc định TanStack coi đó là một truy vấn hoàn toàn mới:
     * `isPending` bật lên, danh sách biến mất, khung chờ hiện ra, rồi danh sách mới đổ vào —
     * ba lần thay đổi bố cục cho một cú chạm. Đó chính là cái "nháy" khi lướt qua các tab.
     *
     * Có nó thì danh sách cũ đứng yên cho tới khi trang mới về và thay một lần duy nhất; số trên
     * tab cũng không nhảy về 0 rồi quay lại.
     */
    placeholderData: keepPreviousData,
    enabled,
    /*
     * Quay lại app ⇒ đọc lại danh sách ngay, KHÔNG điều kiện (`always` bỏ qua `staleTime`).
     *
     * Trong lúc app nằm nền, chuyến có thể đổi chặng mà thông báo không tới được máy: tiền giữ chỗ
     * về (IPN cổng, VietQR từ máy khác), chủ xe duyệt/huỷ, hold hết hạn. Thiếu bước này thẻ giữ
     * chặng cũ cho tới khi khách tự kéo làm mới. `focusManager` đã nối vào `AppState` ở
     * `query-client.ts`, nên "focus" ở đây chính là app quay về tiền cảnh; chỉ query đang có người
     * quan sát (màn danh sách đang gắn) và đang `enabled` mới chạy. Một query vô hạn đọc lại TỪNG
     * trang đã tải, lần lượt — mỗi trang một request, không phải một lượt đọc gộp.
     */
    refetchOnWindowFocus: 'always',
  });
}

/**
 * Lời nhắc thanh toán — chuyến khách đang giữ mà chưa trả, và đã chạm trần chưa (web:
 * `useUnpaidHolds`).
 *
 * Không tự hỏi lại theo nhịp: khoá nằm dưới nhánh `trips`, nên push/huy hiệu tiền về / hết hạn làm
 * mới `trips.all` kéo nó theo; quay lại app là một lượt đọc mới. `enabled` tắt hẳn khi chưa có
 * phiên khách — endpoint chỉ mở cho realm khách.
 */
export function useUnpaidHolds(enabled = true) {
  return useQuery({
    queryKey: queryKeys.trips.unpaidHolds(),
    queryFn: () => tripsApi.unpaidHolds(),
    enabled,
    // Quay về tiền cảnh ⇒ đọc lại (focusManager nối AppState ở `query-client.ts`).
    refetchOnWindowFocus: 'always',
  });
}

/**
 * Hold còn có thể nhận thêm tiền ⇒ còn đáng hỏi lại.
 *
 * Vị từ đến từ `@xeprime/types` (`isAwaitingPayment`) chứ không phải một phép so chép tay: nó là
 * cùng câu hỏi mà web hỏi để bật nhịp poll, và một bản sao ở đây sẽ lặng lẽ trôi khỏi bản kia vào
 * ngày `BOOKING_HOLD_STATUS` có giá trị thứ ba còn chờ tiền.
 */
function isAwaitingHold(trip: CustomerTripDetail | null | undefined): boolean {
  const status = trip?.hold?.status;
  return status != null && isAwaitingPayment(status as BookingHoldStatus);
}

/**
 * Chi tiết MỘT chuyến — tự hỏi lại trong lúc còn hold đang chờ tiền, cùng khuôn với
 * `usePendingInvoice` bên gói (ADR 0039/ADR 0040).
 *
 * ## Đây là lớp thứ BA, không phải lớp duy nhất
 *
 * Màn đang mở đã có hai đường tự làm mới từ trước:
 *   1. Push FCM tới lúc app đang MỞ TRÊN TAY → `refreshForNotification` tự `invalidateQueries`
 *      đúng nhánh `trips` cho loại `HOLD_PAID` (`use-push-notifications.ts`);
 *   2. Huy hiệu Firestore đổi số (ADR 0009, kênh KHÔNG phụ thuộc quyền push) → làm mới RỘNG mọi
 *      nhánh (`BadgeRealtimeProvider`), có nhịp hỏi lại dự phòng 2 phút nếu mất kết nối Firestore.
 *
 * Nhịp hỏi lại ở đây là LƯỚI AN TOÀN cho hai đường trên, cùng hai nhịp với web (PR #183): hai phút
 * khi đang nghe được bản chiếu, hai mươi giây khi không. Trước đây mobile hỏi 8 giây; đổi về nhịp
 * web vì không đổi kết cục nào (đơn chỉ ra đời ở server lúc đối soát đủ tiền) — chỉ đổi độ trễ hiển
 * thị trong ca hiếm cả push lẫn bản chiếu cùng hỏng, và quay về app luôn hỏi lại ngay
 * (`useRefetchOnForeground`). Hai nhịp là `HOLD_POLL_*` ở `@xeprime/types`, chung với web. Chỉ chạy khi hold còn ở trạng thái chờ.
 *
 * `refetchInterval` là HÀM vì lý do đó: tắt ngay khi hold hết cửa nhận tiền (đã `paid`, hết hạn,
 * đã huỷ…), không chạy mãi trên một màn đã xong việc.
 *
 * `useAppActive` bắt buộc, khác web: React Native không có `document.visibilityState` để
 * `focusManager` tự dừng nhịp khi app xuống nền — thiếu nó, nhịp hỏi lại chạy cả khi máy nằm
 * trong túi. `useRefetchOnForeground` lo nửa còn lại: quay về từ app ngân hàng phải thấy kết quả
 * NGAY tại khoảnh khắc đó, không đợi hết một nhịp poll lẫn một đường tín hiệu nào khác.
 */
export function useTrip(id: string): UseQueryResult<CustomerTripDetail> {
  const appActive = useAppActive();
  const live = useBadgeRealtimeLive();
  const pollMs = live ? HOLD_POLL_LIVE_MS : HOLD_POLL_FALLBACK_MS;
  const query = useQuery({
    queryKey: queryKeys.trips.detail(id),
    queryFn: () => tripsApi.detail(id),
    enabled: Boolean(id),
    refetchInterval: (q) => (appActive && isAwaitingHold(q.state.data) ? pollMs : false),
  });

  const { refetch } = query;
  useRefetchOnForeground(
    useCallback(() => {
      if (id) void refetch();
    }, [id, refetch]),
  );

  return query;
}

/**
 * Biên bản bàn giao mà khách được xem.
 *
 * Bề mặt RIÊNG (`/trips/:id/handover-evidence`), cố ý không dùng lại route tenant — route kia
 * trả ghi chú nội bộ, tên người xác nhận, `fileId`, `rowVersion`.
 */
export function useTripHandoverEvidence(
  id: string,
  enabled: boolean,
): UseQueryResult<CustomerTripHandoverEvidence[]> {
  return useQuery({
    queryKey: queryKeys.trips.handoverEvidence(id),
    queryFn: () => tripsApi.handoverEvidence(id),
    enabled: enabled && Boolean(id),
  });
}

/**
 * Huỷ chuyến — ĐƯỜNG GHI DUY NHẤT của khách.
 *
 * Kết quả ghi thẳng vào cache chi tiết (server đã trả chuyến đã đổi chặng), rồi mới invalidate
 * danh sách: không có bước ghi thẳng thì màn chi tiết nháy về trạng thái cũ một nhịp trước khi
 * request thứ hai về.
 */
/**
 * Khách khai tài khoản nhận tiền hoàn — ADR 0033.
 *
 * Ghi thẳng chuyến trả về vào cache như `useCancelTrip`: response đã mang trạng thái mới của
 * khoản hoàn, nên đọc lần thứ hai chỉ để biết kết quả việc mình vừa làm là một request thừa và
 * một khoảng thời gian màn hình nói sai.
 */
export function useProvideRefundAccount(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: ProvideRefundAccountInput) => tripsApi.provideRefundAccount(id, body),
    onSuccess: (trip) => {
      queryClient.setQueryData(queryKeys.trips.detail(id), trip);
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
    },
  });
}

export function useCancelTrip(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reasonCategory: CustomerCancellationReason) => tripsApi.cancel(id, reasonCategory),
    onSuccess: (trip) => {
      queryClient.setQueryData(queryKeys.trips.detail(id), trip);
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
    },
  });
}

/**
 * Gửi đánh giá (BKG-16). Đánh giá lần hai trả 409 — nơi gọi hiện đánh giá cũ, không hiện lỗi đỏ.
 *
 * Invalidate cả nhánh `trips` (cờ `hasReview`/`canReview` nằm trên cả danh sách lẫn chi tiết) và
 * nhánh `marketplace` (điểm đánh giá của xe vừa đổi).
 */
export function useCreateReview(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateReviewInput) => reviewsApi.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(tripId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.marketplace.all });
    },
  });
}

/**
 * Sửa đánh giá (MỘT lần) — cùng nhánh làm mới với `useCreateReview`. Làm mới cả khi lỗi: 409
 * `REVIEW_EDIT_LIMIT` nghĩa là lượt sửa đã dùng ở nơi khác, `canEdit` mới từ server ẩn nút sửa.
 */
export function useUpdateReview(tripId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...body }: UpdateReviewInput & { id: string }) => reviewsApi.update(id, body),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.detail(tripId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.marketplace.all });
    },
  });
}

/**
 * Vé xem MỘT ảnh hiện trạng — KHÔNG cache.
 *
 * URL ký sống vài phút. Đặt nó vào `useQuery` là giữ một chuỗi hết hạn trong bộ nhớ rồi mở ra
 * một ảnh hỏng ở lần bấm thứ hai; xin lại từng cú bấm rẻ hơn nhiều so với việc đó.
 */
export function requestTripPhotoUrl(
  tripId: string,
  type: string,
  slot: string,
): Promise<PrivateFileTicket> {
  return tripsApi.handoverPhotoUrl(tripId, type, slot);
}
