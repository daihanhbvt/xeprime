'use client';

import {
  BOOKING_LIST_PRESET,
  BOOKING_LIST_PRESET_VALUES,
  BOOKING_STATUS,
  type BookingListPreset,
} from '@xeprime/types';
import { enumParam, positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import type { BookingFilters, BookingSort } from '../types';

/**
 * Link CŨ mang `?status=` (thẻ Tổng quan trước 02/11/2026, bookmark) → ngăn tương ứng của cột
 * trái. Ô lọc trạng thái đã bỏ, nên một `status` sống tiếp trên URL sẽ là một bộ lọc vô hình
 * không có nút gỡ — quy nó về ngăn và thôi gửi nó lên API.
 */
const LEGACY_STATUS_PRESET: Readonly<Record<string, BookingListPreset>> = {
  [BOOKING_STATUS.RESERVED]: BOOKING_LIST_PRESET.AWAITING_PICKUP,
  [BOOKING_STATUS.CONFIRMED]: BOOKING_LIST_PRESET.AWAITING_PICKUP,
  [BOOKING_STATUS.ACTIVE]: BOOKING_LIST_PRESET.RENTING,
  [BOOKING_STATUS.COMPLETED]: BOOKING_LIST_PRESET.COMPLETED,
  [BOOKING_STATUS.CANCELLED]: BOOKING_LIST_PRESET.CANCELLED,
  [BOOKING_STATUS.NO_SHOW]: BOOKING_LIST_PRESET.CANCELLED,
};

/**
 * Filter danh sách đơn ở URL searchParams — ADR 0004. Ngăn đang xem là `?preset=`.
 */
export function useBookingFilters() {
  return useUrlFilters<BookingFilters>((sp) => {
    const legacyStatus = sp.get('status');
    return {
      q: sp.get('q') ?? undefined,
      preset:
        (enumParam(sp, 'preset', BOOKING_LIST_PRESET_VALUES) as BookingListPreset | undefined) ??
        (legacyStatus ? LEGACY_STATUS_PRESET[legacyStatus] : undefined),
      vehicleId: sp.get('vehicleId') ?? undefined,
      serviceType: sp.get('serviceType') ?? undefined,
      branchId: sp.get('branchId') ?? undefined,
      sort: (sp.get('sort') as BookingSort | null) ?? undefined,
      page: positiveIntParam(sp, 'page'),
      limit: positiveIntParam(sp, 'limit'),
    };
  });
}
