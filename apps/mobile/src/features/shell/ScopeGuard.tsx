import { useEffect, useRef, type ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { APP_SCOPE } from './app-scope';
import { useTranslations } from 'use-intl';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { SESSION_STATUS, useSessionGate } from '@/features/auth/hooks/use-session-gate';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import { ROUTES } from '@/navigation/routes';
import { fireAndForget } from '@/lib/fire-and-forget';
import { useAppDispatch } from '@/store/hooks';
import { forgetScope, scopeHome } from './use-shell-scope';
import { scopeChanged } from './shell-scope.slice';

/**
 * Cổng của KHU QUẢN LÝ — người có membership gian hàng HOẶC nhân sự nền tảng đi qua.
 *
 * Hai loại vai, một khu: menu bên trong đã rẽ nhánh sẵn theo `platformRole` (`manageNavForScope`
 * → `PLATFORM_NAV` / `SHOP_NAV`), nên gác bằng riêng `tenant` sẽ đá nhân sự nền tảng ra khỏi
 * đúng khu được dựng cho họ. Đối xứng với web: `resolvePortalDestination` đưa người chỉ có
 * platform role vào `/manage`, còn 403 thật do guard backend quyết định.
 *
 * Hai điều nó cố ý KHÔNG làm:
 *
 * 1. **Không đăng xuất.** Mất quyền gian hàng ≠ mất phiên. Người dùng bị đưa về khu khách kèm
 *    một câu giải thích, và vẫn đăng nhập nguyên vẹn — đối xứng với `AdminLayout` bên web, nơi
 *    403 không bao giờ dẫn về màn đăng nhập.
 * 2. **Không gánh 403 của từng màn.** Màn nào bị API từ chối thì tự hiện trạng thái lỗi của
 *    chính nó; cổng này dọn ở nhịp refetch `/auth/me` kế tiếp. Để mỗi màn tự điều hướng khi
 *    gặp 403 là dựng một máy trạng thái thứ hai chạy song song với cổng này.
 *
 * Đá về khu khách chạy trong `useEffect` chứ không phải `<Redirect>` giữa lúc render: điều
 * hướng trong thân render của một layout đang mount là nguồn của cảnh báo "update during render"
 * và của những cú nháy không lần ra được.
 */
export function ScopeGuard({ children }: { children: ReactNode }) {
  const t = useTranslations('MobileShell.scope');
  const router = useRouter();
  const dispatch = useAppDispatch();
  const toast = useAppToast();
  const { status, error, retry } = useSessionGate();
  const { tenant } = useTenantScope();
  const { data: user } = useCurrentUser();

  const ready = status === SESSION_STATUS.READY;
  // "Không còn gì để quản lý" = mất CẢ hai lối: không gian hàng và không vai nền tảng.
  const evicted = ready && tenant === null && !user?.platformRole;

  // Toast chỉ bắn MỘT lần cho mỗi lần bị đá: effect chạy lại theo nhịp refetch, và bốn bản sao
  // của cùng một câu đọc như app đang hỏng chứ không như một lời giải thích.
  const announced = useRef(false);

  useEffect(() => {
    if (!evicted) {
      announced.current = false;
      return;
    }
    if (announced.current) return;
    announced.current = true;

    dispatch(scopeChanged(APP_SCOPE.CUSTOMER));
    fireAndForget(forgetScope, 'ScopeGuard.forgetScope');
    toast.showInfo(t('lostAccess'));
    router.replace(scopeHome(APP_SCOPE.CUSTOMER));
  }, [dispatch, evicted, router, t, toast]);

  switch (status) {
    case SESSION_STATUS.LOADING:
      return (
        <Screen scroll={false}>
          <ScreenLoading />
        </Screen>
      );

    case SESSION_STATUS.UNAUTHENTICATED:
      return (
        <Screen scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('signInRequired')}
            actionLabel={t('signIn')}
            onAction={() => router.push(ROUTES.account.login())}
          />
        </Screen>
      );

    case SESSION_STATUS.UNREACHABLE:
      return (
        <Screen scroll={false}>
          <ScreenError error={error} onRetry={retry} />
        </Screen>
      );

    case SESSION_STATUS.READY:
      // Khung hình giữa lúc effect ở trên chưa kịp chạy: hiện màn chờ thay vì nội dung quản lý
      // của một người vừa mất quyền đọc nó. (`READY` đã bảo đảm có `user` — xem `useSessionGate`.)
      return evicted ? (
        <Screen scroll={false}>
          <ScreenLoading />
        </Screen>
      ) : (
        children
      );
  }
}
