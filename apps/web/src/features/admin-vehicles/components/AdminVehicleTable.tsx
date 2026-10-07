'use client';

import { EyeOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { useTranslations } from 'next-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import {
  MARKETPLACE_VISIBILITY_REASON_META,
  TENANT_STATUS,
  TENANT_STATUS_META,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS_META,
  type MarketplaceVisibilityReason,
  type PaginationMeta,
  type TenantStatus,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { StatusTag } from '@/components/data-display/StatusTag';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import type { AdminVehicle } from '../types';
import styles from './AdminVehicleTable.module.css';

/** Cột ngày đi theo cách sắp xếp: sắp theo "mới cập nhật" thì cột ngày phải là ngày cập nhật. */
export type AdminVehicleDateColumn = 'createdAt' | 'updatedAt';

interface AdminVehicleTableProps {
  items: AdminVehicle[];
  meta: PaginationMeta;
  loading: boolean;
  error?: { onRetry: () => void } | null;
  filtered?: boolean;
  onClearFilters?: () => void;
  onView: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
  /** Xe đang mở ở panel chi tiết — hàng đó được tô để không mất dấu khi panel che bớt bảng. */
  selectedId?: string | null;
  dateColumn?: AdminVehicleDateColumn;
}

/**
 * 8 cột, cột "Xe" có ảnh nhỏ — dưới ngưỡng này bảng cuộn ngang thay vì bóp chữ (Figma `127:2097`).
 * Dịch vụ KHÔNG có cột riêng: nó là bộ lọc và nằm trong panel chi tiết; trên bảng thì ba cột
 * trạng thái + giá + ngày đã là thứ người giám sát quét.
 */
const MIN_TABLE_WIDTH = 1160;

/**
 * Ô "Trên chợ" — đọc KẾT QUẢ hiển thị hiệu lực, không đọc `public_listings.status` (ADR 0048).
 * Hai thứ trùng nhau ở hầu hết hàng, nhưng khác nhau đúng ở ca đáng chú ý nhất — xe đã duyệt mà
 * chủ xe tắt công tắc — và lý do nói thẳng ra ở đây thì người kiểm duyệt không phải mở từng chiếc.
 *
 * `listingStatus = null` là "chưa từng lên sàn": không phải một trạng thái nghiệp vụ, nên không
 * dựng StatusTag giả cho nó.
 */
function MarketplaceCell({ row }: { row: AdminVehicle }) {
  const t = useTranslations('AdminVehicles.table');
  return row.listingStatus ? (
    <StatusTag
      value={row.marketplaceVisibilityReason as MarketplaceVisibilityReason}
      meta={MARKETPLACE_VISIBILITY_REASON_META}
      group="marketplaceVisibility"
    />
  ) : (
    <Tooltip title={t('notListedHint')}>
      <span className={styles.meta}>{t('notListed')}</span>
    </Tooltip>
  );
}

export function AdminVehicleTable({
  items,
  meta,
  loading,
  error = null,
  filtered = false,
  onClearFilters,
  onView,
  onPageChange,
  selectedId = null,
  dateColumn = 'createdAt',
}: AdminVehicleTableProps) {
  const t = useTranslations('AdminVehicles.table');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();

  const identity = (row: AdminVehicle) => (
    <EntityIdentity
      kind="vehicle"
      size="sm"
      name={row.name}
      imageUrl={row.mainImageUrl}
      subtitle={[row.code, row.plateNumber, domainLabel('vehicleType', row.vehicleType)]
        .filter(Boolean)
        .join(LIST_SEPARATOR)}
    />
  );

  const columns: DataTableColumn<AdminVehicle>[] = [
    { title: t('vehicle'), key: 'name', width: 250, render: (_, r) => identity(r) },
    {
      title: t('tenant'),
      key: 'tenant',
      width: 190,
      render: (_, r) => (
        <div className={styles.stack}>
          <span className={styles.tenantName}>
            <span className={styles.clamp}>{r.tenantName}</span>
            {/* Chỉ gắn nhãn khi shop BỊ KHOÁ — nhãn "đang hoạt động" ở mọi hàng là nhiễu. */}
            {r.tenantStatus === TENANT_STATUS.SUSPENDED ? (
              <StatusTag
                value={r.tenantStatus as TenantStatus}
                meta={TENANT_STATUS_META}
                group="tenantStatus"
              />
            ) : null}
          </span>
          {r.provinceName ? <span className={styles.meta}>{r.provinceName}</span> : null}
        </div>
      ),
    },
    {
      title: t('publicStatus'),
      key: 'publicStatus',
      width: 135,
      render: (_, r) => (
        <StatusTag
          value={r.publicStatus as VehiclePublicStatus}
          meta={VEHICLE_PUBLIC_STATUS_META}
          group="vehiclePublicStatus"
        />
      ),
    },
    {
      title: t('marketplace'),
      key: 'marketplace',
      width: 155,
      render: (_, r) => <MarketplaceCell row={r} />,
    },
    {
      title: t('operationStatus'),
      key: 'operationStatus',
      width: 115,
      render: (_, r) => (
        <StatusTag
          value={r.operationStatus as VehicleOperationStatus}
          meta={VEHICLE_OPERATION_STATUS_META}
          group="vehicleOperationStatus"
        />
      ),
    },
    {
      title: t('weekdayPrice'),
      key: 'weekdayPrice',
      align: 'right',
      width: 120,
      render: (_, r) => <span className={styles.money}>{fmt.money(r.weekdayPrice)}</span>,
    },
    {
      title: t(dateColumn),
      key: dateColumn,
      width: 110,
      render: (_, r) => fmt.date(r[dateColumn]),
    },
    actionColumn<AdminVehicle>(
      (row) => [
        { key: 'view', label: t('view'), icon: <EyeOutlined />, onClick: () => onView(row.id) },
      ],
      { width: 130 },
    ),
  ];

  return (
    <DataTable<AdminVehicle>
      label={t('label')}
      columns={columns}
      items={items}
      onRowClick={(row) => onView(row.id)}
      selectedRowKey={selectedId}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={error ? { title: t('loadError'), onRetry: error.onRetry } : null}
      filtered={filtered}
      empty={{ title: t('empty') }}
      noResults={{
        title: t('noResults'),
        action: onClearFilters ? <Button onClick={onClearFilters}>{t('clearFilters')}</Button> : undefined,
      }}
      pagination={{ meta, onChange: onPageChange, totalLabel: (total) => t('total', { count: total }) }}
      // Thẻ mobile (UX §2.4): một neo + chip trạng thái, tối đa bốn dòng, số tiền canh phải.
      renderCard={(row) => (
        <article className={styles.card}>
          <div className={styles.cardHead}>
            {identity(row)}
            <MarketplaceCell row={row} />
          </div>
          <div className={styles.cardLine}>
            <span className={styles.clamp}>{row.tenantName}</span>
            {row.provinceName ? (
              <span className={styles.meta}>
                {LIST_SEPARATOR}
                {row.provinceName}
              </span>
            ) : null}
          </div>
          <div className={styles.cardFoot}>
            <StatusTag
              value={row.operationStatus as VehicleOperationStatus}
              meta={VEHICLE_OPERATION_STATUS_META}
              group="vehicleOperationStatus"
            />
            <span className={styles.money}>{fmt.money(row.weekdayPrice)}</span>
          </div>
        </article>
      )}
    />
  );
}
