'use client';

import { APPROVAL_STATUS_META, type ApprovalStatus, type PaginationMeta } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { formatDateTime } from '@/lib/datetime';
import { targetTypeLabel } from '../constants';
import type { ApprovalTask } from '../types';

interface ApprovalTableProps {
  items: ApprovalTask[];
  meta: PaginationMeta;
  loading: boolean;
  error?: { onRetry: () => void } | null;
  onView: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

/** Figma `127:1725` ghi 680px cho Approval Queue; code có 6 cột. */
const MIN_TABLE_WIDTH = 860;

export function ApprovalTable({
  items,
  meta,
  loading,
  error = null,
  onView,
  onPageChange,
}: ApprovalTableProps) {
  const columns: DataTableColumn<ApprovalTask>[] = [
    { title: 'Gian hàng', key: 'tenant', render: (_, row) => row.tenantName ?? '—' },
    {
      title: 'Loại',
      key: 'targetType',
      width: 130,
      render: (_, row) => targetTypeLabel(row.targetType),
    },
    {
      title: 'Người gửi',
      key: 'submittedBy',
      width: 180,
      render: (_, row) => row.submittedByName ?? '—',
    },
    {
      title: 'Gửi lúc',
      key: 'submittedAt',
      width: 160,
      render: (_, row) => formatDateTime(row.submittedAt),
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 130,
      render: (_, row) => (
        <StatusTag value={row.status as ApprovalStatus} meta={APPROVAL_STATUS_META} />
      ),
    },
    actionColumn<ApprovalTask>(
      (row) => [{ key: 'view', label: 'Xem', showLabel: true, onClick: () => onView(row.id) }],
      { width: 120 },
    ),
  ];

  return (
    <DataTable<ApprovalTask>
      label="Hàng đợi duyệt hồ sơ"
      columns={columns}
      items={items}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={error ? { title: 'Không tải được hàng đợi duyệt', onRetry: error.onRetry } : null}
      // Trang này KHÔNG phân biệt rỗng vs không-kết-quả: bộ lọc mặc định đã là `pending`, nên
      // "không có phiếu nào" là câu đúng cho cả hai. Giữ nguyên hành vi trước migrate.
      empty={{ title: 'Không có phiếu nào' }}
      pagination={{ meta, onChange: onPageChange, totalLabel: (total) => `${total} phiếu` }}
    />
  );
}
