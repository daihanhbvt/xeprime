'use client';

import { Button, Layout, Result, Spin } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { ROUTES } from '@/constants/routes';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useTenantScope } from '@/hooks/use-tenant-scope';
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
  const queryClient = useQueryClient();
  const { data: user, isLoading, isError } = useCurrentUser();
  const { hasNoTenant, isPendingApproval, tenant } = useTenantScope();

  async function handleLogout() {
    await destroySession();
    queryClient.clear();
    router.replace(ROUTES.LOGIN);
  }

  if (isLoading) {
    return (
      <div className={styles.centered}>
        <Spin size="large" />
      </div>
    );
  }

  if (isError || !user) {
    return (
      <div className={styles.centered}>
        <Logo size="lg" />
        <Result
          status="403"
          title="Chưa đăng nhập"
          subTitle="Phiên làm việc đã hết hạn hoặc bạn chưa đăng nhập."
          extra={
            <Link href={ROUTES.LOGIN}>
              <Button type="primary">Đăng nhập</Button>
            </Link>
          }
        />
      </div>
    );
  }

  // screen_spec §10.2: user đăng nhập nhưng chưa thuộc gian hàng nào cần màn riêng,
  // không đẩy thẳng vào dashboard rỗng. (Đăng ký gian hàng sẽ mở ở Slice 2.)
  if (hasNoTenant && !user.platformRole) {
    return (
      <div className={styles.centered}>
        <Logo size="lg" />
        <Result
          status="info"
          title="Bạn chưa thuộc gian hàng nào"
          subTitle="Tạo hồ sơ gian hàng để bắt đầu cho thuê xe, hoặc nhờ chủ shop mời bạn vào."
          extra={<Button onClick={() => void handleLogout()}>Đăng xuất</Button>}
        />
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
