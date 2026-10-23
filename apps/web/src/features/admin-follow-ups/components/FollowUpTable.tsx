'use client';

import { EyeOutlined } from '@ant-design/icons';
import { Button, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import type { FollowUpLostReason, FollowUpStatus, PaginationMeta } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { useAppFormat } from '@/i18n/use-app-format';
import { FOLLOW_UP_STATUS_COLOR } from '../constants';
import type { FollowUp } from '../types';
import styles from './FollowUps.module.css';

/** Sàn bề rộng sáu cột dữ liệu + cột thao tác. */
const MIN_TABLE_WIDTH = 1080;

export function FollowUpTable({
  items,
  meta,
  loading,
  error = null,
  filtered = false,
  onClearFilters,
  onView,
  onPageChange,
  selectedId = null,
}: {
  items: FollowUp[];
  meta: PaginationMeta;
  loading: boolean;
  error?: { onRetry: () => void } | null;
  filtered?: boolean;
  onClearFilters?: () => void;
  onView: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
  selectedId?: string | null;
}) {
  const t = useTranslations('AdminFollowUps');
  const fmt = useAppFormat();

  const columns: DataTableColumn<FollowUp>[] = [
    {
      title: t('table.customer'),
      key: 'customer',
      width: 200,
      render: (_, r) => (
        <div>
          <div className={styles.name}>{r.customerName}</div>
          <div className={styles.meta}>{r.customerPhoneMasked ?? '—'}</div>
        </div>
      ),
    },
    {
      title: t('table.trip'),
      key: 'trip',
      width: 220,
      render: (_, r) => (
        <div>
          <div>{r.vehicleName}</div>
          <div className={styles.meta}>{r.tenantName}</div>
        </div>
      ),
    },
    {
      title: t('table.reason'),
      key: 'reason',
      width: 200,
      render: (_, r) => (
        <div>
          <div>{t(`reason.${r.lostReason as FollowUpLostReason}`)}</div>
          {r.rebookedLater ? <div className={styles.good}>{t('table.rebookedLater')}</div> : null}
        </div>
      ),
    },
    {
      title: t('table.closedAt'),
      key: 'closedAt',
      width: 150,
      render: (_, r) => fmt.shortDateTime(r.closedAt),
    },
    {
      title: t('table.followUp'),
      key: 'followUp',
      width: 150,
      render: (_, r) => {
        const status = r.followUpStatus as FollowUpStatus;
        return <Tag color={FOLLOW_UP_STATUS_COLOR[status]}>{t(`status.${status}`)}</Tag>;
      },
    },
    {
      title: t('table.assignee'),
      key: 'assignee',
      width: 150,
      render: (_, r) => r.assigneeName ?? '—',
    },
    actionColumn<FollowUp>((row) => [
      { key: 'open', label: t('table.open'), icon: <EyeOutlined />, onClick: () => onView(row.id) },
    ]),
  ];

  return (
    <DataTable<FollowUp>
      label={t('table.label')}
      columns={columns}
      items={items}
      onRowClick={(row) => onView(row.id)}
      selectedRowKey={selectedId}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={error ? { title: t('table.loadError'), onRetry: error.onRetry } : null}
      filtered={filtered}
      empty={{ title: t('table.empty') }}
      noResults={{
        title: t('table.noResults'),
        action: onClearFilters ? (
          <Button onClick={onClearFilters}>{t('table.clearFilters')}</Button>
        ) : undefined,
      }}
      pagination={{
        meta,
        onChange: onPageChange,
        totalLabel: (total) => t('table.total', { count: total }),
      }}
    />
  );
}
