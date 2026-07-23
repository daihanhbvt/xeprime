'use client';

import { Avatar, Dropdown, Layout, Space, Tag, Typography } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { TENANT_STATUS_META, type TenantStatus } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { StatusTag } from '@/components/data-display/StatusTag';
import { destroySession } from '@/services/auth.service';
import type { CurrentUser } from '@/hooks/use-current-user';
import styles from './Topbar.module.css';

export function Topbar({ user }: { user: CurrentUser }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    await destroySession();
    // Xoá sạch cache: dữ liệu của người vừa đăng xuất không được hiện lại cho người
    // đăng nhập sau trên cùng máy.
    queryClient.clear();
    router.replace(ROUTES.LOGIN);
  };

  return (
    <Layout.Header className={styles.header}>
      <Space size="small" className={styles.scope}>
        {user.tenant ? (
          <>
            <Typography.Text strong>{user.tenant.name}</Typography.Text>
            <StatusTag value={user.tenant.status as TenantStatus} meta={TENANT_STATUS_META} />
          </>
        ) : null}
        {user.platformRole ? <Tag color="magenta">Nền tảng</Tag> : null}
      </Space>

      <Dropdown
        menu={{
          items: [
            { key: 'name', label: user.displayName, disabled: true },
            { type: 'divider' },
            { key: 'logout', label: 'Đăng xuất', onClick: () => void handleLogout() },
          ],
        }}
      >
        <Space className={styles.user}>
          <Avatar size="small" src={user.avatarUrl ?? undefined} icon={<UserOutlined />} />
          <span className={styles.userName}>{user.displayName}</span>
        </Space>
      </Dropdown>
    </Layout.Header>
  );
}
