'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BOOKING_LIMITS_DEFAULTS,
  bookingLimitViolation,
  lastBookablePickupDateKey,
  type BookingLimits,
  type BookingLimitViolation,
} from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';
import { fetchBookingLimits } from '../api';

/** Trần đặt xe của nền tảng (ADR 0091 điều 4) — đổi hiếm, cache dài như lời mời hợp tác. */
export function useBookingLimits() {
  return useQuery({
    queryKey: queryKeys.feePolicies.bookingLimits(),
    queryFn: fetchBookingLimits,
    staleTime: 60 * 60 * 1000,
  });
}

export interface BookingLimitCheck {
  violation: BookingLimitViolation | null;
  limits: BookingLimits;
  /** Ngày nhận cuối còn đặt được (`YYYY-MM-DD`, giờ VN) — để nói đúng "trước ngày nào". */
  lastPickupDateKey: string;
}

/**
 * Báo SỚM ở trang đặt xe một khoảng thuê vượt trần — cùng hàm thuần server dùng để chặn thật
 * (`bookingLimitViolation`). Chưa tải được trần thì dùng mặc định nền tảng: báo sớm sai vài ngày
 * không hại gì, server vẫn là cổng.
 */
export function useBookingLimitCheck(input: {
  serviceType: string;
  pickupAt: Date | null;
  returnAt: Date | null;
}): BookingLimitCheck {
  const { data } = useBookingLimits();
  const limits = data ?? BOOKING_LIMITS_DEFAULTS;
  const now = new Date();
  return {
    violation: bookingLimitViolation({ ...input, now, limits }),
    limits,
    lastPickupDateKey: lastBookablePickupDateKey(now, limits),
  };
}
