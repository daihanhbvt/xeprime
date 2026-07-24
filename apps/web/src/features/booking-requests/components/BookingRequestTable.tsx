'use client';

import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { Button, Popconfirm, Space, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  BOOKING_REQUEST_STATUS,
  BOOKING_REQUEST_STATUS_META,
  type BookingRequestStatus,
  type PaginationMeta,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { formatDateTimeRange } from '@/lib/datetime';
import type { BookingRequestItem } from '../types';
import styles from './BookingRequestTable.module.css';

interface Props {
  items: BookingRequestItem[];
  meta: PaginationMeta;
  loading: boolean;
  actingId: string | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

export function BookingRequestTable({
  items,
  meta,
  loading,
  actingId,
  onApprove,
  onReject,
  onPageChange,
}: Props) {
  const columns: ColumnsType<BookingRequestItem> = [
    {
      title: 'Khách hàng',
      key: 'customer',
      render: (_, row) => (
        <div>
          <div className={styles.name}>{row.customerName}</div>
          <div className={styles.meta}>
            {row.customerPhone}
            {row.customerEmail ? ` · ${row.customerEmail}` : ''}
          </div>
        </div>
      ),
    },
    {
      title: 'Xe',
      key: 'vehicle',
      render: (_, row) => (
        <div>
          <div className={styles.name}>{row.vehicleName}</div>
          {row.vehiclePlate ? <div className={styles.meta}>{row.vehiclePlate}</div> : null}
        </div>
      ),
    },
    {
      title: 'Thời gian thuê',
      key: 'period',
      render: (_, row) => (
        <span className={styles.period}>{formatDateTimeRange(row.pickupAt, row.returnAt)}</span>
      ),
    },
    {
      title: 'Trạng thái',
      key: 'status',
      render: (_, row) => (
        <StatusTag value={row.status as BookingRequestStatus} meta={BOOKING_REQUEST_STATUS_META} />
      ),
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      width: 190,
      render: (_, row) =>
        row.status === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL ? (
          <Space size="small">
            <Popconfirm
              title="Duyệt và tạo đơn thuê?"
              description="Sẽ giữ chỗ lịch cho khung giờ này."
              okText="Duyệt"
              cancelText="Đóng"
              onConfirm={() => onApprove(row.id)}
            >
              <Button type="primary" size="small" icon={<CheckOutlined />} loading={actingId === row.id}>
                Duyệt
              </Button>
            </Popconfirm>
            <Popconfirm
              title="Từ chối yêu cầu này?"
              okText="Từ chối"
              okButtonProps={{ danger: true }}
              cancelText="Đóng"
              onConfirm={() => onReject(row.id)}
            >
              <Button danger size="small" icon={<CloseOutlined />} loading={actingId === row.id}>
                Từ chối
              </Button>
            </Popconfirm>
          </Space>
        ) : null,
    },
  ];

  return (
    <Table<BookingRequestItem>
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
        showTotal: (total) => `${total} yêu cầu`,
        onChange: onPageChange,
      }}
    />
  );
}
