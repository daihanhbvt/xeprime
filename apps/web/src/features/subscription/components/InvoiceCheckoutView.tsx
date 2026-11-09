'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Result, Skeleton } from 'antd';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { subtractMoney } from '@xeprime/domain';
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
import { Countdown } from '@/components/data-display/Countdown';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { ROUTES, SHOP_SECTION, shopSectionPath } from '@/constants/routes';
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
import {
  usePaymentInfo,
  useSubscriptionCheckout,
  useSubscriptionInvoice,
} from '../hooks/use-subscription';
import type { SubscriptionCheckout, SubscriptionInvoice } from '../types';
import { PaymentLinesSummary } from './PaymentLinesSummary';
import styles from './InvoiceCheckoutView.module.css';

/** Dưới mốc này đồng hồ hạn chuyển khoản đổi sang sắc cảnh báo. */
const PAYMENT_URGENT_MS = 15 * 60_000;

/**
 * Khung của trang thanh toán:
 *  - `bare` - trang TRẦN (không khung - xem `isPartnerPaymentPage`): người trả có thể là gian hàng
 *    đang nợ bước thanh toán đầu tiên, chưa có cổng quản lý nào để dựng khung (ADR 0040);
 *  - `shell` - NGAY TRONG khung site partner, breadcrumb "Thông tin cửa hàng › Thanh toán hoá đơn"
 *    (design `24051:79507`): gian hàng tuyến gói mua / gia hạn từ trang Cửa hàng.
 */
export type PaymentViewVariant = 'bare' | 'shell';

/** Thứ được trả: MỘT hoá đơn, hoặc MỘT phiếu gộp nhiều hoá đơn (ADR 0083). */
type PaymentTarget = { kind: 'invoice'; id: string } | { kind: 'checkout'; id: string };

/** Hình dạng chung của khoản cần trả - hoá đơn lẻ và phiếu gộp nói cùng một ngôn ngữ ở đây. */
interface Payable {
  code: string;
  status: string;
  totalAmount: string;
  paidAmount: string;
  expiresAt: string | null;
  invoices: readonly SubscriptionInvoice[];
  /** Phiên cổng ví chỉ có cho hoá đơn lẻ (ADR 0083 điều 6). */
  gatewayInvoiceId: string | null;
}

function payableOfInvoice(invoice: SubscriptionInvoice): Payable {
  return {
    code: invoice.code,
    status: invoice.status,
    totalAmount: invoice.totalAmount,
    paidAmount: invoice.paidAmount,
    expiresAt: invoice.expiresAt ?? null,
    invoices: [invoice],
    gatewayInvoiceId: invoice.id,
  };
}

function payableOfCheckout(checkout: SubscriptionCheckout): Payable {
  return {
    code: checkout.code,
    status: checkout.status,
    totalAmount: checkout.totalAmount,
    paidAmount: checkout.paidAmount,
    expiresAt: checkout.expiresAt ?? null,
    invoices: checkout.invoices,
    gatewayInvoiceId: null,
  };
}

/** Một hoá đơn gói - `/payment/:invoiceId` (trần) và `/shop/payment/:invoiceId` (trong khung). */
export function InvoiceCheckoutView({
  invoiceId,
  variant = 'bare',
}: {
  invoiceId: string;
  variant?: PaymentViewVariant;
}) {
  return <SubscriptionPaymentView target={{ kind: 'invoice', id: invoiceId }} variant={variant} />;
}

/** Một phiếu gộp nhiều gói - `/payment/checkout/:id` và `/shop/payment/checkout/:id` (ADR 0083). */
export function CheckoutPaymentView({
  checkoutId,
  variant = 'bare',
}: {
  checkoutId: string;
  variant?: PaymentViewVariant;
}) {
  return <SubscriptionPaymentView target={{ kind: 'checkout', id: checkoutId }} variant={variant} />;
}

