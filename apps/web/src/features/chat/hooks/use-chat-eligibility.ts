'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { isUnauthenticated } from '@/services/api-client';
import { chatApi } from '../api';

/**
 * "Tôi nhắn được cho gian hàng này chưa" — dùng để ẨN/HIỆN nút, không phải để cấp quyền.
 *
 * Chỉ hỏi khi cần (`enabled`): gian hàng tuyến gói mở hộp thư công khai, nên ở đó câu trả lời đã
 * biết trước và một round-trip cho mọi lượt xem trang là chi phí không đổi lấy gì.
 *
 * Khách CHƯA đăng nhập nhận 401. Đó không phải lỗi cần báo: server không biết họ đã đặt xe chưa
 * vì chưa biết họ là ai. Coi như "chưa được nhắn" và KHÔNG thử lại — thử lại một 401 chỉ tạo ra
 * ba request giống hệt nhau cho cùng một câu trả lời.
 */
export function useChatEligibility(shopSlug: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.chat.eligibility(shopSlug),
    queryFn: () => chatApi.eligibility(shopSlug),
    enabled: options?.enabled !== false && Boolean(shopSlug),
    retry: (failureCount, error) => !isUnauthenticated(error) && failureCount < 2,
  });
}
