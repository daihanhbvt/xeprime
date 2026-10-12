'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button, Result } from 'antd';
import { useTranslations } from 'next-intl';
import { MOBILE_APP_SCHEME, MOBILE_CLIENT_APP } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import styles from './NativeTripReturn.module.css';

/** ULID (Crockford base32, 26 ký tự) — chặn mọi thứ khác trước khi ghép vào deep link. */
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function nativeTripHref(tripId: string | null | undefined): string | null {
  if (!tripId || !ULID_PATTERN.test(tripId)) return null;
  return `${MOBILE_APP_SCHEME[MOBILE_CLIENT_APP.CUSTOMER]}://trips/${tripId}`;
}

/**
 * Chuyển khách từ trình duyệt của app về lại app sau khi trả qua cổng. Không gọi API: kết quả
 * do app tự hỏi server sau khi trình duyệt đóng. Nút mở app là đường dự phòng khi trình duyệt
 * chặn điều hướng tự động.
 */
export function NativeTripReturn({ tripId }: { tripId: string | null }) {
  const t = useTranslations('PaymentGateway');
  const href = nativeTripHref(tripId);

  useEffect(() => {
    if (href) window.location.replace(href);
  }, [href]);

  return (
    <main className={styles.page}>
      {href ? (
        <Result
          status="success"
          title={t('appReturn.title')}
          subTitle={t('appReturn.detail')}
          extra={
            <Button type="primary" href={href}>
              {t('order.openApp')}
            </Button>
          }
        />
      ) : (
        <Result
          status="warning"
          title={t('appReturn.invalid')}
          extra={
            <Link href={ROUTES.HOME}>
              <Button>{t('appReturn.home')}</Button>
            </Link>
          }
        />
      )}
    </main>
  );
}
