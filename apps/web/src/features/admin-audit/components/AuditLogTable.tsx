'use client';

import { Button, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  AUDIT_ACTOR_SCOPE_META,
  type AuditActorScope,
  type PaginationMeta,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { formatDateTime } from '@/lib/datetime';
import { auditActionLabel, auditTargetTypeLabel } from '../constants';
import type { AuditLog } from '../types';
import styles from './AuditLogTable.module.css';

interface AuditLogTableProps {
  items: AuditLog[];
  meta: PaginationMeta;
  loading: boolean;
  onView: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

export function AuditLogTable({ items, meta, loading, onView, onPageChange }: AuditLogTableProps) {
  const columns: ColumnsType<AuditLog> = [
    { title: 'Thời gian', key: 'createdAt', render: (_, r) => formatDateTime(r.createdAt) },
    {
      title: 'Người thao tác',
      key: 'actor',
      render: (_, r) => (
        <div>
          <div>{r.actorName ?? '—'}</div>
          {r.actorEmail ? <div className={styles.meta}>{r.actorEmail}</div> : null}
        </div>
      ),
    },
    {
      title: 'Phạm vi',
      key: 'scope',
      render: (_, r) => (
        <StatusTag value={r.actorScope as AuditActorScope} meta={AUDIT_ACTOR_SCOPE_META} />
      ),
    },
    {
      title: 'Hành động',
      key: 'action',
      render: (_, r) => (
        <div>
          <div className={styles.action}>{auditActionLabel(r.action)}</div>
          <div className={styles.meta}>{r.action}</div>
        </div>
      ),
    },
    {
      title: 'Đối tượng',
      key: 'target',
      render: (_, r) => (
        <div>
          <div>{auditTargetTypeLabel(r.targetType)}</div>
          {r.targetId ? <div className={styles.meta}>{r.targetId}</div> : null}
        </div>
      ),
    },
    { title: 'Gian hàng', key: 'tenant', render: (_, r) => r.tenantName ?? '—' },
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
    <Table<AuditLog>
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
        showTotal: (total) => `${total} dòng`,
        onChange: onPageChange,
      }}
    />
  );
}
