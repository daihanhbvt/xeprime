'use client';

import { Alert, Button, DatePicker, Progress } from 'antd';
import { useTranslations } from 'next-intl';
import { isNegativeMoney, isZeroMoney, absoluteMoney } from '@xeprime/domain';
import type { InsurancePremiumFallbackReason } from '@xeprime/types';
import { MoneyStat } from '@/components/data-display/MoneyStat';
import { ROUTES } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { MONTH_PARAM_FORMAT, dayjs, nowInAppTz } from '@/lib/datetime';
import { useInsuranceOverview, useOverviewMonth } from '../hooks';
import styles from './InsuranceOverviewPanel.module.css';

/**
 * TỔNG QUAN bảo hiểm một tháng (ADR 0097) — admin nhìn vào là biết tháng này:
 *
 *   khách trả bao nhiêu → phải trả MIC bao nhiêu (sau hoa hồng) → XePrime giữ lại bao nhiêu
 *
 * cộng nguồn phí lúc duyệt (MIC báo hay công thức dự phòng) và việc đang tồn. Mọi con số do server
 * tính (`GET /platform/insurance/overview`); màn này chỉ bày. Tháng nằm trên URL (`?month=`).
 */
export function InsuranceOverviewPanel() {
  const t = useTranslations('AdminInsurance.overview');
  const fmt = useAppFormat();
  const { filters, setFilters } = useOverviewMonth();
  const month = filters.month ?? nowInAppTz().format(MONTH_PARAM_FORMAT);
  const { data, isLoading, isError, refetch } = useInsuranceOverview(month);
  const loading = isLoading && !data;

  const tabHref = (tab: string) => `${ROUTES.ADMIN.INSURANCE}?tab=${tab}`;
  const issued = data?.issued;
  const sources = data?.sources;
  const decided = sources ? sources.partner + sources.formula : 0;
  const partnerRate = decided > 0 && sources ? Math.round((sources.partner / decided) * 100) : null;

  const differenceText = (amount: string) =>
    isZeroMoney(amount)
      ? t('difference.none')
      : isNegativeMoney(amount)
        ? t('difference.under', { amount: fmt.money(absoluteMoney(amount)) })
        : t('difference.over', { amount: fmt.money(amount) });

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <DatePicker
          picker="month"
          value={dayjs(month, MONTH_PARAM_FORMAT)}
          format={(v) => fmt.monthYear(v.toDate())}
          allowClear={false}
          maxDate={nowInAppTz()}
          aria-label={t('month')}
          onChange={(v) => {
            if (v) setFilters({ month: v.format(MONTH_PARAM_FORMAT) }, { resetPage: false });
          }}
        />
        {issued && issued.testCount > 0 ? (
          <span className={styles.muted}>{t('testCount', { count: issued.testCount })}</span>
        ) : null}
      </div>

      {isError && !data ? (
        <Alert
          type="error"
          showIcon
          title={t('loadError')}
          action={<Button onClick={() => void refetch()}>{t('retry')}</Button>}
        />
      ) : null}

      {/* Lớp 1 — ba con số trả lời "tháng này bảo hiểm mang lại gì". */}
      <section className={styles.lead} aria-label={t('lead.label')}>
        <MoneyStat
          variant="tile"
          label={t('lead.earnings')}
          value={issued ? fmt.money(issued.platformEarnings) : null}
          tone="accent"
          loading={loading}
          info={{ label: t('lead.earnings'), content: t('lead.earningsInfo') }}
          hint={
            issued
              ? t('lead.earningsHint', {
                  serviceFee: fmt.money(issued.serviceFee),
                  commission: fmt.money(issued.agencyCommission),
                })
              : undefined
          }
        />
        <MoneyStat
          variant="tile"
          label={t('lead.netPayable')}
          value={issued ? fmt.money(issued.netPayable) : null}
          loading={loading}
          info={{ label: t('lead.netPayable'), content: t('lead.netPayableInfo') }}
          hint={
            issued
              ? t('lead.netPayableHint', {
                  gross: fmt.money(issued.payablePremium),
                  percent: fmt.rate(issued.agencyCommissionPercent),
                })
              : undefined
          }
          href={tabHref('remittances')}
        />
        <MoneyStat
          variant="tile"
          label={t('lead.collected')}
          value={issued ? fmt.money(issued.collectedPremium) : null}
          loading={loading}
          hint={issued ? t('lead.collectedHint', { count: issued.count }) : undefined}
          href={tabHref('certificates')}
        />
      </section>

      {/* Lớp 2 — các dòng làm nên lớp 1. */}
      <section className={styles.grid} aria-label={t('detail.label')}>
        <MoneyStat
          size="compact"
          label={t('detail.payable')}
          value={issued ? fmt.money(issued.payablePremium) : null}
          loading={loading}
          info={{ label: t('detail.payable'), content: t('detail.payableInfo') }}
          hint={
            issued && issued.partnerPremiumMissingCount > 0
              ? t('detail.payableMissing', { count: issued.partnerPremiumMissingCount })
              : undefined
          }
        />
        <MoneyStat
          size="compact"
          label={t('detail.commission', {
            percent: fmt.rate(issued?.agencyCommissionPercent ?? 0),
          })}
          value={issued ? fmt.money(issued.agencyCommission) : null}
          loading={loading}
          info={{ label: t('detail.commissionLabel'), content: t('detail.commissionInfo') }}
        />
        <MoneyStat
          size="compact"
          label={t('detail.serviceFee')}
          value={issued ? fmt.money(issued.serviceFee) : null}
          loading={loading}
          info={{ label: t('detail.serviceFee'), content: t('detail.serviceFeeInfo') }}
        />
        <MoneyStat
          size="compact"
          label={t('detail.difference')}
          value={issued ? differenceText(issued.premiumDifference) : null}
          tone={issued && isNegativeMoney(issued.premiumDifference) ? 'negative' : 'neutral'}
          loading={loading}
          info={{ label: t('detail.difference'), content: t('detail.differenceInfo') }}
        />
        <MoneyStat
          size="compact"
          label={t('detail.refunds')}
          value={data ? fmt.money(data.refunds.amount) : null}
          loading={loading}
          hint={data ? t('detail.refundsHint', { count: data.refunds.count }) : undefined}
        />
      </section>

      <div className={styles.columns}>
        {/* Nguồn phí lúc duyệt (ADR 0097): MIC báo hay công thức dự phòng. */}
        <section className={styles.box} aria-label={t('sources.title')}>
          <h3 className={styles.boxTitle}>{t('sources.title')}</h3>
          {sources ? (
            decided + sources.unrecorded === 0 ? (
              <p className={styles.muted}>{t('sources.empty')}</p>
            ) : (
              <>
                {partnerRate !== null ? (
                  <Progress
                    percent={partnerRate}
                    size="small"
                    status={partnerRate < 90 ? 'exception' : 'normal'}
                    aria-label={t('sources.rateLabel')}
                  />
                ) : null}
                <dl className={styles.facts}>
                  <dt>{t('sources.partner')}</dt>
                  <dd>{sources.partner}</dd>
                  <dt>{t('sources.formula')}</dt>
                  <dd>{sources.formula}</dd>
                  {sources.fallbacks.map((f) => (
                    <FallbackRow key={f.reason} reason={f.reason} count={f.count} />
                  ))}
                  {sources.unrecorded > 0 ? (
                    <>
                      <dt>{t('sources.unrecorded')}</dt>
                      <dd>{sources.unrecorded}</dd>
                    </>
                  ) : null}
                </dl>
                {partnerRate !== null && partnerRate < 90 ? (
                  <Alert type="warning" showIcon title={t('sources.lowRate')} />
                ) : null}
              </>
            )
          ) : null}
        </section>

        {/* Việc đang tồn — tính tại lúc xem, không theo tháng. */}
        <section className={styles.box} aria-label={t('backlog.title')}>
          <h3 className={styles.boxTitle}>{t('backlog.title')}</h3>
          {data ? (
            <dl className={styles.facts}>
              <dt>{t('backlog.attention')}</dt>
              <dd className={data.backlog.attention > 0 ? styles.danger : undefined}>
                {data.backlog.attention}
              </dd>
              <dt>{t('backlog.failed')}</dt>
              <dd className={data.backlog.failed > 0 ? styles.danger : undefined}>
                {data.backlog.failed}
              </dd>
              <dt>{t('backlog.unremitted')}</dt>
              <dd>
                {t('backlog.unremittedValue', {
                  count: data.backlog.unremittedCount,
                  amount: fmt.money(data.backlog.unremittedPremium),
                })}
              </dd>
            </dl>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function FallbackRow({ reason, count }: { reason: InsurancePremiumFallbackReason; count: number }) {
  const t = useTranslations('AdminInsurance.drawer.pricing.fallbackReasons');
  return (
    <>
      <dt className={styles.indent}>{t(reason)}</dt>
      <dd>{count}</dd>
    </>
  );
}
