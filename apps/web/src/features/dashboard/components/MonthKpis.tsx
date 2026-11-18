'use client';

import { Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';
import { InfoCard } from '@/components/layout/InfoCard';
import { cx } from '@/lib/cx';
import { HeadLink } from './HeadLink';
import styles from './MonthKpis.module.css';

/** Một ô của khối so sánh tháng — cùng hình với `KpiCard` của app Partner. */
export interface MonthKpiCell {
  key: string;
  label: string;
  value: string;
  href: string;
  loading: boolean;
  /** `value` null = chưa có số cùng kỳ để so. */
  change?: { value: number | null; unit?: 'percent' | 'points'; previous?: string };
}

/**
 * "Tháng N so với tháng trước" — Figma `24138:80446`: một dải ô ngăn bằng vạch dọc trong khung
 * viền bo 16; mỗi ô nhãn 14 · số 20 semibold · dòng so sánh 12 (icon tròn lên/xuống, xanh/đỏ).
 * Danh sách ô do nơi gọi dựng (`useMonthKpiCells`) — cùng tập với app Partner.
 */
export function MonthKpis({
  month,
  cells,
  report,
}: {
  /** Tháng lịch hiện tại (1-12) cho tiêu đề. */
  month: number;
  cells: readonly MonthKpiCell[];
  report?: { href: string; label: string };
}) {
  const t = useTranslations('Dashboard.kpi');
  if (cells.length === 0) return null;
  return (
    <InfoCard
      title={t('titleVsPrevious', { month })}
      {...(report ? { extra: <HeadLink href={report.href} label={report.label} /> } : {})}
    >
      <div className={styles.strip}>
        {cells.map((cell, index) => (
          <Fragment key={cell.key}>
            {index > 0 ? <span className={styles.divider} aria-hidden="true" /> : null}
            <Link href={cell.href} className={styles.cell}>
              <span className={styles.label}>{cell.label}</span>
              {cell.loading ? (
                <Skeleton active title={false} paragraph={{ rows: 2, width: ['60%', '90%'] }} />
              ) : (
                <>
                  <span className={styles.value}>{cell.value}</span>
                  {cell.change ? <ChangeLine change={cell.change} /> : null}
                </>
              )}
            </Link>
          </Fragment>
        ))}
      </div>
    </InfoCard>
  );
}

/** "↓ 20% so với tháng trước (5,3tr)" — cùng chữ, cùng bậc với `ChangeLine` của app Partner. */
function ChangeLine({ change }: { change: NonNullable<MonthKpiCell['change']> }) {
  const t = useTranslations('Dashboard.change');
  const { value, unit = 'percent', previous } = change;
  if (value === null) return <span className={cx(styles.change, styles.flat)}>{t('none')}</span>;

  const direction = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
  const magnitude = Math.abs(value);
  const text =
    direction === 'flat'
      ? t('flat')
      : unit === 'points'
        ? t('points', { value: magnitude })
        : t('percent', { value: magnitude });

  return (
    <span
      className={cx(
        styles.change,
        direction === 'up' && styles.up,
        direction === 'down' && styles.down,
        direction === 'flat' && styles.flat,
      )}
    >
      {direction === 'flat' ? null : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/partner/dashboard/trend-${direction}.svg`}
          alt=""
          width={16}
          height={16}
          aria-hidden="true"
        />
      )}
      <span>
        {text} {previous ? t('vsPrevious', { value: previous }) : t('vsPreviousBare')}
      </span>
    </span>
  );
}
