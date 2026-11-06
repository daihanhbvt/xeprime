'use client';

import { LockOutlined, LogoutOutlined, ShopOutlined, UserOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useLocaleMenuGroup } from '@/components/i18n/locale-menu';
import { ROUTES } from '@/constants/routes';
import { AccountTrackBadge } from '@/features/account/components/AccountTrackBadge';
import { usePortalLogout } from '@/features/auth/hooks/use-portal-logout';
import { isCommissionOwner } from '@/features/auth/post-auth-destination';
import { useShopSettingsAccess } from '@/features/shop/hooks/use-shop-settings-access';
import { useCurrentUser } from '@/hooks/use-current-user';
import { ZONE } from '@/zones';
import { useZone } from '@/zones/ZoneProvider';
import styles from './AccountMenu.module.css';

/**
 * Menu TÀI KHOẢN của khung quản lý — MỘT bộ mục cho mọi lối vào: khối hồ sơ ở header menu ngang
 * site partner (`PartnerHeader`), thẻ người dùng ở drawer/sidebar (`ManageUserCard`) và avatar ở
 * thanh trên site quản trị (`Topbar`). Trước 02/11/2026 mỗi lối vào tự dựng một bản và chúng đã lệch
 * nhau: bản ở thanh trên có đổi ngôn ngữ, bản ở thẻ thì không.
 *
 * Thứ tự: danh tính (gian hàng · ai đang đăng nhập · tuyến) → tài khoản của NGƯỜI → cài đặt gian
 * hàng → ngôn ngữ → đăng xuất.
 *
 *  - Site partner: "Tài khoản & bảo mật" (chủ xe tuyến hoa hồng: cùng URL là "Hồ sơ chủ xe").
 *    Site quản trị: chỉ trang bảo mật — nhân sự nền tảng không có hồ sơ công khai.
 *  - "Cài đặt gian hàng" chỉ khi người dùng ĐANG đứng trong một gian hàng tuyến gói
 *    (`useShopSettingsAccess`, cùng điều kiện với mọi lối vào khác của trang đó).
 *  - Không có mục "Chuyến tôi đi thuê" (ADR 0053): tài khoản partner/nền tảng không bao giờ đứng tên
 *    một chuyến đi thuê.
 *
 * Danh tính KHÔNG hiện email/SĐT: vỏ portal nằm trên mọi trang, kể cả lúc chia sẻ màn hình.
 */
export function useAccountMenuItems(): NonNullable<MenuProps['items']> {
  const t = useTranslations('ManageCommon');
  const { data: user } = useCurrentUser();
  const canOpenShopSettings = useShopSettingsAccess();
  const logout = usePortalLogout();
  const localeGroup = useLocaleMenuGroup();
  const isAdmin = useZone() === ZONE.ADMIN;

  if (!user) return [];

  const workspaceName = user.tenant?.name ?? (user.displayName || user.email || '-');
  const signedInAs = user.displayName || user.email || '-';

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
    isAdmin
      ? {
          key: 'security',
          icon: <LockOutlined aria-hidden />,
          label: <Link href={ROUTES.ADMIN.SECURITY}>{t('shell.security')}</Link>,
        }
      : {
          key: 'account',
          icon: <UserOutlined aria-hidden />,
          label: (
            <Link href={ROUTES.MANAGE.ACCOUNT}>
              {isCommissionOwner(user) ? t('shell.ownerProfile') : t('shell.account')}
            </Link>
          ),
        },
    ...(canOpenShopSettings && !isAdmin
      ? [
          {
            key: 'shop',
            icon: <ShopOutlined aria-hidden />,
            label: <Link href={ROUTES.MANAGE.SHOP}>{t('shell.shopSettings')}</Link>,
          },
        ]
      : []),
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
