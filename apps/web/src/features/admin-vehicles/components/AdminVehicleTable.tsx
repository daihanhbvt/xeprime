'use client';

import { Button, Tooltip } from 'antd';
import {
  LISTING_STATUS_META,
  TENANT_STATUS,
  TENANT_STATUS_META,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS_META,
  VEHICLE_TYPE_LABEL,
  type ListingStatus,
  type PaginationMeta,
  type TenantStatus,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
  type VehicleType,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { formatDate } from '@/lib/datetime';
import { formatMoneyVnd } from '@/lib/money';
import type { AdminVehicle } from '../types';
import styles from './AdminVehicleTable.module.css';

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
  const columns: DataTableColumn<AdminVehicle>[] = [
    {
      title: 'Xe',
      key: 'name',
      render: (_, r) => (
        <div>
          <div className={styles.name}>{r.name}</div>
          <div className={styles.meta}>
            {r.code}
            {r.plateNumber ? ` · ${r.plateNumber}` : ''}
            {` · ${VEHICLE_TYPE_LABEL[r.vehicleType as VehicleType] ?? r.vehicleType}`}
          </div>
        </div>
      ),
    },
    {
      title: 'Gian hàng',
      key: 'tenant',
      width: 190,
      render: (_, r) => (
        <div>
          <div className={styles.tenantName}>
            {r.tenantName}
            {/* Chỉ gắn nhãn khi shop BỊ KHOÁ — nhãn "đang hoạt động" ở mọi hàng là nhiễu. */}
            {r.tenantStatus === TENANT_STATUS.SUSPENDED ? (
              <StatusTag value={r.tenantStatus as TenantStatus} meta={TENANT_STATUS_META} />
            ) : null}
          </div>
          {r.provinceName ? <div className={styles.meta}>{r.provinceName}</div> : null}
        </div>
      ),
    },
    {
      title: 'Duyệt public',
      key: 'publicStatus',
      width: 140,
      render: (_, r) => (
        <StatusTag
          value={r.publicStatus as VehiclePublicStatus}
          meta={VEHICLE_PUBLIC_STATUS_META}
        />
      ),
    },
    {
      title: 'Trên sàn',
      key: 'listingStatus',
      width: 130,
      render: (_, r) =>
        r.listingStatus ? (
          <StatusTag value={r.listingStatus as ListingStatus} meta={LISTING_STATUS_META} />
        ) : (
          // Chưa từng lên sàn KHÔNG phải một trạng thái nghiệp vụ — không dựng StatusTag giả cho nó.
          <Tooltip title="Xe chưa từng được duyệt lên Marketplace">
            <span className={styles.meta}>Chưa lên sàn</span>
          </Tooltip>
        ),
    },
    {
      title: 'Vận hành',
      key: 'operationStatus',
      width: 120,
      render: (_, r) => (
        <StatusTag
          value={r.operationStatus as VehicleOperationStatus}
          meta={VEHICLE_OPERATION_STATUS_META}
        />
      ),
    },
    {
      title: 'Giá ngày thường',
      key: 'weekdayPrice',
      align: 'right',
      width: 140,
      render: (_, r) => formatMoneyVnd(r.weekdayPrice),
    },
    { title: 'Ngày tạo', key: 'createdAt', width: 120, render: (_, r) => formatDate(r.createdAt) },
    actionColumn<AdminVehicle>(
      (row) => [{ key: 'view', label: 'Xem', showLabel: true, onClick: () => onView(row.id) }],
      { width: 120 },
    ),
  ];

  return (
    <DataTable<AdminVehicle>
      label="Xe toàn hệ thống"
      columns={columns}
      items={items}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={error ? { title: 'Không tải được danh sách xe', onRetry: error.onRetry } : null}
      filtered={filtered}
      empty={{ title: 'Chưa có xe nào trong hệ thống' }}
      noResults={{
        title: 'Không có xe khớp bộ lọc',
        action: onClearFilters ? <Button onClick={onClearFilters}>Xoá bộ lọc</Button> : undefined,
      }}
      pagination={{ meta, onChange: onPageChange, totalLabel: (total) => `${total} xe` }}
    />
  );
}
