import { SERVICE_TYPE_LABEL, VEHICLE_TYPE, type ServiceType } from '@xeprime/types';
import { RequestBookingButton } from '@/features/booking-requests/components/RequestBookingButton';
import { formatMoneyVnd } from '@/lib/money';
import type { PublicListingDetail } from '../types';
import styles from './ListingDetailView.module.css';

const FUEL_LABEL: Record<string, string> = {
  gasoline: 'Xăng',
  diesel: 'Dầu',
  electric: 'Điện',
  hybrid: 'Hybrid',
};

function vehicleTypeLabel(type: string): string {
  return type === VEHICLE_TYPE.MOTORBIKE ? 'Xe máy' : 'Ô tô';
}

/** Trang chi tiết một xe trên Marketplace (server-render). Nút thuê là client island. */
export function ListingDetailView({ listing }: { listing: PublicListingDetail }) {
  const specs: Array<{ label: string; value: string }> = [
    { label: 'Loại xe', value: vehicleTypeLabel(listing.vehicleType) },
    { label: 'Dịch vụ', value: SERVICE_TYPE_LABEL[listing.serviceType as ServiceType] ?? listing.serviceType },
    ...(listing.seatCount ? [{ label: 'Số chỗ', value: `${listing.seatCount} chỗ` }] : []),
    ...(listing.fuelType ? [{ label: 'Nhiên liệu', value: FUEL_LABEL[listing.fuelType] ?? listing.fuelType }] : []),
    ...(listing.manufactureYear ? [{ label: 'Đời xe', value: String(listing.manufactureYear) }] : []),
    ...(listing.color ? [{ label: 'Màu', value: listing.color }] : []),
    ...(listing.brand ? [{ label: 'Hãng', value: [listing.brand, listing.model].filter(Boolean).join(' ') }] : []),
  ];

  return (
    <div className={styles.wrap}>
      <div className={styles.media}>
        {listing.mainImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- ảnh xe từ storage ngoài, chưa qua next/image
          <img src={listing.mainImageUrl} alt={listing.name} className={styles.photo} />
        ) : (
          <div className={styles.placeholder} aria-hidden="true" />
        )}
      </div>

      <div className={styles.info}>
        <h1 className={styles.title}>{listing.name}</h1>

        <div className={styles.price}>
          <b>{formatMoneyVnd(listing.weekdayPrice)}</b>
          <span>/ngày</span>
          {listing.weekendPrice ? (
            <span className={styles.weekend}>Cuối tuần {formatMoneyVnd(listing.weekendPrice)}</span>
          ) : null}
        </div>

        <dl className={styles.specs}>
          {specs.map((s) => (
            <div key={s.label} className={styles.specRow}>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>

        <div className={styles.shop}>
          <div className={styles.shopName}>{listing.shopName}</div>
          {listing.shopProvince ? <div className={styles.shopMeta}>{listing.shopProvince}</div> : null}
          {listing.shopBio ? <p className={styles.shopBio}>{listing.shopBio}</p> : null}
        </div>

        <RequestBookingButton
          vehicleId={listing.id}
          vehicleName={listing.name}
          size="large"
          className={styles.cta}
        />

        {listing.description ? (
          <section className={styles.description}>
            <h2 className={styles.descTitle}>Mô tả</h2>
            <p>{listing.description}</p>
          </section>
        ) : null}
      </div>
    </div>
  );
}
