'use client';

import { EyeOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { AUDIT_ACTOR_SCOPE_META, type AuditActorScope, type PaginationMeta } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { auditActionLabel, auditTargetTypeLabel } from '../constants';
import type { AuditLog } from '../types';
import styles from './AuditLogTable.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

interface AuditLogTableProps {
  items: AuditLog[];
  meta: PaginationMeta;
  loading: boolean;
  /** Chỉ truyền khi tải lần đầu hỏng và không còn dữ liệu — xem hợp đồng của `DataTable`. */
  error?: { onRetry: () => void } | null;
  filtered?: boolean;
  onClearFilters?: () => void;
  onView: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

/**
 * Bề rộng tối thiểu suy ra từ tổng bề rộng cột (P25 — Figma `127:1725` không có đặc tả cột cho
 * bảng này; con số 700px ở bảng tổng của Figma tính cho 6 cột, code có 7).
 */
const MIN_TABLE_WIDTH = 1110;

export function AuditLogTable({
  items,
  meta,
  loading,
  error = null,
  filtered = false,
  onClearFilters,
  onView,
  onPageChange,
}: AuditLogTableProps) {
  const fmt = useAppFormat();

  const columns: DataTableColumn<AuditLog>[] = [
    {
      title: 'Thời gian',
      key: 'createdAt',
      width: 150,
      render: (_, r) => fmt.dateTime(r.createdAt),
    },
    {
      title: 'Người thao tác',
      key: 'actor',
      width: 200,
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
      width: 120,
      render: (_, r) => (
        <StatusTag value={r.actorScope as AuditActorScope} meta={AUDIT_ACTOR_SCOPE_META} group="auditActorScope" />
      ),
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 200,
      render: (_, r) => (
        <div>
          <div className={styles.action}>{auditActionLabel(r.action)}</div>
          {/* Mã thô luôn hiện kèm nhãn: nhật ký phải tra được cả khi action chưa có nhãn VN. */}
          <div className={styles.meta}>{r.action}</div>
        </div>
      ),
    },
    {
      title: 'Đối tượng',
      key: 'target',
      width: 180,
      render: (_, r) => (
        <div>
          <div>{auditTargetTypeLabel(r.targetType)}</div>
          {r.targetId ? <div className={styles.meta}>{r.targetId}</div> : null}
        </div>
      ),
    },
    { title: 'Gian hàng', key: 'tenant', width: 160, render: (_, r) => r.tenantName ?? '—' },
    // Nút có chữ → 120px theo Figma `127:2060` R2.
    actionColumn<AuditLog>((row) => [
      { key: 'view', label: 'Xem chi tiết', icon: <EyeOutlined />, onClick: () => onView(row.id) },
    ]),
  ];

  return (
    <DataTable<AuditLog>
      label="Nhật ký hệ thống"
      columns={columns}
      items={items}
      onRowClick={(row) => onView(row.id)}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={error ? { title: 'Không tải được nhật ký', onRetry: error.onRetry } : null}
      filtered={filtered}
      empty={{ title: 'Chưa có nhật ký nào' }}
      noResults={{
        title: 'Không có dòng nhật ký khớp bộ lọc',
        action: onClearFilters ? <Button onClick={onClearFilters}>Xoá bộ lọc</Button> : undefined,
      }}
      pagination={{
        meta,
        onChange: onPageChange,
        totalLabel: (total) => `${total} dòng`,
      }}
    />
  );
}
