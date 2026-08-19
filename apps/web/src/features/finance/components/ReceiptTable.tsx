'use client';

import { CheckOutlined, StopOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import type { ReactNode } from 'react';
import {
  PAYMENT_METHOD_META,
  RECEIPT_SOURCE_META,
  RECEIPT_STATUS,
  RECEIPT_STATUS_META,
  RECEIPT_TYPE_META,
  isAutoReceipt,
  type PaginationMeta,
  type PaymentMethod,
  type ReceiptSource,
  type ReceiptStatus,
  type ReceiptType,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { vehicleLabel } from '@/lib/vehicle-label';
import type { Receipt } from '../types';
import { ReceiptAmount } from './ReceiptAmount';
import styles from './ReceiptTable.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

interface ReceiptTableProps {
  items: Receipt[];
  meta: PaginationMeta;
  loading: boolean;
  canApprove: boolean;
  error?: { onRetry: () => void } | null;
  filtered?: boolean;
  onClearFilters?: () => void;
  /** Nút tạo phiếu đầu tiên — trang quyết theo quyền `RECEIPT_CREATE`. */
  emptyAction?: ReactNode;
  onOpen: (id: string) => void;
  onApprove: (id: string) => void;
  onCancel: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

/** Suy từ tổng bề rộng cột (P25) — 9 cột, một cột tiền và ba cột nhãn. */
const MIN_TABLE_WIDTH = 1320;

export function ReceiptTable({
  items,
  meta,
  loading,
  canApprove,
  error = null,
  filtered = false,
  onClearFilters,
  emptyAction,
  onOpen,
  onApprove,
  onCancel,
  onPageChange,
}: ReceiptTableProps) {
  const fmt = useAppFormat();

  const columns: DataTableColumn<Receipt>[] = [
    {
      title: 'Phiếu',
      key: 'receipt',
      width: 160,
      render: (_, row) => (
        <div>
          <div className={styles.name}>{row.receiptNo ?? '—'}</div>
          {/* NGÀY PHÁT SINH, không phải lúc nhập — đây là ngày mọi tổng hợp chạy trên đó. */}
          <div className={styles.meta}>{fmt.date(row.occurredAt)}</div>
        </div>
      ),
    },
    {
      title: 'Loại',
      key: 'type',
      width: 110,
      render: (_, row) => <StatusTag value={row.type as ReceiptType} meta={RECEIPT_TYPE_META} group="receiptType" />,
    },
    {
      title: 'Nguồn',
      key: 'source',
      width: 130,
      render: (_, row) => (
        <StatusTag
          value={row.source as ReceiptSource}
          meta={RECEIPT_SOURCE_META}
          group="receiptSource"
        />
      ),
    },
    { title: 'Danh mục', key: 'category', width: 150, render: (_, row) => row.categoryName ?? '—' },
    {
      // Không có cột này thì "đối tượng" của một dòng sổ là ba id 26 ký tự — sổ có số nhưng
      // không trả lời được tiền của ai, xe nào.
      title: 'Đối tượng',
      key: 'subject',
      width: 220,
      render: (_, row) => <SubjectCell row={row} />,
    },
    {
      title: 'Diễn giải',
      key: 'description',
      width: 220,
      render: (_, row) => <span className={styles.desc}>{row.description ?? '—'}</span>,
    },
    {
      title: 'Số tiền',
      key: 'amount',
      align: 'right',
      width: 150,
      render: (_, row) => <ReceiptAmount type={row.type} amount={row.amount} />,
    },
    {
      title: 'Hình thức',
      key: 'method',
      width: 130,
      render: (_, row) =>
        PAYMENT_METHOD_META[row.paymentMethod as PaymentMethod]?.label ?? row.paymentMethod,
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 130,
      render: (_, row) => (
        <StatusTag value={row.status as ReceiptStatus} meta={RECEIPT_STATUS_META} group="receiptStatus" />
      ),
    },
    // Toàn bộ cột hành động biến mất khi thiếu `finance.receipt.approve` — quyền do trang truyền
    // xuống, `RowActions` chỉ ẩn/hiện. Cả hai hành động đều đụng tiền nên đều phải xác nhận.
    actionColumn<Receipt>(
      (row) => [
        {
          key: 'approve',
          label: 'Duyệt',
          icon: <CheckOutlined />,
          hidden:
            !canApprove ||
            !(
              row.status === RECEIPT_STATUS.PENDING_APPROVAL || row.status === RECEIPT_STATUS.DRAFT
            ),
          confirm: { title: 'Duyệt phiếu này?', okText: 'Duyệt' },
          onClick: () => onApprove(row.id),
        },
        {
          key: 'cancel',
          label: 'Huỷ',
          icon: <StopOutlined />,
          danger: true,
          // Phiếu tự động huỷ ở nghiệp vụ gốc — backend đã chặn (RECEIPT_SOURCE_LOCKED); ẩn nút
          // ở đây để người dùng không bấm vào một hành động chắc chắn thất bại.
          hidden: !canApprove || row.status === RECEIPT_STATUS.CANCELLED || isAutoReceipt(row.source),
          confirm: { title: 'Huỷ phiếu này?', okText: 'Huỷ phiếu' },
          onClick: () => onCancel(row.id),
        },
      ],
      { width: 220, maxInline: 2 },
    ),
  ];

  return (
    <DataTable<Receipt>
      label="Danh sách phiếu thu chi"
      columns={columns}
      items={items}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={error ? { title: 'Không tải được danh sách phiếu', onRetry: error.onRetry } : null}
      filtered={filtered}
      empty={{ title: 'Chưa có phiếu thu/chi nào', action: emptyAction }}
      noResults={{
        title: 'Không có phiếu khớp bộ lọc',
        action: onClearFilters ? <Button onClick={onClearFilters}>Xoá bộ lọc</Button> : undefined,
      }}
      onRowClick={(row) => onOpen(row.id)}
      renderCard={(row) => <ReceiptCard row={row} />}
      pagination={{ meta, onChange: onPageChange, totalLabel: (total) => `${total} phiếu` }}
    />
  );
}

/** Khách · xe (biển số) · mã đơn — mỗi thứ một dòng, thiếu thì bỏ hẳn dòng đó. */
function SubjectCell({ row }: { row: Receipt }) {
  const vehicle = vehicleLabel(row.vehicleName, row.plateNumber);
  if (!row.customerName && !vehicle && !row.bookingCode) return <span>—</span>;

  return (
    <div>
      {row.customerName ? <div className={styles.name}>{row.customerName}</div> : null}
      {vehicle ? <div className={styles.meta}>{vehicle}</div> : null}
      {row.bookingCode ? <div className={styles.meta}>{row.bookingCode}</div> : null}
    </div>
  );
}

/**
 * Thẻ mobile riêng thay cho thẻ tự suy của `DataTable`.
 *
 * Thẻ tự suy trải 9 cột thành 9 dòng `label: value` — trên điện thoại đó là một khối chữ phải
 * đọc từ đầu mới thấy số tiền. Ở đây số tiền là thứ to nhất, phần còn lại là ngữ cảnh.
 */
function ReceiptCard({ row }: { row: Receipt }) {
  const fmt = useAppFormat();
  const vehicle = vehicleLabel(row.vehicleName, row.plateNumber);

  return (
    <article className={styles.card}>
      <div className={styles.cardTop}>
        <ReceiptAmount type={row.type} amount={row.amount} size="card" />
        <StatusTag
          value={row.status as ReceiptStatus}
          meta={RECEIPT_STATUS_META}
          group="receiptStatus"
        />
      </div>

      <div className={styles.cardTags}>
        <StatusTag value={row.type as ReceiptType} meta={RECEIPT_TYPE_META} group="receiptType" />
        <StatusTag
          value={row.source as ReceiptSource}
          meta={RECEIPT_SOURCE_META}
          group="receiptSource"
        />
      </div>

      <div className={styles.cardLine}>
        {fmt.date(row.occurredAt)} · {row.categoryName ?? 'Chưa phân loại'}
      </div>
      {row.customerName || vehicle ? (
        <div className={styles.cardLine}>{[row.customerName, vehicle].filter(Boolean).join(' · ')}</div>
      ) : null}
      {row.description ? <div className={styles.cardMuted}>{row.description}</div> : null}
      <div className={styles.cardMuted}>
        {row.receiptNo ?? '—'} ·{' '}
        {PAYMENT_METHOD_META[row.paymentMethod as PaymentMethod]?.label ?? row.paymentMethod}
      </div>
    </article>
  );
}
