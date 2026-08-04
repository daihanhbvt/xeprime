'use client';

import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { App, Button, Descriptions, Drawer, Input, Modal, Popconfirm, Result, Spin } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import {
  FUEL_TYPE_LABEL,
  LISTING_STATUS_META,
  PERMISSION,
  SERVICE_TYPE_LABEL,
  TENANT_STATUS_META,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  VEHICLE_TYPE_LABEL,
  type FuelType,
  type ListingStatus,
  type ServiceType,
  type TenantStatus,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
  type VehicleType,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { listingPath, shopPath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { formatDate } from '@/lib/datetime';
import { formatMoneyVnd } from '@/lib/money';
import { getErrorMessage } from '@/services/api-client';
import { useAdminVehicle, useVehicleModeration } from '../hooks/use-admin-vehicles';
import type { AdminVehicleDetail } from '../types';
import styles from './AdminVehicleDetailDrawer.module.css';

export function AdminVehicleDetailDrawer({
  vehicleId,
  onClose,
}: {
  vehicleId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError, refetch } = useAdminVehicle(vehicleId);

  return (
    <Drawer
      title={data ? data.name : 'Xe'}
      width={560}
      open={Boolean(vehicleId)}
      onClose={onClose}
      extra={
        data ? (
          <StatusTag
            value={data.publicStatus as VehiclePublicStatus}
            meta={VEHICLE_PUBLIC_STATUS_META}
          />
        ) : null
      }
    >
      {isError ? (
        <Result
          status="error"
          title="Không tải được thông tin xe"
          extra={
            <Button type="primary" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : isLoading || !data ? (
        <div className={styles.center}>
          <Spin />
        </div>
      ) : (
        <Body vehicle={data} />
      )}
    </Drawer>
  );
}

function Body({ vehicle }: { vehicle: AdminVehicleDetail }) {
  const { message } = App.useApp();
  const { has } = usePermissions();
  const moderation = useVehicleModeration(vehicle.id);
  const [hideOpen, setHideOpen] = useState(false);
  const [reason, setReason] = useState('');

  const canModerate = has(PERMISSION.PLATFORM_VEHICLE_MODERATE);
  const isPublic = vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;
  const isHidden = vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.HIDDEN;
  const trimmedReason = reason.trim();

  function submitHide() {
    if (!trimmedReason) return;
    moderation.mutate(
      { kind: 'hide', reason: trimmedReason },
      {
        onSuccess: () => {
          message.success('Đã ẩn xe khỏi Marketplace');
          setHideOpen(false);
          setReason('');
        },
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  }

  function submitUnhide() {
    moderation.mutate(
      { kind: 'unhide' },
      {
        onSuccess: () => message.success('Đã hiển thị lại xe trên Marketplace'),
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  }

  return (
    <div>
      <Descriptions column={1} size="small" bordered items={detailItems(vehicle)} />

      <div className={styles.actions}>
        {!canModerate ? (
          <div className={styles.hint}>Bạn không có quyền kiểm duyệt xe.</div>
        ) : isPublic ? (
          <Button
            danger
            block
            icon={<EyeInvisibleOutlined />}
            loading={moderation.isPending}
            onClick={() => setHideOpen(true)}
          >
            Ẩn xe khỏi Marketplace
          </Button>
        ) : isHidden ? (
          <Popconfirm
            title="Hiển thị lại xe này trên Marketplace?"
            okText="Bỏ ẩn"
            cancelText="Đóng"
            onConfirm={submitUnhide}
          >
            <Button type="primary" block icon={<EyeOutlined />} loading={moderation.isPending}>
              Bỏ ẩn xe
            </Button>
          </Popconfirm>
        ) : (
          <div className={styles.hint}>
            Chỉ ẩn được xe đang hiển thị công khai, và chỉ bỏ ẩn được xe do nền tảng ẩn.
          </div>
        )}
      </div>

      <Modal
        title="Ẩn xe khỏi Marketplace"
        open={hideOpen}
        okText="Ẩn xe"
        cancelText="Huỷ"
        okButtonProps={{ danger: true, disabled: !trimmedReason }}
        confirmLoading={moderation.isPending}
        onOk={submitHide}
        onCancel={() => setHideOpen(false)}
      >
        <p className={styles.note}>
          Xe biến mất khỏi Marketplace ngay lập tức. Chủ shop có thể sửa rồi gửi duyệt lại. Lý do
          được lưu vào nhật ký hệ thống nên bắt buộc nhập.
        </p>
        <Input.TextArea
          rows={3}
          maxLength={500}
          showCount
          value={reason}
          placeholder="Lý do ẩn xe…"
          onChange={(e) => setReason(e.target.value)}
        />
      </Modal>
    </div>
  );
}

function detailItems(v: AdminVehicleDetail) {
  const specs = [
    v.brand,
    v.model,
    v.manufactureYear ? String(v.manufactureYear) : null,
    v.seatCount ? `${v.seatCount} chỗ` : null,
    v.fuelType ? (FUEL_TYPE_LABEL[v.fuelType as FuelType] ?? v.fuelType) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return [
    { key: 'code', label: 'Mã xe', children: v.code },
    { key: 'plate', label: 'Biển số', children: v.plateNumber ?? '—' },
    {
      key: 'type',
      label: 'Loại · dịch vụ',
      children: `${VEHICLE_TYPE_LABEL[v.vehicleType as VehicleType] ?? v.vehicleType} · ${
        SERVICE_TYPE_LABEL[v.serviceType as ServiceType] ?? v.serviceType
      }`,
    },
    ...(specs ? [{ key: 'specs', label: 'Thông số', children: specs }] : []),
    {
      key: 'tenant',
      label: 'Gian hàng',
      children: (
        <span className={styles.inline}>
          <Link href={shopPath.detail(v.tenantSlug)} target="_blank">
            {v.tenantName}
          </Link>
          <StatusTag value={v.tenantStatus as TenantStatus} meta={TENANT_STATUS_META} />
        </span>
      ),
    },
    { key: 'owner', label: 'Chủ shop', children: v.ownerName ?? '—' },
    { key: 'province', label: 'Tỉnh/TP', children: v.provinceName ?? '—' },
    {
      key: 'operation',
      label: 'Vận hành',
      children: (
        <StatusTag
          value={v.operationStatus as VehicleOperationStatus}
          meta={VEHICLE_OPERATION_STATUS_META}
        />
      ),
    },
    {
      key: 'listing',
      label: 'Trên sàn',
      children: v.listingStatus ? (
        <span className={styles.inline}>
          <StatusTag value={v.listingStatus as ListingStatus} meta={LISTING_STATUS_META} />
          <Link href={listingPath.detail(v.id)} target="_blank">
            Xem trang xe
          </Link>
        </span>
      ) : (
        'Chưa lên sàn'
      ),
    },
    {
      key: 'prices',
      label: 'Giá thường · cuối tuần · giờ',
      children: `${formatMoneyVnd(v.weekdayPrice)} · ${formatMoneyVnd(v.weekendPrice)} · ${formatMoneyVnd(v.hourlyPrice)}`,
    },
    { key: 'bookings', label: 'Số đơn thuê', children: String(v.bookingCount) },
    { key: 'reviews', label: 'Số đánh giá', children: String(v.reviewCount) },
    { key: 'created', label: 'Ngày tạo', children: formatDate(v.createdAt) },
    { key: 'updated', label: 'Cập nhật', children: formatDate(v.updatedAt) },
  ];
}
