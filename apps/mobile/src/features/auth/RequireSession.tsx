import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { ROUTES } from '@/navigation/routes';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { SESSION_STATUS, useSessionGate } from './hooks/use-session-gate';

/**
 * Cổng "phải đăng nhập mới xem được" (AUTH-07) — bản native của việc `(manage)`/`/account` bên
 * web bị `AppShell`/`AccountShell` gác.
 *
 * Thanh tab đã ẩn các mục cần đăng nhập, nhưng **ẩn không phải chặn**: một deep link
 * (`xeprime://trips`) hay một thông báo đẩy mở thẳng màn đó, và nó render với dữ liệu rỗng rồi
 * bắn một loạt 401.
 *
 * Nó KHÔNG thay guard backend — mọi endpoint phía sau vẫn tự kiểm phiên và quyền (CLAUDE.md
 * mục 6). Và nó KHÔNG điều hướng: `<Redirect>` lúc mạng chập chờn sẽ ném người dùng ra khỏi màn
 * họ đang đọc.
 */
export function RequireSession({
  children,
  fallback,
}: {
  children: ReactNode;
  /**
   * Skeleton của màn được bảo vệ. Bỏ trống chỉ khi màn đó CHƯA có hình dạng để dựng trước — lúc
   * đó spinner là câu trả lời trung thực, không phải lối tắt (skill mục 4b).
   */
  fallback?: ReactNode;
}) {
  const t = useTranslations('Account');
  const navigateOnce = useNavigateOnce();
  const { status, error, retry } = useSessionGate();

  switch (status) {
    case SESSION_STATUS.LOADING:
      return fallback ? (
        <Screen>{fallback}</Screen>
      ) : (
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
            onAction={() => navigateOnce(ROUTES.account.login())}
          />
        </Screen>
      );

    // Mất mạng KHÔNG phải hết phiên: bắt một người vẫn còn phiên hợp lệ đăng nhập lại vì đi qua
    // thang máy là sai. Cho thử lại.
    case SESSION_STATUS.UNREACHABLE:
      return (
        <Screen scroll={false}>
          <ScreenError error={error} onRetry={retry} />
        </Screen>
      );

    case SESSION_STATUS.READY:
      return children;
  }
}
