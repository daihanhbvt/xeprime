'use client';

import { Alert, Button, Spin } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { useAuthModal, useNextFromCurrentPath } from '@/features/auth/components/AuthModalProvider';
import { AUTH_MODE } from '@/features/auth/post-auth-destination';
import { useCurrentUser, type CurrentUser } from '@/hooks/use-current-user';
import { useErrorMessage } from '@/i18n/use-error-message';
import { isUnauthenticated } from '@/services/api-client';

import styles from './CustomerAuthGate.module.css';

/**
 * CỔNG ĐĂNG NHẬP của site khách — một bản cho mọi trang cần phiên khách: khu `/account`, `/trips`
 * (qua `AccountShell`) và trang thanh toán `/payment/:id` (không có menu tài khoản).
 *
 * Ba lối ra khác nhau, và không gộp được:
 *  - đang nạp `/auth/me` ⇒ chờ;
 *  - 401 ⇒ trạng thái HỢP LỆ (chưa đăng nhập), mời đăng nhập rồi quay lại đúng trang này;
 *  - lỗi khác ⇒ lỗi hệ thống, cho thử lại.
 *
 * `children` là một HÀM nhận người dùng đã đăng nhập: trang bên trong không phải tự kiểm `user`
 * lần nữa — đó là cách một bản sao của cổng mọc lại.
 */
export function CustomerAuthGate({ children }: { children: (user: CurrentUser) => ReactNode }) {
  const t = useTranslations('Account');
  const tCommon = useTranslations('Common');
  const errorMessage = useErrorMessage();
  const { data: user, isLoading, isError, error, refetch } = useCurrentUser();
  const { open } = useAuthModal();
  const nextFromHere = useNextFromCurrentPath();

  if (isLoading) {
    return (
      <div className={styles.center}>
        <Spin size="large" />
      </div>
    );
  }

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

  return <>{children(user)}</>;
}
