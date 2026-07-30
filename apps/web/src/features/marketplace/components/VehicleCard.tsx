'use client';

import {
  DashboardOutlined,
  EnvironmentOutlined,
  HeartOutlined,
  StarFilled,
  TeamOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import {
  SERVICE_TYPE_LABEL,
  VEHICLE_TYPE,
  VEHICLE_TYPE_LABEL,
  type ServiceType,
  type VehicleType,
} from '@xeprime/types';
import { RequestBookingButton } from '@/features/booking-requests/components/RequestBookingButton';
import { listingPath, shopPath } from '@/constants/routes';
import { formatMoneyVnd } from '@/lib/money';
import { fuelLabel } from '../constants';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import type { PublicListing } from '../types';
import styles from './VehicleCard.module.css';

/** Một thẻ xe trên marketplace. Chỉ hiển thị trường backend thật sự có — thiếu thì ẩn dòng đó. */
export function VehicleCard({ listing }: { listing: PublicListing }) {
  const { filters } = useMarketplaceFilters();

  const typeLabel = VEHICLE_TYPE_LABEL[listing.vehicleType as VehicleType] ?? listing.vehicleType;
  const brandLine = [listing.brand, listing.model].filter(Boolean).join(' ');
  const specs = [brandLine || typeLabel, listing.seatCount ? `${listing.seatCount} chỗ` : null]
    .filter(Boolean)
    .join(' · ');

  const serviceLabel =
    SERVICE_TYPE_LABEL[listing.serviceType as ServiceType] ?? listing.serviceType;
  const fuel = fuelLabel(listing.fuelType);
  const rating = Number(listing.ratingAvg);
  const hasRating = listing.ratingCount > 0 && Number.isFinite(rating);

  // Mang ngày giờ đã lọc sang trang chi tiết để prefill luồng đặt xe.
  const dateQs = new URLSearchParams();
  if (filters.pickupAt) dateQs.set('pickupAt', filters.pickupAt);
  if (filters.returnAt) dateQs.set('returnAt', filters.returnAt);
  const detailHref = dateQs.toString()
    ? `${listingPath.detail(listing.id)}?${dateQs.toString()}`
    : listingPath.detail(listing.id);

  return (
    <article className={styles.card}>
      {/* Stretched-link: cả thẻ dẫn tới trang chi tiết, trừ các nút z-index cao hơn. */}
      <Link href={detailHref} className={styles.stretch} aria-label={`Xem chi tiết ${listing.name}`} />

      <div className={styles.media}>
        {listing.mainImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- ảnh xe từ storage ngoài, chưa qua next/image
          <img src={listing.mainImageUrl} alt={listing.name} className={styles.photo} />
        ) : (
          <CarGlyph type={listing.vehicleType as VehicleType} />
        )}
        <span className={styles.serviceBadge}>{serviceLabel}</span>
        <button className={styles.fav} type="button" aria-label="Lưu xe">
          <HeartOutlined />
        </button>
      </div>

      <div className={styles.body}>
        <h3 className={styles.title}>{listing.name}</h3>
        {specs ? <p className={styles.specs}>{specs}</p> : null}

        <div className={styles.metaRow}>
          {listing.shopProvince ? (
            <span className={styles.metaItem}>
              <EnvironmentOutlined /> {listing.shopProvince}
            </span>
          ) : null}
          {hasRating ? (
            <span className={styles.metaItem}>
              <StarFilled className={styles.star} /> {rating.toFixed(1)}
              <span className={styles.ratingCount}>({listing.ratingCount})</span>
            </span>
          ) : (
            <span className={styles.newTag}>Xe mới</span>
          )}
        </div>

        <div className={styles.featureRow}>
          {fuel ? (
            <span className={styles.metaItem}>
              <DashboardOutlined /> {fuel}
            </span>
          ) : null}
          {listing.seatCount ? (
            <span className={styles.metaItem}>
              <TeamOutlined /> {listing.seatCount} chỗ
            </span>
          ) : null}
        </div>

        <div className={styles.footer}>
          <div className={styles.price}>
            <b>{formatMoneyVnd(listing.weekdayPrice)}</b>
            <span>/ngày</span>
          </div>
          <Link
            href={shopPath.detail(listing.shopSlug)}
            className={styles.shop}
            title={listing.shopName}
          >
            {listing.shopName}
          </Link>
        </div>

        <RequestBookingButton
          vehicleId={listing.id}
          vehicleName={listing.name}
          vehicleImageUrl={listing.mainImageUrl}
          pricePerDay={listing.weekdayPrice}
          pickupAt={filters.pickupAt}
          returnAt={filters.returnAt}
          block
          className={styles.requestBtn}
        />
      </div>
    </article>
  );
}

function CarGlyph({ type }: { type: VehicleType }) {
  return (
    <span className={styles.glyph} aria-hidden="true">
      {type === VEHICLE_TYPE.MOTORBIKE ? (
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4">
          <circle cx="11" cy="34" r="6" />
          <circle cx="37" cy="34" r="6" />
          <path d="M11 34l7-12h9l4 6h6M18 22l-3-6h-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 48 48" fill="currentColor">
          <path d="M9 28h30l-4.5-9.2A5 5 0 0 0 30 16H21.6a5 5 0 0 0-3.8 1.7L11 26l-2 2Z" />
          <rect x="8" y="27.5" width="32" height="6.5" rx="3.2" />
        </svg>
      )}
    </span>
  );
}
