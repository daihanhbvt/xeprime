'use client';

import { LogoutOutlined, MessageOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Badge, Button, Dropdown } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Logo } from '@/components/brand/Logo';
import { ROUTES } from '@/constants/routes';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { useChatUnreadCount } from '@/features/chat/hooks/use-chat-unread-count';
import { useCurrentUser } from '@/hooks/use-current-user';
import { destroySession } from '@/services/auth.service';
import styles from './MarketHeader.module.css';

const NAV = [
  { key: 'explore', label: 'Khám phá', href: ROUTES.HOME },
  { key: 'about', label: 'Về Prime', href: ROUTES.HOME },
  { key: 'trips', label: 'Chuyến của tôi', href: ROUTES.TRIPS },
];

export function MarketHeader() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const { data: chatUnread } = useChatUnreadCount(!!user);

  async function handleLogout() {
    try {
      await destroySession();
    } catch {
      // Cookie có thể đã hết hạn — vẫn dọn cache + về Home.
    }
    // Xoá cache: dữ liệu người vừa thoát không hiện lại cho người kế tiếp trên cùng máy.
    queryClient.clear();
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
              <Dropdown
                trigger={['click']}
                menu={{
                  items: [
                    { key: 'name', label: user.displayName, disabled: true },
                    { type: 'divider' },
                    {
                      key: 'trips',
                      label: <Link href={ROUTES.TRIPS}>Chuyến của tôi</Link>,
                    },
                    { key: 'chat', label: <Link href={ROUTES.CHAT}>Tin nhắn</Link> },
                    { type: 'divider' },
                    {
                      key: 'logout',
                      icon: <LogoutOutlined />,
                      label: 'Đăng xuất',
                      onClick: () => void handleLogout(),
                    },
                  ],
                }}
              >
                <span className={styles.avatarTrigger} role="button" tabIndex={0} aria-label="Tài khoản">
                  <Avatar className={styles.avatar} size={34}>
                    {initial(user.displayName)}
                  </Avatar>
                </span>
              </Dropdown>
            </>
          ) : (
            <Link href={ROUTES.LOGIN}>
              <Button type="primary" icon={<UserOutlined />}>
                Đăng nhập
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || 'K';
}
