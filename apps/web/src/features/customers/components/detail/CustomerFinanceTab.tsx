'use client';

import { ArrowRightOutlined } from '@ant-design/icons';
import { Alert, Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PERMISSION, PLAN_FEATURE, STATUS_COLOR } from '@xeprime/types';
import { MoneyVolumeChart } from '@/components/chart/MoneyVolumeChart';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { ToneDotBadge } from '@/components/data-display/StatusBadge';
import { SectionCard } from '@/components/layout/SectionCard';
import { SegmentedTabs } from '@/components/navigation/SegmentedTabs';
import { receiptsPath } from '@/constants/routes';
import { RecordPaymentModal } from '@/features/payments/components/RecordPaymentModal';
import { useFeature } from '@/hooks/use-feature';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { dayjs } from '@/lib/datetime';
import { isZeroMoney } from '@/lib/money';
import { useCustomerRevenue } from '../../hooks/use-customers';
import type { CustomerBooking, CustomerRevenuePeriod } from '../../types';
import { CustomerReceiptsPanel } from '../CustomerReceiptsPanel';
import styles from './CustomerDetail.module.css';

const PERIODS: readonly CustomerRevenuePeriod[] = ['week', 'month', 'quarter', 'year'];

/**
 * Tab "Thu chi" của hồ sơ khách — Figma Partner-XePrime `23797:55706` (02/11/2026).
 *
 * Kỳ Tuần/Tháng/Quý/Năm này: cột là GIÁ TRỊ ĐƠN theo ngày nhận xe, "Thực thu trong kỳ" là phiếu thu
 * kinh doanh đã duyệt (cọc là tiền giữ hộ, không phải doanh thu — ADR 0013 §3). Khoản phải thu là
 * MỌI kỳ, cùng vị từ với màn Công nợ. Danh sách phiếu thu cũ giữ nguyên ở cuối tab.
 */
