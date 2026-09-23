'use client';

import { EyeOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import { useTranslations } from 'next-intl';
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
import { StatusTag } from '@/components/data-display/StatusTag';
import { useDomainLabel } from '@/i18n/use-domain-label';
import type { AdminVehicle } from '../types';
import styles from './AdminVehicleTable.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

interface AdminVehicleTableProps {
  items: AdminVehicle[];
  meta: PaginationMeta;
  loading: boolean;
  error?: { onRetry: () => void } | null;
  filtered?: boolean;
  onClearFilters?: () => void;
  onView: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

/**
 * Suy từ tổng bề rộng cột (P25 — Figma `127:1725` không đặc tả cột cho bảng này).
 * 8 cột với ba cột trạng thái → cần cuộn ngang dưới ~1120px, đúng ngưỡng `127:2097` cho bảng 8 cột.
 */
const MIN_TABLE_WIDTH = 1120;

export function AdminVehicleTable({
  items,
  meta,
  loading,
  error = null,
  filtered = false,
  onClearFilters,
  onView,
  onPageChange,
}: AdminVehicleTableProps) {
  const t = useTranslations('AdminVehicles.table');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();

  const columns: DataTableColumn<AdminVehicle>[] = [
    {
      title: t('vehicle'),
      key: 'name',
      width: 240,
      render: (_, r) => (
        <div>
          <div className={styles.name}>{r.name}</div>
          <div className={styles.meta}>
            {r.code}
            {r.plateNumber ? ` · ${r.plateNumber}` : ''}
            {` · ${domainLabel('vehicleType', r.vehicleType)}`}
          </div>
        </div>
      ),
    },
    {
      title: t('tenant'),
      key: 'tenant',
      width: 190,
      render: (_, r) => (
        <div>
          <div className={styles.tenantName}>
            {r.tenantName}
            {/* Chỉ gắn nhãn khi shop BỊ KHOÁ — nhãn "đang hoạt động" ở mọi hàng là nhiễu. */}
            {r.tenantStatus === TENANT_STATUS.SUSPENDED ? (
              <StatusTag
                value={r.tenantStatus as TenantStatus}
                meta={TENANT_STATUS_META}
                group="tenantStatus"
              />
            ) : null}
          </div>
          {r.provinceName ? <div className={styles.meta}>{r.provinceName}</div> : null}
        </div>
      ),
    },
    {
      title: t('publicStatus'),
      key: 'publicStatus',
      width: 140,
      render: (_, r) => (
        <StatusTag
          value={r.publicStatus as VehiclePublicStatus}
          meta={VEHICLE_PUBLIC_STATUS_META}
          group="vehiclePublicStatus"
        />
      ),
    },
    {
      /*
       * Cột này đọc KẾT QUẢ hiển thị hiệu lực, không đọc `public_listings.status` như trước
       * (ADR 0048). Hai thứ trùng nhau ở hầu hết hàng, nhưng khác nhau đúng ở ca đáng chú ý
       * nhất — xe đã duyệt mà chủ xe tắt công tắc — và lý do nói thẳng ra ở đây thì người kiểm
       * duyệt không phải mở từng chiếc để đoán.
       *
       * `listingStatus = null` là "chưa từng lên sàn": không phải một trạng thái nghiệp vụ, nên
       * không dựng StatusTag giả cho nó.
       */
      title: t('marketplace'),
      key: 'marketplace',
      width: 160,
      render: (_, r) =>
        r.listingStatus ? (
          <StatusTag
            value={r.marketplaceVisibilityReason as MarketplaceVisibilityReason}
            meta={MARKETPLACE_VISIBILITY_REASON_META}
            group="marketplaceVisibility"
          />
        ) : (
          <Tooltip title={t('notListedHint')}>
            <span className={styles.meta}>{t('notListed')}</span>
          </Tooltip>
        ),
    },
    {
      title: t('operationStatus'),
      key: 'operationStatus',
      width: 120,
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
      width: 140,
      render: (_, r) => fmt.money(r.weekdayPrice),
    },
    {
      title: t('createdAt'),
      key: 'createdAt',
      width: 120,
      render: (_, r) => fmt.date(r.createdAt),
    },
    actionColumn<AdminVehicle>((row) => [
      { key: 'view', label: t('view'), icon: <EyeOutlined />, onClick: () => onView(row.id) },
    ]),
  ];

  return (
    <DataTable<AdminVehicle>
      label={t('label')}
      columns={columns}
      items={items}
      onRowClick={(row) => onView(row.id)}
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
    />
  );
}
