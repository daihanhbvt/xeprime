'use client';

import Link from 'next/link';
import { Tag } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DRIVER_ASSIGNMENT_OUTCOME_META, type DriverAssignmentOutcome } from '@xeprime/types';
import { driverWageLine } from '@xeprime/domain';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { bookingPath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { DRIVER_ASSIGNMENTS_LIMIT } from '../api';
import { useDriverAssignments } from '../hooks/use-drivers';
import type { Driver, DriverAssignmentRow } from '../types';
import styles from './DriversPage.module.css';

/**
 * "Chuyến & tiền công" của MỘT tài xế trong tháng (ADR 0075) — các chuyến tài xế đã nhận, kết thúc
 * trong tháng (giờ VN), mỗi chuyến kèm tiền công đã ghi. Cùng phép đếm với hai cột thống kê của
 * trang Tài xế; phân trang ở server.
 */
export function DriverAssignmentsDrawer({
  driver,
  month,
  monthLabel,
  onClose,
}: {
  driver: Driver | null;
  /** `YYYY-MM` — bỏ trống = tháng hiện tại (server quyết). */
  month: string | undefined;
  monthLabel: string;
  onClose: () => void;
}) {
  const t = useTranslations('Drivers.wage.drawer');
  const tLine = useTranslations('Drivers.wage.line');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const [page, setPage] = useState(1);
  const query = useDriverAssignments(driver?.id ?? null, month, page);

  const columns: DataTableColumn<DriverAssignmentRow>[] = [
    {
      title: t('columns.booking'),
      key: 'booking',
      width: 140,
      render: (_, row) => (
        <Link href={bookingPath.detail(row.bookingId)} className={styles.name}>
          {row.bookingCode}
        </Link>
      ),
    },
    {
      title: t('columns.period'),
      key: 'period',
      width: 200,
      render: (_, row) => (
        <span className={styles.meta}>{fmt.shortDateTimeRange(row.pickupAt, row.returnAt)}</span>
      ),
    },
    {
      title: t('columns.outcome'),
      key: 'outcome',
      width: 140,
      render: (_, row) => (
        <Tag color={DRIVER_ASSIGNMENT_OUTCOME_META[row.outcome as DriverAssignmentOutcome]?.color}>
          {domainLabel('driverAssignmentOutcome', row.outcome)}
        </Tag>
      ),
    },
    {
      title: t('columns.wage'),
      key: 'wage',
      width: 180,
      render: (_, row) => {
        const line = driverWageLine({ amount: row.wageAmount, stage: row.stage });
        if (!line) return <span className={styles.meta}>—</span>;
        return line.kind === 'none' ? (
          <span className={styles.meta}>{tLine('none')}</span>
        ) : (
          <span className={styles.name}>
            {tLine(line.kind, { amount: fmt.money(line.amount), days: row.wageDays ?? 0 })}
          </span>
        );
      },
    },
  ];

  const meta = query.data?.meta ?? {
    page,
    limit: DRIVER_ASSIGNMENTS_LIMIT,
    total: 0,
    hasNext: false,
  };

  return (
    <DetailDrawer
      open={driver !== null}
      onClose={() => {
        setPage(1);
        onClose();
      }}
      size="lg"
      title={driver ? t('title', { name: driver.name }) : ''}
      extra={
        driver ? (
          <span className={styles.meta}>
            {monthLabel} ·{' '}
            {t('summary', {
              trips: driver.monthCompletedTrips,
              amount: fmt.money(driver.monthWageTotal),
            })}
          </span>
        ) : null
      }
    >
      <DataTable<DriverAssignmentRow>
        label={t('tableLabel')}
        columns={columns}
        items={query.data?.items ?? []}
        rowKey={(row) => row.id}
        minWidth={640}
        loading={query.isFetching}
        error={
          query.isError && !query.data
            ? { title: t('loadError'), onRetry: () => void query.refetch() }
            : null
        }
        empty={{ title: t('empty') }}
        pagination={{
          meta,
          onChange: (next) => setPage(next),
          totalLabel: (total) => t('total', { count: total }),
        }}
      />
    </DetailDrawer>
  );
}
