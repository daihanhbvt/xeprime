'use client';

import { LogoutOutlined } from '@ant-design/icons';
import { Avatar, Button } from 'antd';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  PLATFORM_ROLE_LABEL,
  TENANT_ROLE_LABEL,
  type PlatformRole,
  type TenantRole,
} from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { useCurrentUser } from '@/hooks/use-current-user';
import { destroySession } from '@/services/auth.service';
import styles from './ManageUserCard.module.css';

/** Nhãn vai trò hiển thị: ưu tiên role gian hàng, rồi tới role nền tảng. */
function roleLabel(roleKey: string | undefined, platformRole: string | null): string {
  if (roleKey && roleKey in TENANT_ROLE_LABEL) {
    return TENANT_ROLE_LABEL[roleKey as TenantRole];
  }
  if (platformRole && platformRole in PLATFORM_ROLE_LABEL) {
    return PLATFORM_ROLE_LABEL[platformRole as PlatformRole];
  }
  return roleKey ?? platformRole ?? '—';
}

/**
 * Thẻ người dùng ở chân sidebar/drawer: avatar, tên, vai trò, nút đăng xuất.
 * Dùng chung desktop (Sidebar) và mobile (Drawer) để một chỗ sửa là cả hai đổi.
 */
export function ManageUserCard() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();

  async function handleLogout() {
    await destroySession();
    // Xoá cache: dữ liệu người vừa thoát không hiện lại cho người đăng nhập kế trên cùng máy.
    queryClient.clear();
    // Đăng xuất TỪ cổng quản lý → về đăng nhập cổng quản lý, không phải marketplace.
    router.replace(ROUTES.MANAGE.LOGIN);
  }

  if (!user) return null;

  const initial = (user.displayName || user.email || '?').trim().charAt(0).toUpperCase();

  return (
    <div className={styles.card}>
      <Avatar className={styles.avatar} src={user.avatarUrl ?? undefined}>
        {initial}
      </Avatar>
      <div className={styles.info}>
        <div className={styles.name}>{user.displayName}</div>
        <div className={styles.role}>{roleLabel(user.tenant?.roleKey, user.platformRole)}</div>
      </div>
      <Button
        type="text"
        size="small"
        icon={<LogoutOutlined />}
        aria-label="Đăng xuất"
        onClick={() => void handleLogout()}
      />
    </div>
  );
}
