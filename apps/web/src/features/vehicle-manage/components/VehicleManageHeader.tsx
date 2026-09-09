'use client';

import { StarFilled } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';

import { StatusTag } from '@/components/data-display/StatusTag';
import { listingPath } from '@/constants/routes';
import type { VehicleDetail, VehicleStats } from '@/features/vehicles/types';
import { useAppFormat } from '@/i18n/use-app-format';

import styles from './VehicleManageHeader.module.css';

interface Props {
  vehicle: VehicleDetail;
  /** Chỉ số từ `/vehicles/:id/summary` — vắng mặt khi chưa tải xong hoặc hỏng; header tự bỏ trống. */
  stats: VehicleStats | undefined;
}

/**
 * Thanh đầu của không gian quản lý xe: ảnh đại diện, tên, trạng thái, điểm đánh giá + số chuyến
 * THẬT (từ summary — không bịa), và "Xem trang xe" chỉ dẫn được khi xe đã công khai.
 *
 * KHÔNG có "Số dư": nền tảng chưa có số dư/ví chủ xe (ADR 0028 điều 8) — một con số giả là
 * một lời hứa sai.
 */
export function VehicleManageHeader({ vehicle, stats }: Props) {
  const t = useTranslations('VehicleManage.header');
  const fmt = useAppFormat();
  const isPublic = vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;

  return (
    <header className={styles.header}>
      {vehicle.mainImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh R2, host theo môi trường
        <img src={vehicle.mainImageUrl} alt="" className={styles.image} />
      ) : (
        <div className={styles.imageFallback} aria-hidden="true" />
      )}
      <div className={styles.text}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{vehicle.name}</h1>
          <StatusTag
            value={vehicle.operationStatus as VehicleOperationStatus}
            meta={VEHICLE_OPERATION_STATUS_META}
            group="vehicleOperationStatus"
          />
          <StatusTag
            value={vehicle.publicStatus as VehiclePublicStatus}
            meta={VEHICLE_PUBLIC_STATUS_META}
            group="vehiclePublicStatus"
          />
        </div>
        <p className={styles.meta}>
          {stats ? (
            <>
              <span className={styles.rating}>
                <StarFilled aria-hidden="true" />
                {stats.ratingAvg ? fmt.rating(Number(stats.ratingAvg)) : t('noRating')}
              </span>
              <span className={styles.sep} aria-hidden="true">
                {LIST_SEPARATOR}
              </span>
              <span>{t('trips', { count: stats.completedBookings })}</span>
            </>
          ) : (
            <span>{vehicle.plateNumber ?? vehicle.code}</span>
          )}
        </p>
      </div>
      <div className={styles.actions}>
        {isPublic ? (
          <Link href={listingPath.detail(vehicle.id)} target="_blank" rel="noopener">
            <Button>{t('viewListing')}</Button>
          </Link>
        ) : (
          <Tooltip title={t('viewListingDisabled')}>
            {/* span để tooltip vẫn hiện trên nút disabled (AntD không bắt sự kiện ở nút disabled). */}
            <span className={styles.disabledWrap}>
              <Button disabled>{t('viewListing')}</Button>
            </span>
          </Tooltip>
        )}
      </div>
    </header>
  );
}
