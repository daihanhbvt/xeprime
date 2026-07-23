'use client';

import { Descriptions, Typography } from 'antd';
import type { DescriptionsProps } from 'antd';
import {
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS_META,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { formatDateTime } from '@/lib/datetime';
import { formatMoneyVnd } from '@/lib/money';
import { fuelTypeLabel, serviceTypeLabel, vehicleTypeLabel } from '../constants';
import type { VehicleDetail } from '../types';
import styles from './VehicleDetailView.module.css';

const EMPTY = '—';

export function VehicleDetailView({ vehicle }: { vehicle: VehicleDetail }) {
  const items: DescriptionsProps['items'] = [
    { key: 'code', label: 'Mã xe', children: vehicle.code },
    { key: 'name', label: 'Tên xe', children: vehicle.name },
    { key: 'type', label: 'Loại xe', children: vehicleTypeLabel(vehicle.vehicleType) },
    { key: 'service', label: 'Dịch vụ', children: serviceTypeLabel(vehicle.serviceType) },
    { key: 'plate', label: 'Biển số', children: vehicle.plateNumber || EMPTY },
    { key: 'brand', label: 'Hãng', children: vehicle.brand || EMPTY },
    { key: 'model', label: 'Dòng xe', children: vehicle.model || EMPTY },
    { key: 'year', label: 'Đời xe', children: vehicle.manufactureYear ?? EMPTY },
    { key: 'seats', label: 'Số chỗ', children: vehicle.seatCount ?? EMPTY },
    { key: 'color', label: 'Màu sắc', children: vehicle.color || EMPTY },
    { key: 'fuel', label: 'Nhiên liệu', children: fuelTypeLabel(vehicle.fuelType) },
    {
      key: 'weekdayPrice',
      label: 'Giá ngày thường',
      children: formatMoneyVnd(vehicle.weekdayPrice),
    },
    { key: 'weekendPrice', label: 'Giá cuối tuần', children: formatMoneyVnd(vehicle.weekendPrice) },
    {
      key: 'operation',
      label: 'Trạng thái vận hành',
      children: (
        <StatusTag
          value={vehicle.operationStatus as VehicleOperationStatus}
          meta={VEHICLE_OPERATION_STATUS_META}
        />
      ),
    },
    {
      key: 'public',
      label: 'Trạng thái public',
      children: (
        <StatusTag
          value={vehicle.publicStatus as VehiclePublicStatus}
          meta={VEHICLE_PUBLIC_STATUS_META}
        />
      ),
    },
    { key: 'created', label: 'Tạo lúc', children: formatDateTime(vehicle.createdAt) },
    { key: 'updated', label: 'Cập nhật', children: formatDateTime(vehicle.updatedAt) },
  ];

  return (
    <div>
      {vehicle.mainImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh ngoài từ URL người dùng nhập
        <img src={vehicle.mainImageUrl} alt={vehicle.name} className={styles.image} />
      ) : null}

      <Descriptions bordered size="middle" column={{ xs: 1, sm: 2 }} items={items} />

      {vehicle.description ? (
        <div className={styles.desc}>
          <div className={styles.descTitle}>Mô tả</div>
          <Typography.Paragraph>{vehicle.description}</Typography.Paragraph>
        </div>
      ) : null}
    </div>
  );
}
