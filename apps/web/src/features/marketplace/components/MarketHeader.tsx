'use client';

import { MessageOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Badge, Button } from 'antd';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { ROUTES } from '@/constants/routes';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { useChatUnreadCount } from '@/features/chat/hooks/use-chat-unread-count';
import { useCurrentUser } from '@/hooks/use-current-user';
import styles from './MarketHeader.module.css';

const NAV = [
  { key: 'explore', label: 'Khám phá', href: ROUTES.HOME },
  { key: 'about', label: 'Về Prime', href: ROUTES.HOME },
  { key: 'trips', label: 'Chuyến của tôi', href: ROUTES.TRIPS },
];

export function MarketHeader() {
  const { data: user } = useCurrentUser();
  const { data: chatUnread } = useChatUnreadCount(!!user);

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
              <Link href={ROUTES.TRIPS} aria-label="Đơn thuê của tôi">
                <Avatar className={styles.avatar} size={34}>
                  {initial(user.displayName)}
                </Avatar>
              </Link>
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
