'use client';

import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { App, Button, Descriptions, Input, Popconfirm } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import {
  LISTING_STATUS_META, PERMISSION, TENANT_STATUS_META, VEHICLE_OPERATION_STATUS_META, VEHICLE_PUBLIC_STATUS, VEHICLE_PUBLIC_STATUS_META, VEHICLE_TYPE_LABEL, serviceTypesLabel, type ListingStatus, type TenantStatus, type VehicleOperationStatus, type VehiclePublicStatus, type VehicleType, } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { useCatalogLabels, type CatalogLabels } from '@/features/catalog/use-catalog';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { listingPath, shopPath } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { getErrorMessage } from '@/services/api-client';
import { useAdminVehicle, useVehicleModeration } from '../hooks/use-admin-vehicles';
import type { AdminVehicleDetail } from '../types';
import styles from './AdminVehicleDetailDrawer.module.css';
import { useAppFormat, type AppFormat } from '@/i18n/use-app-format';
import { LIST_SEPARATOR } from '@xeprime/domain';

export function AdminVehicleDetailDrawer({
  vehicleId,
  onClose,
}: {
  vehicleId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError, refetch } = useAdminVehicle(vehicleId);

  return (
    <DetailDrawer
      title={data ? data.name : 'Xe'}
      size="md"
      open={Boolean(vehicleId)}
      onClose={onClose}
      loading={!isError && (isLoading || !data)}
      error={isError}
      errorTitle="Không tải được thông tin xe"
      onRetry={() => void refetch()}
      extra={
        data ? (
          <StatusTag
            value={data.publicStatus as VehiclePublicStatus}
            meta={VEHICLE_PUBLIC_STATUS_META} group="vehiclePublicStatus"
          />
        ) : null
      }
    >
      {data ? <Body vehicle={data} /> : null}
    </DetailDrawer>
  );
}

function Body({ vehicle }: { vehicle: AdminVehicleDetail }) {
  const fmt = useAppFormat();
  const { message } = App.useApp();
  const { has } = usePermissions();
  const moderation = useVehicleModeration(vehicle.id);
  const labels = useCatalogLabels();
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
      <Descriptions column={1} size="small" bordered items={detailItems(vehicle, labels, fmt)} />

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

      <ResponsiveDialog
        title="Ẩn xe khỏi Marketplace"
        open={hideOpen}
        size="sm"
        okText="Ẩn xe"
        cancelText="Huỷ"
        destructive
        okDisabled={!trimmedReason}
        confirmLoading={moderation.isPending}
        onOk={submitHide}
        onClose={() => setHideOpen(false)}
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
      </ResponsiveDialog>
    </div>
  );
}

function detailItems(v: AdminVehicleDetail, labels: CatalogLabels, fmt: AppFormat) {
  const specs = [
    labels.brandLabel(v.brand),
    v.model,
    v.manufactureYear ? String(v.manufactureYear) : null,
    v.seatCount ? `${v.seatCount} chỗ` : null,
    labels.fuelTypeLabel(v.fuelType),
  ]
    .filter(Boolean)
    .join(LIST_SEPARATOR);

  return [
    { key: 'code', label: 'Mã xe', children: v.code },
    { key: 'plate', label: 'Biển số', children: v.plateNumber ?? '—' },
    {
      key: 'type',
      label: 'Loại · dịch vụ',
      children: `${VEHICLE_TYPE_LABEL[v.vehicleType as VehicleType] ?? v.vehicleType} · ${serviceTypesLabel(v.serviceTypes ?? [])}`,
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
          <StatusTag value={v.tenantStatus as TenantStatus} meta={TENANT_STATUS_META} group="tenantStatus" />
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
          meta={VEHICLE_OPERATION_STATUS_META} group="vehicleOperationStatus"
        />
      ),
    },
    {
      key: 'listing',
      label: 'Trên sàn',
      children: v.listingStatus ? (
        <span className={styles.inline}>
          <StatusTag value={v.listingStatus as ListingStatus} meta={LISTING_STATUS_META} group="listingStatus" />
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
      children: `${fmt.money(v.weekdayPrice)} · ${fmt.money(v.weekendPrice)} · ${fmt.money(v.hourlyPrice)}`,
    },
    { key: 'bookings', label: 'Số đơn thuê', children: String(v.bookingCount) },
    { key: 'reviews', label: 'Số đánh giá', children: String(v.reviewCount) },
    { key: 'created', label: 'Ngày tạo', children: fmt.date(v.createdAt) },
    { key: 'updated', label: 'Cập nhật', children: fmt.date(v.updatedAt) },
  ];
}
