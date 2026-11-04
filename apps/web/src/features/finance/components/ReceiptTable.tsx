'use client';

import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  RECEIPT_SOURCE_META,
  RECEIPT_STATUS,
  RECEIPT_STATUS_META,
  RECEIPT_TYPE_META,
  isAutoReceipt,
  type PaginationMeta,
  type ReceiptSource,
  type ReceiptStatus,
  type ReceiptType,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { vehicleLabel } from '@/lib/vehicle-label';
import type { Receipt } from '../types';
import { ReceiptAmount } from './ReceiptAmount';
import styles from './ReceiptTable.module.css';

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

/** Tám cột dữ liệu + thao tác theo design `23813:58308` (bỏ cột Diễn giải, chốt 04/11/2026). */
const MIN_TABLE_WIDTH = 1240;

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
  const t = useTranslations('Finance.receipts.table');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();

  const columns: DataTableColumn<Receipt>[] = [
    {
      title: t('columns.receipt'),
      key: 'receipt',
      // Mã phiếu "PT-20261103-E8Z9FZ2K" phải nằm trên MỘT dòng như design.
      width: 220,
      render: (_, row) => (
        <div>
          <div className={styles.name}>{row.receiptNo ?? tCommon('labels.emptyValue')}</div>
          {/* NGÀY PHÁT SINH, không phải lúc nhập — đây là ngày mọi tổng hợp chạy trên đó. */}
          <div className={styles.meta}>{fmt.date(row.occurredAt)}</div>
        </div>
      ),
    },
    {
      title: t('columns.type'),
      key: 'type',
      width: 110,
      render: (_, row) => (
        <StatusTag value={row.type as ReceiptType} meta={RECEIPT_TYPE_META} group="receiptType" />
      ),
    },
    {
      title: t('columns.source'),
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
    {
      title: t('columns.category'),
      key: 'category',
      width: 150,
      render: (_, row) => row.categoryName ?? tCommon('labels.emptyValue'),
    },
    {
      // Không có cột này thì "đối tượng" của một dòng sổ là ba id 26 ký tự — sổ có số nhưng
      // không trả lời được tiền của ai, xe nào. Diễn giải không còn cột riêng (design): đọc ở hộp
      // chi tiết, và ô tìm kiếm vẫn tìm theo nó.
      title: t('columns.customer'),
      key: 'subject',
      width: 220,
      render: (_, row) => <SubjectCell row={row} />,
    },
    {
      title: t('columns.amount'),
      key: 'amount',
      width: 150,
      render: (_, row) => <ReceiptAmount type={row.type} amount={row.amount} />,
    },
    {
      title: t('columns.method'),
      key: 'method',
      width: 130,
      render: (_, row) => domainLabel('paymentMethod', row.paymentMethod),
    },
    {
      title: tCommon('labels.status'),
      key: 'status',
      width: 130,
      render: (_, row) => (
        <StatusTag
          value={row.status as ReceiptStatus}
          meta={RECEIPT_STATUS_META}
          group="receiptStatus"
        />
      ),
    },
    /*
     * Thao tác theo design: phiếu CHỜ DUYỆT mang "Hủy" + "Duyệt" ngay trên dòng; mọi phiếu khác là
     * "Xem chi tiết". Huỷ một phiếu tay ĐÃ duyệt vẫn làm được — ở chân hộp chi tiết (chốt
     * 04/11/2026), vì đó là thao tác hiếm và nặng hơn, nên đáng một bước mở phiếu ra đọc trước.
     * Cả hai thao tác đụng tiền đều phải xác nhận; quyền do trang truyền xuống.
     */
    actionColumn<Receipt>(
      (row) => {
        const pending =
          row.status === RECEIPT_STATUS.PENDING_APPROVAL || row.status === RECEIPT_STATUS.DRAFT;
        const actionable = canApprove && pending;
        return [
          {
            key: 'cancel',
            label: t('actions.cancelShort'),
            showLabel: true,
            primary: false,
            // Phiếu tự động huỷ ở nghiệp vụ gốc — backend đã chặn (RECEIPT_SOURCE_LOCKED).
            hidden: !actionable || isAutoReceipt(row.source),
            confirm: { title: t('actions.cancelConfirm'), okText: t('actions.cancelOk') },
            onClick: () => onCancel(row.id),
          },
          {
            key: 'approve',
            label: tCommon('actions.approve'),
            showLabel: true,
            primary: true,
            hidden: !actionable,
            confirm: { title: t('actions.approveConfirm'), okText: tCommon('actions.approve') },
            onClick: () => onApprove(row.id),
          },
          {
            key: 'view',
            label: t('actions.view'),
            showLabel: true,
            primary: false,
            hidden: actionable,
            onClick: () => onOpen(row.id),
          },
        ];
      },
      { width: 200, maxInline: 2, title: t('columns.actions'), variant: 'standard' },
    ),
  ];

  return (
    <DataTable<Receipt>
      label={t('label')}
      columns={columns}
      items={items}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={error ? { title: t('error.title'), onRetry: error.onRetry } : null}
      filtered={filtered}
      empty={{ title: t('empty.title'), action: emptyAction }}
      noResults={{
        title: t('noResults.title'),
        action: onClearFilters ? (
          <Button onClick={onClearFilters}>{tCommon('actions.clear')}</Button>
        ) : undefined,
      }}
      onRowClick={(row) => onOpen(row.id)}
      renderCard={(row) => <ReceiptCard row={row} />}
      pagination={{
        meta,
        onChange: onPageChange,
        totalLabel: (total) => t('totalLabel', { count: total }),
      }}
    />
  );
}

/** Khách · xe (biển số) · mã đơn — mỗi thứ một dòng, thiếu thì bỏ hẳn dòng đó. */
function SubjectCell({ row }: { row: Receipt }) {
  const tCommon = useTranslations('Common');
  const vehicle = vehicleLabel(row.vehicleName, row.plateNumber);
  if (!row.customerName && !vehicle && !row.bookingCode) {
    return <span>{tCommon('labels.emptyValue')}</span>;
  }

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
  const t = useTranslations('Finance.receipts.table');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
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
        {fmt.date(row.occurredAt)} · {row.categoryName ?? t('uncategorized')}
      </div>
      {row.customerName || vehicle ? (
        <div className={styles.cardLine}>
          {[row.customerName, vehicle].filter(Boolean).join(LIST_SEPARATOR)}
        </div>
      ) : null}
      {row.description ? <div className={styles.cardMuted}>{row.description}</div> : null}
      <div className={styles.cardMuted}>
        {row.receiptNo ?? tCommon('labels.emptyValue')} ·{' '}
        {domainLabel('paymentMethod', row.paymentMethod)}
      </div>
    </article>
  );
}
