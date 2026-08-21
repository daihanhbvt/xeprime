'use client';

import { Alert, Button, Spin } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { useAuthModal, useNextFromCurrentPath } from '@/features/auth/components/AuthModalProvider';
import { AUTH_MODE } from '@/features/auth/post-auth-destination';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useErrorMessage } from '@/i18n/use-error-message';
import { isUnauthenticated } from '@/services/api-client';

import { AccountSidebar } from './AccountSidebar';
import styles from './AccountShell.module.css';

/**
 * Vỏ chung của khu `/account` — tiêu đề, menu, và **cổng đăng nhập đặt ĐÚNG MỘT LẦN**.
 *
 * Trước đây `AccountView` tự gác cửa cho riêng nó. Khi khu này có 9 trang, mỗi trang tự gác là
 * chín bản sao của cùng một luồng bảo mật — và chỉ cần một trang quên là lộ khung trang cho
 * người chưa đăng nhập. Vỏ gác một lần, trang con chỉ lo dữ liệu của mình.
 *
 * Vỏ nằm trong route group `(public)` nên vẫn giữ header/footer marketplace: ADR 0014 — lúc mở
 * trang này người dùng đang ở vai CON NGƯỜI, không phải vai gian hàng, và chính họ cũng có thể
 * đi thuê xe. Đường về `/manage` luôn thấy được ở `MarketHeader` và ở `ShopEntryCard`.
 */
export function AccountShell({ children }: { children: ReactNode }) {
  const t = useTranslations('Account');
  const errorMessage = useErrorMessage();
  const { data: user, isLoading, isError, error, refetch } = useCurrentUser();
  const { open } = useAuthModal();
  const nextFromHere = useNextFromCurrentPath();
  const tCommon = useTranslations('Common');

  if (isLoading) {
    return (
      <div className={styles.center}>
        <Spin size="large" />
      </div>
    );
  }

  // 401 là trạng thái hợp lệ (chưa đăng nhập), không phải lỗi hệ thống — hai lối ra khác nhau.
  if (isError && isUnauthenticated(error)) {
    return (
      <div className={styles.center}>
        <Alert type="info" showIcon message={t('signInRequired')} />
        <Button type="primary" onClick={() => open({ mode: AUTH_MODE.LOGIN, next: nextFromHere() })}>
          {t('signIn')}
        </Button>
      </div>
    );
  }

  if (isError || !user) {
    return (
      <div className={styles.center}>
        <Alert type="error" showIcon message={errorMessage(error)} />
        <Button onClick={() => void refetch()}>{tCommon('actions.retry')}</Button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.subtitle}>{t('subtitle')}</p>
      </header>

      <div className={styles.body}>
        <aside className={styles.aside}>
          <AccountSidebar />
        </aside>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
