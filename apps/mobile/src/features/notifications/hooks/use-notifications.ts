import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  notificationsApi,
  notificationListKeyParams,
  type NotificationListResult,
} from '@/features/notifications/api';
import { chatDebug } from '@/lib/chat-debug';
import { useBadgeRealtime } from '@/features/badges/BadgeRealtimeProvider';
import { useOnBadgeChange } from '@/features/badges/hooks/use-on-badge-change';
import { useRefreshBadges } from '@/features/badges/hooks/use-badges';
import { queryKeys } from '@/queries/query-keys';

/**
 * Danh sách thông báo của tôi, tải dần theo cuộn.
 *
 * `enabled` để chỉ tải khi MỞ tấm trượt — y như web chỉ tải khi mở popover. Một cái chuông đóng
 * không có lý do gì để kéo bản ghi về mỗi lần người dùng đổi màn.
 *
 * Khác web ở TRÌNH BÀY: popover của web dừng ở trang đầu vì nó cao chưa tới 15 dòng, còn tấm
 * trượt ở đây cuộn được nên nó nối tiếp các trang mà chính endpoint đã hỗ trợ (`page`/`limit`).
 * Cắt trang vẫn ở SERVER — không có chỗ nào kéo cả hộp thông báo về rồi cắt tại chỗ.
 *
 * `page` KHÔNG nằm trong queryKey: nó là `pageParam` của TanStack. Có `page` trong khoá thì mỗi
 * trang là một cache riêng và danh sách không bao giờ nối lại được.
 */
export function useNotificationsInfinite(enabled: boolean) {
  const { counts } = useBadgeRealtime();
  const queryClient = useQueryClient();

  /*
   * Để một tấm trượt ĐANG MỞ cũng cập nhật, không phải đóng rồi mở lại.
   *
   * Bản chiếu huy hiệu đổi ⇒ có thông báo mới (hoặc vừa đọc ở máy khác) ⇒ tải lại danh
   * sách. Thiếu cầu nối này thì con số trên chuông nhảy tức thì còn danh sách bên dưới
   * đứng im — đúng triệu chứng "chuông báo có việc mới, mở ra không thấy gì".
   */
  useOnBadgeChange(counts.notificationsUnread, () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
  });
  return useInfiniteQuery({
    queryKey: queryKeys.notifications.list(notificationListKeyParams()),
    queryFn: ({ pageParam }) => notificationsApi.list({ page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last: NotificationListResult) =>
      last.meta.hasNext ? last.meta.page + 1 : undefined,
    enabled,
    /*
     * Bấm vào chuông là một hành động "cho tôi xem NGAY".
     *
     * Với `staleTime` 30 giây mặc định của toàn app, mở lại tấm trượt trong vòng 30 giây sẽ
     * phục vụ bản cache cũ: con số đã nhảy (bản chiếu realtime cập nhật tức thì) mà danh sách
     * thì chưa — đúng triệu chứng "chuông báo có việc mới, mở ra không thấy gì".
     */
    staleTime: 0,
  });
}


/**
 * Đánh dấu MỘT thông báo đã đọc → làm mới cả danh sách và huy hiệu.
 *
 * HAI lần invalidate vì đó là hai query khác nhau: danh sách nằm ở `notifications.*`, còn con số
 * trên chuông sống chung với huy hiệu chat ở `badges.me`. Bỏ vế thứ hai thì chuông vẫn sáng sau
 * khi người dùng vừa bấm đọc, cho tới nhịp làm mới kế tiếp — đúng thứ người dùng để ý đầu tiên.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const refreshBadges = useRefreshBadges();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      chatDebug.notificationReadOk(false, 1);
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      refreshBadges();
    },
    onError: (error) => chatDebug.notificationReadFailed(error),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const refreshBadges = useRefreshBadges();
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: (result) => {
      chatDebug.notificationReadOk(true, result.updated);
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all });
      refreshBadges();
    },
    onError: (error) => chatDebug.notificationReadFailed(error),
  });
}
