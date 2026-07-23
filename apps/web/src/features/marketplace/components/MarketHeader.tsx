'use client';

import { BellOutlined, UserOutlined } from '@ant-design/icons';
import { Avatar, Badge, Button } from 'antd';
import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { ROUTES } from '@/constants/routes';
import { useCurrentUser } from '@/hooks/use-current-user';
import styles from './MarketHeader.module.css';

const NAV = [
  { key: 'explore', label: 'Khám phá', href: ROUTES.HOME },
  { key: 'about', label: 'Về Prime', href: ROUTES.HOME },
  { key: 'trips', label: 'Chuyến của tôi', href: ROUTES.HOME },
];

export function MarketHeader() {
  const { data: user } = useCurrentUser();

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
              <Badge dot>
                <button className={styles.iconBtn} type="button" aria-label="Thông báo">
                  <BellOutlined />
                </button>
              </Badge>
              <Avatar className={styles.avatar} size={34}>
                {initial(user.displayName)}
              </Avatar>
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
