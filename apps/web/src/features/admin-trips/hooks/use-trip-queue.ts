'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { isPlatformTripQueue, type PlatformTripQueue } from '@xeprime/types';
import { ADMIN_TRIP_QUEUE_PARAM } from '@/constants/routes';
import { DEFAULT_TRIP_QUEUE } from '../trip-queues';

/**
 * Hàng đợi đang chọn của màn "Vận hành chuyến" — sống ở URL (ADR 0004): gửi link "hàng đợi sắp
 * giao xe" cho đồng nghiệp là họ mở ra đúng hàng đợi đó.
 *
 * Đổi hàng đợi thì XOÁ mọi tham số khác: bộ lọc/trang/đơn đang mở của hàng đợi này không có nghĩa
 * ở hàng đợi kia, và để nó nằm lại là để nó sống dậy sai chỗ. Mã lạ trên URL rơi về mặc định.
 */
export function useTripQueue() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const requested = searchParams.get(ADMIN_TRIP_QUEUE_PARAM);
  const queue: PlatformTripQueue = isPlatformTripQueue(requested) ? requested : DEFAULT_TRIP_QUEUE;

  const selectQueue = useCallback(
    (next: PlatformTripQueue) => {
      const params = new URLSearchParams();
      // Hàng đợi mặc định không ghi `?queue=` — URL trần vẫn là trạng thái mặc định.
      if (next !== DEFAULT_TRIP_QUEUE) params.set(ADMIN_TRIP_QUEUE_PARAM, next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  return { queue, selectQueue };
}
