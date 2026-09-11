'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { useRefreshBadges } from '@/features/badges/hooks/use-badges';
import { markAllNotificationsRead, markNotificationRead } from '../api';

/**
 * Đánh dấu một thông báo đã đọc → làm mới cả danh sách và huy hiệu.
 *
 * Hai lần invalidate vì đó là hai query khác nhau: danh sách nằm ở `notifications.*`, còn con số
 * trên chuông sống chung với huy hiệu chat ở `badges.me`. Bỏ vế thứ hai thì chuông vẫn sáng sau
 * khi người dùng vừa bấm đọc, cho tới nhịp làm mới kế tiếp.
 */
export function useMarkRead() {
  const queryClient = useQueryClient();
  const refreshBadges = useRefreshBadges();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      refreshBadges();
    },
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  const refreshBadges = useRefreshBadges();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      refreshBadges();
    },
  });
}
