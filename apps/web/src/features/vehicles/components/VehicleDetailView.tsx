'use client';

import { Card, Descriptions, Tag, Typography } from 'antd';
import type { DescriptionsProps } from 'antd';
import {
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS_META,
  vehicleFeatureLabel,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { formatDateTime } from '@/lib/datetime';
import { formatMoneyVnd } from '@/lib/money';
import { bodyTypeLabelOf, fuelTypeLabel, serviceTypeLabel, vehicleTypeLabel } from '../constants';
import { discountedPriceVnd } from '../pricing';
import type { VehicleDetail } from '../types';
import { VehiclePublicReviewPanel } from './VehiclePublicReviewPanel';
import styles from './VehicleDetailView.module.css';

const EMPTY = '—';

/**
 * Chi tiết xe — bố cục hai cột theo Figma `65:240`.
 *
 * Cột chính: ảnh + thông số kỹ thuật + tiện ích + mô tả.
 * Cột phụ: bảng giá và tiến trình gửi duyệt công khai.
 *
 * Ở ≤1024px hai cột xếp chồng (bảng giá lên trước thông số) — xem `.module.css`.
 */
export function VehicleDetailView({ vehicle }: { vehicle: VehicleDetail }) {
  const discounted = discountedPriceVnd(vehicle.weekdayPrice, vehicle.discountPercent);

  const specs: DescriptionsProps['items'] = [
    { key: 'code', label: 'Mã quản lý', children: vehicle.code },
    { key: 'plate', label: 'Biển số', children: vehicle.plateNumber || EMPTY },
    { key: 'type', label: 'Loại phương tiện', children: vehicleTypeLabel(vehicle.vehicleType) },
    { key: 'service', label: 'Loại hình dịch vụ', children: serviceTypeLabel(vehicle.serviceType) },
    { key: 'brand', label: 'Hãng xe', children: vehicle.brand || EMPTY },
    { key: 'model', label: 'Mẫu xe', children: vehicle.model || EMPTY },
    { key: 'body', label: 'Kiểu dáng thân xe', children: bodyTypeLabelOf(vehicle.bodyType) },
    { key: 'year', label: 'Năm sản xuất', children: vehicle.manufactureYear ?? EMPTY },
    { key: 'seats', label: 'Số chỗ ngồi', children: vehicle.seatCount ?? EMPTY },
    { key: 'fuel', label: 'Nhiên liệu', children: fuelTypeLabel(vehicle.fuelType) },
    { key: 'color', label: 'Màu sắc', children: vehicle.color || EMPTY },
    {
      key: 'delivery',
      label: 'Giao xe tận nơi',
      children: vehicle.deliveryEnabled ? 'Có' : 'Không',
    },
    {
      key: 'noCollateral',
      label: 'Miễn thế chấp',
      children: vehicle.noCollateral ? 'Có' : 'Không',
    },
    { key: 'created', label: 'Tạo lúc', children: formatDateTime(vehicle.createdAt) },
    { key: 'updated', label: 'Cập nhật', children: formatDateTime(vehicle.updatedAt) },
  ];

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <div className={styles.identity}>
          <p className={styles.subtitle}>Mã quản lý: {vehicle.code}</p>
          <div className={styles.statuses}>
            <StatusTag
              value={vehicle.operationStatus as VehicleOperationStatus}
              meta={VEHICLE_OPERATION_STATUS_META}
            />
            <StatusTag
              value={vehicle.publicStatus as VehiclePublicStatus}
              meta={VEHICLE_PUBLIC_STATUS_META}
            />
          </div>
        </div>

        <Card title="Hình ảnh của xe" className={styles.card}>
          {vehicle.mainImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- ảnh ngoài từ URL người dùng nhập
            <img src={vehicle.mainImageUrl} alt={vehicle.name} className={styles.image} />
          ) : (
            <p className={styles.noImage}>Chưa có ảnh đại diện.</p>
          )}

          {vehicle.images.length > 0 ? (
            <ul className={styles.gallery} aria-label="Thư viện ảnh">
              {vehicle.images.map((url) => (
                <li key={url}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- ảnh ngoài từ URL người dùng nhập */}
                  <img src={url} alt="" className={styles.thumb} />
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card title="Thông tin chi tiết phương tiện" className={styles.card}>
          <Descriptions bordered size="middle" column={{ xs: 1, sm: 2 }} items={specs} />
        </Card>

        {vehicle.features.length > 0 ? (
          <Card title="Tiện ích" className={styles.card}>
            <div className={styles.chips}>
              {vehicle.features.map((key) => (
                <Tag key={key}>{vehicleFeatureLabel(key)}</Tag>
              ))}
            </div>
          </Card>
        ) : null}

        {vehicle.description ? (
          <Card title="Mô tả" className={styles.card}>
            <Typography.Paragraph className={styles.description}>
              {vehicle.description}
            </Typography.Paragraph>
          </Card>
        ) : null}
      </div>

      <aside className={styles.side}>
        <Card title="Biểu phí & bảng giá" className={styles.card}>
          <dl className={styles.prices}>
            <div className={styles.priceRow}>
              <dt>Giá ngày thường</dt>
              <dd>{formatMoneyVnd(vehicle.weekdayPrice)}</dd>
            </div>
            <div className={styles.priceRow}>
              <dt>Giá cuối tuần</dt>
              <dd>{formatMoneyVnd(vehicle.weekendPrice)}</dd>
            </div>
            <div className={styles.priceRow}>
              <dt>Giá theo giờ</dt>
              <dd>{vehicle.hourlyPrice ? `${formatMoneyVnd(vehicle.hourlyPrice)}/giờ` : EMPTY}</dd>
            </div>
            <div className={styles.priceRow}>
              <dt>Giảm giá</dt>
              <dd>
                {vehicle.discountPercent ? (
                  <Tag color="red">-{vehicle.discountPercent}%</Tag>
                ) : (
                  EMPTY
                )}
              </dd>
            </div>
            {discounted != null ? (
              <div className={`${styles.priceRow} ${styles.priceTotal}`}>
                <dt>Giá hiển thị sàn</dt>
                <dd>{formatMoneyVnd(discounted)}</dd>
              </div>
            ) : null}
          </dl>
        </Card>

        <VehiclePublicReviewPanel vehicle={vehicle} />
      </aside>
    </div>
  );
}
