'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { UserBadgeCounts } from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';
import { useBadgeRealtime } from '../BadgeRealtimeProvider';

/**
 * Mọi con số hiện ở khung ứng dụng, đọc từ MỘT nguồn.
 *
 * Hook này cố ý KHÔNG tạo query của riêng nó. `BadgeRealtimeProvider` là chủ sở hữu duy nhất của
 * query badge, và lý do rất cụ thể: TanStack Query gắn đồng hồ `refetchInterval` cho TỪNG
 * observer. Ba nơi đọc (chuông, biểu tượng chat, huy hiệu menu) mà mỗi nơi gọi `useQuery` thì
 * sau vài giây đầu sẽ có ba đồng hồ cùng chạy trên một khoá — "một request" chỉ còn đúng ở lần
 * mount, và cả mục tiêu của thay đổi này tan trong im lặng.
 *
 * Không cần truyền `enabled`: provider tự tắt query khi chưa đăng nhập, nên khu công khai không
 * phát sinh request 401 và không nơi gọi nào phải nhớ luật đó.
 */
export function useBadges(): UserBadgeCounts {
  return useBadgeRealtime().counts;
}

/**
 * Làm mới huy hiệu ngay sau một hành động của CHÍNH người dùng (đọc thông báo, mở hộp thư, gửi
 * tin). Con số phải đổi lúc họ bấm, không phải ở nhịp poll kế tiếp — và đợi bản chiếu Firestore
 * đi một vòng qua worker cũng là một quãng trễ mà thao tác cục bộ không cần phải chịu.
 */
export function useRefreshBadges(): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.badges.all });
  }, [queryClient]);
}
