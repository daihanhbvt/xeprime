'use client';

import { EyeOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { APPROVAL_STATUS_META, type ApprovalStatus, type PaginationMeta } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import type { ApprovalTask } from '../types';
import { useAppFormat } from '@/i18n/use-app-format';

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
  const t = useTranslations('Approvals');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();

  const columns: DataTableColumn<ApprovalTask>[] = [
    {
      title: t('table.tenant'),
      key: 'tenant',
      width: 220,
      render: (_, row) => row.tenantName ?? '—',
    },
    {
      title: t('table.targetType'),
      key: 'targetType',
      width: 130,
      // Nhãn đọc từ message theo MÃ — `seller_profile` trước đây không có trong bảng nhãn nên
      // hiện ra nguyên chuỗi mã cho reviewer.
      render: (_, row) => t(`targetType.${row.targetType}`),
    },
    {
      title: t('table.submittedBy'),
      key: 'submittedBy',
      width: 180,
      render: (_, row) => row.submittedByName ?? '—',
    },
    {
      title: t('table.submittedAt'),
      key: 'submittedAt',
      width: 160,
      render: (_, row) => fmt.dateTime(row.submittedAt),
    },
    {
      title: t('table.status'),
      key: 'status',
      width: 130,
      render: (_, row) => (
        <StatusTag value={row.status as ApprovalStatus} meta={APPROVAL_STATUS_META} group="approvalStatus" />
      ),
    },
    actionColumn<ApprovalTask>((row) => [
      {
        key: 'view',
        label: t('table.view'),
        icon: <EyeOutlined />,
        onClick: () => onView(row.id),
      },
    ]),
  ];

  return (
    <DataTable<ApprovalTask>
      label={t('page.title')}
      columns={columns}
      items={items}
      onRowClick={(row) => onView(row.id)}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={error ? { title: t('table.loadError'), onRetry: error.onRetry } : null}
      // Trang này KHÔNG phân biệt rỗng vs không-kết-quả: bộ lọc mặc định đã là `pending`, nên
      // "không có phiếu nào" là câu đúng cho cả hai. Giữ nguyên hành vi trước migrate.
      empty={{ title: t('table.empty') }}
      pagination={{
        meta,
        onChange: onPageChange,
        totalLabel: (total) => tCommon('pagination.total', { count: total }),
      }}
    />
  );
}
