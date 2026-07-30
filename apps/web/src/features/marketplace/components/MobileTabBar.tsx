'use client';

import { CompassOutlined, IdcardOutlined, MessageOutlined, ScheduleOutlined } from '@ant-design/icons';
import { Badge } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';
import { cx } from '@/lib/cx';
import { ROUTES } from '@/constants/routes';
import { useChatUnreadCount } from '@/features/chat/hooks/use-chat-unread-count';
import { useCurrentUser } from '@/hooks/use-current-user';
import styles from './MobileTabBar.module.css';

interface Tab {
  key: string;
  label: string;
  href: string;
  Icon: ComponentType;
  /** Hiện huy hiệu số tin chưa đọc. */
  badge?: boolean;
}

/**
 * Thanh điều hướng dưới đáy cho khu công khai — CHỈ hiện ở mobile (CSS), desktop dùng header.
 *
 * Mỗi tab trỏ một route có thật; tab "Tài khoản" đổi đích theo trạng thái đăng nhập nên không
 * bao giờ dẫn tới trang trắng.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const { data: user } = useCurrentUser();
  const { data: chatUnread } = useChatUnreadCount(!!user);

  const tabs: Tab[] = [
    { key: 'explore', label: 'Khám phá', href: ROUTES.HOME, Icon: CompassOutlined },
    { key: 'chat', label: 'Tin nhắn', href: ROUTES.CHAT, Icon: MessageOutlined, badge: true },
    { key: 'trips', label: 'Chuyến', href: ROUTES.TRIPS, Icon: ScheduleOutlined },
    {
      key: 'account',
      label: user ? 'Tài khoản' : 'Đăng nhập',
      href: user ? ROUTES.TRIPS : ROUTES.LOGIN,
      Icon: IdcardOutlined,
    },
  ];

  return (
    <nav className={styles.bar} aria-label="Điều hướng nhanh">
      {tabs.map((tab) => {
        const active = tab.href === ROUTES.HOME ? pathname === tab.href : pathname.startsWith(tab.href);
        const icon = <tab.Icon />;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={cx(styles.tab, active && styles.tabActive)}
            aria-current={active ? 'page' : undefined}
          >
            <span className={styles.icon}>
              {tab.badge && chatUnread?.count ? (
                <Badge count={chatUnread.count} size="small" overflowCount={9}>
                  {icon}
                </Badge>
              ) : (
                icon
              )}
            </span>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
