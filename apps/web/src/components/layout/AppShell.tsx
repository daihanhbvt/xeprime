'use client';

import { Result, Spin } from 'antd';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { ROUTES } from '@/constants/routes';
import { portalLoginWithNext } from '@/features/auth/post-auth-destination';
import { NoTenantState } from '@/features/shop/components/NoTenantState';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { destroySession } from '@/services/auth.service';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { MobileNav } from './MobileNav';
import styles from './AppShell.module.css';
import { useTranslations } from 'next-intl';

/**
 * Các route NẰM TRONG `/manage` nhưng không dùng khung portal.
 *
 * `/manage/login` phải công khai, nếu không thì chưa đăng nhập sẽ bị chính shell đá về
 * `/manage/login` → vòng lặp. `/manage/onboarding` đã đăng nhập nhưng chưa có gian hàng, tức là
 * đúng nhóm mà shell chặn — nên nó tự render lấy, không có sidebar (chưa có gì để điều hướng).
 *
 * Next.js không cho một route con "thoát" layout cha, nên danh sách này là cách khai báo điều
 * đó ở đúng nơi quyết định — chính shell.
 */
const PUBLIC_PORTAL_PATHS: readonly string[] = [ROUTES.MANAGE.LOGIN];
const BARE_PORTAL_PATHS: readonly string[] = [ROUTES.MANAGE.LOGIN, ROUTES.MANAGE.ONBOARDING];

/**
 * Route CHIẾM TRỌN VIEWPORT: vùng cuộn dọc là của chính màn đó (lịch xe cuộn TRONG lưới),
 * không phải của body. Shell khoá chiều cao = 100dvh và tắt cuộn ở `.content`; đồng thời ẨN
 * thanh bottom-nav mobile CHỈ ở các route này — lịch cần đáy màn hình cho hàng "Xe còn trống",
 * các trang khác vẫn giữ điều hướng như cũ.
 */
const VIEWPORT_PORTAL_PATHS: readonly string[] = [ROUTES.MANAGE.CALENDAR];

/**
 * Khung của Management Portal.
 *
 * Portal dùng chung cho gian hàng và nền tảng, khác nhau ở scope (screen_spec §5) — nên
 * shell không phân biệt host/admin, chỉ Sidebar lọc menu theo quyền.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations('ManageCommon');
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data: user, isLoading, isError } = useCurrentUser();
  const { hasNoTenant, isPendingApproval, tenant } = useTenantScope();

  const isPublicPortalPath = PUBLIC_PORTAL_PATHS.includes(pathname);
  const isBarePortalPath = BARE_PORTAL_PATHS.includes(pathname);
  const notAuthenticated = !isPublicPortalPath && !isLoading && (isError || !user);

  // Cookie phiên hỏng/hết hạn: proxy chỉ kiểm tra CÓ cookie chứ không verify, nên vẫn cho vào
  // /manage rồi /auth/me trả 401. Ở đây xoá cookie hỏng (DELETE /auth/session) rồi ra
  // /manage/login — không xoá thì proxy cứ đá login ngược lại /manage (loop).
  useEffect(() => {
    if (!notAuthenticated) return;
    let cancelled = false;
    void (async () => {
      try {
        await destroySession();
      } catch {
        // Lỗi mạng khi xoá phiên vẫn không cản việc điều hướng ra login.
      }
      if (cancelled) return;
      queryClient.clear();
      router.replace(portalLoginWithNext(pathname));
    })();
    return () => {
      cancelled = true;
    };
  }, [notAuthenticated, pathname, router, queryClient]);

  // Trang đăng nhập cổng quản lý tự render lấy — không cần user, không có shell.
  if (isPublicPortalPath) return <>{children}</>;

  if (isLoading || isError || !user) {
    // Hoặc đang nạp /auth/me, hoặc đang dọn phiên hỏng để ra login (effect ở trên).
    return (
      <div className={styles.centered}>
        <Spin size="large" />
      </div>
    );
  }

  // User đăng nhập nhưng chưa thuộc gian hàng nào và không phải nhân sự nền tảng.
  // KHÔNG tự bật form tạo gian hàng ở đây (hành vi cũ): "chưa có shop" là trạng thái hợp lệ của
  // một khách thuê xe. Form tạo shop chỉ sống ở `/manage/onboarding`, nơi người dùng chủ động vào.
  if (hasNoTenant && !user.platformRole) {
    if (isBarePortalPath) return <>{children}</>;
    return <NoTenantState />;
  }

  if (isBarePortalPath) return <>{children}</>;

  const isViewportPath = VIEWPORT_PORTAL_PATHS.includes(pathname);

  return (
    <div
      className={[styles.shell, isViewportPath ? styles.shellViewport : '']
        .filter(Boolean)
        .join(' ')}
    >
      <Sidebar />
      <div className={styles.main}>
        <Topbar user={user} />
        <main
          className={[styles.content, isViewportPath ? styles.contentViewport : '']
            .filter(Boolean)
            .join(' ')}
        >
          {isPendingApproval && tenant ? (
            <Result
              status="warning"
              title={t('shell.pendingTitle')}
              subTitle={t('shell.pendingBody')}
              className={styles.pendingBanner}
            />
          ) : null}
          {children}
        </main>
        {isViewportPath ? null : <MobileNav />}
      </div>
    </div>
  );
}
