'use client';

import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
  LockOutlined,
  PercentageOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { DashboardPanel } from '@/features/dashboard/components/DashboardPanel';
import { StatCard } from '@/features/dashboard/components/StatCard';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import type { PartnerCommission } from './api';
import { usePartnerCommission } from './hooks';
import { KeyValues, MoneyValue, usePeriodLabel, useTabState } from './parts';
import styles from './PartnerDetail.module.css';

type MonthRow = PartnerCommission['months'][number];

/**
 * Tab Hoa hồng & đối soát (chủ xe cá nhân) — CHỈ ĐỌC.
 *
 * Nền tảng chưa có kỳ đối soát chốt sổ, nên tab này nói thẳng điều đó và chỉ hiện số liệu gộp
 * theo tháng từ các đơn đã hoàn tất (cột đã đóng băng trên đơn). Không ví, không rút tiền, không
 * tài khoản ngân hàng, không sửa tỷ lệ. Số tiền do server bỏ khi người xem thiếu quyền tiền.
 */
export function CommissionTab({ tenantId }: { tenantId: string }) {
  const t = useTranslations('AdminTenants.partnerDetail');
  const query = usePartnerCommission(tenantId);
  const state = useTabState({
    isLoading: query.isLoading,
    error: query.isError && !query.data ? query.error : null,
    onRetry: () => void query.refetch(),
    deniedMessage: t('denied.commission'),
  });
  if (state || !query.data) return <div className={styles.tabBody}>{state}</div>;
  return <CommissionContent data={query.data} />;
}

function CommissionContent({ data }: { data: PartnerCommission }) {
  const t = useTranslations('AdminTenants.partnerDetail.commission');
  const fmt = useAppFormat();
  const periodLabel = usePeriodLabel();
  const current = data.months.find((month) => !month.closed) ?? null;
  const completedTotal = data.months.reduce((sum, month) => sum + month.completedCount, 0);

  const columns: DataTableColumn<MonthRow>[] = [
    {
      title: t('columns.month'),
      key: 'month',
      width: 110,
      render: (_, row) => periodLabel(row.period),
    },
    {
      title: t('columns.completed'),
      key: 'count',
      width: 110,
      align: 'right',
      render: (_, row) => row.completedCount,
    },
    {
      title: t('columns.revenue'),
      key: 'revenue',
      width: 140,
      align: 'right',
      render: (_, row) => <MoneyValue value={row.revenue} />,
    },
    {
      title: t('columns.serviceFee'),
      key: 'fee',
      width: 140,
      align: 'right',
      render: (_, row) => <MoneyValue value={row.serviceFee} />,
    },
    {
      title: t('columns.tax'),
      key: 'tax',
      width: 130,
      align: 'right',
      render: (_, row) => <MoneyValue value={row.tax} />,
    },
    {
      title: t('columns.state'),
      key: 'state',
      width: 140,
      render: (_, row) =>
        row.closed ? <Tag>{t('stateClosed')}</Tag> : <Tag color="processing">{t('stateOpen')}</Tag>,
    },
  ];

  return (
    <div className={styles.tabBody}>
      {data.amountsVisible ? null : (
        <div className={styles.banner}>
          <LockOutlined className={styles.bannerIcon} />
          <span>{t('moneyNote')}</span>
        </div>
      )}
      <div className={cx(styles.banner, styles.bannerInfo)}>
        <InfoCircleOutlined className={styles.bannerIcon} />
        <span>{t('noSettlement')}</span>
      </div>

      <div className={styles.halves}>
        <DashboardPanel
          title={t('policy.title')}
          icon={<PercentageOutlined />}
          empty={t('policy.none')}
        >
          {data.feePolicy ? (
            <KeyValues
              items={[
                {
                  key: 'rate',
                  label: t('policy.rate'),
                  value: (
                    <strong>
                      {t('policy.percent', { value: Number(data.feePolicy.serviceFeePercent) })}
                    </strong>
                  ),
                },
                { key: 'basis', label: t('policy.basis'), value: t('policy.basisValue') },
                {
                  key: 'from',
                  label: t('policy.effectiveFrom'),
                  value: data.feePolicy.effectiveFrom
                    ? fmt.date(data.feePolicy.effectiveFrom)
                    : '—',
                },
                { key: 'version', label: t('policy.version'), value: data.feePolicy.version },
              ]}
            />
          ) : null}
        </DashboardPanel>

        <DashboardPanel
          title={t('current.title')}
          icon={<CalendarOutlined />}
          empty={t('current.empty')}
        >
          {current ? (
            <KeyValues
              items={[
                { key: 'period', label: t('current.period'), value: periodLabel(current.period) },
                { key: 'count', label: t('current.completed'), value: current.completedCount },
                {
                  key: 'revenue',
                  label: t('current.revenue'),
                  value: <MoneyValue value={current.revenue} />,
                },
                {
                  key: 'fee',
                  label: t('current.serviceFee'),
                  value: <MoneyValue value={current.serviceFee} />,
                },
                { key: 'tax', label: t('current.tax'), value: <MoneyValue value={current.tax} /> },
              ]}
            />
          ) : null}
        </DashboardPanel>
      </div>

      <div className={styles.kpis}>
        <StatCard
          label={t('stats.completed')}
          value={fmt.count(completedTotal)}
          hint={t('stats.completedHint', { months: data.months.length })}
          icon={CheckCircleOutlined}
          tone="green"
        />
        <StatCard
          label={t('stats.open')}
          value={fmt.count(data.openBookings)}
          icon={ClockCircleOutlined}
          tone="gold"
        />
        <StatCard
          label={t('stats.disputes')}
          value={fmt.count(data.openDisputes)}
          icon={WarningOutlined}
          tone="red"
          danger={data.openDisputes > 0}
        />
      </div>

      <div className={styles.columns}>
        <DashboardPanel title={t('history.title')} icon={<FileTextOutlined />}>
          <DataTable<MonthRow>
            label={t('history.title')}
            columns={columns}
            items={data.months}
            rowKey={(row) => row.period}
            minWidth={760}
            empty={{ title: t('history.empty') }}
          />
        </DashboardPanel>
        <DashboardPanel title={t('rules.title')} icon={<InfoCircleOutlined />}>
          <ol className={styles.timeline}>
            {(['rule1', 'rule2', 'rule3', 'rule4'] as const).map((key) => (
              <li key={key}>{t(`rules.${key}`)}</li>
            ))}
          </ol>
        </DashboardPanel>
      </div>
    </div>
  );
}
