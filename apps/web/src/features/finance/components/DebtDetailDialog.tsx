'use client';

import { DollarOutlined } from '@ant-design/icons';
import { Button, Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import {
  BOOKING_STATUS_META,
  PAYMENT_STATUS,
  PAYMENT_STATUS_META,
  type BookingStatus,
  type PaymentStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { bookingPath } from '@/constants/routes';
import {
  BookingDetailActionsProvider,
  useBookingDetailActions,
} from '@/features/bookings/components/detail/BookingDetailActions';
import { ContactButtons } from '@/features/bookings/components/detail/BookingDetailSections';
import { depositOutstanding } from '@/features/bookings/components/detail/handover-readiness';
import {
  CustomerSideCard,
  PaymentSideCard,
  VehicleSideCard,
} from '@/features/bookings/components/detail/BookingDetailSide';
import { useBooking } from '@/features/bookings/hooks/use-booking';
import { usePaymentHistory } from '@/features/payments/hooks/use-payments';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { overdueDays } from '@/lib/datetime';
import { isZeroMoney } from '@/lib/money';
import styles from './DebtDetailDialog.module.css';

/**
 * Hộp CÔNG NỢ của một đơn — design Partner-XePrime `23872:60767`: băng "Còn nợ" (quá hạn N ngày ·
 * hạn trả · đã trả X/Y · Thu tiền) · Thanh toán · Xe · Lịch sử thu tiền · Khách + liên hệ · chân
 * hộp "Hợp đồng" + "Chi tiết đơn thuê".
 *
 * GHÉP từ chính các thẻ của trang chi tiết đơn (`BookingDetailActionsProvider` + thẻ cột phải),
 * nên mọi con số, quyền, cổng gói và hộp thao tác (thu tiền, hợp đồng) là MỘT bản với trang đơn —
 * không dựng bản chi tiết thứ hai. Thao tác nào hộp này không có thì "Chi tiết đơn thuê" mở trang
 * đơn đầy đủ (chốt 04/11/2026).
 */
export function DebtDetailDialog({
  bookingId,
  onClose,
}: {
  bookingId: string | null;
  onClose: () => void;
}) {
  const t = useTranslations('Finance.debts.detail');
  const tCommon = useTranslations('Common');
  const { data, isLoading, isError, refetch } = useBooking(bookingId);

  const body = isLoading ? (
    <Skeleton active paragraph={{ rows: 10 }} />
  ) : isError || !data ? (
    <EmptyState
      variant="error"
      title={t('errorTitle')}
      onRetry={() => void refetch()}
      retryLabel={tCommon('actions.retry')}
    />
  ) : null;

  if (body || !data) {
    return (
      <ResponsiveDialog
        open={bookingId !== null}
        onClose={onClose}
        size="lg"
        mobileMode="fullscreen"
        footer={null}
        title={t('title', { code: '…' })}
      >
        {body}
      </ResponsiveDialog>
    );
  }

  return (
    <BookingDetailActionsProvider booking={data}>
      <ResponsiveDialog
        open={bookingId !== null}
        onClose={onClose}
        size="fit"
        mobileMode="fullscreen"
        title={
          <span className={styles.titleRow}>
            <span>{t('title', { code: data.code })}</span>
            <StatusTag
              value={data.status as BookingStatus}
              meta={BOOKING_STATUS_META}
              group="bookingStatus"
            />
          </span>
        }
        footer={<DebtDetailFooter bookingId={data.id} />}
      >
        <div className={styles.body}>
          <DebtBanner />
          <div className={styles.columns}>
            <div className={styles.column}>
              <PaymentSideCard />
              <PaymentHistoryCard />
            </div>
            <div className={styles.column}>
              <VehicleSideCard />
              <div className={styles.customer}>
                <CustomerSideCard />
                <ContactButtons variant="labeled" />
              </div>
            </div>
          </div>
        </div>
      </ResponsiveDialog>
    </BookingDetailActionsProvider>
  );
}

/** Đã trả trên phải thu, làm tròn xuống 1% — CHỈ để vẽ vạch tiến độ, không phải một số tiền. */
function paidPercent(paid: string, total: string): number {
  const p = Number(paid);
  const t = Number(total);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return 0;
  return Math.max(0, Math.min(100, Math.floor((p / t) * 100)));
}

/** Băng đỏ "Còn nợ" đầu hộp — nút "Thu tiền" theo đúng cổng quyền + gói của trang đơn. */
function DebtBanner() {
  const t = useTranslations('Finance.debts.detail');
  const fmt = useAppFormat();
  const { booking, can, openPay } = useBookingDetailActions();
  const late = overdueDays(booking.returnAt);
  const percent = paidPercent(booking.collectedAmount, booking.amountDue);
  const hasDebt = !isZeroMoney(booking.debtAmount);

  return (
    <section className={hasDebt ? styles.banner : styles.bannerSettled} aria-label={t('debtLabel')}>
      <div className={styles.bannerMain}>
        <span className={styles.bannerLabel}>{t('debtLabel')}</span>
        <span className={styles.bannerAmount}>{fmt.money(booking.debtAmount)}</span>
        <span className={styles.bannerDue}>
          {late > 0 ? <b className={styles.late}>{t('overdue', { count: late })}</b> : null}
          {late > 0 ? ' · ' : null}
          {t('dueAt', { date: fmt.dateTime(booking.returnAt) })}
        </span>
      </div>
      <div className={styles.bannerSide}>
        <span className={styles.bannerPaid}>
          {t('paidOf', {
            paid: fmt.money(booking.collectedAmount),
            total: fmt.money(booking.amountDue),
          })}
        </span>
        {/* Độ dài vạch chỉ biết lúc chạy → CSS custom property (ngoại lệ ADR 0003). */}
        <span
          className={styles.track}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          style={{ '--xp-paid-width': `${percent}%` } as CSSProperties}
        >
          <span className={styles.bar} />
        </span>
        {can.collect && hasDebt ? (
          <Button type="primary" icon={<DollarOutlined />} onClick={openPay}>
            {t('collect')}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

/**
 * "Lịch sử thu tiền" gọn của design: từng khoản thu (số · lúc · loại tiền · trạng thái), rồi cọc
 * theo đơn / cọc đã nhận / chi phí phát sinh. Hoàn một khoản vẫn ở hộp "Lịch sử thu tiền" của
 * trang đơn — nơi có đủ ngữ cảnh để quyết một việc đụng tiền.
 */
function PaymentHistoryCard() {
  const t = useTranslations('Finance.debts.detail');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const { booking, can } = useBookingDetailActions();
  const history = usePaymentHistory(can.history ? booking.id : null);
  const prep = booking.handoverPrep;

  return (
    <section className={styles.card} aria-label={t('history')}>
      <h3 className={styles.cardTitle}>{t('history')}</h3>

      {can.history ? (
        history.isLoading ? (
          <Skeleton active title={false} paragraph={{ rows: 2 }} />
        ) : history.isError ? (
          <p className={styles.muted}>{t('historyError')}</p>
        ) : (history.data ?? []).length === 0 ? (
          <p className={styles.muted}>{t('historyEmpty')}</p>
        ) : (
          <ul className={styles.payments}>
            {(history.data ?? []).map((p) => (
              <li key={p.id} className={styles.payment}>
                <div className={styles.paymentMain}>
                  <span
                    className={
                      p.status === PAYMENT_STATUS.REFUNDED ? styles.refunded : styles.paymentAmount
                    }
                  >
                    +{fmt.money(p.amount)}
                  </span>
                  <span className={styles.muted}>
                    {fmt.dateTime(p.paidAt ?? p.createdAt)} · {dl('paymentKind', p.kind)} ·{' '}
                    {dl('paymentMethod', p.method)}
                  </span>
                </div>
                <StatusTag
                  value={p.status as PaymentStatus}
                  meta={PAYMENT_STATUS_META}
                  group="paymentStatus"
                />
              </li>
            ))}
          </ul>
        )
      ) : null}

      <dl className={styles.facts}>
        <div>
          <dt>{t('depositExpected')}</dt>
          <dd>{isZeroMoney(booking.depositAmount) ? t('none') : fmt.money(booking.depositAmount)}</dd>
        </div>
        {prep && !isZeroMoney(prep.depositRequired) ? (
          <div>
            <dt>{t('depositReceived')}</dt>
            <dd>
              {isZeroMoney(prep.depositReceived)
                ? t('depositReceivedNo')
                : isZeroMoney(depositOutstanding(prep))
                  ? t('depositReceivedYes')
                  : fmt.money(prep.depositReceived)}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>{t('surcharge')}</dt>
          <dd>
            {isZeroMoney(booking.surchargeTotal) ? t('none') : fmt.money(booking.surchargeTotal)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** Chân hộp: "Hợp đồng" (xem/tạo — cùng hành động với trang đơn) · "Chi tiết đơn thuê". */
function DebtDetailFooter({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Finance.debts.detail');
  const { booking, can, contractPending, openContract } = useBookingDetailActions();
  const contractKnown = booking.handoverPrep ? booking.handoverPrep.contractId !== null : true;

  return (
    <div className={styles.footer}>
      {can.contract ? (
        <Button size="large" loading={contractPending} onClick={openContract}>
          {contractKnown ? t('contract') : t('createContract')}
        </Button>
      ) : null}
      <Link href={bookingPath.detail(bookingId)}>
        <Button type="primary" size="large">
          {t('openBooking')}
        </Button>
      </Link>
    </div>
  );
}