export function CustomerFinanceTab({
  customerId,
  canViewBookings,
}: {
  customerId: string;
  /** Doanh thu + khoản phải thu liệt kê ĐƠN — cần thêm bookings.view (server cũng đòi). */
  canViewBookings: boolean;
}) {
  const t = useTranslations('Customers.profile.finance');
  const tHistory = useTranslations('Customers.profile.history');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const financeFeature = useFeature(PLAN_FEATURE.FINANCE);
  const canCollect = has(PERMISSION.PAYMENT_RECORD) && financeFeature.isVisible;

  const [period, setPeriod] = useState<CustomerRevenuePeriod>('month');
  const [paying, setPaying] = useState<CustomerBooking | null>(null);
  const { data, isLoading, isFetching, isError, error, refetch } = useCustomerRevenue(
    customerId,
    period,
    canViewBookings,
  );

  const points = (data?.buckets ?? []).map((bucket) => ({
    key: bucket.from,
    money: bucket.amount,
    count: bucket.count,
  }));
  const bucketLabel = (from: string) => {
    const bucket = data?.buckets.find((b) => b.from === from);
    if (!bucket) return '';
    const start = dayjs(bucket.from);
    // Cột tháng (quý/năm) ghi tên tháng; cột ngày/5 ngày ghi khoảng ngày.
    if (period === 'quarter' || period === 'year') return fmt.monthYear(start.toDate());
    const end = dayjs(bucket.to).subtract(1, 'day');
    return period === 'week' || start.isSame(end, 'day')
      ? fmt.dayMonth(bucket.from)
      : `${start.format('DD')} - ${fmt.dayMonth(end.toISOString())}`;
  };
  const oldestDebt = data?.receivables[0] ?? null;

  const columns: DataTableColumn<CustomerBooking>[] = [
    {
      title: tHistory('colBooking'),
      key: 'code',
      width: 130,
      render: (_, row) => <b>{row.code}</b>,
    },
    {
      title: t('colContent'),
      key: 'content',
      width: 240,
      render: (_, row) => (
        <div className={styles.stack}>
          <span>{row.vehicleName}</span>
          <span className={styles.muted}>
            {[row.vehiclePlate, fmt.date(row.pickupAt)].filter(Boolean).join(' · ')}
          </span>
        </div>
      ),
    },
    {
      title: tHistory('colTime'),
      key: 'range',
      width: 210,
      render: (_, row) => (
        <div className={styles.stack}>
          <span>
            <span className={styles.muted}>{tHistory('pickupAt')}</span>{' '}
            {fmt.shortDateTime(row.pickupAt)}
          </span>
          <span>
            <span className={styles.muted}>{tHistory('returnAt')}</span>{' '}
            {fmt.shortDateTime(row.returnAt)}
          </span>
        </div>
      ),
    },
    {
      title: tHistory('colStatus'),
      key: 'state',
      width: 130,
      render: () => <ToneDotBadge color={STATUS_COLOR.DANGER}>{t('unpaid')}</ToneDotBadge>,
    },
    {
      title: tHistory('colTotal'),
      key: 'total',
      width: 130,
      align: 'right',
      render: (_, row) => fmt.money(row.totalAmount),
    },
    {
      title: t('colPaid'),
      key: 'paid',
      width: 120,
      align: 'right',
      render: (_, row) => fmt.money(row.paidAmount),
    },
    {
      title: t('colDebt'),
      key: 'debt',
      width: 130,
      align: 'right',
      render: (_, row) => <b className={styles.debt}>{fmt.money(row.debtAmount)}</b>,
    },
    ...(canCollect
      ? ([
          {
            title: '',
            key: 'collect',
            width: 110,
            align: 'right',
            render: (_, row) => (
              <Button size="small" onClick={() => setPaying(row)}>
                {t('collect')}
              </Button>
            ),
          },
        ] as DataTableColumn<CustomerBooking>[])
      : []),
  ];

  return (
    <div className={styles.tabStack}>
      {canViewBookings ? (
        <>
          <SectionCard
            title={t('title')}
            extra={
              <SegmentedTabs
                label={t('title')}
                value={period}
                onChange={setPeriod}
                items={PERIODS.map((value) => ({ value, label: t(`period.${value}`) }))}
              />
            }
          >
            {isError && !data ? (
              <Alert
                type="error"
                showIcon
                title={t('errorTitle')}
                description={errorMessage(error)}
                action={<Button onClick={() => void refetch()}>{tCommon('actions.retry')}</Button>}
              />
            ) : (
              <>
                <div className={styles.financeSummary}>
                  <div className={styles.financeMain}>
                    <span className={styles.muted}>
                      {t('receivable', { count: data?.receivableCount ?? 0 })}
                    </span>
                    <b className={styles.financeDebt}>{fmt.money(data?.receivableAmount ?? '0')}</b>
                  </div>
                  <div>
                    <span className={styles.muted}>{t('collected')}</span>
                    <b className={styles.financeValue}>
                      {fmt.money(data?.collectedInPeriod ?? '0')}
                    </b>
                  </div>
                  <div>
                    <span className={styles.muted}>{t('completed')}</span>
                    <b className={styles.financeValue}>{data?.completedInPeriod ?? 0}</b>
                  </div>
                  {canCollect && oldestDebt ? (
                    <Button type="primary" onClick={() => setPaying(oldestDebt)}>
                      {t('collect')}
                    </Button>
                  ) : null}
                </div>
                <MoneyVolumeChart
                  points={points}
                  labelOf={bucketLabel}
                  moneyLabel={t('chartMoney')}
                  countLabel={t('chartCount')}
                  title={t('chartTitle')}
                  loading={isLoading || (isFetching && !data)}
                  empty={
                    data && isZeroMoney(data.periodRevenue) ? { title: t('chartEmpty') } : null
                  }
                />
              </>
            )}
          </SectionCard>

          <SectionCard
            title={t('receivablesTitle')}
            extra={
              <Link
                href={receiptsPath.filtered({ tenantCustomerId: customerId })}
                className={styles.link}
              >
                {t('ledgerLink')} <ArrowRightOutlined />
              </Link>
            }
          >
            <DataTable<CustomerBooking>
              label={t('receivablesTitle')}
              columns={columns}
              items={data?.receivables ?? []}
              minWidth={1000}
              loading={isFetching && !data}
              empty={{ title: t('receivablesEmpty') }}
            />
          </SectionCard>
        </>
      ) : null}

      <SectionCard title={t('receiptsTitle')}>
        <CustomerReceiptsPanel customerId={customerId} />
      </SectionCard>

      {paying ? (
        <RecordPaymentModal
          bookingId={paying.id}
          debtAmount={paying.debtAmount ?? '0'}
          open
          onClose={() => setPaying(null)}
        />
      ) : null}
    </div>
  );
}
