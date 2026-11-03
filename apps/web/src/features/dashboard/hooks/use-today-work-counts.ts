'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchPartnerToday } from '../api';

/** Cùng nhịp với Tổng quan: số đổi theo PHÚT (chạm giờ giao/trả), lưới an toàn cho realtime. */
const TODAY_REFRESH_MS = 60_000;

/**
 * Hai con số "cần xử lý" trên menu site partner (chốt với người dùng 02/11/2026):
 *  - `bookingsNeedsAction` — "Quản lý đơn thuê xe": Chờ giao xe + Đang thuê, đúng nhóm "CẦN XỬ LÝ"
 *    ở cột trái của màn đó;
 *  - `calendarToday` — "Lịch thuê xe": lượt giao + lượt nhận xe hẹn trong HÔM NAY.
 *
 * Một request nhẹ (`GET /dashboard/today`) cho cả hai; thông báo realtime làm mới nhánh
 * `dashboard` nên số nhảy ngay khi có đơn đổi trạng thái.
 */
export function useTodayWorkCounts(enabled: boolean) {
  const { data } = useQuery({
    queryKey: queryKeys.dashboard.today,
    queryFn: fetchPartnerToday,
    enabled,
    staleTime: 30_000,
    refetchInterval: TODAY_REFRESH_MS,
    refetchOnWindowFocus: true,
  });
  return {
    bookingsNeedsAction: data ? data.awaitingPickup + data.active : 0,
    calendarToday: data ? data.pickupsToday + data.returnsToday : 0,
  };
}
