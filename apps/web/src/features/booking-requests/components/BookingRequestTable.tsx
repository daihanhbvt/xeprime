'use client';

import { CarOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { Button, Popconfirm, Space, Tag, Tooltip } from 'antd';
import {
  BOOKING_REQUEST_STATUS,
  BOOKING_REQUEST_STATUS_META,
  type BookingRequestStatus,
  type PaginationMeta,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { formatDateTimeRange } from '@/lib/datetime';
import { formatMoneyVnd } from '@/lib/money';
import type { BookingRequestItem } from '../types';
import styles from './BookingRequestTable.module.css';

interface Props {
  items: BookingRequestItem[];
  meta: PaginationMeta;
  loading: boolean;
  actingId: string | null;
  error?: { onRetry: () => void } | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  /** Mở drawer "Báo giá giao nhận" (Wave 2) — chỉ gọi cho yêu cầu có giao tận nơi. */
  onQuote: (row: BookingRequestItem) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

/** Figma `127:1725` ghi 860px cho Booking Requests; Wave 2 thêm cụm báo giá giao nhận. */
const MIN_TABLE_WIDTH = 1020;

export function BookingRequestTable({
  items,
  meta,
  loading,
  actingId,
  error = null,
  onApprove,
  onReject,
  onQuote,
  onPageChange,
}: Props) {
  const columns: DataTableColumn<BookingRequestItem>[] = [
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
      width: 200,
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
      width: 220,
      render: (_, row) => (
        <span className={styles.period}>{formatDateTimeRange(row.pickupAt, row.returnAt)}</span>
      ),
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 190,
      render: (_, row) => (
        <div className={styles.statusCell}>
          <StatusTag
            value={row.status as BookingRequestStatus}
            meta={BOOKING_REQUEST_STATUS_META}
          />
          {/* Nhánh giao tận nơi (Wave 2): thiếu báo giá → duyệt bị chặn, nói ra ngay ở hàng. */}
          {row.deliveryRequested ? (
            row.needsDeliveryQuote ? (
              <Tag color="orange" icon={<CarOutlined aria-hidden="true" />}>
                Cần báo giá giao nhận
              </Tag>
            ) : row.deliveryQuote?.stale ? (
              <Tooltip title="Chính sách giao nhận đã đổi sau khi báo giá — nên báo lại trước khi duyệt">
                <Tag color="orange" icon={<CarOutlined aria-hidden="true" />}>
                  Báo giá đã cũ
                </Tag>
              </Tooltip>
            ) : row.deliveryQuote ? (
              <Tag icon={<CarOutlined aria-hidden="true" />}>
                Giao nhận {formatMoneyVnd(row.deliveryQuote.fee)}
              </Tag>
            ) : null
          ) : null}
        </div>
      ),
    },
    {
      // CỐ Ý KHÔNG dùng `actionColumn`/`RowActions`: đây là cặp CTA duyệt/từ chối, không phải dải
      // nút icon phụ. `RowActions` render `type="text"`, sẽ hạ nút "Duyệt" từ nút chính xuống
      // chữ thường — mất hẳn thứ bậc thị giác của một quyết định tạo ra đơn thuê thật.
      // Vẫn giữ `fixed: 'right'` + width cố định theo Figma `127:2060` R1–R2.
      title: '',
      key: 'actions',
      align: 'right',
      fixed: 'right',
      width: 270,
      render: (_, row) =>
        row.status === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL ? (
          <Space size="small" onClick={(event) => event.stopPropagation()}>
            {row.deliveryRequested ? (
              <Button
                // Thiếu/cũ báo giá thì đây là hành động chính của hàng — duyệt sẽ bị chặn.
                type={row.needsDeliveryQuote || row.deliveryQuote?.stale ? 'primary' : 'default'}
                size="small"
                icon={<CarOutlined aria-hidden="true" />}
                onClick={() => onQuote(row)}
              >
                Báo giá
              </Button>
            ) : null}
            <Popconfirm
              title="Duyệt và tạo đơn thuê?"
              description="Giá chốt theo chính sách hiện tại + báo giá giao nhận (nếu có); sẽ giữ chỗ lịch cho khung giờ này."
              okText="Duyệt"
              cancelText="Đóng"
              onConfirm={() => onApprove(row.id)}
            >
              <Button
                type="primary"
                size="small"
                icon={<CheckOutlined aria-hidden="true" />}
                loading={actingId === row.id}
                // Chặn sớm cho đúng UX; chốt thật vẫn là DELIVERY_QUOTE_REQUIRED ở backend.
                disabled={row.needsDeliveryQuote}
              >
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
              <Button
                danger
                size="small"
                icon={<CloseOutlined aria-hidden="true" />}
                loading={actingId === row.id}
              >
                Từ chối
              </Button>
            </Popconfirm>
          </Space>
        ) : null,
    },
  ];

  return (
    <DataTable<BookingRequestItem>
      label="Danh sách yêu cầu thuê"
      columns={columns}
      items={items}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={error ? { title: 'Không tải được danh sách yêu cầu', onRetry: error.onRetry } : null}
      empty={{ title: 'Không có yêu cầu nào' }}
      pagination={{ meta, onChange: onPageChange, totalLabel: (total) => `${total} yêu cầu` }}
    />
  );
}
