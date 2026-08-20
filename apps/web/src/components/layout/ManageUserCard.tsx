'use client';

import { LogoutOutlined, ShopOutlined, UpOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Dropdown, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import Link from 'next/link';
import { PERMISSION } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { cx } from '@/lib/cx';
import { usePortalLogout } from '@/features/auth/hooks/use-portal-logout';
import { useCurrentUser } from '@/hooks/use-current-user';
import { usePermissions } from '@/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { initialOf } from '@/lib/initials';
import styles from './ManageUserCard.module.css';
import { useTranslations } from 'next-intl';

export interface ManageUserCardProps {
  /** Thu gọn còn avatar (sidebar 64px). */
  collapsed?: boolean;
  /**
   * `dark` = đặt trên `--xp-shell-sidebar-bg` (Sidebar desktop và Drawer mobile).
   * `light` = trên nền trắng. Cùng quy ước với `ManageMenu`.
   */
  tone?: 'light' | 'dark';
}

/**
 * Thẻ người dùng ở chân sidebar/drawer — và là lối vào MENU TÀI KHOẢN.
 *
 * Hồ sơ, cài đặt gian hàng và đăng xuất không phải chức năng vận hành, nên chúng không chiếm
 * dòng nào trong menu chính: cả ba nằm sau một cú bấm vào chính thẻ này. Nhờ vậy sidebar chỉ
 * còn những thứ chủ xe dùng để chạy việc.
 *
 * Chỉ hiện tên hiển thị và nhãn vai trò — KHÔNG hiện email hay số điện thoại. Vỏ portal nằm
 * trên mọi trang, kể cả lúc chia sẻ màn hình.
 *
 * Đăng xuất gọi `usePortalLogout` dùng chung với `Topbar` — một luồng, hai lối vào.
 */
export function ManageUserCard({ collapsed = false, tone = 'light' }: ManageUserCardProps) {
  const t = useTranslations('ManageCommon');
  const { data: user } = useCurrentUser();
  const { has } = usePermissions();
  const domainLabel = useDomainLabel();
  const logout = usePortalLogout();

  if (!user) return null;

  const name = user.displayName || user.email || '—';
  const roleKey = user.tenant?.roleKey;
  const role = roleKey
    ? domainLabel('tenantRole', roleKey, roleKey)
    : user.platformRole
      ? domainLabel('platformRole', user.platformRole, user.platformRole)
      : '—';
  const dark = tone === 'dark';

  const menuItems: MenuProps['items'] = [
    {
      key: 'profile',
      icon: <UserOutlined aria-hidden />,
      label: <Link href={ROUTES.ACCOUNT}>{t('shell.profile')}</Link>,
    },
    // Cài đặt gian hàng chỉ có nghĩa khi người dùng ĐANG đứng trong một gian hàng — nhân sự
    // nền tảng không có gian hàng nào để cài đặt.
    ...(user.tenant && has(PERMISSION.TENANT_VIEW)
      ? [
          {
            key: 'shop',
            icon: <ShopOutlined aria-hidden />,
            label: <Link href={ROUTES.MANAGE.SHOP}>{t('shell.shopSettings')}</Link>,
          },
        ]
      : []),
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined aria-hidden />,
      label: t('shell.logout'),
      onClick: () => void logout(),
    },
  ];

  const avatar = (
    <Avatar className={styles.avatar} src={user.avatarUrl ?? undefined}>
      {initialOf(user.displayName || user.email)}
    </Avatar>
  );

  const trigger = collapsed ? (
    // Thu gọn thì tên bị ẩn — tooltip là chỗ duy nhất còn đọc được "ai đang đăng nhập".
    <Tooltip title={`${name} · ${role}`} placement="right">
      <button
        type="button"
        className={cx(styles.card, dark && styles.dark, styles.cardCollapsed)}
        aria-label={`${t('shell.accountMenu')}: ${name} · ${role}`}
      >
        {avatar}
      </button>
    </Tooltip>
  ) : (
    <button
      type="button"
      className={cx(styles.card, dark && styles.dark)}
      aria-label={`${t('shell.accountMenu')}: ${name} · ${role}`}
    >
      {avatar}
      <span className={styles.info}>
        <span className={styles.name} title={name}>
          {name}
        </span>
        {/* Figma `14:1495`: vai trò là huy hiệu gold, không phải chữ mờ. Chữ trên nền gold
            dùng `--xp-color-primary-contrast` (đo được 6.60 — đạt AA). */}
        <span className={styles.role} title={role}>
          {role}
        </span>
      </span>
      <UpOutlined className={styles.caret} aria-hidden />
    </button>
  );

  return (
    <Dropdown trigger={['click']} placement="topRight" menu={{ items: menuItems }}>
      {trigger}
    </Dropdown>
  );
}
