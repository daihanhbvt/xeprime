import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import {
  reviewsApi,
  tripsApi,
  TRIPS_DEFAULT_LIMIT,
  type CreateReviewInput,
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
    queryKey: queryKeys.trips.list({ filter, limit: TRIPS_DEFAULT_LIMIT, ...(role ? { role } : {}) }),
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
  });
}

export function useTrip(id: string): UseQueryResult<CustomerTripDetail> {
  return useQuery({
    queryKey: queryKeys.trips.detail(id),
    queryFn: () => tripsApi.detail(id),
    enabled: Boolean(id),
  });
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
    mutationFn: () => tripsApi.cancel(id),
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
