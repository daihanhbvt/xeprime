'use client';

import { vehicleGalleryItems } from '../../media';
import { useImageSlotLabel } from '../../hooks/use-image-slot-label';
import { useIsMobile } from '@/hooks/use-media-query';
import { ListingGallery } from '@/features/marketplace/components/ListingGallery';
import {
  CarOutlined,
  CheckOutlined,
  DownOutlined,
  ExportOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { App, Button, Dropdown, Tooltip } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';
import {
  SERVICE_TYPE,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  VEHICLE_SOURCE_TYPE,
  VEHICLE_TYPE,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';

import { StatusTag } from '@/components/data-display/StatusTag';
import { listingPath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { decorativeIcon } from '@/lib/decorative-icon';

import { useUpdateVehicle } from '../../hooks/use-vehicle-mutations';
import { useVehicleSummary } from '../../hooks/use-vehicle-summary';
import { publishCompleteness } from '../../publication';
import type { VehicleDetail } from '../../types';
import { MarketplaceVisibilitySwitch } from '../MarketplaceVisibilitySwitch';
import styles from './VehicleEditShell.module.css';

/**
 * Thẻ tóm tắt ở cột phải màn sửa xe (design `23731:37932`): ảnh · tên + nguồn xe · vận hành (đổi tại
 * chỗ) · kiểm duyệt · loại xe · giá · KM · Hoàn thiện %. Công tắc "Trên chợ" ở đầu trang
 * (`VehicleEditMarketBar` bên dưới).
 */
export function VehicleEditSummary({
  vehicle,
  statusEditable,
  showSource,
  showOwnerStats,
  onOpenMedia,
}: {
  vehicle: VehicleDetail;
  /** Trạng thái vận hành sửa tại chỗ — cần `vehicles.update` và không bị phiên hỗ trợ ghim. */
  statusEditable: boolean;
  /** Nhãn nguồn xe (Sở hữu/Trả góp…) — chỉ tuyến gói có khái niệm nguồn xe. */
  showSource: boolean;
  /** Điểm đánh giá + số chuyến — tuyến hoa hồng không có Hồ sơ 360 để đọc chúng. */
  showOwnerStats: boolean;
  /** Bấm ảnh mở mục Hình ảnh — `undefined` khi người này không tới được mục đó. */
  onOpenMedia?: () => void;
}) {
  const t = useTranslations('Vehicles.editor.summary');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const update = useUpdateVehicle(vehicle.id);
  const summary = useVehicleSummary(vehicle.id);

  const operation = vehicle.operationStatus as VehicleOperationStatus;
  const review = vehicle.publicStatus as VehiclePublicStatus;
  const services = vehicle.serviceTypes ?? [];
  const isCar = vehicle.vehicleType === VEHICLE_TYPE.CAR;

  async function changeStatus(next: VehicleOperationStatus) {
    if (next === vehicle.operationStatus) return;
    try {
      await update.mutateAsync({ operationStatus: next });
      message.success(t('statusSaved'));
    } catch (err) {
      message.error(errorMessage(err));
    }
  }

  // Giá đại diện: giá ngày của dịch vụ đầu tiên xe có, dài hạn thì giá tháng.
  const price =
    services.includes(SERVICE_TYPE.SELF_DRIVE) && vehicle.weekdayPrice
      ? { value: fmt.money(vehicle.weekdayPrice), unit: t('perDay') }
      : services.includes(SERVICE_TYPE.WITH_DRIVER) && vehicle.withDriverDailyPrice
        ? { value: fmt.money(vehicle.withDriverDailyPrice), unit: t('perDay') }
        : services.includes(SERVICE_TYPE.LONG_TERM) && vehicle.monthlyPrice
          ? { value: fmt.money(vehicle.monthlyPrice), unit: t('perMonth') }
          : null;

  const seatOrCategory = isCar
    ? vehicle.seatCount
      ? t('seats', { count: vehicle.seatCount })
      : null
    : vehicle.motorbikeCategory
      ? domainLabel('motorbikeCategory', vehicle.motorbikeCategory)
      : null;
  const kind = [domainLabel('vehicleType', vehicle.vehicleType), seatOrCategory]
    .filter(Boolean)
    .join(' · ');

  const odometer = summary.data?.currentOdometerKm ?? null;
  const completeness = publishCompleteness(vehicle);
  const percent =
    completeness.total > 0 ? Math.round((completeness.done / completeness.total) * 100) : 100;
  const stats = summary.data?.stats;
  const isMobile = useIsMobile();
  const slotLabel = useImageSlotLabel();
  const gallery = vehicleGalleryItems(vehicle, slotLabel);
  const sourceType = vehicle.sourceType ?? VEHICLE_SOURCE_TYPE.OWNED;

  const image = vehicle.mainImageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- ảnh R2 ngoài miền, không qua next/image
    <img className={styles.summaryImage} src={vehicle.mainImageUrl} alt={vehicle.name} />
  ) : (
    <span className={styles.summaryImageFallback} aria-hidden="true">
      <CarOutlined />
    </span>
  );

  return (
    <section className={styles.summary} aria-label={t('label')}>
      {/* Khổ điện thoại: ảnh lớn + dải ảnh nhỏ như app (người dùng chốt 17/11/2026). */}
      {isMobile && gallery.length > 0 ? (
        <ListingGallery
          name={vehicle.name}
          mainImageUrl={gallery[0]?.url ?? null}
          images={gallery.map((item) => item.url)}
        />
      ) : null}
      <div className={styles.summaryMedia} hidden={isMobile && gallery.length > 0}>
        {onOpenMedia ? (
          <Tooltip title={t('openMedia')}>
            <button
              type="button"
              className={styles.summaryMediaButton}
              onClick={onOpenMedia}
              aria-label={t('openMedia')}
            >
              {image}
            </button>
          </Tooltip>
        ) : (
          image
        )}
      </div>

      <div className={styles.summaryBody}>
        <div className={styles.summaryNameRow}>
          <h2 className={styles.summaryName}>{vehicle.name}</h2>
          {showSource ? (
            <span className={styles.sourceBadge}>
              {domainLabel('vehicleSourceType', sourceType)}
            </span>
          ) : null}
        </div>

        <dl className={styles.summaryList}>
          <div className={styles.summaryRow}>
            <dt>{t('operation')}</dt>
            <dd>
              {statusEditable ? (
                <Dropdown
                  trigger={['click']}
                  disabled={update.isPending}
                  menu={{
                    selectable: true,
                    selectedKeys: [operation],
                    items: VEHICLE_OPERATION_STATUS_VALUES.map((status) => ({
                      key: status,
                      label: (
                        <span className={styles.statusOption}>
                          <StatusTag
                            value={status}
                            meta={VEHICLE_OPERATION_STATUS_META}
                            group="vehicleOperationStatus"
                          />
                          {status === operation
                            ? decorativeIcon(<CheckOutlined className={styles.statusCheck} />)
                            : null}
                        </span>
                      ),
                    })),
                    onClick: ({ key }) => void changeStatus(key as VehicleOperationStatus),
                  }}
                >
                  <button
                    type="button"
                    className={styles.statusTrigger}
                    aria-label={t('changeStatus', {
                      status: domainLabel('vehicleOperationStatus', operation),
                    })}
                  >
                    <StatusTag
                      value={operation}
                      meta={VEHICLE_OPERATION_STATUS_META}
                      group="vehicleOperationStatus"
                    />
                    {decorativeIcon(update.isPending ? <LoadingOutlined /> : <DownOutlined />)}
                  </button>
                </Dropdown>
              ) : (
                <StatusTag
                  value={operation}
                  meta={VEHICLE_OPERATION_STATUS_META}
                  group="vehicleOperationStatus"
                />
              )}
            </dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>{t('review')}</dt>
            <dd>
              <StatusTag
                value={review}
                meta={VEHICLE_PUBLIC_STATUS_META}
                group="vehiclePublicStatus"
              />
            </dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>{t('plate')}</dt>
            <dd className={vehicle.plateNumber ? undefined : styles.summaryMuted}>
              {vehicle.plateNumber || tLabels('notAvailable')}
            </dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>{t('kind')}</dt>
            <dd>{kind}</dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>{price ? t('priceWithUnit', { unit: price.unit }) : t('price')}</dt>
            <dd className={price ? undefined : styles.summaryMuted}>
              {price ? price.value : tLabels('notAvailable')}
            </dd>
          </div>
          <div className={styles.summaryRow}>
            <dt>{t('odometer')}</dt>
            <dd className={odometer == null ? styles.summaryMuted : undefined}>
              {odometer == null ? tLabels('notAvailable') : fmt.km(odometer)}
            </dd>
          </div>
          {showOwnerStats && stats ? (
            <div className={styles.summaryRow}>
              <dt>{t('rating')}</dt>
              <dd>
                {stats.ratingAvg ? fmt.rating(Number(stats.ratingAvg)) : t('noRating')}
                {' · '}
                {t('trips', { count: stats.completedBookings })}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className={styles.completeness}>
          <span className={styles.completenessLabel}>
            {t('completeness')}
            <span className={styles.completenessValue}>{percent}%</span>
          </span>
          <div
            className={styles.completenessBar}
            role="progressbar"
            aria-label={t('completeness')}
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={t('completenessValue', {
              done: completeness.done,
              total: completeness.total,
            })}
          >
            <div
              className={styles.completenessFill}
              style={{ '--completeness': `${percent}%` } as CSSProperties}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Công tắc "Trên chợ" + "Xem trang xe" ở GÓC PHẢI đầu trang (03/11/2026, người dùng chốt — lệch
 * design, design đặt nó cuối thẻ tóm tắt). Đây là trạng thái chủ xe kiểm tra nhiều nhất, nên nó
 * đứng ngang tiêu đề thay vì nằm dưới cả cột số liệu. Ô bị khoá vì xe đang trên chợ đã tự nói điều
 * đó ngay dưới từng ô ở mục Thông tin chung, nên không lặp thêm dòng nhắc ở đây.
 */
export function VehicleEditMarketBar({ vehicle }: { vehicle: VehicleDetail }) {
  const t = useTranslations('Vehicles.editor.summary');
  const isPublic = vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;

  return (
    <div className={styles.marketBar}>
      <div className={styles.marketSwitch}>
        <MarketplaceVisibilitySwitch vehicle={vehicle} bare />
      </div>
      {isPublic ? (
        <Link href={listingPath.detail(vehicle.id)} target="_blank" rel="noopener">
          <Button icon={<ExportOutlined aria-hidden />}>{t('viewListing')}</Button>
        </Link>
      ) : null}
    </div>
  );
}
