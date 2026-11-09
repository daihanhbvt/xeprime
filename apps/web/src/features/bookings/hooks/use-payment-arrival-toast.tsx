'use client';

import { useQueryClient } from '@tanstack/react-query';
import { App, Button } from 'antd';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';
import { BOOKING_REQUEST_STATUS } from '@xeprime/types';
import { bookingPath } from '@/constants/routes';
import { fetchBookingRequest } from '@/features/booking-requests/api';
import { useBookingRequests } from '@/features/booking-requests/hooks/use-booking-requests';
import { queryKeys } from '@/services/query-keys';

/**
 * Theo dõi tối đa chừng này yêu cầu đang chờ khách trả — trần `limit` của API. Một gian hàng có hơn
 * từng ấy khoản chờ cùng lúc thì phần dư không có toast (chuông thông báo vẫn báo).
 */
const WATCH_LIMIT = 100;

/**
 * Toast "Ghi nhận thanh toán" khi khách trả ĐỦ tiền giữ chỗ trong lúc màn "Đơn thuê xe" đang mở (Figma
 * `23895:15181` Step 3, sổ cái §3.2b — dùng cho cả List lẫn Kanban). Chỉ ở trình duyệt, không đổi
 * backend:
 *
 * 1. Một truy vấn nhỏ, làm mới nền, giữ tập yêu cầu `awaiting_hold` mà người xem thấy được.
 * 2. Một yêu cầu RỜI tập đó ⇒ hỏi server trạng thái thật của nó. Chỉ `converted_to_booking` (tức đối
 *    soát đã xác nhận đủ tiền và đơn đã ra đời — ADR 0044 điều 2) mới có toast; hết hạn, bị huỷ, hay
 *    chỉ trôi ra ngoài trang theo dõi thì im lặng.
 * 3. Lần tải ĐẦU chỉ ghi mốc — mở màn không bắn toast cho những chuyến đã thành đơn từ trước.
 *
 * Có toast thì làm mới luôn danh sách đơn để thẻ hiện ngay ở "Chờ giao xe" thay vì đợi nhịp kế.
 */
export function usePaymentArrivalToast({
  enabled,
  canOpenBooking,
}: {
  /** `booking_requests.view` — không có thì không theo dõi gì. */
  enabled: boolean;
  /** `bookings.view` — có thì toast có nút "Xem đơn hàng". */
  canOpenBooking: boolean;
}) {
  const t = useTranslations('Bookings.board.paymentArrived');
  const { notification } = App.useApp();
  const router = useRouter();
  const queryClient = useQueryClient();
  const watch = useBookingRequests(
    { status: BOOKING_REQUEST_STATUS.AWAITING_HOLD, sort: 'urgent', page: 1, limit: WATCH_LIMIT },
    { enabled, live: true },
  );

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
          queryFn: () => fetchBookingRequest(id),
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
          const key = `payment-arrived-${id}`;
          void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
          notification.info({
            key,
            placement: 'topRight',
            duration: 10,
            title: t('title'),
            description: request.bookingCode
              ? t('body', { code: request.bookingCode })
              : t('bodyNoCode', { vehicle: request.vehicleName }),
            actions: canOpenBooking ? (
              <Button
                type="link"
                onClick={() => {
                  notification.destroy(key);
                  router.push(bookingPath.detail(bookingId));
                }}
              >
                {t('action')}
              </Button>
            ) : undefined,
          });
        })
        // Hỏi không được (mạng, hết phiên) thì thôi — thẻ vẫn tự sang cột ở nhịp làm mới kế.
        .catch(() => undefined);
    }
    // `t`/`notification`/`router` ổn định theo phiên; chạy lại theo DỮ LIỆU, không theo identity hàm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
}
