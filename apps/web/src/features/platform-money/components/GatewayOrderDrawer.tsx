'use client';

import { InfoCircleOutlined } from '@ant-design/icons';
import { Alert, App, Button, Collapse } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import {
  PAYMENT_ORDER_NOTE_LENGTH,
  PAYMENT_ORDER_REQUERY_OUTCOME,
  PAYMENT_ORDER_RESULT_SOURCE,
  PAYMENT_ORDER_REVIEW_STATUS,
  PAYMENT_ORDER_STATUS,
  PAYMENT_ORDER_STATUS_META,
  PAYMENT_ORDER_TARGET,
  type PaymentOrderStatus,
} from '@xeprime/types';
import { CopyButton } from '@/components/data-display/CopyButton';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { ReasonDialog } from '@/components/overlay/ReasonDialog';
import {
  WORK_DRAWER_BODY_CLASS,
  WorkDrawerFacts,
  WorkDrawerFooter,
  WorkDrawerLayout,
  WorkDrawerPager,
  WorkDrawerTitle,
  type WorkDrawerFact,
} from '@/components/overlay/WorkDrawer';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  useApplyGatewayOrder,
  usePlatformGatewayOrder,
  useRequeryGatewayOrder,
  useResolveGatewayOrder,
} from '../hooks/use-gateway-orders';
import type { PlatformPaymentOrderDetail, PlatformPaymentOrderEvent } from '../types';
import { ResolveGatewayOrderDialog } from './ResolveGatewayOrderDialog';
import styles from './GatewayOrderDrawer.module.css';

/**
 * Chi tiết MỘT lượt thanh toán qua cổng — khuôn PANEL LÀM VIỆC (`components/overlay/WorkDrawer`),
 * cùng hình với hàng đợi tiền vào ngân hàng.
 *
 * Ba quyết định:
 *  - "Hỏi lại cổng": server truy vấn cổng ngay, và nếu cổng đã thu thì ghi nhận qua ĐÚNG đường tiền
 *    của IPN — dùng cho lượt kẹt vì IPN không tới hoặc lần ghi nhận trước hỏng tạm thời;
 *  - "Ghi nhận khoản này": chỉ hiện khi server nói được (`canApply`) — cổng đã thu đúng số mà máy
 *    KHÔNG tự áp vì lượt đã từng bị đóng (có thể đã hoàn tay). Người trực đối chiếu rồi tự quyết,
 *    kèm ghi chú; server chạy đúng hàm áp tiền của webhook và ghi audit;
 *  - "Đóng lượt": ghi lại việc đã làm bên ngoài (vd hoàn tay qua portal của cổng) kèm mã hoàn —
 *    KHÔNG chạy thao tác tiền nào.
 */
