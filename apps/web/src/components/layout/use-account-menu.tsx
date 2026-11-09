'use client';

import { LockOutlined, LogoutOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useLocaleMenuGroup } from '@/components/i18n/locale-menu';
import { ROUTES } from '@/constants/routes';
import { AccountTrackBadge } from '@/features/account/components/AccountTrackBadge';
import { usePortalLogout } from '@/features/auth/hooks/use-portal-logout';
import { useCurrentUser } from '@/hooks/use-current-user';
import styles from './AccountMenu.module.css';

/**
 * Menu TÀI KHOẢN của khung SITE QUẢN TRỊ — avatar ở thanh trên (`Topbar`) và thẻ người dùng ở
 * drawer mobile (`ManageUserCard`). Một bộ mục cho cả hai lối vào.
 *
 * Site partner đã có menu hồ sơ riêng theo design (`PartnerAccountMenu`, Figma `24051:85101`,
 * 06/11/2026); site quản trị giữ bản này cho tới khi có design của nó.
 *
 * Thứ tự: danh tính (khu làm việc · ai đang đăng nhập · tuyến) → bảo mật → ngôn ngữ → đăng xuất.
 * Nhân sự nền tảng không có hồ sơ công khai nên chỉ có trang bảo mật. Danh tính KHÔNG hiện
 * email/SĐT: vỏ portal nằm trên mọi trang, kể cả lúc chia sẻ màn hình.
 */
export function useAccountMenuItems(): NonNullable<MenuProps['items']> {
  const t = useTranslations('ManageCommon');
  const { data: user } = useCurrentUser();
  const logout = usePortalLogout();
  const localeGroup = useLocaleMenuGroup();

  if (!user) return [];

  const workspaceName = user.tenant?.name ?? (user.displayName || user.email || '—');
  const signedInAs = user.displayName || user.email || '—';

  return [
    {
      key: 'identity',
      label: (
        <span className={styles.identity}>
          <span className={styles.workspace}>{workspaceName}</span>
          <span className={styles.signedInAs}>{t('shell.signedInAs', { name: signedInAs })}</span>
          <AccountTrackBadge tenant={user.tenant} size="small" />
        </span>
      ),
      disabled: true,
    },
    { type: 'divider' },
    {
      key: 'security',
      icon: <LockOutlined aria-hidden />,
      label: <Link href={ROUTES.ADMIN.SECURITY}>{t('shell.security')}</Link>,
    },
    { type: 'divider' },
    localeGroup,
    { type: 'divider' },
    {
      key: 'logout',
      icon: <LogoutOutlined aria-hidden />,
      label: t('shell.logout'),
      onClick: () => void logout(),
    },
  ];
}
