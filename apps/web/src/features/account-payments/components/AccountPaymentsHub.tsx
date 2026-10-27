'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { ROUTES } from '@/constants/routes';
import { AccountPanel } from '@/features/account/components/AccountPanel';
import { cx } from '@/lib/cx';

import styles from './AccountPaymentsHub.module.css';

/**
 * Hai tab của mục "Quản lý thanh toán". Mỗi tab là một ROUTE có sẵn — tab đang mở sống trên URL
 * (ADR 0004): F5, nút Back và link chia sẻ đều mở đúng tab, và hai trang giữ nguyên bộ lọc/phân
 * trang trên URL của riêng mình.
 */
const TABS = [
  { key: 'balance', href: ROUTES.ACCOUNT.BALANCE },
  { key: 'history', href: ROUTES.ACCOUNT.PAYMENTS },
] as const;

/**
 * Khung của mục "Quản lý thanh toán" — design Account / Balance · History (Figma `19879:74829`,
 * `21695:27193`): MỘT cửa cho ba màn tiền trước đây là ba mục menu.
 *
 *  · "Tài khoản thanh toán" — số dư ví điểm, lệnh rút, tài khoản nhận tiền (`/account/balance`).
 *  · "Lịch sử giao dịch"    — MỘT danh sách hợp nhất mọi lần tiền dịch chuyển
 *                            (`GET /account/transactions`, `/account/payments`).
 *
 * Tiêu đề `h1` của trang nằm ở đây: vỏ `AccountShell` không mang `h1`.
 */
export function AccountPaymentsHub({ children }: { children: ReactNode }) {
  const t = useTranslations('AccountPayments.hub');
  const pathname = usePathname();

  return (
    <AccountPanel
      as="h1"
      title={t('title')}
      subtitle={t('subtitle')}
      extra={
        <nav className={styles.tabs} aria-label={t('tabsLabel')}>
          {TABS.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.key}
                href={tab.href}
                className={cx(styles.tab, active && styles.active)}
                aria-current={active ? 'page' : undefined}
              >
                {t(`tabs.${tab.key}`)}
              </Link>
            );
          })}
        </nav>
      }
    >
      {children}
    </AccountPanel>
  );
}
