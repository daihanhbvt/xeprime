'use client';

import { Button, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { APPROVAL_STATUS_META, type ApprovalStatus, type PaginationMeta } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { formatDateTime } from '@/lib/datetime';
import { targetTypeLabel } from '../constants';
import type { ApprovalTask } from '../types';

interface ApprovalTableProps {
  items: ApprovalTask[];
  meta: PaginationMeta;
  loading: boolean;
  onView: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

export function ApprovalTable({ items, meta, loading, onView, onPageChange }: ApprovalTableProps) {
  const columns: ColumnsType<ApprovalTask> = [
    {
      title: 'Gian hàng',
      key: 'tenant',
      render: (_, row) => row.tenantName ?? '—',
    },
    {
      title: 'Loại',
      key: 'targetType',
      render: (_, row) => targetTypeLabel(row.targetType),
    },
    {
      title: 'Người gửi',
      key: 'submittedBy',
      render: (_, row) => row.submittedByName ?? '—',
    },
    {
      title: 'Gửi lúc',
      key: 'submittedAt',
      render: (_, row) => formatDateTime(row.submittedAt),
    },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (_, row) => (
        <StatusTag value={row.status as ApprovalStatus} meta={APPROVAL_STATUS_META} />
      ),
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, row) => (
        <Button type="link" onClick={() => onView(row.id)}>
          Xem
        </Button>
      ),
    },
  ];

  return (
    <Table<ApprovalTask>
      rowKey="id"
      columns={columns}
      dataSource={items}
      loading={loading}
      scroll={{ x: 'max-content' }}
      pagination={{
        current: meta.page,
        pageSize: meta.limit,
        total: meta.total,
        showTotal: (total) => `${total} phiếu`,
        onChange: onPageChange,
      }}
    />
  );
}
