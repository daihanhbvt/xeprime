'use client';

import { useSearchParams } from 'next/navigation';
import { PAYMENT_RETURN_PARAM } from '@xeprime/types';
import { canStartAnotherCheckout, useGatewayOrder } from '../hooks';
import { PAYMENT_SURFACE } from '../types';
import { GatewayPayOptions } from './GatewayPayOptions';

/**
 * Lối MoMo/VNPAY của trang chuyến — `GatewayPayOptions` cộng đúng một luật: vừa quay về từ cổng với
 * một lượt còn dùng được / đang ghi nhận thì KHÔNG mời mở phiên mới (xem `canStartAnotherCheckout`).
 *
 * Đọc cùng khoá cache với `TripGatewayReturn`, nên không có request thứ hai; lượt rời chặng chờ là
 * khối này tự đổi theo.
 */
export function TripGatewayOptions({
  tripId,
  amount,
  deadline,
}: {
  tripId: string;
  amount: string;
  deadline?: string | null;
}) {
  const params = useSearchParams();
  const orderId = params?.get(PAYMENT_RETURN_PARAM.TRIP_ORDER) ?? null;
  const order = useGatewayOrder(PAYMENT_SURFACE.CUSTOMER, orderId);

  if (orderId && !canStartAnotherCheckout(order.data, { failedToLoad: order.isError })) {
    return null;
  }
  return (
    <GatewayPayOptions target={{ kind: 'trip', tripId }} amount={amount} deadline={deadline} />
  );
}
