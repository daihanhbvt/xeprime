'use client';

import { Button, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  TENANT_STATUS_META,
  TENANT_TYPE_LABEL,
  type PaginationMeta,
  type TenantStatus,
  type TenantType,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { formatDate } from '@/lib/datetime';
import type { AdminTenant } from '../types';
import styles from './AdminTenantTable.module.css';

interface AdminTenantTableProps {
  items: AdminTenant[];
  meta: PaginationMeta;
  loading: boolean;
  onView: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

export function AdminTenantTable({ items, meta, loading, onView, onPageChange }: AdminTenantTableProps) {
  const columns: ColumnsType<AdminTenant> = [
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
      render: (_, r) => TENANT_TYPE_LABEL[r.tenantType as TenantType] ?? r.tenantType,
    },
    { title: 'Xe', key: 'vehicles', align: 'right', render: (_, r) => r.vehicleCount },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (_, r) => <StatusTag value={r.status as TenantStatus} meta={TENANT_STATUS_META} />,
    },
    { title: 'Ngày tạo', key: 'createdAt', render: (_, r) => formatDate(r.createdAt) },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, r) => (
        <Button type="link" onClick={() => onView(r.id)}>
          Xem
        </Button>
      ),
    },
  ];

  return (
    <Table<AdminTenant>
      rowKey="id"
      columns={columns}
      dataSource={items}
      loading={loading}
      scroll={{ x: 'max-content' }}
      pagination={{
        current: meta.page,
        pageSize: meta.limit,
        total: meta.total,
        showSizeChanger: true,
        showTotal: (total) => `${total} gian hàng`,
        onChange: onPageChange,
      }}
    />
  );
}
