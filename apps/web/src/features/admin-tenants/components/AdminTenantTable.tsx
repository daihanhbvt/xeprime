'use client';

import { EyeOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import {
  TENANT_STATUS_META,
  type PaginationMeta,
  type PlatformPartnerKind,
  type TenantStatus,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import type { AdminTenant } from '../types';
import styles from './AdminTenantTable.module.css';

interface AdminTenantTableProps {
  /** Danh sách đang hiển thị — chỉ đổi câu chữ; dữ liệu đã được server lọc theo loại. */
  partnerKind: PlatformPartnerKind;
  items: AdminTenant[];
  meta: PaginationMeta;
  loading: boolean;
  error?: { onRetry: () => void } | null;
  filtered?: boolean;
  onClearFilters?: () => void;
  onView: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

/** Suy từ tổng bề rộng cột (P25 — Figma `127:1725` không đặc tả cột cho bảng gian hàng). */
const MIN_TABLE_WIDTH = 950;

export function AdminTenantTable({
  partnerKind,
  items,
  meta,
  loading,
  error = null,
  filtered = false,
  onClearFilters,
  onView,
  onPageChange,
}: AdminTenantTableProps) {
  const t = useTranslations('AdminTenants.list');
  const tKind = useTranslations(`AdminTenants.list.kinds.${partnerKind}`);
  const tCommon = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const empty = tCommon('emptyValue');

  const columns: DataTableColumn<AdminTenant>[] = [
    {
      title: tKind('name'),
      key: 'name',
      width: 230,
      render: (_, r) => (
        <div>
          <div className={styles.name}>{r.name}</div>
          <div className={styles.meta}>
            {r.code}
            {r.provinceName ? ` · ${r.provinceName}` : ''}
          </div>
        </div>
      ),
    },
    {
      title: tKind('owner'),
      key: 'owner',
      width: 180,
      render: (_, r) => (
        <div>
          <div>{r.ownerName ?? empty}</div>
          {r.phone ? <div className={styles.meta}>{r.phone}</div> : null}
        </div>
      ),
    },
    {
      title: t('columns.type'),
      key: 'type',
      width: 120,
      render: (_, r) => domainLabel('tenantType', r.tenantType, r.tenantType),
    },
    {
      title: t('columns.vehicles'),
      key: 'vehicles',
      align: 'right',
      width: 80,
      render: (_, r) => r.vehicleCount,
    },
    {
      title: t('columns.status'),
      key: 'status',
      width: 130,
      render: (_, r) => (
        <StatusTag
          value={r.status as TenantStatus}
          meta={TENANT_STATUS_META}
          group="tenantStatus"
        />
      ),
    },
    {
      title: t('columns.createdAt'),
      key: 'createdAt',
      width: 120,
      render: (_, r) => fmt.date(r.createdAt),
    },
    actionColumn<AdminTenant>((row) => [
      { key: 'view', label: t('view'), icon: <EyeOutlined />, onClick: () => onView(row.id) },
    ]),
  ];

  return (
    <DataTable<AdminTenant>
      label={tKind('tableLabel')}
      columns={columns}
      items={items}
      onRowClick={(row) => onView(row.id)}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={error ? { title: tKind('loadError'), onRetry: error.onRetry } : null}
      filtered={filtered}
      empty={{ title: tKind('empty') }}
      noResults={{
        title: tKind('noResults'),
        action: onClearFilters ? (
          <Button onClick={onClearFilters}>{t('clearFilters')}</Button>
        ) : undefined,
      }}
      pagination={{
        meta,
        onChange: onPageChange,
        totalLabel: (total) => tKind('total', { count: total }),
      }}
    />
  );
}
