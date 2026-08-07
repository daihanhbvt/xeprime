'use client';

import { Button } from 'antd';
import {
  TENANT_STATUS_META,
  TENANT_TYPE_LABEL,
  type PaginationMeta,
  type TenantStatus,
  type TenantType,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { formatDate } from '@/lib/datetime';
import type { AdminTenant } from '../types';
import styles from './AdminTenantTable.module.css';

interface AdminTenantTableProps {
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
  items,
  meta,
  loading,
  error = null,
  filtered = false,
  onClearFilters,
  onView,
  onPageChange,
}: AdminTenantTableProps) {
  const columns: DataTableColumn<AdminTenant>[] = [
    {
      title: 'Gian hàng',
      key: 'name',
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
      title: 'Chủ shop',
      key: 'owner',
      width: 180,
      render: (_, r) => (
        <div>
          <div>{r.ownerName ?? '—'}</div>
          {r.phone ? <div className={styles.meta}>{r.phone}</div> : null}
        </div>
      ),
    },
    {
      title: 'Loại',
      key: 'type',
      width: 120,
      render: (_, r) => TENANT_TYPE_LABEL[r.tenantType as TenantType] ?? r.tenantType,
    },
    { title: 'Xe', key: 'vehicles', align: 'right', width: 80, render: (_, r) => r.vehicleCount },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 130,
      render: (_, r) => <StatusTag value={r.status as TenantStatus} meta={TENANT_STATUS_META} />,
    },
    { title: 'Ngày tạo', key: 'createdAt', width: 120, render: (_, r) => formatDate(r.createdAt) },
    actionColumn<AdminTenant>(
      (row) => [{ key: 'view', label: 'Xem', showLabel: true, onClick: () => onView(row.id) }],
      { width: 120 },
    ),
  ];

  return (
    <DataTable<AdminTenant>
      label="Danh sách gian hàng"
      columns={columns}
      items={items}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={error ? { title: 'Không tải được danh sách gian hàng', onRetry: error.onRetry } : null}
      filtered={filtered}
      empty={{ title: 'Chưa có gian hàng nào' }}
      noResults={{
        title: 'Không có gian hàng khớp bộ lọc',
        action: onClearFilters ? <Button onClick={onClearFilters}>Xoá bộ lọc</Button> : undefined,
      }}
      pagination={{
        meta,
        onChange: onPageChange,
        totalLabel: (total) => `${total} gian hàng`,
      }}
    />
  );
}
