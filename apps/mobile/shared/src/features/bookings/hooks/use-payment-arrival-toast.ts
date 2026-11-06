import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'use-intl';
import { BOOKING_REQUEST_STATUS } from '@xeprime/types';
import { bookingRequestFiltersToParams, bookingRequestsApi } from '@/api/booking-requests/api';
import { TOAST_PRESET } from '@/components/feedback/AppToast';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { queryKeys } from '@/queries/query-keys';

/** Trần `limit` của API — phần dư không có toast (chuông thông báo vẫn báo). */
const WATCH_LIMIT = 100;
/** Cùng nhịp `LIVE_REFRESH_MS` của web. */
const LIVE_REFRESH_MS = 30_000;

/**
 * Toast "Ghi nhận thanh toán" khi khách trả ĐỦ tiền giữ chỗ trong lúc màn đơn thuê đang mở —
 * bản native của web `usePaymentArrivalToast` (05/11/2026), cùng thuật toán:
 *
 * 1. Một truy vấn nhỏ làm mới nền giữ tập yêu cầu `awaiting_hold` người xem thấy được.
 * 2. Một yêu cầu RỜI tập đó ⇒ hỏi server trạng thái thật. Chỉ `converted_to_booking` (đối soát đã
 *    xác nhận đủ tiền, đơn đã ra đời — ADR 0044 điều 2) mới có toast.
 * 3. Lần tải ĐẦU chỉ ghi mốc — mở màn không bắn toast cho chuyến đã thành đơn từ trước.
 */
export function usePaymentArrivalToast({
  enabled,
  canOpenBooking,
}: {
  /** `booking_requests.view` — không có thì không theo dõi gì. */
  enabled: boolean;
  /** `bookings.view` — có thì chạm toast mở đơn. */
  canOpenBooking: boolean;
}) {
  const t = useTranslations('Bookings.board.paymentArrived');
  const toast = useAppToast();
  const navigateOnce = useNavigateOnce();
  const queryClient = useQueryClient();
  const filters = {
    status: BOOKING_REQUEST_STATUS.AWAITING_HOLD,
    page: 1,
    limit: WATCH_LIMIT,
  };
  const watch = useQuery({
    queryKey: queryKeys.bookingRequests.list(bookingRequestFiltersToParams(filters)),
    queryFn: () => bookingRequestsApi.list(filters),
    enabled,
    refetchInterval: LIVE_REFRESH_MS,
  });

  const baseline = useRef<ReadonlySet<string> | null>(null);
  const announced = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const items = watch.data?.items;
  useEffect(() => {
    if (!items) return;
    const current = new Set(items.map((request) => request.id));
    const previous = baseline.current;
    baseline.current = current;
    if (!previous) return;

    for (const id of previous) {
      if (current.has(id) || announced.current.has(id)) continue;
      void queryClient
        .fetchQuery({
          queryKey: queryKeys.bookingRequests.detail(id),
          queryFn: () => bookingRequestsApi.detail(id),
          staleTime: 0,
        })
        .then((request) => {
          if (!mounted.current || announced.current.has(id)) return;
          if (
            request.status !== BOOKING_REQUEST_STATUS.CONVERTED_TO_BOOKING ||
            !request.bookingId
          ) {
            return;
          }
          announced.current.add(id);
          const bookingId = request.bookingId;
          void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
          toast.showNotice({
            title: t('title'),
            body: request.bookingCode
              ? t('body', { code: request.bookingCode })
              : t('bodyNoCode', { vehicle: request.vehicleName }),
            tone: TOAST_PRESET.SUCCESS,
            ...(canOpenBooking
              ? { onPress: () => navigateOnce(ROUTES.manage.bookingDetail(bookingId)) }
              : {}),
          });
        })
        // Hỏi không được (mạng, hết phiên) thì thôi — danh sách tự cập nhật ở nhịp kế.
        .catch(() => undefined);
    }
    // Chạy lại theo DỮ LIỆU, không theo identity hàm (như web).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
}
