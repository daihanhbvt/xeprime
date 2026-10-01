'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchFleetSummary } from '../api';

/**
 * Đếm đội xe theo trạng thái vận hành — dải chỉ số đầu `/manage/vehicles` (Figma `236:4648`).
 *
 * `enabled` do trang quyết (chỉ tải khi dải chỉ số thực sự hiển thị); hỏng thì dải tự ẩn,
 * không chặn danh sách.
 *
 * `branchId` là BẮT BUỘC phải truyền đúng cái mà danh sách bên dưới đang lọc: dải này đứng ngay
 * trên bảng, nên "40 xe" ở trên và 4 dòng ở dưới là hai câu trả lời khác nhau cho cùng một câu
 * hỏi, trên cùng một màn hình. Trước ADR 0052 nó đếm toàn gian hàng và đó là một lỗi thật.
 */
export function useFleetSummary(enabled: boolean, branchId?: string) {
  const params = branchId ? { branchId } : {};
  return useQuery({
    queryKey: queryKeys.vehicles.fleetSummary(params),
    queryFn: () => fetchFleetSummary(params),
    enabled,
    staleTime: 60_000,
  });
}
