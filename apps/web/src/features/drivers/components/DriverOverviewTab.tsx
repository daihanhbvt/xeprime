'use client';

import {
  CalendarOutlined,
  CarOutlined,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { MoneyVolumeChart } from '@/components/chart/MoneyVolumeChart';
import { DashboardPanel } from '@/features/dashboard/components/DashboardPanel';
import { StatCard } from '@/features/dashboard/components/StatCard';
import { useAppFormat } from '@/i18n/use-app-format';
import { dayjs } from '@/lib/datetime';
import { useDriverWageSettings } from '../hooks/use-drivers';
import type { DriverOverview } from '../types';
import { DRIVER_MONTH_FORMAT } from './DriverMonthPicker';
import styles from './DriverDetail.module.css';

/**
 * Tab Tổng quan của ngăn chi tiết tài xế — mọi số đến từ MỘT lần đọc `GET /drivers/:id/overview`,
 * nên bốn thẻ, hai panel và biểu đồ luôn khớp nhau.
 *
 * Tỉ lệ nhận chỉ là phần trăm khi có ít nhất một lượt để đo; "chưa được gán lần nào" và "được gán
 * mà không nhận" là hai điều khác hẳn nhau, nên không có lượt nào thì hiện "—", không phải 0%.
 */
export function DriverOverviewTab({
  overview,
  monthPicker,
}: {
  overview: DriverOverview;
  monthPicker: ReactNode;
}) {
  const t = useTranslations('Drivers.detail.overview');
  const fmt = useAppFormat();
  const settings = useDriverWageSettings();
  const { driver, month, upcoming, reliability, trend } = overview;
  const monthLabel = fmt.monthYear(dayjs(month.month, DRIVER_MONTH_FORMAT).toDate());
  const shopDaily = settings.data?.dailyWage ?? null;
  const hasTrend = trend.some((p) => p.trips > 0 || Number(p.wageTotal) > 0);

  return (
    <div className={styles.tabBody}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarSummary}>{t('period', { month: monthLabel })}</span>
        {monthPicker}
      </div>
      <div className={styles.kpis}>
        <StatCard
          label={t('stats.wageTotal')}
          value={fmt.money(month.wageTotal)}
          hint={monthLabel}
          icon={WalletOutlined}
          tone="gold"
        />
        <StatCard
          label={t('stats.completedTrips')}
          value={fmt.count(month.completedTrips)}
          hint={t('stats.drivenDays', { count: month.drivenDays })}
          icon={CarOutlined}
          tone="green"
        />
        <StatCard
          label={t('stats.averageDaily')}
          value={month.averageDailyWage == null ? '—' : fmt.money(month.averageDailyWage)}
          hint={
            shopDaily ? t('stats.shopDaily', { amount: fmt.money(shopDaily) }) : t('stats.noShopDaily')
          }
          icon={CalendarOutlined}
          tone="blue"
        />
        <StatCard
          label={t('stats.upcoming')}
          value={fmt.count(upcoming.acceptedTrips)}
          hint={
            upcoming.acceptedTrips > 0
              ? t('stats.upcomingWage', { amount: fmt.money(upcoming.acceptedWage) })
              : t('stats.upcomingNone')
          }
          icon={ClockCircleOutlined}
          tone="blue"
        />
      </div>

      <div className={styles.halves}>
        <DashboardPanel title={t('wage.title', { month: monthLabel })} icon={<WalletOutlined />}>
          <KeyValues
            rows={[
              {
                key: 'completed',
                label: t('wage.completed', { count: month.completedTrips }),
                value: fmt.money(month.completedWage),
              },
              {
                key: 'agreed',
                label: t('wage.agreed', { count: month.agreedTrips }),
                value: fmt.money(month.agreedWage),
              },
              { key: 'total', label: t('wage.total'), value: fmt.money(month.wageTotal) },
              {
                key: 'edited',
                label: t('wage.edited'),
                value: t('wage.editedValue', { count: month.editedTrips }),
              },
            ]}
          />
          <p className={styles.note}>{t('wage.note')}</p>
        </DashboardPanel>

        <DashboardPanel
          title={t('reliability.title', { days: reliability.windowDays })}
          icon={<SafetyCertificateOutlined />}
        >
          <KeyValues
            rows={[
              {
                key: 'rate',
                label: t('reliability.acceptRate'),
                value:
                  reliability.acceptRate == null ? (
                    <span className={styles.sub}>{t('reliability.noSample')}</span>
                  ) : (
                    <>
                      {t('reliability.rate', { rate: reliability.acceptRate })}{' '}
                      <span className={styles.sub}>
                        {t('reliability.rateOf', {
                          accepted: reliability.accepted,
                          decided: reliability.decided,
                        })}
                      </span>
                    </>
                  ),
              },
              {
                key: 'response',
                label: t('reliability.response'),
                value:
                  reliability.medianResponseMinutes == null
                    ? '—'
                    : reliability.medianResponseMinutes === 0
                      ? t('reliability.underMinute')
                      : fmt.minutesDuration(reliability.medianResponseMinutes),
              },
              {
                key: 'declined',
                label: t('reliability.declined'),
                value: fmt.count(reliability.declined),
              },
              {
                key: 'expired',
                label: t('reliability.expired'),
                value: (
                  <span className={reliability.expired > 0 ? styles.warn : undefined}>
                    {fmt.count(reliability.expired)}
                  </span>
                ),
              },
              {
                key: 'drops',
                label: t('reliability.drops'),
                value:
                  driver.dropCount > 0 ? (
                    <span className={driver.criticalDropCount > 0 ? styles.danger : styles.warn}>
                      {t('reliability.dropsValue', {
                        count: driver.dropCount,
                        critical: driver.criticalDropCount,
                      })}
                    </span>
                  ) : (
                    fmt.count(0)
                  ),
              },
              {
                key: 'pending',
                label: t('reliability.pending'),
                value: fmt.count(upcoming.pendingTrips),
              },
              ...(driver.autoAssignCooldownUntil
                ? [
                    {
                      key: 'cooldown',
                      label: t('reliability.cooldown'),
                      value: (
                        <span className={styles.warn}>
                          {fmt.dateTime(driver.autoAssignCooldownUntil)}
                        </span>
                      ),
                    },
                  ]
                : []),
            ]}
          />
        </DashboardPanel>
      </div>

      <MoneyVolumeChart
        title={t('trend.title')}
        description={t('trend.description')}
        points={trend.map((p) => ({ key: p.month, money: p.wageTotal, count: p.trips }))}
        labelOf={(key) => fmt.monthYear(dayjs(key, DRIVER_MONTH_FORMAT).toDate())}
        moneyLabel={t('trend.money')}
        countLabel={t('trend.trips')}
        empty={hasTrend ? null : { title: t('trend.empty') }}
      />
    </div>
  );
}

function KeyValues({ rows }: { rows: { key: string; label: string; value: ReactNode }[] }) {
  return (
    <dl className={styles.kv}>
      {rows.map((row) => (
        <div key={row.key} className={styles.kvRow}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
