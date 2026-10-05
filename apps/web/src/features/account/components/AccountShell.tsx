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
 * Vỏ chung của khu `/account` (và `/trips`, được bọc cùng vỏ) của SITE KHÁCH — menu trái và **cổng
 * đăng nhập đặt ĐÚNG MỘT LẦN**: mỗi trang tự gác là từng ấy bản sao của cùng một luồng bảo mật, và
 * chỉ cần một trang quên là lộ khung trang cho người chưa đăng nhập.
 *
 * Từ ADR 0053 khu này CHỈ phục vụ tài khoản khách: phiên ở đây luôn là phiên realm `customer` (cookie
 * của site khách), nên không còn nhánh "tài khoản gian hàng mở nhầm khu khách" phải chuyển hướng —
 * tài khoản đối tác không có phiên ở site này. Owner Lite đã sang site partner.
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
        <Alert type="info" showIcon title={t('signInRequired')} />
        <Button type="primary" onClick={() => open({ mode: AUTH_MODE.LOGIN, next: nextFromHere() })}>
          {t('signIn')}
        </Button>
      </div>
    );
  }

  if (isError || !user) {
    return (
      <div className={styles.center}>
        <Alert type="error" showIcon title={errorMessage(error)} />
        <Button onClick={() => void refetch()}>{tCommon('actions.retry')}</Button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.body}>
        <aside className={styles.aside}>
          <AccountSidebar user={user} />
        </aside>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
