'use client';

import {
  DownOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Dropdown, type MenuProps } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Logo } from '@/components/brand/Logo';
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
import { useLocaleMenuGroup } from '@/components/i18n/locale-menu';
import { APP_NAME } from '@/constants/app-name';
import { ROUTES } from '@/constants/routes';
import { useAuthModal, useNextFromCurrentPath } from '@/features/auth/components/AuthModalProvider';
import { useMarketLogout } from '@/features/auth/hooks/use-market-logout';
import { AUTH_MODE } from '@/features/auth/post-auth-destination';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { CHAT_SIDE } from '@xeprime/types';
import { ChatMenu } from '@/features/chat/components/ChatMenu';
import { useCurrentUser, type CurrentUser } from '@/hooks/use-current-user';
import styles from './MarketHeader.module.css';

/** Điều hướng chính — thứ tự và đích cố định, nhãn theo ngôn ngữ. */
const NAV = [
  { key: 'explore', labelKey: 'explore', href: ROUTES.HOME },
  { key: 'about', labelKey: 'about', href: ROUTES.HOME },
  { key: 'trips', labelKey: 'trips', href: ROUTES.TRIPS },
] as const;

export function MarketHeader() {
  const t = useTranslations('Navigation.public');
  const { data: user } = useCurrentUser();
  const { open } = useAuthModal();
  const logout = useMarketLogout();
  const nextFromHere = useNextFromCurrentPath();
  const localeGroup = useLocaleMenuGroup();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href={ROUTES.HOME} className={styles.brand} aria-label={APP_NAME}>
          <Logo size="sm" />
        </Link>

        <nav className={styles.nav} aria-label={t('mainNavLabel')}>
          {NAV.map((item, i) => (
            <Link
              key={item.key}
              href={item.href}
              className={i === 0 ? styles.navActive : styles.navLink}
            >
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>

        <div className={styles.right}>
          {user ? (
            <>
              <ChatMenu side={CHAT_SIDE.CUSTOMER} />
              <NotificationBell context="customer" />
              {/*
                Đổi ngôn ngữ nằm TRONG menu tài khoản (nhóm cuối), không phải một nút riêng trên
                thanh: nó là việc làm một lần rồi thôi, còn chỗ trên thanh thì dành cho những thứ
                người ta bấm hằng ngày. Khách CHƯA đăng nhập không có menu này nên vẫn được một
                nút riêng ở nhánh dưới — chọn ngôn ngữ không được nằm sau một cổng đăng nhập.
              */}
              <Dropdown
                trigger={['click']}
                menu={{ items: accountMenu(user, logout, t, localeGroup) }}
              >
                <span
                  className={styles.avatarTrigger}
                  role="button"
                  tabIndex={0}
                  aria-label={t('account')}
                >
                  <Avatar className={styles.avatar} size={34} src={user.avatarUrl ?? undefined}>
                    {initial(user.displayName)}
                  </Avatar>
                  <DownOutlined className={styles.avatarCaret} aria-hidden="true" />
                </span>
              </Dropdown>
            </>
          ) : (
            <>
              <LocaleSwitcher />
              {/* Đăng nhập của KHÁCH mở modal ngay tại trang đang xem — không rời marketplace. */}
              <Button
                type="primary"
                icon={<UserOutlined />}
                onClick={() => open({ mode: AUTH_MODE.LOGIN, next: nextFromHere() })}
              >
                {t('login')}
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * Menu tài khoản chỉ hiện lối vào mà user THẬT SỰ có scope, trừ đúng một ngoại lệ: lời mời
 * "Trở thành chủ xe" — đó là hành động tự nguyện, không phải khu vực bị khoá.
 */
function accountMenu(
  user: CurrentUser,
  onLogout: () => void,
  t: ReturnType<typeof useTranslations<'Navigation.public'>>,
  localeGroup: NonNullable<MenuProps['items']>[number],
): MenuProps['items'] {
  return [
    { key: 'name', label: user.displayName, disabled: true },
    { type: 'divider' },
    { key: 'account', label: <Link href={ROUTES.ACCOUNT.ROOT}>{t('accountMine')}</Link> },
    { key: 'trips', label: <Link href={ROUTES.TRIPS}>{t('trips')}</Link> },
    { key: 'chat', label: <Link href={ROUTES.CHAT}>{t('chat')}</Link> },
    { type: 'divider' },
    user.tenant
      ? {
          key: 'manage',
          icon: <ShopOutlined />,
          label: <Link href={ROUTES.MANAGE.ROOT}>{t('manageShop')}</Link>,
        }
      : {
          key: 'become-owner',
          icon: <ShopOutlined />,
          label: <Link href={ROUTES.MANAGE.ONBOARDING}>{t('becomeOwner')}</Link>,
        },
    ...(user.platformRole
      ? [
          {
            key: 'admin',
            icon: <SafetyCertificateOutlined />,
            label: <Link href={ROUTES.MANAGE.ADMIN}>{t('platformAdmin')}</Link>,
          },
        ]
      : []),
    { type: 'divider' },
    localeGroup,
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: t('logout'), onClick: onLogout },
  ];
}

/**
 * Chữ cái đầu của tên cho avatar. Fallback là chữ cái đầu của "Khách"/"Guest" theo ngôn ngữ —
 * nhưng tên khách là dữ liệu người dùng nhập, nên trường hợp rỗng cực hiếm và một ký tự trung
 * tính đủ dùng; không đáng kéo cả bộ dịch vào một hàm thuần.
 */
function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '·';
}
