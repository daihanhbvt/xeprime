import { useState } from 'react';
import type { BookingRequestListResult } from '../api';

export type StatusCounts = BookingRequestListResult['meta']['statusCounts'];

const EMPTY: StatusCounts = [];

/**
 * Giữ bộ đếm theo trạng thái đã biết gần nhất để dải tab không nhấp nháy về 0.
 *
 * `meta.statusCounts` đi CHUNG truy vấn với danh sách, nên đổi tab là đổi khoá ⇒ `data` vắng một
 * nhịp ⇒ mọi tab hiện 0 rồi nhảy lại. API không có endpoint đếm riêng, và bộ đếm đổi chậm nên số
 * của lần đọc trước gần như luôn còn đúng.
 *
 * Là state chứ không phải ref vì đây là mẫu "điều chỉnh state khi props đổi" — đọc/ghi ref lúc
 * render là hành vi không xác định và `react-hooks/refs` chặn thẳng.
 */
export function useStickyStatusCounts(result: BookingRequestListResult | undefined): StatusCounts {
  const [kept, setKept] = useState<StatusCounts>(EMPTY);

  const fresh = result?.meta.statusCounts;
  if (fresh !== undefined && fresh !== kept) setKept(fresh);

  return fresh ?? kept;
}
