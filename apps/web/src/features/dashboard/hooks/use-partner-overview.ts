'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchPartnerOverview, partnerOverviewParams } from '../api';

/**
 * Nhịp tự làm mới của Tổng quan. "Việc cần làm" đổi theo PHÚT (hạn trả lời 15′–4 giờ, quá giờ giao
 * xe), nên một màn để mở cả buổi phải tự nói đúng mà không cần ai bấm F5. Thông báo realtime đã
 * làm mới nhánh `dashboard` ngay khi có yêu cầu/đơn đổi (`notification-refresh.ts`); nhịp này là
 * lưới an toàn cho thứ chỉ đổi vì THỜI GIAN trôi (một chuyến vừa chạm giờ trả). TanStack tự dừng
 * nhịp khi tab bị ẩn.
 */
const OVERVIEW_REFRESH_MS = 60_000;

/**
 * Tổng quan site partner — một request cho phần vận hành, cả hai tuyến. Tenant scope do backend
 * lấy từ phiên; `branchId` chỉ thu hẹp trong gian hàng (ADR 0052).
 *
 * `placeholderData` giữ số cũ trong lúc đổi chi nhánh: bốn thẻ nháy về "…" rồi hiện lại là cách
 * nhanh nhất để người đọc tưởng số vừa mất.
 */
export function usePartnerOverview(branchId?: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.dashboard.overview(partnerOverviewParams(branchId)),
    queryFn: () => fetchPartnerOverview(branchId),
    enabled,
    staleTime: 30_000,
    refetchInterval: OVERVIEW_REFRESH_MS,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  });
}
