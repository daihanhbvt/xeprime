'use client';

import { CheckCircleFilled } from '@ant-design/icons';
import { Button, Table, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { USER_STATUS_META, type PaginationMeta, type UserStatus } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { formatDate, formatDateTime } from '@/lib/datetime';
import type { AdminCustomer } from '../types';
import styles from './AdminCustomerTable.module.css';

interface AdminCustomerTableProps {
  items: AdminCustomer[];
  meta: PaginationMeta;
  loading: boolean;
  onView: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

export function AdminCustomerTable({
  items,
  meta,
  loading,
  onView,
  onPageChange,
}: AdminCustomerTableProps) {
  const columns: ColumnsType<AdminCustomer> = [
    {
      title: 'Khách',
      key: 'name',
      render: (_, r) => (
        <div>
          <div className={styles.name}>{r.displayName}</div>
          <div className={styles.meta}>{r.emailMasked ?? '—'}</div>
        </div>
      ),
    },
    {
      title: 'SĐT',
      key: 'phone',
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
      render: (_, r) => r.requestCount,
    },
    {
      title: 'Thành đơn',
      key: 'bookedCount',
      align: 'right',
      render: (_, r) => r.bookedCount,
    },
    {
      title: 'Đánh giá',
      key: 'reviewCount',
      align: 'right',
      render: (_, r) => r.reviewCount,
    },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (_, r) => <StatusTag value={r.status as UserStatus} meta={USER_STATUS_META} />,
    },
    {
      title: 'Đăng nhập gần nhất',
      key: 'lastLoginAt',
      render: (_, r) => (r.lastLoginAt ? formatDateTime(r.lastLoginAt) : 'Chưa đăng nhập'),
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
    <Table<AdminCustomer>
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
        showTotal: (total) => `${total} khách`,
        onChange: onPageChange,
      }}
    />
  );
}
