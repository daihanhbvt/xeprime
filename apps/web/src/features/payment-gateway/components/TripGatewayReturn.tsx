'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { MOBILE_APP_SCHEME, MOBILE_CLIENT_APP, PAYMENT_RETURN_PARAM } from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';
import { PAYMENT_SURFACE } from '../types';
import { GatewayOrderNotice } from './GatewayOrderNotice';

/**
 * Trang chuyến là TRANG QUAY VỀ của tiền giữ chỗ qua cổng: server dựng `returnUrl` =
 * `/trips/:id?paymentOrder=<lượt>` (ADR 0058). Khối này đọc ĐÚNG MỘT tham số — ID của lượt — rồi hỏi
 * server; mọi tham số khác mà cổng gắn lên URL bị bỏ qua.
 *
 * Lượt rời chặng chờ ⇒ làm mới chuyến: tiền đã vào thì khoản giữ chỗ thành `paid` và chuyến có đơn,
 * và khối tiền giữ chỗ phía dưới phải nói đúng điều đó ngay, không đợi nhịp hỏi 20 giây của nó.
 */
export function TripGatewayReturn({ tripId }: { tripId: string }) {
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const orderId = params?.get(PAYMENT_RETURN_PARAM.TRIP_ORDER) ?? null;
  const fromApp = params?.get(PAYMENT_RETURN_PARAM.NATIVE) === '1';

  const onSettled = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.trips.all });
  }, [queryClient]);

  if (!orderId) return null;
  return (
    <GatewayOrderNotice
      surface={PAYMENT_SURFACE.CUSTOMER}
      orderId={orderId}
      // Mở từ app XePrime ⇒ mời quay lại đúng chuyến trong app (deep link cùng đường `/trips/:id`).
      nativeReturnHref={
        fromApp
          ? `${MOBILE_APP_SCHEME[MOBILE_CLIENT_APP.CUSTOMER]}://trips/${encodeURIComponent(tripId)}`
          : null
      }
      onSettled={onSettled}
    />
  );
}
