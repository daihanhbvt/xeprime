import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { subscribeSessionEnded } from '@/lib/auth-session';
import { logger } from '@/lib/logger';
import { queryKeys } from '@/queries/query-keys';
import { resetSessionScopedCache } from '@/queries/reset-session-cache';

/**
 * Tầng DUY NHẤT phản ứng khi phiên kết thúc.
 *
 * Nguồn tin là kho token, KHÔNG phải mã 401 của từng request: access token chỉ sống 15 phút
 * (ADR 0017) nên 401 là chuyện thường ngày và client tự làm mới rồi đi tiếp. Phiên chỉ thật sự
 * chết khi refresh token bị từ chối hoặc người dùng đăng xuất — đúng hai lúc đó cache mới dọn.
 *
 * Màn hình KHÔNG tự kiểm 401 — chúng chỉ đọc `useCurrentUser`, và `<RequireSession>` là nơi duy
 * nhất quyết định hiện gì khi không có phiên. Tách làm hai vì kho token nằm ngoài cây React
 * (không gọi được hook), còn cổng thì không thấy vòng đời của token.
 */
export function SessionBoundary({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  useEffect(
    () =>
      subscribeSessionEnded(() => {
        logger.warn('Phiên kết thúc — dọn dữ liệu của phiên');
        resetSessionScopedCache(queryClient);
      }),
    [queryClient],
  );

  /**
   * Quyền và gian hàng đọc lại mỗi lần app quay lại tiền cảnh.
   *
   * `STALE_TIME.STANDARD` của `useCurrentUser` không đủ: điện thoại nằm trong túi hàng giờ, và
   * trong lúc đó chủ shop có thể đã gỡ người này khỏi gian hàng. Không có nhịp này thì họ mở
   * app ra vẫn thấy quyền cũ cho tới khi chạm phải request đầu tiên trả 403.
   *
   * `invalidateQueries` chứ không `refetchQueries`: màn nào không đang mounted thì chỉ cần đánh
   * dấu cũ, khỏi tốn một request cho dữ liệu chưa ai nhìn.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
    });
    return () => sub.remove();
  }, [queryClient]);

  return children;
}
