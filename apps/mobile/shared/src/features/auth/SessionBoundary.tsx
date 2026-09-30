import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { router } from 'expo-router';
import { branchScopeReset } from '@/features/branches/branch-scope.slice';
import { shellScopeReset } from '@/features/shell/shell-scope.slice';
import { subscribeSessionEnded } from '@/lib/auth-session';
import { leaveApp } from './leave-app';
import { logger } from '@/lib/logger';
import { queryKeys } from '@/queries/query-keys';
import { resetSessionScopedCache } from '@/queries/reset-session-cache';
import { useAppDispatch } from '@/store/hooks';

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
  const dispatch = useAppDispatch();

  /*
   * Cache của TanStack Query không phải chỗ duy nhất mang dấu vết phiên cũ — hai lựa chọn UI ở
   * Redux cũng vậy:
   *
   *   - scope CHI NHÁNH: một id chi nhánh của gian hàng trước sẽ lọc rỗng mọi danh sách của
   *     người đăng nhập kế tiếp;
   *   - scope VỎ (khu khách / khu quản lý) + đích đã nhớ của từng khu: đăng xuất từ trong khu
   *     quản lý mà không dọn thì người kế tiếp mở thẳng vào cổng quản lý của một gian hàng họ
   *     không thuộc về, rồi bị `ScopeGuard` đá ra — một cú nháy không ai giải thích được. Chỉ từ
   *     16/09/2026 đường này mới có thật: trước đó khu quản lý không có chỗ nào để đăng xuất.
   */
  /*
   * ĐIỀU HƯỚNG cũng thuộc về đây, không thuộc về cái nút đăng xuất.
   *
   * Phiên chết mà người dùng đang đứng ở một màn CẦN phiên thì màn đó hoá thành "Vui lòng đăng
   * nhập để xem tài khoản của bạn" và nằm lại đó — `RequireSession`/`ScopeGuard` cố ý không tự
   * điều hướng (một `<Redirect>` lúc mạng chập chờn sẽ ném người dùng ra khỏi màn đang đọc). Để
   * mỗi nút đăng xuất tự lo phần rời màn thì đường phiên chết vì refresh token bị từ chối không
   * có ai lo cả — và đó là đường xảy ra nhiều hơn.
   *
   * Dùng `router` TOÀN CỤC của expo-router chứ không phải hook: tầng này nằm NGOÀI `<Stack>`,
   * nên ở đây không có navigator nào để `useRouter()` bám vào.
   */
  useEffect(
    () =>
      subscribeSessionEnded(() => {
        logger.warn('Phiên kết thúc — dọn dữ liệu của phiên');
        resetSessionScopedCache(queryClient);
        dispatch(branchScopeReset());
        dispatch(shellScopeReset());
        leaveApp(router);
      }),
    [dispatch, queryClient],
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
