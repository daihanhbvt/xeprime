'use client';

import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import { BOOKING_EXTENSION_STATUS } from '@xeprime/types';
import { BankTransferDetails } from '@/features/payment-gateway/components/BankTransferDetails';
import { useAppFormat } from '@/i18n/use-app-format';
import { isZeroMoney } from '@/lib/money';
import { useTripExtensions } from '../hooks';
import layout from './TripRequestLayout.module.css';
import styles from './TripExtensionPanel.module.css';

/**
 * GIA HẠN CHUYẾN phía khách (ADR 0077) — chủ xe tạo phụ lục, khách chuyển phần giữ chỗ qua QR,
 * phần còn lại trả thẳng chủ xe. Chỉ hiện phụ lục ĐANG CHỜ (kèm QR) và lần gia hạn gần nhất đã
 * hiệu lực; chuyến chưa từng gia hạn thì khối im lặng.
 */
export function TripExtensionPanel({ tripId }: { tripId: string }) {
  const t = useTranslations('Trips.extension');
  const fmt = useAppFormat();
  const { data } = useTripExtensions(tripId, true);
  if (!data || data.length === 0) return null;

  const pending = data.find((e) => e.status === BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT);
  const lastActive = [...data].reverse().find((e) => e.status === BOOKING_EXTENSION_STATUS.ACTIVE);
  if (!pending && !lastActive) return null;

  return (
    <section className={layout.card}>
      <h2 className={layout.cardTitle}>{t('title')}</h2>
      {pending ? (
        <div className={styles.stack}>
          <p className={layout.cardLead}>
            {t('pendingLead', { months: pending.months, date: fmt.shortDateTime(pending.toAt) })}
          </p>
          <dl className={styles.facts}>
            <div>
              <dt>{t('rental')}</dt>
              <dd>{fmt.money(pending.rentalAmount)}</dd>
            </div>
            <div>
              <dt>{t('online')}</dt>
              <dd>{fmt.money(pending.onlineAmount)}</dd>
            </div>
            {!isZeroMoney(pending.payAtPickupAmount) ? (
              <div>
                <dt>{t('direct')}</dt>
                <dd>{fmt.money(pending.payAtPickupAmount)}</dd>
              </div>
            ) : null}
          </dl>
          <BankTransferDetails
            account={pending.paymentInfo}
            amount={pending.remainingAmount}
            code={pending.code}
          />
          {pending.expiresAt ? (
            <Alert
              type="warning"
              showIcon
              title={t('deadline', { time: fmt.shortDateTime(pending.expiresAt) })}
            />
          ) : null}
        </div>
      ) : lastActive ? (
        <Alert
          type="success"
          showIcon
          title={t('activated', {
            months: lastActive.months,
            date: fmt.shortDateTime(lastActive.toAt),
          })}
        />
      ) : null}
    </section>
  );
}
