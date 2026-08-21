'use client';

import {
  CompassOutlined,
  IdcardOutlined,
  MessageOutlined,
  ScheduleOutlined,
} from '@ant-design/icons';
import { Badge } from 'antd';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import type { PublicNavKey } from '@/i18n/keys';
import { cx } from '@/lib/cx';
import { ROUTES } from '@/constants/routes';
import { useAuthModal, useNextFromCurrentPath } from '@/features/auth/components/AuthModalProvider';
import { AUTH_MODE } from '@/features/auth/post-auth-destination';
import { useChatUnreadCount } from '@/features/chat/hooks/use-chat-unread-count';
import { useCurrentUser } from '@/hooks/use-current-user';
import styles from './MobileTabBar.module.css';

interface Tab {
  key: string;
  /** Khoá trong `Navigation.public` — nhãn dựng lúc render. */
  labelKey: PublicNavKey;
  href: string;
  Icon: ComponentType;
  /** Hiện huy hiệu số tin chưa đọc. */
  badge?: boolean;
  /** Cần đăng nhập — chưa login thì mở modal thay vì điều hướng tới trang trống. */
  requiresAuth?: boolean;
}

/**
 * Thanh điều hướng dưới đáy cho khu công khai — CHỈ hiện ở mobile (CSS), desktop dùng header.
 *
 * Tab cần đăng nhập mà chưa login thì MỞ MODAL kèm `next` trỏ đúng tab đó, thay vì đá sang
 * trang đăng nhập của cổng quản lý (hành vi cũ) — đây là hành động của khách, không phải của
 * chủ shop.
 */
export function MobileTabBar() {
  const t = useTranslations('Navigation.public');
  const pathname = usePathname();
  const { data: user } = useCurrentUser();
  const { data: chatUnread } = useChatUnreadCount(!!user);
  const { open } = useAuthModal();
  const nextFromHere = useNextFromCurrentPath();

  const tabs: Tab[] = [
    { key: 'explore', labelKey: 'explore', href: ROUTES.HOME, Icon: CompassOutlined },
    {
      key: 'chat',
      labelKey: 'chat',
      href: ROUTES.CHAT,
      Icon: MessageOutlined,
      badge: true,
      requiresAuth: true,
    },
    {
      key: 'trips',
      labelKey: 'tripsShort',
      href: ROUTES.TRIPS,
      Icon: ScheduleOutlined,
      requiresAuth: true,
    },
    {
      key: 'account',
      labelKey: user ? 'account' : 'login',
      href: ROUTES.ACCOUNT.ROOT,
      Icon: IdcardOutlined,
      requiresAuth: true,
    },
  ];

  return (
    <nav className={styles.bar} aria-label={t('quickNavLabel')}>
      {tabs.map((tab) => {
        // Khớp tuyệt đối hoặc khớp tiền tố CÓ DẤU `/` — `startsWith(tab.href)` trần sẽ cho
        // `/tripsomething` sáng tab `/trips`. Hôm nay chưa route nào đụng nhau, nhưng đây là
        // cùng quy tắc mà `matchSelectedKey` và `proxy.ts` đã dùng; để lệch là đặt bẫy.
        const active =
          tab.href === ROUTES.HOME
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        const icon = <tab.Icon />;
        const gated = Boolean(tab.requiresAuth) && !user;

        const inner = (
          <>
            <span className={styles.icon}>
              {tab.badge && chatUnread?.count ? (
                <Badge count={chatUnread.count} size="small" overflowCount={9}>
                  {icon}
                </Badge>
              ) : (
                icon
              )}
            </span>
            {t(tab.labelKey)}
          </>
        );

        if (gated) {
          return (
            <button
              key={tab.key}
              type="button"
              className={cx(styles.tab, styles.tabButton)}
              onClick={() =>
                open({
                  mode: AUTH_MODE.LOGIN,
                  // `next` là đích của tab (không phải trang hiện tại): khách bấm "Chuyến" là
                  // muốn tới đó, đăng nhập xong phải đến đúng nơi.
                  next: tab.key === 'account' ? nextFromHere() : tab.href,
                })
              }
            >
              {inner}
            </button>
          );
        }

        return (
          <Link
            key={tab.key}
            href={tab.href}
            className={cx(styles.tab, active && styles.tabActive)}
            aria-current={active ? 'page' : undefined}
          >
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}
