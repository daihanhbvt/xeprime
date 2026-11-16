'use client';

import {
  STATUS_COLOR,
  VEHICLE_DATA_IMPORT_STATUS,
  type VehicleDataImportStatus,
} from '@xeprime/types';
import { Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { useAppFormat } from '@/i18n/use-app-format';

import { useVehicleDataImports } from '../hooks';
import type { VehicleDataImport } from '../types';
import styles from './VehicleData.module.css';

const LIMIT = 10;

const STATUS_TAG: Record<VehicleDataImportStatus, string> = {
  [VEHICLE_DATA_IMPORT_STATUS.PREVIEWED]: STATUS_COLOR.PROCESSING,
  [VEHICLE_DATA_IMPORT_STATUS.APPLIED]: STATUS_COLOR.SUCCESS,
  [VEHICLE_DATA_IMPORT_STATUS.DISCARDED]: STATUS_COLOR.NEUTRAL,
};

/** Các lượt nhập file: ai, lúc nào, file gì, kết quả. Bấm một lượt để xem lại từng dòng. */
export function VehicleDataImportHistory({
  open,
  onClose,
  onOpenImport,
}: {
  open: boolean;
  onClose: () => void;
  onOpenImport: (id: string) => void;
}) {
  const t = useTranslations('AdminVehicleData');
  const fmt = useAppFormat();
  const [page, setPage] = useState(1);
  const history = useVehicleDataImports({ page, limit: LIMIT }, open);

  const columns: DataTableColumn<VehicleDataImport>[] = [
    {
      title: t('history.columns.file'),
      key: 'file',
      render: (_, i) => <span className={styles.strong}>{i.fileName}</span>,
    },
    {
      title: t('history.columns.status'),
      key: 'status',
      width: 140,
      render: (_, i) => (
        <Tag color={STATUS_TAG[i.status as VehicleDataImportStatus]} className={styles.tag}>
          {t(`import.status.${i.status as VehicleDataImportStatus}`)}
        </Tag>
      ),
    },
    {
      title: t('history.columns.rows'),
      key: 'rows',
      width: 280,
      render: (_, i) =>
        t('history.rowsSummary', {
          total: i.summary.rowsTotal,
          create: i.summary.rowsCreate,
          update: i.summary.rowsUpdate,
          error: i.summary.rowsError,
        }),
    },
    {
      title: t('history.columns.created'),
      key: 'created',
      width: 200,
      render: (_, i) => (
        <span className={styles.stack}>
          <span>{fmt.dateTime(i.appliedAt ?? i.createdAt)}</span>
          {i.appliedByName || i.createdByName ? (
            <span className={styles.muted}>{i.appliedByName ?? i.createdByName}</span>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <DetailDrawer open={open} onClose={onClose} size="lg" title={t('history.title')}>
      <DataTable<VehicleDataImport>
        label={t('history.tableLabel')}
        columns={columns}
        items={history.data?.items ?? []}
        rowKey={(i) => i.id}
        onRowClick={(i) => onOpenImport(i.id)}
        minWidth={760}
        loading={history.isFetching}
        error={
          history.isError && !history.data
            ? { title: t('import.loadError'), onRetry: () => void history.refetch() }
            : null
        }
        empty={{ title: t('history.empty') }}
        renderCard={(i) => (
          <span className={styles.card}>
            <span className={styles.strong}>{i.fileName}</span>
            <span className={styles.muted}>
              {t(`import.status.${i.status as VehicleDataImportStatus}`)} ·{' '}
              {fmt.dateTime(i.createdAt)}
            </span>
          </span>
        )}
        pagination={{
          meta: history.data?.meta ?? { page, limit: LIMIT, total: 0, hasNext: false },
          onChange: (next) => setPage(next),
          totalLabel: (total) => t('history.total', { count: total }),
        }}
      />
    </DetailDrawer>
  );
}
