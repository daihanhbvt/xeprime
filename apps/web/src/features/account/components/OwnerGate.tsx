'use client';

import { ShopOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { LoadingState } from '@/components/feedback/LoadingState';
import { ROUTES } from '@/constants/routes';
import { resolveOwnerCtaHref } from '@/features/auth/post-auth-destination';

import { useOwnerAccess } from '../hooks/use-owner-access';
import styles from './OwnerGate.module.css';

/**
 * Cổng của các màn CHỦ XE trong `/account` (danh sách xe, lịch, khai thuế).
 *
 * Không phải chủ gian hàng thì `children` KHÔNG được render — tức là không hook nào bên trong
 * chạy, không request tenant nào bay đi để rồi nhận 403. Người gõ thẳng URL thấy một trạng thái
 * tử tế với đúng hai lối đi: trở thành chủ xe (hoặc về cổng quản lý nếu họ là nhân viên của một
 * gian hàng) và quay về tài khoản.
 *
 * Đây là lớp trải nghiệm; lớp chặn thật vẫn là guard backend (CLAUDE.md §3).
 */
export function OwnerGate({ children }: { children: ReactNode }) {
  const t = useTranslations('Account.ownerGate');
  const { user, isOwner, isLoading } = useOwnerAccess();

  if (isLoading) return <LoadingState variant="page" />;
  if (isOwner) return <>{children}</>;

  const shopName = user?.tenant?.name;

  return (
    <section className={styles.root} role="status">
      <span className={styles.icon} aria-hidden="true">
        <ShopOutlined />
      </span>
      <h1 className={styles.title}>{t('title')}</h1>
      <p className={styles.body}>{shopName ? t('bodyMember', { shop: shopName }) : t('body')}</p>
      <div className={styles.actions}>
        <Link href={resolveOwnerCtaHref(user)}>
          <Button type="primary">{shopName ? t('openManage') : t('becomeOwner')}</Button>
        </Link>
        <Link href={ROUTES.ACCOUNT.ROOT}>
          <Button>{t('backToAccount')}</Button>
        </Link>
      </div>
    </section>
  );
}
