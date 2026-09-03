import { useCallback } from 'react';
import { useRouter, type Href } from 'expo-router';
import { APP_SCOPE, isAppScope, resolveScopeCapability, type AppScope } from './app-scope';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { deleteSecureItem, getSecureItem, setSecureItem, SECURE_KEY } from '@/lib/secure-storage';
import { fireAndForget } from '@/lib/fire-and-forget';
import { ROUTES } from '@/navigation/routes';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { lastRouteChanged, scopeChanged } from './shell-scope.slice';

/** Màn đầu của mỗi khu — nơi rơi về khi chưa nhớ đích nào. */
export function scopeHome(scope: AppScope): Href {
  return scope === APP_SCOPE.MANAGE ? ROUTES.manage.home() : ROUTES.explore.home();
}

/** Lựa chọn khu lần trước. Giá trị lạ (bản cũ, dữ liệu hỏng) coi như chưa chọn gì. */
export async function readRememberedScope(): Promise<AppScope | null> {
  const raw = await getSecureItem(SECURE_KEY.SHELL_SCOPE);
  return isAppScope(raw) ? raw : null;
}

export async function rememberScope(scope: AppScope): Promise<void> {
  await setSecureItem(SECURE_KEY.SHELL_SCOPE, scope);
}

export async function forgetScope(): Promise<void> {
  await deleteSecureItem(SECURE_KEY.SHELL_SCOPE);
}

export interface ShellScope {
  scope: AppScope;
  /** Có membership gian hàng — tín hiệu DUY NHẤT bật khu quản lý. */
  canManage: boolean;
  /** Đổi khu: ghi đích đang dở, nhớ lựa chọn, rồi `replace` sang đích của khu kia. */
  switchTo: (target: AppScope) => void;
  /** Ghi đích đang dở của một khu — layout của khu đó gọi mỗi lần route đổi. */
  trackRoute: (scope: AppScope, route: string) => void;
}

/**
 * Đọc và đổi khu app.
 *
 * `switchTo` dùng `replace`, KHÔNG `push`: hai khu không phải hai nấc sâu của cùng một cây, và
 * `push` sẽ để lại một nút lui dẫn ngược về khu vừa rời — đúng thứ người dùng không mong đợi.
 */
export function useShellScope(): ShellScope {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const scope = useAppSelector((s) => s.shellScope.scope);
  const lastRoute = useAppSelector((s) => s.shellScope.lastRoute);
  const { data: user } = useCurrentUser();

  const trackRoute = useCallback(
    (target: AppScope, route: string) => {
      dispatch(lastRouteChanged({ scope: target, route }));
    },
    [dispatch],
  );

  const switchTo = useCallback(
    (target: AppScope) => {
      if (target === scope) return;

      dispatch(scopeChanged(target));
      fireAndForget(() => rememberScope(target), 'useShellScope.rememberScope');

      // Đích đã nhớ là một chuỗi đường dẫn thật đã từng render — dùng thẳng làm `Href`.
      const destination = (lastRoute[target] as Href | undefined) ?? scopeHome(target);
      router.replace(destination);
    },
    [dispatch, lastRoute, router, scope],
  );

  return {
    scope,
    canManage: resolveScopeCapability(user).canManage,
    switchTo,
    trackRoute,
  };
}
