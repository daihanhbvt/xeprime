'use client';

import {
  LogoutOutlined,
  MessageOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Badge, Button, Dropdown, type MenuProps } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Logo } from '@/components/brand/Logo';
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
import { ROUTES } from '@/constants/routes';
import { useAuthModal, useNextFromCurrentPath } from '@/features/auth/components/AuthModalProvider';
import { useMarketLogout } from '@/features/auth/hooks/use-market-logout';
import { AUTH_MODE } from '@/features/auth/post-auth-destination';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { useChatUnreadCount } from '@/features/chat/hooks/use-chat-unread-count';
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
  const { data: chatUnread } = useChatUnreadCount(!!user);
  const { open } = useAuthModal();
  const logout = useMarketLogout();
  const nextFromHere = useNextFromCurrentPath();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href={ROUTES.HOME} className={styles.brand} aria-label="XePrime">
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
          {/*
            Bộ đổi ngôn ngữ đứng TRƯỚC tin nhắn/thông báo/tài khoản, và có mặt cả khi CHƯA đăng
            nhập: chọn ngôn ngữ là việc người ta làm trước khi làm bất cứ việc gì khác, nên nó
            không được nằm trong menu tài khoản của người đã đăng nhập.
          */}
          <LocaleSwitcher />
          {user ? (
            <>
              <Badge count={chatUnread?.count ?? 0} size="small" overflowCount={99}>
                {/*
                  MỘT bề mặt tương tác: liên kết được tạo dáng như nút tròn, KHÔNG phải `<Button>`
                  lồng trong `<Link>`. Lồng hai phần tử tương tác cho trình đọc màn hình hai đích
                  cho cùng một hành động, và bàn phím phải Tab hai lần để đi qua một biểu tượng.
                */}
                <Link href={ROUTES.CHAT} aria-label={t('chat')} className={styles.iconBtn}>
                  <MessageOutlined aria-hidden="true" />
                </Link>
              </Badge>
              <NotificationBell context="customer" />
              <Dropdown trigger={['click']} menu={{ items: accountMenu(user, logout, t) }}>
                <span
                  className={styles.avatarTrigger}
                  role="button"
                  tabIndex={0}
                  aria-label={t('account')}
                >
                  <Avatar className={styles.avatar} size={34} src={user.avatarUrl ?? undefined}>
                    {initial(user.displayName)}
                  </Avatar>
                </span>
              </Dropdown>
            </>
          ) : (
            // Đăng nhập của KHÁCH mở modal ngay tại trang đang xem — không rời marketplace.
            <Button
              type="primary"
              icon={<UserOutlined />}
              onClick={() => open({ mode: AUTH_MODE.LOGIN, next: nextFromHere() })}
            >
              {t('login')}
            </Button>
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