/**
 * TRANG THANH TOÁN gói (13/10/2026; phiếu gộp + bản trong khung 06/11/2026).
 *
 * Mọi lối mua gói dẫn tới đây ngay khi hoá đơn / phiếu tạo xong: hộp "Mua hoặc gia hạn gói" của
 * trang Cửa hàng, bước thanh toán của onboarding gian hàng trả phí, bước cuối của luồng nâng cấp từ
 * tuyến hoa hồng. Đây cũng là trang cổng MoMo/VNPAY chuyển người trả về (`returnUrl` do server dựng -
 * `PAYMENT_PAGE_PATH`).
 *
 * Gói bật khi tiền về - việc của webhook SePay hoặc IPN cổng, trong CÙNG transaction với hoá đơn
 * `paid` (ADR 0022 · ADR 0040 điều 3 · ADR 0083 điều 3 cho phiếu gộp). Trang biết điều đó khi chính
 * khoản cần trả đổi trạng thái: thông báo `subscription_activated` đẩy qua bản chiếu realtime làm mới
 * nó ngay, nhịp hỏi lại là lưới an toàn. KHÔNG có nút "Tôi đã chuyển khoản" - một nút tự khai đã trả
 * là một lời hứa mở cổng quản lý không qua tiền.
 */
function SubscriptionPaymentView({
  target,
  variant,
}: {
  target: PaymentTarget;
  variant: PaymentViewVariant;
}) {
  const t = useTranslations('Subscription.checkout');
  const tCommon = useTranslations('Common');
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const params = useSearchParams();
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const invoiceQuery = useSubscriptionInvoice(target.kind === 'invoice' ? target.id : '');
  const checkoutQuery = useSubscriptionCheckout(target.kind === 'checkout' ? target.id : '');
  const query = target.kind === 'invoice' ? invoiceQuery : checkoutQuery;
  const payable: Payable | null =
    target.kind === 'invoice'
      ? invoiceQuery.data
        ? payableOfInvoice(invoiceQuery.data)
        : null
      : checkoutQuery.data
        ? payableOfCheckout(checkoutQuery.data)
        : null;

  const orderId = params?.get(PAYMENT_RETURN_PARAM.ORDER) ?? null;
  const fromApp = params?.get(PAYMENT_RETURN_PARAM.NATIVE) === '1';
  const shell = variant === 'shell';
  const homeHref = shell
    ? shopSectionPath(SHOP_SECTION.PLAN)
    : user
      ? partnerHomeHref(user)
      : ROUTES.MANAGE.ROOT;

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
   * Khoản cần trả vừa RỜI trạng thái chờ sang `paid` (đối soát xong) ⇒ hỏi lại phạm vi một lần. Chỉ
   * khi đã THẤY nó đang chờ: mở thẳng một hoá đơn đã trả từ lâu không cần làm mới gì.
   */
  const status = payable?.status;
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
  if (query.isPending) {
    body = <Skeleton active paragraph={{ rows: 8 }} />;
  } else if (query.isError || !payable) {
    const notFound = getErrorCode(query.error) === API_ERROR_CODE.NOT_FOUND;
    body = (
      <Result
        status={notFound ? '404' : 'error'}
        title={notFound ? t('notFoundTitle') : t('loadErrorTitle')}
        subTitle={notFound ? t('notFoundBody') : errorMessage(query.error)}
        extra={
          notFound ? (
            <Link href={homeHref}>
              <Button type="primary">{shell ? t('backToShop') : t('backHome')}</Button>
            </Link>
          ) : (
            <Button type="primary" onClick={() => void query.refetch()}>
              {tCommon('actions.retry')}
            </Button>
          )
        }
      />
    );
  } else {
    body = (
      <PaymentBody payable={payable} orderId={orderId} homeHref={homeHref} shell={shell} />
    );
  }

  const notice = orderId ? (
    <GatewayOrderNotice
      surface={PAYMENT_SURFACE.PARTNER}
      orderId={orderId}
      nativeReturnHref={fromApp ? `${MOBILE_APP_SCHEME[MOBILE_CLIENT_APP.PARTNER]}://` : null}
      onSettled={onOrderSettled}
    />
  ) : null;

  if (shell) {
    return (
      <div className={styles.shellPage}>
        <ManagePageHeader
          title={t('shellTitle')}
          subtitle={t('shellSubtitle')}
          onBack={() => router.push(homeHref)}
        />
        {notice}
        {body}
      </div>
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
          {notice}
          {body}
        </CheckoutFrame>
      </main>
    </div>
  );
}

function PaymentBody({
  payable,
  orderId,
  homeHref,
  shell,
}: {
  payable: Payable;
  orderId: string | null;
  homeHref: string;
  shell: boolean;
}) {
  const t = useTranslations('Subscription.checkout');
  const tPayment = useTranslations('Subscription.payment');
  const fmt = useAppFormat();
  const { data: user } = useCurrentUser();
  const awaiting = isSubscriptionInvoicePayable(payable.status);
  const paymentInfo = usePaymentInfo(awaiting);
  /*
   * Vừa quay về từ cổng với một lượt còn dùng được / đang ghi nhận ⇒ KHÔNG mời mở phiên mới (xem
   * `canStartAnotherCheckout`). Cùng khoá cache với `GatewayOrderNotice` - không request thứ hai.
   */
  const order = useGatewayOrder(PAYMENT_SURFACE.PARTNER, awaiting ? orderId : null);
  const gatewayEnabled =
    payable.gatewayInvoiceId !== null &&
    (!orderId || canStartAnotherCheckout(order.data, { failedToLoad: order.isError }));
  const [first] = payable.invoices;

  if (payable.status === SUBSCRIPTION_INVOICE_STATUS.PAID) {
    return (
      <Result
        status="success"
        title={payable.invoices.length > 1 ? t('paidTitleMany') : t('paidTitle')}
        subTitle={
          first
            ? tPayment('period', { from: fmt.date(first.periodFrom), to: fmt.date(first.periodTo) })
            : undefined
        }
        extra={
          <Link href={homeHref}>
            <Button type="primary" size="large">
              {shell ? t('backToShop') : t('enterManage')}
            </Button>
          </Link>
        }
      />
    );
  }

  if (!awaiting) {
    // Đã huỷ/hết hạn: chọn gói lại - gian hàng đang nợ bước đầu thì ở onboarding, còn lại ở trang gói.
    const againHref = shell
      ? shopSectionPath(SHOP_SECTION.PLAN)
      : resolvePartnerTrack(user) === PARTNER_TRACK.PACKAGE_PENDING
        ? ROUTES.MANAGE.ONBOARDING
        : ROUTES.MANAGE.SUBSCRIPTION;
    return (
      <Result
        status="warning"
        title={t('voidTitle')}
        subTitle={t('voidBody', { code: payable.code })}
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

  const partial = payable.status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID;
  const amount = partial
    ? (subtractMoney(payable.totalAmount, payable.paidAmount) ?? payable.totalAmount)
    : payable.totalAmount;

  return (
    <CheckoutPanel
      target={{ kind: 'invoice', invoiceId: payable.gatewayInvoiceId ?? first?.id ?? '' }}
      amount={amount}
      code={payable.code}
      account={paymentInfo.data}
      gatewayEnabled={gatewayEnabled}
      amountLabel={partial ? tPayment('remainingLabel') : t('amountLabel')}
      details={<PaymentLinesSummary invoices={payable.invoices} />}
      countdown={
        payable.expiresAt ? (
          <Countdown
            deadline={payable.expiresAt}
            urgentMs={PAYMENT_URGENT_MS}
            labels={{ remaining: t('deadline'), expired: t('deadlinePassed') }}
          />
        ) : null
      }
      alert={
        partial ? (
          <Alert
            type="warning"
            showIcon
            title={tPayment('partialIntro', { paid: fmt.money(payable.paidAmount) })}
          />
        ) : null
      }
      notes={
        <ul className={styles.notes}>
          {/* "Tự xác nhận khi tiền về" đã do `CheckoutPanel` nói ngay trên - không lặp. */}
          {payable.expiresAt ? (
            <li>{tPayment('expires', { date: fmt.dateTime(payable.expiresAt) })}</li>
          ) : null}
          <li>{t('pendingNote')}</li>
        </ul>
      }
    />
  );
}
