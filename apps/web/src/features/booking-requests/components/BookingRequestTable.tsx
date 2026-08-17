'use client';

import { CarOutlined, CheckOutlined, CloseOutlined, MessageOutlined } from '@ant-design/icons';
import { Tag, Tooltip } from 'antd';
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
import {
  actionColumn,
  DataTable,
  type DataTableColumn,
} from '@/components/data-display/DataTable';
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
    actionColumn<BookingRequestItem>(
      (row) =>
        row.status === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL
          ? [
              {
                key: 'approve',
                label: 'Duyệt',
                icon: <CheckOutlined aria-hidden="true" />,
                primary: true,
                loading: actingId === row.id,
                confirm: {
                  title: 'Duyệt và tạo đơn thuê?',
                  description: row.deliveryRequested
                    ? 'Giá chốt theo chính sách hiện tại, phí giao nhận mặc định Miễn phí (cập nhật sau trên đơn nếu cần); sẽ giữ chỗ lịch cho khung giờ này.'
                    : 'Giá chốt theo chính sách hiện tại; sẽ giữ chỗ lịch cho khung giờ này.',
                  okText: 'Duyệt',
                  cancelText: 'Đóng',
                },
                onClick: () => onApprove(row.id),
              },
              {
                key: 'reject',
                label: 'Từ chối',
                icon: <CloseOutlined aria-hidden="true" />,
                danger: true,
                loading: actingId === row.id,
                confirm: {
                  title: 'Từ chối yêu cầu này?',
                  okText: 'Từ chối',
                  cancelText: 'Đóng',
                },
                onClick: () => onReject(row.id),
              },
            ]
          : [],
      { width: 240, maxInline: 2 },
    ),
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
