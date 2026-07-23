'use client';

import { HeartOutlined } from '@ant-design/icons';
import {
  SERVICE_TYPE_LABEL,
  VEHICLE_TYPE,
  type ServiceType,
  type VehicleType,
} from '@xeprime/types';
import { formatMoneyVnd } from '@/lib/money';
import type { PublicListing } from '../types';
import styles from './VehicleCard.module.css';

const FUEL_LABEL: Record<string, string> = {
  gasoline: 'Xăng',
  diesel: 'Dầu',
  electric: 'Điện',
  hybrid: 'Hybrid',
};

/** Một thẻ xe trên marketplace — bám card của xeprime.vn. */
export function VehicleCard({ listing }: { listing: PublicListing }) {
  const seats = listing.seatCount ? `${listing.seatCount} chỗ` : null;
  const fuel = listing.fuelType ? (FUEL_LABEL[listing.fuelType] ?? listing.fuelType) : null;
  const specs = [seats, fuel, listing.brand].filter(Boolean).join(' · ');
  const serviceLabel = SERVICE_TYPE_LABEL[listing.serviceType as ServiceType] ?? listing.serviceType;

  return (
    <article className={styles.card}>
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
        <div className={styles.footer}>
          <div className={styles.price}>
            <b>{formatMoneyVnd(listing.weekdayPrice)}</b>
            <span>/ngày</span>
          </div>
          <span className={styles.shop} title={listing.shopName}>
            {listing.shopName}
          </span>
        </div>
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
