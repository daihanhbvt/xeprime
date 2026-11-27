'use client';

import { CarOutlined } from '@ant-design/icons';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { isNewListing } from '@xeprime/domain';
import {
  VEHICLE_OPERATION_STATUS,
  VEHICLE_OPERATION_STATUS_META,
  transmissionFamily,
  type VehicleOperationStatus,
} from '@xeprime/types';
import { DiscountTag } from '@/components/data-display/DiscountTag';
import { StatusTag } from '@/components/data-display/StatusTag';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import {
  PhotoAmenityPills,
  listingAmenityItems,
} from '@/features/marketplace/components/PhotoAmenityPills';
import type { VehicleBookingPickerItem } from '@/features/vehicles/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { applyDiscountPercent } from '@/lib/money';
import styles from './StaffVehicleCard.module.css';

/** Trạng thái vận hành đáng báo trên thẻ — "sẵn sàng"/"đang thuê" đã do cờ bận theo khung giờ nói. */
const FLAGGED_STATUSES: readonly string[] = [
  VEHICLE_OPERATION_STATUS.MAINTENANCE,
  VEHICLE_OPERATION_STATUS.INACTIVE,
];

interface StaffVehicleCardProps {
  vehicle: VehicleBookingPickerItem;
  selected: boolean;
  onSelect: () => void;
}

/**
 * Thẻ xe của bước "Chọn xe" khi lập đơn (Figma Partner `24565:59749`) — CÙNG khung với thẻ chợ
 * để nhân viên thấy chiếc xe như khách thấy: ảnh, nhãn ưu đãi trên ảnh, tên + đánh giá, phường,
 * thông số. Dùng lại các mảnh của thẻ chợ (`DiscountTag`, `PhotoAmenityPills`, khoá dịch
 * `Listings.card`) thay vì vẽ lại.
 *
 * Khác thẻ chợ (chốt 25/11/2026): cả thẻ là một NÚT CHỌN (`aria-pressed`), không có tim (yêu thích
 * là của tài khoản khách); có hàng "Biển số xe" + giá/ngày (design cập nhật 25/11: nhãn trên biển
 * số, giá gốc gạch ngang trên giá vàng như thẻ chợ); xe đã có lịch trong khung giờ vẫn hiện nhưng mờ
 * và không bấm được.
 */
