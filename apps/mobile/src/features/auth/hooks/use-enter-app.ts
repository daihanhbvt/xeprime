import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { resolveInitialScope, type AppScope } from '@/features/shell/app-scope';
import type { CurrentUser } from '@/features/auth/api';
import { enterApp } from '@/features/auth/enter-app';
import { fireAndForget } from '@/lib/fire-and-forget';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { readRememberedScope } from '@/features/shell/use-shell-scope';
import { deepLinkConsumed, scopeChanged } from '@/features/shell/shell-scope.slice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

/**
 * "Đăng nhập xong thì vào khu nào" — cùng luật với lúc mở app (`resolveInitialScope`).
 *
 * Có hook này vì `enterApp()` là hàm thuần và không đọc được Keychain hay Redux, còn ba màn đăng
 * nhập thì không nên tự biết chuyện đó. Lệch luật giữa "mở app" và "vừa đăng nhập" là kiểu lỗi
 * chỉ chủ gian hàng gặp, và họ mô tả nó thành "app lúc thì vào chỗ này lúc thì vào chỗ kia".
 *
 * Deep link đang chờ THẮNG cả hai: link là thứ người dùng chủ động bấm để tới.
 */
export function useEnterApp(): (user?: CurrentUser) => void {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const pendingDeepLink = useAppSelector((s) => s.shellScope.pendingDeepLink);
  // Màn nào có sẵn hồ sơ thì truyền vào; màn nào không (đăng ký, đặt mật khẩu) đọc bản
  // `seedSession()` vừa ghi vào cache — cùng một dữ liệu, không thêm request.
  const { data: cachedUser } = useCurrentUser();

  return useCallback(
    (user?: CurrentUser) => {
      /*
       * Đọc Keychain có thể hỏng (máy khoá, keystore lỗi) và khi đó KHÔNG được để người dùng kẹt
       * lại màn đăng nhập: phiên đã cấp xong, thứ duy nhất mất là lựa chọn khu lần trước mà
       * `resolveInitialScope` vốn đã có luật cho. Phải BẮT ở đây — `void (async …)()` để lỗi nổi
       * lên thành `Uncaught (in promise)` ngay sau khi đăng nhập thành công và app đứng im.
       */
      const enter = async () => {
        let remembered: AppScope | null = null;
        try {
          remembered = await readRememberedScope();
        } catch (error) {
          if (__DEV__) console.warn('[useEnterApp] không đọc được khu đã nhớ:', error);
        }

        const scope = resolveInitialScope({ user: user ?? cachedUser, remembered });

        dispatch(scopeChanged(scope));
        if (pendingDeepLink) dispatch(deepLinkConsumed());

        enterApp(router, { scope, next: pendingDeepLink });
      };

      fireAndForget(enter, 'useEnterApp');
    },
    [cachedUser, dispatch, pendingDeepLink, router],
  );
}
