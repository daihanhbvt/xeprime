'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button } from 'antd';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import {
  MOBILE_APP_SCHEME,
  MOBILE_CLIENT_APP,
  PAYMENT_ORDER_VIEW_STATE,
  PAYMENT_RETURN_PARAM,
} from '@xeprime/types';
import { Logo } from '@/components/brand/Logo';
import { ROUTES } from '@/constants/routes';
import { partnerHomeHref } from '@/features/auth/post-auth-destination';
import { useCurrentUser } from '@/hooks/use-current-user';
import { queryKeys } from '@/services/query-keys';
import { PAYMENT_SURFACE, type PaymentOrder } from '../types';
import { GatewayOrderNotice } from './GatewayOrderNotice';
import styles from './PartnerPaymentReturn.module.css';

/**
 * TRANG QUAY VỀ của site partner sau khi trả hoá đơn gói qua MoMo/VNPAY (ADR 0058).
 *
 * Màn một việc, không khung: người đến đây có thể là gian hàng chưa mở được cổng quản lý (đang nợ
 * bước thanh toán đầu tiên — ADR 0040). Nó đọc ĐÚNG MỘT tham số (`order`) rồi hỏi server; gói bật
 * hay chưa là chuyện của IPN/truy vấn phía server, không phải của việc trình duyệt đã quay về.
 *
 * Lượt hoàn tất ⇒ làm mới phạm vi (`/auth/me`) và gói: một gian hàng vừa trả xong bước đầu chuyển từ
 * "đang nợ thanh toán" sang tuyến gói, và nút "Tiếp tục" phải đưa họ vào đúng nơi theo phạm vi MỚI.
 */
export function PartnerPaymentReturn() {
  const t = useTranslations('PaymentGateway.return');
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const orderId = params?.get(PAYMENT_RETURN_PARAM.ORDER) ?? null;
  const fromApp = params?.get(PAYMENT_RETURN_PARAM.NATIVE) === '1';

  const onSettled = useCallback(
    (order: PaymentOrder) => {
      if (order.viewState !== PAYMENT_ORDER_VIEW_STATE.COMPLETED) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
    },
    [queryClient],
  );

  // Đích theo phạm vi HIỆN TẠI — sau khi scope làm mới, gian hàng vừa kích hoạt gói đi vào Manage.
  const continueHref = user ? partnerHomeHref(user) : ROUTES.MANAGE.ROOT;

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href={ROUTES.MANAGE.ROOT} className={styles.brand}>
          <Logo size="md" />
        </Link>
      </header>

      <main className={styles.main}>
        <section className={styles.card} aria-labelledby="xp-payment-return-title">
          <h1 id="xp-payment-return-title" className={styles.title}>
            {t('title')}
          </h1>

          {orderId ? (
            <GatewayOrderNotice
              surface={PAYMENT_SURFACE.PARTNER}
              orderId={orderId}
              nativeReturnHref={
                fromApp ? `${MOBILE_APP_SCHEME[MOBILE_CLIENT_APP.PARTNER]}://` : null
              }
              onSettled={onSettled}
            />
          ) : (
            <Alert type="warning" showIcon title={t('missingOrder')} />
          )}

          <div className={styles.actions}>
            <Link href={continueHref}>
              <Button type="primary">{t('continue')}</Button>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
