'use client';

import { useTranslations } from 'next-intl';
import { PLAN_VEHICLE_SCOPE, planVehicleScopeOf } from '@xeprime/types';

import { useAppFormat } from '@/i18n/use-app-format';

import { useTenantPlans } from '../hooks/use-subscription';
import type { SubscriptionInvoice } from '../types';
import styles from './PaymentLinesSummary.module.css';

/**
 * Các dòng "Thông tin thanh toán" của trang thanh toán - design `24051:79507`: mỗi gói một dòng
 * (loại gói · số tiền · tên bậc, hạn mức), rồi thời gian áp dụng + kỳ hạn. Phiếu gộp (ADR 0083) có
 * hai dòng gói; kỳ chung thì in một lần, khác nhau thì in theo từng gói.
 *
 * Tên bậc đọc từ danh mục gói đang bán (cache dùng chung với bảng giá); bậc đã gỡ khỏi danh mục thì
 * rơi về mã bậc ghi trên hoá đơn. Kỳ in ở đây là kỳ DỰ KIẾN trên hoá đơn - kỳ thật chốt lúc tiền về.
 */
export function PaymentLinesSummary({ invoices }: { invoices: readonly SubscriptionInvoice[] }) {
  const t = useTranslations('Subscription.checkout');
  const tLanes = useTranslations('Subscription.lanes');
  const tPurchase = useTranslations('Subscription.purchase');
  const fmt = useAppFormat();
  const plans = useTenantPlans();

  const planName = (invoice: SubscriptionInvoice) =>
    plans.data?.find((plan) => plan.id === invoice.planId)?.name ?? invoice.planCode;
  const limitText = (invoice: SubscriptionInvoice) => {
    const scope = planVehicleScopeOf(invoice.vehicleScope);
    const limit = invoice.quota.maxVehicles;
    if (limit == null) return tPurchase('limitVehiclesUnlimited');
    if (scope === PLAN_VEHICLE_SCOPE.MOTORBIKE)
      return tPurchase('limitMotorbikes', { count: limit });
    if (scope === PLAN_VEHICLE_SCOPE.CAR) return tPurchase('limitCars', { count: limit });
    return tPurchase('limitVehicles', { count: limit });
  };
  const samePeriod = invoices.every(
    (invoice) =>
      invoice.periodFrom === invoices[0]?.periodFrom &&
      invoice.periodTo === invoices[0]?.periodTo &&
      invoice.termMonths === invoices[0]?.termMonths,
  );

  const period = (invoice: SubscriptionInvoice, label: string) => (
    <div className={styles.row} key={`period-${invoice.id}`}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>
        <span className={styles.main}>
          {fmt.date(invoice.periodFrom)} → {fmt.date(invoice.periodTo)}
        </span>
        <span className={styles.sub}>{t('termMonths', { months: invoice.termMonths })}</span>
      </dd>
    </div>
  );

  return (
    <dl className={styles.list}>
      {invoices.map((invoice) => (
        <div className={styles.row} key={invoice.id}>
          <dt className={styles.label}>
            {tLanes(`title.${planVehicleScopeOf(invoice.vehicleScope)}`)}
          </dt>
          <dd className={styles.value}>
            <span className={styles.main}>{fmt.money(invoice.totalAmount)}</span>
            <span className={styles.sub}>
              {planName(invoice)}, {limitText(invoice)}
            </span>
          </dd>
        </div>
      ))}
      {samePeriod && invoices[0]
        ? period(invoices[0], t('periodLabel'))
        : invoices.map((invoice) =>
            period(
              invoice,
              t('periodLabelFor', {
                scope: tLanes(`title.${planVehicleScopeOf(invoice.vehicleScope)}`),
              }),
            ),
          )}
    </dl>
  );
}
