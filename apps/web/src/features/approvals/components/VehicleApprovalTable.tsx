'use client';

import { CarOutlined, EyeOutlined } from '@ant-design/icons';
import { Button, Image } from 'antd';
import { useTranslations } from 'next-intl';
import { APPROVAL_STATUS_META, type ApprovalStatus, type PaginationMeta } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import type { VehicleApprovalRow } from '../types';
import styles from './VehicleApprovalTable.module.css';

interface VehicleApprovalTableProps {
  items: VehicleApprovalRow[];
  meta: PaginationMeta;
  loading: boolean;
  error?: { onRetry: () => void } | null;
  /** Có bộ lọc nào (ngoài mặc định) đang bật — quyết định câu rỗng nào hiện. */
  filtered: boolean;
  onClearFilters: () => void;
  onView: (approvalTaskId: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

/** 7 cột, cột "Xe" có ảnh nhỏ — dưới ngưỡng này bảng cuộn ngang thay vì bóp chữ. */
const MIN_TABLE_WIDTH = 1040;

/**
 * Hàng đợi "Duyệt xe".
 *
 * KHÔNG có nút Phê duyệt/Từ chối trên từng dòng, có chủ đích: quyết định chỉ được đưa ra sau khi
 * người duyệt đã mở hồ sơ và đi qua danh mục kiểm tra. Một nút duyệt ngay trên dòng là mời duyệt
 * một chiếc xe chỉ nhìn qua một tấm ảnh 40px.
 */
export function VehicleApprovalTable({
  items,
  meta,
  loading,
  error = null,
  filtered,
  onClearFilters,
  onView,
  onPageChange,
}: VehicleApprovalTableProps) {
  const t = useTranslations('Approvals.table');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const columns: DataTableColumn<VehicleApprovalRow>[] = [
    {
      title: t('vehicle'),
      key: 'vehicle',
      width: 280,
      render: (_, row) => (
        <div className={styles.vehicle}>
          {row.mainImageUrl ? (
            <Image
              src={row.mainImageUrl}
              alt={t('imageAlt', { name: row.vehicleName })}
              preview={false}
              loading="lazy"
              classNames={{ root: styles.thumb }}
            />
          ) : (
            <span className={styles.thumbEmpty} role="img" aria-label={t('noImage')}>
              <CarOutlined aria-hidden />
            </span>
          )}
          <div className={styles.vehicleText}>
            <span className={styles.vehicleName}>{row.vehicleName}</span>
            <span className={styles.caption}>
              {row.vehicleCode}
              {row.plateNumber ? ` · ${row.plateNumber}` : ''}
            </span>
          </div>
        </div>
      ),
    },
    {
      title: t('vehicleType'),
      key: 'vehicleType',
      width: 100,
      render: (_, row) => domainLabel('vehicleType', row.vehicleType),
    },
    {
      title: t('source'),
      key: 'source',
      width: 200,
      render: (_, row) => (
        <div className={styles.stack}>
          <span className={styles.caption}>
            {domainLabel('storefrontKind', row.storefrontKind)}
          </span>
          <span className={styles.clamp}>{row.sourceName}</span>
        </div>
      ),
    },
    {
      title: t('submittedBy'),
      key: 'submittedBy',
      width: 160,
      render: (_, row) => <span className={styles.clamp}>{row.submittedByName ?? '—'}</span>,
    },
    {
      title: t('submittedAt'),
      key: 'submittedAt',
      width: 150,
      render: (_, row) => fmt.dateTime(row.submittedAt),
    },
    {
      title: t('status'),
      key: 'status',
      width: 140,
      render: (_, row) => (
        <StatusTag
          value={row.approvalStatus as ApprovalStatus}
          meta={APPROVAL_STATUS_META}
          group="approvalStatus"
        />
      ),
    },
    actionColumn<VehicleApprovalRow>((row) => [
      {
        key: 'view',
        label: t('view'),
        icon: <EyeOutlined />,
        onClick: () => onView(row.approvalTaskId),
      },
    ]),
  ];

  return (
    <DataTable<VehicleApprovalRow>
      label={t('label')}
      columns={columns}
      items={items}
      rowKey={(row) => row.approvalTaskId}
      onRowClick={(row) => onView(row.approvalTaskId)}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={error ? { title: t('loadError'), onRetry: error.onRetry } : null}
      filtered={filtered}
      empty={{ title: t('empty'), description: t('emptyDescription') }}
      noResults={{
        title: t('noResults'),
        description: t('noResultsDescription'),
        action: <Button onClick={onClearFilters}>{t('clearFilters')}</Button>,
      }}
      pagination={{
        meta,
        onChange: onPageChange,
        totalLabel: (total) => tCommon('pagination.total', { count: total }),
      }}
    />
  );
}
