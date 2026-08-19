'use client';

import { LogoutOutlined } from '@ant-design/icons';
import { Avatar, Button, Tooltip } from 'antd';
import {
  PLATFORM_ROLE_LABEL,
  TENANT_ROLE_LABEL,
  type PlatformRole,
  type TenantRole,
} from '@xeprime/types';
import { cx } from '@/lib/cx';
import { usePortalLogout } from '@/features/auth/hooks/use-portal-logout';
import { useCurrentUser } from '@/hooks/use-current-user';
import { initialOf } from '@/lib/initials';
import styles from './ManageUserCard.module.css';
import { useTranslations } from 'next-intl';

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

export interface ManageUserCardProps {
  /** Thu gọn còn avatar (sidebar 64px). */
  collapsed?: boolean;
  /**
   * `dark` = đặt trên `--xp-shell-sidebar-bg`. `light` = trên nền trắng (Drawer mobile —
   * tới Batch 1D-C mới đổi sang tối theo `14:1661`). Cùng quy ước với `ManageMenu`.
   */
  tone?: 'light' | 'dark';
}

/**
 * Thẻ người dùng ở chân sidebar/drawer: avatar, tên, vai trò, nút đăng xuất.
 *
 * Chỉ hiện tên hiển thị và nhãn vai trò — KHÔNG hiện email hay số điện thoại. Vỏ portal nằm
 * trên mọi trang, kể cả lúc chia sẻ màn hình.
 *
 * Đăng xuất gọi `usePortalLogout` dùng chung với `Topbar` — một luồng, hai lối vào.
 */
export function ManageUserCard({ collapsed = false, tone = 'light' }: ManageUserCardProps) {
  const t = useTranslations('ManageCommon');
  const { data: user } = useCurrentUser();
  const logout = usePortalLogout();

  if (!user) return null;

  const name = user.displayName || user.email || '—';
  const role = roleLabel(user.tenant?.roleKey, user.platformRole);
  const dark = tone === 'dark';

  const avatar = (
    <Avatar className={styles.avatar} src={user.avatarUrl ?? undefined}>
      {initialOf(user.displayName || user.email)}
    </Avatar>
  );

  const logoutButton = (
    <Button
      type="text"
      size="small"
      className={cx(styles.logout, dark && styles.logoutDark)}
      icon={<LogoutOutlined />}
      aria-label={t('shell.logout')}
      onClick={() => void logout()}
    />
  );

  if (collapsed) {
    return (
      <div className={cx(styles.card, dark && styles.dark, styles.cardCollapsed)}>
        {/* Thu gọn thì tên bị ẩn — tooltip là chỗ duy nhất còn đọc được "ai đang đăng nhập". */}
        <Tooltip title={`${name} · ${role}`} placement="right">
          <span className={styles.avatarWrap} aria-label={`${name} · ${role}`} role="img">
            {avatar}
          </span>
        </Tooltip>
        {logoutButton}
      </div>
    );
  }

  return (
    <div className={cx(styles.card, dark && styles.dark)}>
      {avatar}
      <div className={styles.info}>
        <div className={styles.name} title={name}>
          {name}
        </div>
        {/* Figma `14:1495`: vai trò là huy hiệu gold, không phải chữ mờ. Chữ trên nền gold
            dùng `--xp-color-primary-contrast` (đo được 6.60 — đạt AA). */}
        <span className={styles.role} title={role}>
          {role}
        </span>
      </div>
      {logoutButton}
    </div>
  );
}
