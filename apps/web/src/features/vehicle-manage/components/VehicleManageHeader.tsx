'use client';

import { StarFilled } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  MARKETPLACE_VISIBILITY_REASON_META,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS_META,
  type MarketplaceVisibilityReason,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';

import { StatusTag } from '@/components/data-display/StatusTag';
import { BackButton } from '@/components/navigation/BackButton';
import { ROUTES, listingPath } from '@/constants/routes';
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
  const tRoot = useTranslations('VehicleManage');
  const fmt = useAppFormat();
  /*
   * "Xem trang xe" theo KẾT QUẢ hiển thị thật, không theo trạng thái kiểm duyệt (ADR 0048): một
   * chiếc xe đã duyệt nhưng chủ xe đang tạm ẩn thì `/listings/:id` trả 404, nên một đường dẫn
   * sáng ở đây là dẫn người dùng tới một trang không tồn tại.
   */
  const isPublic = vehicle.isMarketplaceVisible;

  return (
    <header className={styles.header}>
      <BackButton
        href={ROUTES.ACCOUNT.VEHICLES}
        label={tRoot('backToList')}
        className={styles.back}
      />
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
          {/* Kết quả hiển thị thật — server suy, web không ghép lại từ ba status (ADR 0048). */}
          <StatusTag
            value={vehicle.marketplaceVisibilityReason as MarketplaceVisibilityReason}
            meta={MARKETPLACE_VISIBILITY_REASON_META}
            group="marketplaceVisibility"
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
