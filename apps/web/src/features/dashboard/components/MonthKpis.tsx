'use client';

import { CheckCircleOutlined, FileAddOutlined, PieChartOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { countChangePercent } from '@xeprime/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { utilizationPointChange } from '../dashboard-model';
import type { DashboardLinks } from '../hooks/use-dashboard-links';
import type { PartnerOverviewMonth } from '../types';
import { ChangeBadge } from './ChangeBadge';
import { StatCard } from './StatCard';
import styles from './MonthKpis.module.css';

/**
 * Hàng KPI "Tháng này" — hàng HAI của Tổng quan (sau việc cần làm, trước biểu đồ — UX §1.5).
 *
 * Ba thẻ vận hành chung cho hai tuyến (đơn mới · chuyến hoàn thành · tỉ lệ lấp đầy), mỗi thẻ kèm
 * mũi tên so CÙNG KỲ tháng trước do server tính và dẫn tới danh sách tạo nên con số. Tuyến gói chèn
 * thêm thẻ tiền/đội xe qua `leading`/`trailing` — cùng một hàng, cùng một nhịp.
 *
 * `month === null` (không có quyền xem đơn) ⇒ ba thẻ vận hành vắng, không hiện 0.
 */
export function MonthKpis({
  month,
  loading,
  links,
  leading,
  trailing,
}: {
  month: PartnerOverviewMonth | null | undefined;
  loading: boolean;
  links: DashboardLinks;
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const t = useTranslations('Dashboard.kpi');
  const fmt = useAppFormat();
  const showOps = month !== null;
  const pending = loading && !month;

  return (
    <section className={styles.section} aria-label={t('title')}>
      <h2 className={styles.heading}>{t('title')}</h2>
      <div className={styles.grid}>
        {leading}
        {showOps ? (
          <>
            <StatCard
              label={t('newBookings')}
              value={month ? fmt.count(month.newBookings) : '—'}
              icon={FileAddOutlined}
              tone="blue"
              loading={pending}
              href={links.allBookings}
              change={
                month ? (
                  <ChangeBadge value={countChangePercent(month.newBookings, month.newBookingsPrevious)} />
                ) : null
              }
            />
            <StatCard
              label={t('completedTrips')}
              value={month ? fmt.count(month.completedTrips) : '—'}
              icon={CheckCircleOutlined}
              tone="green"
              loading={pending}
              href={links.completed}
              change={
                month ? (
                  <ChangeBadge
                    value={countChangePercent(month.completedTrips, month.completedTripsPrevious)}
                  />
                ) : null
              }
            />
            <StatCard
              label={t('utilization')}
              value={
                month
                  ? month.utilizationPercent === null
                    ? t('utilizationEmpty')
                    : t('utilizationValue', { value: month.utilizationPercent })
                  : '—'
              }
              hint={t('utilizationHint')}
              icon={PieChartOutlined}
              tone="gold"
              loading={pending}
              href={links.calendar}
              change={
                month && month.utilizationPercent !== null ? (
                  <ChangeBadge
                    unit="points"
                    value={utilizationPointChange(
                      month.utilizationPercent,
                      month.utilizationPercentPrevious,
                    )}
                  />
                ) : null
              }
            />
          </>
        ) : null}
        {trailing}
      </div>
    </section>
  );
}
