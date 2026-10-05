'use client';

import { Button, Spin } from 'antd';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, type ReactNode } from 'react';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ROUTES, tenantSupportContextIdFromPath } from '@/constants/routes';
import { tenantSupportHref } from '@/constants/tenant-support-routes';
import { adminLoginWithNext, isAdminPublicPage } from '@/features/auth/post-auth-destination';
import { usePortalLogout } from '@/features/auth/hooks/use-portal-logout';
import { SupportSessionBoundary } from '@/features/tenant-support/components/SupportWorkspaceProvider';
import { useCurrentUser } from '@/hooks/use-current-user';
import { destroySession } from '@/services/auth.service';
import { ShellFrame } from './ShellFrame';
import { useNavPreferencesSync } from './use-nav-preferences-sync';
import styles from './AppShell.module.css';

/**
 * Khung của SITE QUẢN TRỊ (`admin.xeprime.vn`, realm `platform` — ADR 0051 điều 3 · ADR 0053).
 *
 * Dùng lại `ShellFrame` (Sidebar/Topbar/thanh tab) với menu nền tảng — không nhân bản khung. Khác
 * `AppShell` ở cổng: chỉ tài khoản có VAI nền tảng còn hiệu lực. Một tài khoản realm `platform` đã
 * bị gỡ khỏi đội ngũ vẫn đăng nhập được (phiên còn sống) nhưng dừng ở màn 403 này — tuyệt đối không
 * đẩy họ sang nơi khác: site quản trị không có "khu" nào khác để rơi vào.
 *
 * Phiên hỗ trợ gian hàng (ADR 0050 §12) sống TRONG khu này (`/tenant-support/<id phiên>/…`): ranh
 * giới phiên bọc cả khung, nên sidebar/breadcrumb/thanh tab là của gian hàng đang được hỗ trợ.
 *
 * Lớp trải nghiệm. Chặn thật: RealmGuard (chỉ realm `platform`) + `@PlatformOnly` + quyền ở API.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const t = useTranslations('ManageCommon.adminGate');
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const logout = usePortalLogout();
  const { data: user, isLoading, isError } = useCurrentUser();
  useNavPreferencesSync();

  const isPublicPage = isAdminPublicPage(pathname);
  const notAuthenticated = !isPublicPage && !isLoading && (isError || !user);

  // Phiên hỏng/hết hạn: dọn cookie rồi về trang đăng nhập của site quản trị (cùng lý do `AppShell`).
  useEffect(() => {
    if (!notAuthenticated) return;
    let cancelled = false;
    void (async () => {
      try {
        await destroySession();
      } catch {
        // Lỗi mạng khi xoá phiên vẫn không cản việc điều hướng ra trang đăng nhập.
      }
      if (cancelled) return;
      queryClient.clear();
      router.replace(adminLoginWithNext(pathname));
    })();
    return () => {
      cancelled = true;
    };
  }, [notAuthenticated, pathname, router, queryClient]);

  if (isPublicPage) return <>{children}</>;

  if (isLoading || isError || !user) {
    return (
      <div className={styles.centered}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user.platformRole) {
    return (
      <div className={styles.centered}>
        <PermissionState
          kind="forbidden"
          title={t('title')}
          description={t('description')}
          action={
            <Button type="primary" onClick={() => void logout()}>
              {t('logout')}
            </Button>
          }
        />
      </div>
    );
  }

  const supportContextId = tenantSupportContextIdFromPath(pathname);
  // Lịch của phiên hỗ trợ khoá chiều cao như lịch của chính gian hàng.
  const viewport =
    supportContextId !== null &&
    pathname === tenantSupportHref(supportContextId, ROUTES.MANAGE.CALENDAR);

  const frame = (
    <ShellFrame user={user} viewport={viewport}>
      {children}
    </ShellFrame>
  );

  return supportContextId ? (
    <SupportSessionBoundary key={supportContextId} contextId={supportContextId}>
      {frame}
    </SupportSessionBoundary>
  ) : (
    frame
  );
}
