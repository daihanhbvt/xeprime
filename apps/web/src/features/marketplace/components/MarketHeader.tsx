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
import { useRouter } from 'next/navigation';
import { Logo } from '@/components/brand/Logo';
import { ROUTES } from '@/constants/routes';
import {
  useAuthModal,
  useNextFromCurrentPath,
} from '@/features/auth/components/AuthModalProvider';
import { useAuthCache } from '@/features/auth/hooks/use-auth-actions';
import { AUTH_MODE } from '@/features/auth/post-auth-destination';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { useChatUnreadCount } from '@/features/chat/hooks/use-chat-unread-count';
import { useCurrentUser, type CurrentUser } from '@/hooks/use-current-user';
import { destroySession } from '@/services/auth.service';
import styles from './MarketHeader.module.css';

const NAV = [
  { key: 'explore', label: 'Khám phá', href: ROUTES.HOME },
  { key: 'about', label: 'Về Prime', href: ROUTES.HOME },
  { key: 'trips', label: 'Chuyến của tôi', href: ROUTES.TRIPS },
];

export function MarketHeader() {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: chatUnread } = useChatUnreadCount(!!user);
  const { open } = useAuthModal();
  const { clearAfterLogout } = useAuthCache();
  const nextFromHere = useNextFromCurrentPath();

  async function handleLogout() {
    try {
      await destroySession();
    } catch {
      // Cookie có thể đã hết hạn — vẫn dọn cache + về Home.
    }
    // Xoá cache: dữ liệu người vừa thoát không hiện lại cho người kế tiếp trên cùng máy.
    clearAfterLogout();
    router.replace(ROUTES.HOME);
  }

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href={ROUTES.HOME} className={styles.brand} aria-label="XePrime">
          <Logo size="sm" />
        </Link>

        <nav className={styles.nav} aria-label="Điều hướng chính">
          {NAV.map((item, i) => (
            <Link
              key={item.key}
              href={item.href}
              className={i === 0 ? styles.navActive : styles.navLink}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.right}>
          {user ? (
            <>
              <Badge count={chatUnread?.count ?? 0} size="small" overflowCount={99}>
                <Link href={ROUTES.CHAT} aria-label="Tin nhắn">
                  <Button type="text" shape="circle" icon={<MessageOutlined />} />
                </Link>
              </Badge>
              <NotificationBell context="customer" />
              <Dropdown trigger={['click']} menu={{ items: accountMenu(user, handleLogout) }}>
                <span
                  className={styles.avatarTrigger}
                  role="button"
                  tabIndex={0}
                  aria-label="Tài khoản"
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
              Đăng nhập
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
function accountMenu(user: CurrentUser, onLogout: () => void): MenuProps['items'] {
  return [
    { key: 'name', label: user.displayName, disabled: true },
    { type: 'divider' },
    { key: 'account', label: <Link href={ROUTES.ACCOUNT}>Tài khoản của tôi</Link> },
    { key: 'trips', label: <Link href={ROUTES.TRIPS}>Chuyến của tôi</Link> },
    { key: 'chat', label: <Link href={ROUTES.CHAT}>Tin nhắn</Link> },
    { type: 'divider' },
    user.tenant
      ? {
          key: 'manage',
          icon: <ShopOutlined />,
          label: <Link href={ROUTES.MANAGE.ROOT}>Quản lý gian hàng</Link>,
        }
      : {
          key: 'become-owner',
          icon: <ShopOutlined />,
          label: <Link href={ROUTES.MANAGE.ONBOARDING}>Trở thành chủ xe</Link>,
        },
    ...(user.platformRole
      ? [
          {
            key: 'admin',
            icon: <SafetyCertificateOutlined />,
            label: <Link href={ROUTES.MANAGE.ADMIN}>Quản trị nền tảng</Link>,
          },
        ]
      : []),
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', onClick: onLogout },
  ];
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || 'K';
}
