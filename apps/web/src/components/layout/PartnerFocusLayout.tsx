'use client';

import { LogoutOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Logo } from '@/components/brand/Logo';
import { ROUTES } from '@/constants/routes';
import { usePortalLogout } from '@/features/auth/hooks/use-portal-logout';
import { useCurrentUser } from '@/hooks/use-current-user';

import styles from './PartnerFocusLayout.module.css';

/**
 * Khung TẬP TRUNG của site partner — cho các màn một việc, không có sidebar: trang chọn cách cho
 * thuê ngay sau khi tạo tài khoản đối tác, và wizard đăng xe nhanh.
 *
 * Vì sao không dùng `AppShell`: tài khoản chưa có gian hàng thì chưa có menu nào để điều hướng, và
 * wizard tự TẠO gian hàng ở bước lưu — nếu nằm trong khung đầy đủ, sidebar sẽ bật lên giữa chừng
 * ngay khi `/auth/me` đổi tuyến. Một thanh trên cùng mỏng (logo + ai đang đăng nhập + đăng xuất)
 * giữ cho người dùng luôn có lối ra.
 */
export function PartnerFocusLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('ManageCommon');
  const { data: user } = useCurrentUser();
  const logout = usePortalLogout();
  const name = user ? user.displayName || user.email || user.phone : null;

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href={ROUTES.MANAGE.ROOT} className={styles.brand} aria-label={t('shell.partnerHome')}>
          <Logo size="md" />
        </Link>
        {user ? (
          <div className={styles.account}>
            {name ? (
              <span className={styles.signedInAs}>{t('shell.signedInAs', { name })}</span>
            ) : null}
            <Button type="text" icon={<LogoutOutlined />} onClick={() => void logout()}>
              {t('shell.logout')}
            </Button>
          </div>
        ) : null}
      </header>
      <div className={styles.body}>{children}</div>
    </div>
  );
}