export function StaffVehicleCard({ vehicle, selected, onSelect }: StaffVehicleCardProps) {
  const t = useTranslations('Listings.card');
  const tPicker = useTranslations('BookingRequests.vehiclePicker');
  const fmt = useAppFormat();
  const { fuelTypeLabel } = useCatalogLabels();

  const discount = vehicle.discountPercent ?? 0;
  const hasRating = !isNewListing(vehicle);
  const fuel = fuelTypeLabel(vehicle.fuelType);
  const location = vehicle.provinceName
    ? vehicle.wardName
      ? t('locationLine', { ward: vehicle.wardName, province: vehicle.provinceName })
      : vehicle.provinceName
    : null;
  const amenities = listingAmenityItems(
    vehicle,
    vehicle.instantBookServiceTypes.length > 0,
    (key) => t(key),
  );
  const specs = [
    vehicle.seatCount
      ? {
          key: 'seats',
          icon: '/home/card-seats.svg',
          w: 12,
          h: 11,
          label: t('seats', { count: vehicle.seatCount }),
        }
      : null,
    vehicle.transmission
      ? {
          key: 'transmission',
          icon: '/home/card-transmission.svg',
          w: 13,
          h: 13,
          label: t(`transmissionFamily.${transmissionFamily(vehicle.transmission)}`),
        }
      : null,
    fuel ? { key: 'fuel', icon: '/home/card-fuel.svg', w: 16, h: 16, label: fuel } : null,
  ].filter((spec): spec is NonNullable<typeof spec> => spec !== null);
  // Cùng con số thẻ chợ hiện: giá ngày SAU khuyến mãi trực tiếp của xe.
  const dailyPrice =
    vehicle.weekdayPrice && discount > 0
      ? applyDiscountPercent(vehicle.weekdayPrice, discount)
      : vehicle.weekdayPrice;
  const compactPrice = (value: string) => fmt.moneyCompact(value, { price: true });

  return (
    <button
      type="button"
      className={cx(styles.card, selected && styles.selected, vehicle.busy && styles.busy)}
      onClick={onSelect}
      disabled={vehicle.busy}
      aria-pressed={selected}
      title={vehicle.busy ? tPicker('busyHint', { name: vehicle.name }) : undefined}
    >
      <span className={styles.media}>
        {vehicle.mainImageUrl ? (
          // Ảnh trang trí bên trong một nút chọn — không phải ảnh mở xem, nên `<img>` thường.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={vehicle.mainImageUrl} alt="" loading="lazy" className={styles.photo} />
        ) : (
          <span className={styles.glyph} aria-hidden="true">
            <CarOutlined />
          </span>
        )}
        {discount > 0 ? (
          <span className={styles.badges}>
            <DiscountTag percent={discount} variant="badge" />
          </span>
        ) : null}
        {vehicle.busy ? <span className={styles.busyBadge}>{tPicker('busy')}</span> : null}
        <PhotoAmenityPills items={amenities} label={t('amenitiesLabel')} />
      </span>

      <span className={styles.body}>
        <span className={styles.info}>
          <span className={styles.topRow}>
            <span className={styles.nameRow}>
              <span className={styles.title}>{vehicle.name}</span>
              {!hasRating ? <span className={styles.newBadge}>{t('newVehicle')}</span> : null}
            </span>
            {hasRating ? (
              <span
                className={styles.rating}
                title={t('ratingCount', { count: vehicle.ratingCount })}
              >
                <Image src="/home/star-16.svg" alt="" width={16} height={16} unoptimized />
                <span>
                  {t.rich('ratingValue', {
                    rating: fmt.rating(Number(vehicle.ratingAvg)),
                    count: vehicle.ratingCount,
                    muted: (chunks) => <span className={styles.ratingCount}>{chunks}</span>,
                  })}
                </span>
              </span>
            ) : null}
          </span>
          {location ? (
            <span className={styles.location}>
              <span className={styles.icon20}>
                <Image src="/home/card-location.svg" alt="" width={15} height={19} unoptimized />
              </span>
              <span className={styles.ellipsis}>{location}</span>
            </span>
          ) : null}
        </span>

        {specs.length > 0 ? (
          <span className={styles.specs}>
            {specs.map((spec) => (
              <span key={spec.key} className={styles.spec}>
                <span className={styles.icon16}>
                  <Image src={spec.icon} alt="" width={spec.w} height={spec.h} unoptimized />
                </span>
                <span>{spec.label}</span>
              </span>
            ))}
          </span>
        ) : null}
      </span>

      <span className={styles.meta}>
        {/* Biển số là thứ nhân viên nhận ra xe; xe chưa có biển (xe mới về) thì hiện mã xe. */}
        <span className={styles.identity}>
          <span className={styles.identityLabel}>
            {tPicker(vehicle.plateNumber ? 'plateLabel' : 'codeLabel')}
          </span>
          <span className={styles.identityRow}>
            <span className={cx(styles.identityValue, styles.ellipsis)}>
              {vehicle.plateNumber || vehicle.code}
            </span>
            {FLAGGED_STATUSES.includes(vehicle.operationStatus) ? (
              <StatusTag
                value={vehicle.operationStatus as VehicleOperationStatus}
                meta={VEHICLE_OPERATION_STATUS_META}
                group="vehicleOperationStatus"
              />
            ) : null}
          </span>
        </span>
        {dailyPrice ? (
          <span className={styles.price}>
            {discount > 0 && vehicle.weekdayPrice ? (
              <s className={styles.oldPrice}>{compactPrice(vehicle.weekdayPrice)}</s>
            ) : null}
            <span className={styles.currentPrice}>
              {t.rich('priceDaily', {
                value: compactPrice(dailyPrice),
                amount: (chunks) => <b>{chunks}</b>,
                unit: (chunks) => <span>{chunks}</span>,
              })}
            </span>
          </span>
        ) : null}
      </span>
    </button>
  );
}
