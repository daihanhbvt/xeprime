import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@xeprime/api-client';
import {
  BOOKING_LIMITS_DEFAULTS,
  bookingLimitViolation,
  lastBookablePickupDateKey,
  type BookingLimits,
  type BookingLimitViolation,
} from '@xeprime/types';
import { feePoliciesApi } from '@/api/fee-policies/api';

/*
 * Bản native của web `booking-requests/hooks/use-booking-limits.ts` (ADR 0091 điều 4). Hai bản không
 * tự đồng bộ (ADR 0031) - luật thật là hàm thuần `bookingLimitViolation` dùng chung với server.
 */

/** Trần đặt xe của nền tảng - đổi hiếm, cache dài. */
export function useBookingLimits() {
  return useQuery({
    queryKey: queryKeys.feePolicies.bookingLimits(),
    queryFn: () => feePoliciesApi.bookingLimits(),
    staleTime: 60 * 60 * 1000,
  });
}

export interface BookingLimitCheck {
  violation: BookingLimitViolation | null;
  limits: BookingLimits;
  /** Ngày nhận cuối còn đặt được (`YYYY-MM-DD`, giờ VN). */
  lastPickupDateKey: string;
}

/**
 * Báo SỚM một khoảng thuê vượt trần - cùng hàm thuần server dùng để chặn thật. Chưa tải được trần
 * thì dùng mặc định nền tảng: server vẫn là cổng.
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
