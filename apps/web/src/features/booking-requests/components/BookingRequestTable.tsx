'use client';

import { CarOutlined, CheckOutlined, CloseOutlined, MessageOutlined } from '@ant-design/icons';
import { Button, Popconfirm, Space, Tag, Tooltip } from 'antd';
import {
  BOOKING_REQUEST_STATUS,
  BOOKING_REQUEST_STATUS_META,
  ROUTE_TYPE_LABEL,
  SERVICE_TYPE,
  serviceTypeLabel,
  type BookingRequestStatus,
  type PaginationMeta,
  type RouteType,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { formatShortDateTimeRange } from '@/lib/datetime';
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
  onPageChange: (page: number, pageSize: number) => void;
}

/** Figma `127:1725` ghi 860px; thêm cột Dịch vụ (17/08) + cột thao tác cố định bên phải. */
const MIN_TABLE_WIDTH = 1240;

export function BookingRequestTable({
  items,
  meta,
  loading,
  actingId,
  error = null,
  onApprove,
  onReject,
  onPageChange,
}: Props) {
  const columns: DataTableColumn<BookingRequestItem>[] = [
    {
      title: 'Khách hàng',
      key: 'customer',
      width: 240,
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
      width: 260,
      render: (_, row) => (
        <span className={styles.period}>
          {formatShortDateTimeRange(row.pickupAt, row.returnAt)}
        </span>
      ),
    },
    {
      // Dịch vụ + ngữ cảnh chuyến (17/08): có tài xế hiện lộ trình + địa chỉ đón/điểm đến —
      // đúng thứ shop cần đọc để BÁO GIÁ trước khi duyệt.
      title: 'Dịch vụ',
      key: 'service',
      width: 220,
      render: (_, row) => (
        <div>
          <Tag>{serviceTypeLabel(row.serviceType)}</Tag>
          {row.serviceType === SERVICE_TYPE.WITH_DRIVER ? (
            <div className={styles.meta}>
              {row.routeType ? (ROUTE_TYPE_LABEL[row.routeType as RouteType] ?? row.routeType) : ''}
              {row.pickupAddress ? ` · Đón: ${row.pickupAddress}` : ''}
              {row.destination ? ` → ${row.destination}` : ''}
            </div>
          ) : null}
          {/* Ghi chú của khách từng bị bỏ quên (không render dù DTO trả) — nay hiện tại đây. */}
          {row.note ? (
            <Tooltip title={row.note}>
              <div className={styles.meta}>
                <MessageOutlined aria-hidden="true" /> {row.note}
              </div>
            </Tooltip>
          ) : null}
        </div>
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
          {/*
            Giao tận nơi (Wave 9): KHÔNG còn cửa chặn báo giá. Chỉ nói hình thức nhận xe và mức
            phí mặc định; chủ xe chốt phí thật trên ĐƠN sau khi duyệt và thoả thuận với khách.
          */}
          {row.deliveryRequested ? (
            <Tooltip title={row.deliveryAddress ?? undefined}>
              <Tag icon={<CarOutlined aria-hidden="true" />}>Giao tận nơi · Miễn phí</Tag>
            </Tooltip>
          ) : null}
        </div>
      ),
    },
    {
      // CỐ Ý KHÔNG dùng `actionColumn`/`RowActions`: đây là cặp CTA duyệt/từ chối, không phải dải
      // nút icon phụ. `RowActions` render `type="text"`, sẽ hạ nút "Duyệt" từ nút chính xuống
      // chữ thường — mất hẳn thứ bậc thị giác của một quyết định tạo ra đơn thuê thật.
      // Vẫn giữ `fixed: 'right'` + width cố định theo Figma `127:2060` R1–R2.
      title: 'Thao tác',
      key: 'actions',
      align: 'right',
      fixed: 'right',
      width: 270,
      render: (_, row) =>
        row.status === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL ? (
          <Space size="small" onClick={(event) => event.stopPropagation()}>
            <Popconfirm
              title="Duyệt và tạo đơn thuê?"
              description={
                row.deliveryRequested
                  ? 'Giá chốt theo chính sách hiện tại, phí giao nhận mặc định Miễn phí (cập nhật sau trên đơn nếu cần); sẽ giữ chỗ lịch cho khung giờ này.'
                  : 'Giá chốt theo chính sách hiện tại; sẽ giữ chỗ lịch cho khung giờ này.'
              }
              okText="Duyệt"
              cancelText="Đóng"
              onConfirm={() => onApprove(row.id)}
            >
              <Button
                type="primary"
                size="small"
                icon={<CheckOutlined aria-hidden="true" />}
                loading={actingId === row.id}
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
