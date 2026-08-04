'use client';

import { Button, Table, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
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
import { StatusTag } from '@/components/data-display/StatusTag';
import { formatDate } from '@/lib/datetime';
import { formatMoneyVnd } from '@/lib/money';
import type { AdminVehicle } from '../types';
import styles from './AdminVehicleTable.module.css';

interface AdminVehicleTableProps {
  items: AdminVehicle[];
  meta: PaginationMeta;
  loading: boolean;
  onView: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

export function AdminVehicleTable({
  items,
  meta,
  loading,
  onView,
  onPageChange,
}: AdminVehicleTableProps) {
  const columns: ColumnsType<AdminVehicle> = [
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
      render: (_, r) => (
        <div>
          <div className={styles.tenantName}>
            {r.tenantName}
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
      render: (_, r) => (
        <StatusTag value={r.publicStatus as VehiclePublicStatus} meta={VEHICLE_PUBLIC_STATUS_META} />
      ),
    },
    {
      title: 'Trên sàn',
      key: 'listingStatus',
      render: (_, r) =>
        r.listingStatus ? (
          <StatusTag value={r.listingStatus as ListingStatus} meta={LISTING_STATUS_META} />
        ) : (
          <Tooltip title="Xe chưa từng được duyệt lên Marketplace">
            <span className={styles.meta}>Chưa lên sàn</span>
          </Tooltip>
        ),
    },
    {
      title: 'Vận hành',
      key: 'operationStatus',
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
      render: (_, r) => formatMoneyVnd(r.weekdayPrice),
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
    <Table<AdminVehicle>
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
        showTotal: (total) => `${total} xe`,
        onChange: onPageChange,
      }}
    />
  );
}
