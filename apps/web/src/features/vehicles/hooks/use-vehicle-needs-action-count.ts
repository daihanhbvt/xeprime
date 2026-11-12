'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchVehicleNeedsActionCount } from '../api';

/** Nhịp hỏi lại: hạn giấy tờ / mốc bảo dưỡng đổi theo NGÀY, việc đổi tức thời đã có invalidate. */
const NEEDS_ACTION_REFRESH_MS = 5 * 60_000;

/**
 * Số xe có việc "cần xử lý" — huy hiệu mục menu Danh sách xe (chốt 03/11/2026).
 *
 * Key nằm dưới nhánh `vehicles` › `alerts`, nên mọi thao tác ghi đã làm mới xe hay cảnh báo (sửa
 * xe, giấy tờ, bảo dưỡng, bàn giao, admin duyệt/trả xe qua thông báo) kéo con số theo — không có
 * đường làm mới thứ hai phải nhớ.
 */
export function useVehicleNeedsActionCount(enabled: boolean): number {
  const { data } = useQuery({
    queryKey: queryKeys.vehicles.needsActionCount(),
    queryFn: fetchVehicleNeedsActionCount,
    enabled,
    staleTime: 60_000,
    refetchInterval: NEEDS_ACTION_REFRESH_MS,
    refetchOnWindowFocus: true,
  });
  return enabled && data ? data.count : 0;
}
