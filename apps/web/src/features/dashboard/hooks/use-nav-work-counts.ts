'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchPartnerRequests, fetchPartnerToday } from '../api';

/**
 * Cùng nhịp với Tổng quan: số và màu đổi theo PHÚT (chạm giờ giao/trả, chạm mốc khẩn của yêu cầu),
 * lưới an toàn cho realtime — thông báo làm mới nhánh `dashboard` nên số nhảy ngay khi có đổi.
 */
const NAV_WORK_REFRESH_MS = 60_000;

/** Một con số "cần xử lý" trên menu và việc trong đó đã TRỄ chưa (huy hiệu đỏ thay vì cam). */
export interface NavWorkCount {
  count: number;
  urgent: boolean;
}

const NONE: NavWorkCount = { count: 0, urgent: false };

const queryOptions = {
  staleTime: 30_000,
  refetchInterval: NAV_WORK_REFRESH_MS,
  refetchOnWindowFocus: true,
};

/**
 * Lượt giao + trả xe ĐẾN HẠN (chốt với người dùng 04/11/2026): hẹn tới hết hôm nay, gồm cả lượt
 * đã quá giờ từ những ngày trước — mỗi đơn đếm một lần. Đỏ khi có lượt đã QUÁ giờ hẹn.
 *
 * Không đếm "mọi đơn đang thuê" hay "mọi đơn chờ giao": chuyến dài hạn đang chạy và lượt giao
 * tuần sau không phải việc phải làm bây giờ — đếm chúng làm huy hiệu sáng quanh năm.
 */
export function useHandoverWorkCount(enabled: boolean): NavWorkCount {
  const { data } = useQuery({
    queryKey: queryKeys.dashboard.today,
    queryFn: fetchPartnerToday,
    enabled,
    ...queryOptions,
  });
  if (!data) return NONE;
  return {
    count: data.pickupsDue + data.returnsDue,
    urgent: data.pickupsOverdue + data.returnsOverdue > 0,
  };
}

/**
 * Yêu cầu đặt xe chờ duyệt — cùng tập với tab "Cần xử lý" của hộp thư (`pending_host_approval`).
 * Đỏ khi có yêu cầu sắp hết hạn trả lời (`pendingUrgent`, cùng mốc với lượt nhắc cuối của hệ
 * thống): để quá hạn là mất khách và trừ tỉ lệ phản hồi (ADR 0045 điều 3).
 */
export function useRequestWorkCount(enabled: boolean): NavWorkCount {
  const { data } = useQuery({
    queryKey: queryKeys.dashboard.requests,
    queryFn: fetchPartnerRequests,
    enabled,
    ...queryOptions,
  });
  if (!data) return NONE;
  return { count: data.pending, urgent: data.pendingUrgent > 0 };
}
