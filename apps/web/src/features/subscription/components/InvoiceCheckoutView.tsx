'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Result, Skeleton } from 'antd';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import {
  API_ERROR_CODE,
  MOBILE_APP_SCHEME,
  MOBILE_CLIENT_APP,
  PAYMENT_ORDER_VIEW_STATE,
  PAYMENT_RETURN_PARAM,
  SUBSCRIPTION_INVOICE_STATUS,
  isSubscriptionInvoicePayable,
} from '@xeprime/types';
import { Logo } from '@/components/brand/Logo';
import { ROUTES } from '@/constants/routes';
import { PARTNER_TRACK, partnerHomeHref, resolvePartnerTrack } from '@/features/auth/post-auth-destination';
import { CheckoutFrame } from '@/features/payment-gateway/components/CheckoutFrame';
import { CheckoutPanel } from '@/features/payment-gateway/components/CheckoutPanel';
import { GatewayOrderNotice } from '@/features/payment-gateway/components/GatewayOrderNotice';
import { canStartAnotherCheckout, useGatewayOrder } from '@/features/payment-gateway/hooks';
import { PAYMENT_SURFACE, type PaymentOrder } from '@/features/payment-gateway/types';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { getErrorCode } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';
import { usePaymentInfo, useSubscriptionInvoice } from '../hooks/use-subscription';
import type { SubscriptionInvoice } from '../types';
import { invoiceRemainingAmount } from './InvoicePaymentPanel';
import { InvoicePlanSummary } from './InvoicePlanSummary';
import styles from './InvoiceCheckoutView.module.css';

/**
 * TRANG THANH TOÁN một hoá đơn gói — `partner.xeprime.vn/payment/:invoiceId` (13/10/2026).
 *
 * Mọi lối mua gói dẫn tới đây ngay khi hoá đơn tạo xong: "Gia hạn / đổi gói", bước thanh toán của
 * onboarding gian hàng trả phí, bước cuối của luồng nâng cấp từ tuyến hoa hồng. Đây cũng là trang
 * cổng MoMo/VNPAY chuyển người trả về (\`returnUrl\` do server dựng — \`PAYMENT_PAGE_PATH\`).
 *
 * Trang TRẦN (không sidebar — xem \`isPartnerPaymentPage\`): người trả có thể là gian hàng đang nợ
 * bước thanh toán đầu tiên, chưa có cổng quản lý nào để dựng khung (ADR 0040).
 *
 * Gói bật khi tiền về — việc của webhook SePay hoặc IPN cổng, trong CÙNG transaction với hoá đơn
 * \`paid\` (ADR 0022 · ADR 0040 điều 3). Trang biết điều đó khi chính hoá đơn đổi trạng thái: thông báo
 * \`subscription_activated\` đẩy qua bản chiếu realtime làm mới nó ngay, nhịp hỏi lại là lưới an toàn.
 * KHÔNG có nút "Tôi đã chuyển khoản" — một nút tự khai đã trả là một lời hứa mở cổng quản lý không
 * qua tiền.
 */
export function InvoiceCheckoutView({ invoiceId }: { invoiceId: string }) {
  const t = useTranslations('Subscription.checkout');
  const tCommon = useTranslations('Common');
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const { data: user } = useCurrentUser();
  const invoice = useSubscriptionInvoice(invoiceId);

  const orderId = params?.get(PAYMENT_RETURN_PARAM.ORDER) ?? null;
  const fromApp = params?.get(PAYMENT_RETURN_PARAM.NATIVE) === '1';
  const homeHref = user ? partnerHomeHref(user) : ROUTES.MANAGE.ROOT;

  /*
   * Lượt cổng hoàn tất ⇒ làm mới hoá đơn, gói và PHẠM VI: gian hàng vừa trả bước đầu chuyển từ "đang
   * nợ thanh toán" sang tuyến gói, và nút "Vào trang quản lý" phải đưa họ tới nơi theo phạm vi MỚI.
   */
  const onOrderSettled = useCallback(
    (order: PaymentOrder) => {
      if (order.viewState !== PAYMENT_ORDER_VIEW_STATE.COMPLETED) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
    },
    [queryClient],
  );

  /*
   * Hoá đơn vừa RỜI trạng thái chờ sang `paid` (chuyển khoản đối soát xong) ⇒ hỏi lại phạm vi một
   * lần. Chỉ khi đã THẤY nó đang chờ: mở thẳng một hoá đơn đã trả từ lâu không cần làm mới gì.
   */
  const status = invoice.data?.status;
  const seenAwaiting = useRef(false);
  useEffect(() => {
    if (!status) return;
    if (isSubscriptionInvoicePayable(status)) {
      seenAwaiting.current = true;
      return;
    }
    if (seenAwaiting.current && status === SUBSCRIPTION_INVOICE_STATUS.PAID) {
      seenAwaiting.current = false;
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all });
    }
  }, [status, queryClient]);

  let body: ReactNode;
  if (invoice.isPending) {
    body = <Skeleton active paragraph={{ rows: 8 }} />;
  } else if (invoice.isError || !invoice.data) {
    const notFound = getErrorCode(invoice.error) === API_ERROR_CODE.NOT_FOUND;
    body = (
      <Result
        status={notFound ? '404' : 'error'}
        title={notFound ? t('notFoundTitle') : t('loadErrorTitle')}
        subTitle={notFound ? t('notFoundBody') : errorMessage(invoice.error)}
        extra={
          notFound ? (
            <Link href={homeHref}>
              <Button type="primary">{t('backHome')}</Button>
            </Link>
          ) : (
            <Button type="primary" onClick={() => void invoice.refetch()}>
              {tCommon('actions.retry')}
            </Button>
          )
        }
      />
    );
  } else {
    body = (
      <InvoiceCheckoutBody invoice={invoice.data} orderId={orderId} homeHref={homeHref} />
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <Link href={homeHref} className={styles.brand}>
          <Logo size="md" />
        </Link>
      </header>
      <main className={styles.main}>
        <CheckoutFrame backHref={homeHref} backLabel={t('back')} title={t('title')}>
          {orderId ? (
            <GatewayOrderNotice
              surface={PAYMENT_SURFACE.PARTNER}
              orderId={orderId}
              nativeReturnHref={fromApp ? `${MOBILE_APP_SCHEME[MOBILE_CLIENT_APP.PARTNER]}://` : null}
              onSettled={onOrderSettled}
            />
          ) : null}
          {body}
        </CheckoutFrame>
      </main>
    </div>
  );
}

