'use client';

import { CheckCircleFilled } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { USER_STATUS_META, type PaginationMeta, type UserStatus } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { formatDate, formatDateTime } from '@/lib/datetime';
import type { AdminCustomer } from '../types';
import styles from './AdminCustomerTable.module.css';

interface AdminCustomerTableProps {
  items: AdminCustomer[];
  meta: PaginationMeta;
  loading: boolean;
  error?: { onRetry: () => void } | null;
  filtered?: boolean;
  onClearFilters?: () => void;
  onView: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

/** Suy từ tổng bề rộng cột (P25) — 9 cột, ba cột đếm hẹp. */
const MIN_TABLE_WIDTH = 1160;

export function AdminCustomerTable({
  items,
  meta,
  loading,
  error = null,
  filtered = false,
  onClearFilters,
  onView,
  onPageChange,
}: AdminCustomerTableProps) {
  const columns: DataTableColumn<AdminCustomer>[] = [
    {
      title: 'Khách',
      key: 'name',
      render: (_, r) => (
        <div>
          <div className={styles.name}>{r.displayName}</div>
          {/* Email LUÔN che ở danh sách — bỏ che chỉ xảy ra trong panel chi tiết và có ghi audit. */}
          <div className={styles.meta}>{r.emailMasked ?? '—'}</div>
        </div>
      ),
    },
    {
      title: 'SĐT',
      key: 'phone',
      width: 150,
      render: (_, r) => (
        <span className={styles.phoneCell}>
          <span className={styles.masked}>{r.phoneMasked ?? '—'}</span>
          {r.phoneVerified ? (
            <Tooltip title="SĐT đã xác thực OTP">
              {/* Màu lấy từ token (ADR 0003), không hard-code hex trong component. */}
              <CheckCircleFilled className={styles.verified} />
            </Tooltip>
          ) : null}
        </span>
      ),
    },
    {
      title: 'Yêu cầu',
      key: 'requestCount',
      align: 'right',
      width: 100,
      render: (_, r) => r.requestCount,
    },
    {
      title: 'Thành đơn',
      key: 'bookedCount',
      align: 'right',
      width: 110,
      render: (_, r) => r.bookedCount,
    },
    {
      title: 'Đánh giá',
      key: 'reviewCount',
      align: 'right',
      width: 100,
      render: (_, r) => r.reviewCount,
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 120,
      render: (_, r) => <StatusTag value={r.status as UserStatus} meta={USER_STATUS_META} />,
    },
    {
      title: 'Đăng nhập gần nhất',
      key: 'lastLoginAt',
      width: 170,
      render: (_, r) => (r.lastLoginAt ? formatDateTime(r.lastLoginAt) : 'Chưa đăng nhập'),
    },
    { title: 'Ngày tạo', key: 'createdAt', width: 120, render: (_, r) => formatDate(r.createdAt) },
    actionColumn<AdminCustomer>(
      (row) => [{ key: 'view', label: 'Xem', showLabel: true, onClick: () => onView(row.id) }],
      { width: 120 },
    ),
  ];

  return (
    <DataTable<AdminCustomer>
      label="Danh sách khách hàng"
      columns={columns}
      items={items}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={error ? { title: 'Không tải được danh sách khách', onRetry: error.onRetry } : null}
      filtered={filtered}
      empty={{ title: 'Chưa có khách thuê nào' }}
      noResults={{
        title: 'Không có khách khớp bộ lọc',
        action: onClearFilters ? <Button onClick={onClearFilters}>Xoá bộ lọc</Button> : undefined,
      }}
      pagination={{ meta, onChange: onPageChange, totalLabel: (total) => `${total} khách` }}
    />
  );
}
