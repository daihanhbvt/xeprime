import { useEffect } from 'react';
import { usePathname } from 'expo-router';
import type { AppScope } from './app-scope';
import { useAppDispatch } from '@/store/hooks';
import { lastRouteChanged } from './shell-scope.slice';

/**
 * Ghi màn đang dở của một khu, để lần đổi khu sau quay lại đúng chỗ.
 *
 * Gọi ở `_layout.tsx` của từng khu chứ không ở root: layout gốc thấy cả những màn CHEN NGANG
 * (`/login`, `/auth/callback`, `/+not-found`), và nhớ nhầm một trong số đó nghĩa là mở lại khu
 * quản lý rơi thẳng vào màn đăng nhập.
 */
export function useTrackScopeRoute(scope: AppScope): void {
  const dispatch = useAppDispatch();
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    dispatch(lastRouteChanged({ scope, route: pathname }));
  }, [dispatch, pathname, scope]);
}
