import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { subscribeSessionEnded } from '@/lib/auth-session';
import { logger } from '@/lib/logger';
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

  return children;
}
