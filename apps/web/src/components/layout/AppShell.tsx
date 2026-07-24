'use client';

import { Button, Layout, Result, Spin } from 'antd';
import { usePathname, useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { ROUTES } from '@/constants/routes';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { ShopRegistration } from '@/features/shop/components/ShopRegistration';
import { destroySession } from '@/services/auth.service';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import styles from './AppShell.module.css';

/**
 * Khung của Management Portal.
 *
 * Portal dùng chung cho gian hàng và nền tảng, khác nhau ở scope (screen_spec §5) — nên
 * shell không phân biệt host/admin, chỉ Sidebar lọc menu theo quyền.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data: user, isLoading, isError } = useCurrentUser();
  const { hasNoTenant, isPendingApproval, tenant } = useTenantScope();

  async function handleLogout() {
    await destroySession();
    queryClient.clear();
    router.replace(ROUTES.LOGIN);
  }

  const notAuthenticated = !isLoading && (isError || !user);

  // Cookie phiên hỏng/hết hạn: proxy chỉ kiểm tra CÓ cookie chứ không verify, nên vẫn cho vào
  // /manage rồi /auth/me trả 401. Ở đây xoá cookie hỏng (DELETE /auth/session) rồi ra thẳng
  // /login — không xoá thì proxy cứ đá /login ngược lại /manage (loop).
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
      router.replace(`${ROUTES.LOGIN}?next=${encodeURIComponent(pathname)}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [notAuthenticated, pathname, router, queryClient]);

  if (isLoading) {
    return (
      <div className={styles.centered}>
        <Spin size="large" />
      </div>
    );
  }

  if (isError || !user) {
    // Đang xoá phiên hỏng và điều hướng ra /login (effect ở trên) — chỉ hiện spinner.
    return (
      <div className={styles.centered}>
        <Spin size="large" />
      </div>
    );
  }

  // screen_spec §10.2: user đăng nhập nhưng chưa thuộc gian hàng nào → cho đăng ký gian hàng
  // ngay tại đây, không đẩy vào dashboard rỗng. Đăng ký xong /auth/me có tenant → vào portal.
  if (hasNoTenant && !user.platformRole) {
    return (
      <div className={styles.centered}>
        <Logo size="lg" />
        <ShopRegistration />
        <Button type="text" onClick={() => void handleLogout()}>
          Đăng xuất
        </Button>
      </div>
    );
  }

  return (
    <Layout className={styles.shell}>
      <Sidebar />
      <Layout>
        <Topbar user={user} />
        <Layout.Content className={styles.content}>
          {isPendingApproval && tenant ? (
            <Result
              status="warning"
              title="Gian hàng đang chờ duyệt"
              subTitle="Bạn vẫn xem được dữ liệu, nhưng xe chưa lên marketplace cho tới khi hồ sơ được duyệt."
              className={styles.pendingBanner}
            />
          ) : null}
          {children}
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