function InvoiceCheckoutBody({
  invoice,
  orderId,
  homeHref,
}: {
  invoice: SubscriptionInvoice;
  orderId: string | null;
  homeHref: string;
}) {
  const t = useTranslations('Subscription.checkout');
  const tPayment = useTranslations('Subscription.payment');
  const fmt = useAppFormat();
  const { data: user } = useCurrentUser();
  const payable = isSubscriptionInvoicePayable(invoice.status);
  const paymentInfo = usePaymentInfo(payable);
  /*
   * Vừa quay về từ cổng với một lượt còn dùng được / đang ghi nhận ⇒ KHÔNG mời mở phiên mới (xem
   * `canStartAnotherCheckout`). Cùng khoá cache với `GatewayOrderNotice` — không request thứ hai.
   */
  const order = useGatewayOrder(PAYMENT_SURFACE.PARTNER, payable ? orderId : null);
  const gatewayEnabled =
    !orderId || canStartAnotherCheckout(order.data, { failedToLoad: order.isError });

  if (invoice.status === SUBSCRIPTION_INVOICE_STATUS.PAID) {
    return (
      <Result
        status="success"
        title={t('paidTitle')}
        subTitle={tPayment('period', {
          from: fmt.date(invoice.periodFrom),
          to: fmt.date(invoice.periodTo),
        })}
        extra={
          <Link href={homeHref}>
            <Button type="primary" size="large">
              {t('enterManage')}
            </Button>
          </Link>
        }
      />
    );
  }

  if (!payable) {
    // Hoá đơn đã huỷ/hết hạn: chọn gói lại — gian hàng đang nợ bước đầu thì ở onboarding, còn lại ở trang gói.
    const againHref =
      resolvePartnerTrack(user) === PARTNER_TRACK.PACKAGE_PENDING
        ? ROUTES.MANAGE.ONBOARDING
        : ROUTES.MANAGE.SUBSCRIPTION;
    return (
      <Result
        status="warning"
        title={t('voidTitle')}
        subTitle={t('voidBody', { code: invoice.code })}
        extra={
          <Link href={againHref}>
            <Button type="primary" size="large">
              {t('pickAgain')}
            </Button>
          </Link>
        }
      />
    );
  }

  const partial = invoice.status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID;

  return (
    <CheckoutPanel
      target={{ kind: 'invoice', invoiceId: invoice.id }}
      amount={invoiceRemainingAmount(invoice)}
      code={invoice.code}
      account={paymentInfo.data}
      gatewayEnabled={gatewayEnabled}
      amountLabel={partial ? tPayment('remainingLabel') : t('amountLabel')}
      details={<InvoicePlanSummary invoice={invoice} />}
      alert={
        partial ? (
          <Alert
            type="warning"
            showIcon
            title={tPayment('partialIntro', { paid: fmt.money(invoice.paidAmount) })}
          />
        ) : null
      }
      notes={
        <ul className={styles.notes}>
          {invoice.expiresAt ? (
            <li>{tPayment('expires', { date: fmt.dateTime(invoice.expiresAt) })}</li>
          ) : null}
          <li>{tPayment('autoActivateNote')}</li>
        </ul>
      }
    />
  );
}