export function GatewayOrderDrawer({
  id,
  previousId,
  nextId,
  onNavigate,
  onClose,
}: {
  id: string | null;
  previousId: string | null;
  nextId: string | null;
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('PlatformMoney.gateway');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const fmt = useAppFormat();
  const detail = usePlatformGatewayOrder(id);
  const resolve = useResolveGatewayOrder();
  const apply = useApplyGatewayOrder();
  const requery = useRequeryGatewayOrder();
  const order = detail.data;

  // Hộp thoại GẮN với lượt đã mở nó — sang lượt khác thì hộp thoại cũ tự không còn.
  const [dialogFor, setDialogFor] = useState<string | null>(null);
  const dialogOpen = dialogFor !== null && dialogFor === id;
  const [applyFor, setApplyFor] = useState<string | null>(null);
  const applyOpen = applyFor !== null && applyFor === id;
  const busy = resolve.isPending || requery.isPending || apply.isPending;
  const canApply = order?.canApply === true;
  const open = order?.reviewStatus === PAYMENT_ORDER_REVIEW_STATUS.OPEN;
  /** Hỏi lại cổng chỉ có nghĩa khi còn chờ cổng, hoặc cổng đã thu mà chưa ghi nhận xong. */
  const canRequery =
    order != null &&
    order.reviewStatus !== PAYMENT_ORDER_REVIEW_STATUS.RESOLVED &&
    (order.status === PAYMENT_ORDER_STATUS.PENDING ||
      (order.status === PAYMENT_ORDER_STATUS.SUCCEEDED && order.appliedAt === null));

  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    topRef.current?.scrollIntoView?.({ block: 'start' });
  }, [order?.id]);

  function submitResolve(input: { note: string; refundReference?: string }) {
    if (!id || busy) return;
    // Chốt lượt KẾ ngay lúc gửi: đóng xong, lượt này rời hàng đợi và trước/sau mất mốc.
    const goTo = nextId ?? previousId;
    resolve.mutate(
      { id, ...input },
      {
        onSuccess: () => {
          message.success(t('resolve.success'));
          setDialogFor(null);
          if (goTo) onNavigate(goTo);
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  function submitApply(note: string) {
    if (!id || busy) return;
    // Như đóng lượt: ghi nhận xong, lượt rời hàng đợi — chốt lượt KẾ trước khi danh sách đổi.
    const goTo = nextId ?? previousId;
    apply.mutate(
      { id, note },
      {
        onSuccess: () => {
          message.success(t('apply.success'));
          setApplyFor(null);
          if (goTo) onNavigate(goTo);
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  function submitRequery() {
    if (!id || busy) return;
    requery.mutate(id, {
      // Nói ĐÚNG điều đã xảy ra — "đã hỏi" không có nghĩa là cổng đã trả lời.
      onSuccess: (result) => {
        if (result.outcome === PAYMENT_ORDER_REQUERY_OUTCOME.CHANGED) {
          message.success(t('requery.changed'));
        } else if (result.outcome === PAYMENT_ORDER_REQUERY_OUTCOME.NO_CHANGE) {
          message.info(t('requery.noChange'));
        } else {
          message.warning(t('requery.unreachable'));
        }
      },
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  const footer = !order ? null : (
    <WorkDrawerFooter
      hint={
        open ? (
          <span className={styles.hint}>
            <InfoCircleOutlined aria-hidden />
            {t('footer.open')}
          </span>
        ) : (
          t('footer.handled')
        )
      }
      actions={
        <>
          {canRequery ? (
            <Button disabled={busy} loading={requery.isPending} onClick={submitRequery}>
              {t('footer.requery')}
            </Button>
          ) : null}
          {open ? (
            <Button
              type={canApply ? 'default' : 'primary'}
              disabled={busy}
              onClick={() => id && setDialogFor(id)}
            >
              {t('footer.resolve')}
            </Button>
          ) : null}
          {canApply ? (
            <Button type="primary" disabled={busy} onClick={() => id && setApplyFor(id)}>
              {t('footer.apply')}
            </Button>
          ) : null}
        </>
      }
    />
  );

  return (
    <>
      <DetailDrawer
        open={Boolean(id)}
        onClose={onClose}
        size="xl"
        closeAtEnd
        ariaLabel={t('detail.title')}
        title={
          <WorkDrawerTitle
            label={t('detail.title')}
            code={order?.targetCode ?? null}
            status={
              order ? (
                <StatusTag
                  value={order.status as PaymentOrderStatus}
                  meta={PAYMENT_ORDER_STATUS_META}
                  group="paymentOrderStatus"
                />
              ) : null
            }
          />
        }
        extra={
          <WorkDrawerPager
            previousId={previousId}
            nextId={nextId}
            onNavigate={onNavigate}
            previousLabel={t('detail.previous')}
            nextLabel={t('detail.next')}
          />
        }
        loading={detail.isLoading}
        error={detail.isError && !order}
        errorTitle={t('detail.loadError')}
        onRetry={() => void detail.refetch()}
        bodyClassName={WORK_DRAWER_BODY_CLASS}
        footer={footer}
      >
        {order ? (
          <WorkDrawerLayout
            key={order.id}
            ref={topRef}
            sideLabel={t('detail.sideLabel')}
            main={<OrderFile order={order} />}
            side={<OrderSide order={order} />}
          />
        ) : null}
      </DetailDrawer>

      <ResolveGatewayOrderDialog
        open={dialogOpen}
        submitting={resolve.isPending}
        onSubmit={submitResolve}
        onClose={() => setDialogFor(null)}
      />

      <ReasonDialog
        open={applyOpen}
        title={t('apply.title')}
        summary={
          order
            ? t('apply.summary', {
                amount: fmt.money(order.paidAmount ?? order.amount),
                code: order.targetCode,
              })
            : undefined
        }
        label={t('apply.note')}
        placeholder={t('apply.notePlaceholder')}
        requiredMessage={t('apply.noteRequired')}
        minLength={PAYMENT_ORDER_NOTE_LENGTH.MIN}
        maxLength={PAYMENT_ORDER_NOTE_LENGTH.MAX}
        submitText={t('apply.submit')}
        destructive={false}
        loading={apply.isPending}
        onSubmit={submitApply}
        onClose={() => setApplyFor(null)}
      />
    </>
  );
}

/** Hồ sơ lượt — số tiền, lời cổng nói, đường ghi nhận, bằng chứng gốc thu gọn. */
function OrderFile({ order }: { order: PlatformPaymentOrderDetail }) {
  const t = useTranslations('PlatformMoney.gateway');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const empty = <span className={styles.muted}>{tCommon('labels.emptyValue')}</span>;
  const mono = (value: string | null | undefined, copyLabel: string) =>
    value ? (
      <span className={styles.copyable}>
        <span className={styles.mono}>{value}</span>
        <CopyButton value={value} label={copyLabel} />
      </span>
    ) : (
      empty
    );

  const facts: WorkDrawerFact[] = [
    {
      key: 'provider',
      label: t('columns.provider'),
      value: domainLabel('paymentGatewayProvider', order.provider),
    },
    {
      key: 'target',
      label: t('detail.target'),
      value: domainLabel('paymentOrderTarget', order.targetType),
    },
    { key: 'tenant', label: t('columns.tenant'), value: order.tenantName },
    { key: 'initiatedBy', label: t('detail.initiatedBy'), value: order.initiatedByName ?? empty },
    { key: 'orderRef', label: t('detail.orderRef'), value: mono(order.providerOrderRef, t('detail.orderRef')) },
    { key: 'providerTx', label: t('detail.providerTx'), value: mono(order.providerTxId ?? null, t('detail.providerTx')) },
    {
      key: 'amountPaid',
      label: t('detail.amountPaid'),
      value: order.paidAmount ? fmt.money(order.paidAmount) : empty,
    },
    { key: 'resultCode', label: t('detail.resultCode'), value: order.providerResultCode ?? empty },
    { key: 'payMethod', label: t('detail.payMethod'), value: order.providerPayMethod ?? empty },
    { key: 'paidAt', label: t('detail.paidAt'), value: order.paidAt ? fmt.dateTime(order.paidAt) : empty },
    {
      key: 'resultSource',
      label: t('detail.resultSource'),
      value: order.resultSource
        ? order.resultSource === PAYMENT_ORDER_RESULT_SOURCE.IPN
          ? t('source.ipn')
          : t('source.query')
        : empty,
    },
    {
      key: 'applyOutcome',
      label: t('detail.applyOutcome'),
      value: order.applyOutcome
        ? domainLabel('paymentOrderApplyOutcome', order.applyOutcome)
        : empty,
    },
    {
      key: 'appliedAt',
      label: t('detail.appliedAt'),
      value: order.appliedAt ? fmt.dateTime(order.appliedAt) : empty,
    },
    { key: 'createdAt', label: t('detail.createdAt'), value: fmt.dateTime(order.createdAt) },
    { key: 'expiresAt', label: t('detail.expiresAt'), value: fmt.dateTime(order.expiresAt) },
    {
      key: 'lastQueriedAt',
      label: t('detail.lastQueriedAt'),
      value: order.lastQueriedAt ? fmt.dateTime(order.lastQueriedAt) : empty,
    },
    ...(order.providerMessage
      ? [{ key: 'message', label: t('detail.message'), value: order.providerMessage, wide: true }]
      : []),
    ...(order.applyError
      ? [{ key: 'applyError', label: t('detail.applyError'), value: order.applyError, wide: true }]
      : []),
  ];

  return (
    <>
      <div className={styles.amountBlock}>
        <span className={styles.amountLabel}>{t('detail.amountSent')}</span>
        <span className={styles.amount}>{fmt.money(order.amount)}</span>
      </div>
      <WorkDrawerFacts items={facts} />
      <OrderEvents events={order.events} />
      <Collapse
        size="small"
        items={[
          {
            key: 'raw',
            label: t('detail.rawTitle'),
            children: order.resultJson ? (
              <>
                <p className={styles.rawHint}>{t('detail.rawHint')}</p>
                <pre className={styles.raw}>{JSON.stringify(order.resultJson, null, 2)}</pre>
              </>
            ) : (
              <p className={styles.rawHint}>{t('detail.rawEmpty')}</p>
            ),
          },
        ]}
      />
    </>
  );
}

/** Cột phải — vì sao cần xử lý, khoản đích ĐANG ở đâu, và kết quả xử lý (nếu đã đóng). */
function OrderSide({ order }: { order: PlatformPaymentOrderDetail }) {
  const t = useTranslations('PlatformMoney.gateway');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const empty = tCommon('labels.emptyValue');
  const target = order.target;

  return (
    <div className={styles.sideStack}>
      {order.reviewReason ? (
        <section className={styles.side} aria-labelledby="xp-gateway-reason">
          <h3 id="xp-gateway-reason" className={styles.sideTitle}>
            {t('detail.reasonTitle')}
          </h3>
          <Alert
            type={order.reviewStatus === PAYMENT_ORDER_REVIEW_STATUS.OPEN ? 'warning' : 'info'}
            showIcon
            title={domainLabel('paymentOrderReviewReason', order.reviewReason)}
          />
        </section>
      ) : null}

      <section className={styles.side} aria-labelledby="xp-gateway-target">
        <h3 id="xp-gateway-target" className={styles.sideTitle}>
          {t('detail.targetTitle')}
        </h3>
        {target.status === null ? (
          <p className={styles.sideHint}>{t('detail.targetGone')}</p>
        ) : (
          <dl className={styles.targetFacts}>
            <div>
              <dt>{t('detail.targetStatus')}</dt>
              <dd>
                {domainLabel(
                  order.targetType === PAYMENT_ORDER_TARGET.SUBSCRIPTION_INVOICE
                    ? 'subscriptionInvoiceStatus'
                    : 'bookingHoldStatus',
                  target.status,
                )}
              </dd>
            </div>
            <div>
              <dt>{t('detail.targetAmount')}</dt>
              <dd>{target.amount ? fmt.money(target.amount) : empty}</dd>
            </div>
            <div>
              <dt>{t('detail.targetPaid')}</dt>
              <dd>{target.paidAmount ? fmt.money(target.paidAmount) : empty}</dd>
            </div>
            <div>
              <dt>{t('detail.targetExpires')}</dt>
              <dd>{target.expiresAt ? fmt.dateTime(target.expiresAt) : empty}</dd>
            </div>
          </dl>
        )}
      </section>

      {/*
       * Kết quả xử lý — cả khi lượt đã MỞ LẠI (cổng báo thu sau khi người trực đóng): ghi chú và mã
       * hoàn của lần trước là thứ người trực cần nhất để không ghi nhận một khoản đã hoàn.
       */}
      {order.reviewNote || order.refundReference ? (
        <section className={styles.side} aria-labelledby="xp-gateway-result">
          <h3 id="xp-gateway-result" className={styles.sideTitle}>
            {order.reviewStatus === PAYMENT_ORDER_REVIEW_STATUS.RESOLVED
              ? t('detail.resultTitle')
              : t('detail.priorResultTitle')}
          </h3>
          {order.reviewNote ? <p className={styles.resultNote}>{order.reviewNote}</p> : null}
          {order.reviewedAt ? (
            <p className={styles.sideHint}>
              {t('detail.resolvedBy', {
                name: order.reviewedByName ?? empty,
                time: fmt.dateTime(order.reviewedAt),
              })}
            </p>
          ) : null}
          {order.refundReference ? (
            <Alert
              type="info"
              showIcon
              title={t('detail.refundReference', { reference: order.refundReference })}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/**
 * Nhật ký MỌI kết quả đã xác minh của cổng, mới nhất trước — IPN gửi lại, truy vấn, kết quả lệch số
 * tiền… Đây là bằng chứng khi một lượt có nhiều lời kể khác nhau; `resultJson` chỉ là lời cuối.
 */
function OrderEvents({ events }: { events: readonly PlatformPaymentOrderEvent[] }) {
  const t = useTranslations('PlatformMoney.gateway');
  const fmt = useAppFormat();
  // Mã đi trên dây là dữ liệu: mã lạ (cổng thêm kết cục mới) hiện nguyên văn thay vì vỡ trang.
  const label = (group: 'outcome' | 'effect', code: string) =>
    t.has(`events.${group}.${code}` as never) ? t(`events.${group}.${code}` as never) : code;

  return (
    <section className={styles.events} aria-labelledby="xp-gateway-events">
      <h3 id="xp-gateway-events" className={styles.sideTitle}>
        {t('events.title', { count: events.length })}
      </h3>
      {events.length === 0 ? (
        <p className={styles.sideHint}>{t('events.empty')}</p>
      ) : (
        <ol className={styles.eventList}>
          {events.map((event) => (
            <li key={event.id} className={styles.event}>
              <div className={styles.eventHead}>
                <span className={styles.eventOutcome}>{label('outcome', event.outcome)}</span>
                <span className={styles.muted}>
                  {event.source === PAYMENT_ORDER_RESULT_SOURCE.IPN
                    ? t('source.ipn')
                    : t('source.query')}
                </span>
                <time className={styles.muted} dateTime={event.createdAt}>
                  {fmt.dateTime(event.createdAt)}
                </time>
              </div>
              <div className={styles.eventBody}>
                <span>{t('events.effectLine', { effect: label('effect', event.effect) })}</span>
                {event.amount ? <span>{fmt.money(event.amount)}</span> : null}
                <span className={styles.mono}>{t('events.code', { code: event.resultCode })}</span>
                {event.providerTxId ? (
                  <span className={styles.mono}>{event.providerTxId}</span>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
