import Link from 'next/link';
import { CATALOG_TYPE, VEHICLE_TYPE, serviceTypesLabel } from '@xeprime/types';
import { RequestBookingButton } from '@/features/booking-requests/components/RequestBookingButton';
import { catalogLabel, type CatalogMap } from '@/features/catalog/types';
import { ChatWithShopButton } from '@/features/chat/components/ChatWithShopButton';
import { shopPath } from '@/constants/routes';
import { applyDiscountPercent, formatMoneyVnd } from '@/lib/money';
import type { PublicListingDetail } from '../types';
import { ListingGallery } from './ListingGallery';
import { ListingReviews } from './ListingReviews';
import styles from './ListingDetailView.module.css';

function vehicleTypeLabel(type: string): string {
  return type === VEHICLE_TYPE.MOTORBIKE ? 'Xe máy' : 'Ô tô';
}

/** Trang chi tiết một xe trên Marketplace (server-render). Nút thuê là client island. */
export function ListingDetailView({
  listing,
  catalog,
  pickupAt,
  returnAt,
  serviceType,
  routeType,
}: {
  listing: PublicListingDetail;
  /** Danh mục lọc — trang server không gọi được `useCatalog`, page truyền xuống. */
  catalog: CatalogMap;
  pickupAt?: string;
  returnAt?: string;
  /** Ngữ cảnh dịch vụ/lộ trình từ tab tìm kiếm — prefill luồng đặt (17/08). */
  serviceType?: string;
  routeType?: string;
}) {
  const brand = catalogLabel(catalog[CATALOG_TYPE.VEHICLE_BRAND], listing.brand);
  const specs: Array<{ label: string; value: string }> = [
    { label: 'Loại xe', value: vehicleTypeLabel(listing.vehicleType) },
    // Mảng dịch vụ (17/08) — "Tự lái · Có tài xế · Thuê dài hạn".
    { label: 'Dịch vụ', value: serviceTypesLabel(listing.serviceTypes ?? []) },
    ...(listing.bodyType
      ? [
          {
            label: 'Kiểu dáng',
            value: catalogLabel(catalog[CATALOG_TYPE.BODY_TYPE], listing.bodyType) ?? '',
          },
        ]
      : []),
    ...(listing.seatCount ? [{ label: 'Số chỗ', value: `${listing.seatCount} chỗ` }] : []),
    ...(listing.fuelType
      ? [
          {
            label: 'Nguồn năng lượng',
            value: catalogLabel(catalog[CATALOG_TYPE.FUEL_TYPE], listing.fuelType) ?? '',
          },
        ]
      : []),
    ...(listing.manufactureYear
      ? [{ label: 'Đời xe', value: String(listing.manufactureYear) }]
      : []),
    ...(listing.color ? [{ label: 'Màu', value: listing.color }] : []),
    ...(brand ? [{ label: 'Hãng', value: [brand, listing.model].filter(Boolean).join(' ') }] : []),
  ];

  // Giá sau giảm chỉ để HIỂN THỊ (marketing) — giá chốt thật do shop quyết khi duyệt yêu cầu.
  const discount = listing.discountPercent ?? 0;
  const displayPrice =
    discount > 0 ? applyDiscountPercent(listing.weekdayPrice, discount) : listing.weekdayPrice;

  return (
    <div className={styles.wrap}>
      <div className={styles.media}>
        {/* Client island: bấm ảnh nào cũng mở trình xem toàn màn hình chung (đếm x/y). */}
        <ListingGallery
          name={listing.name}
          mainImageUrl={listing.mainImageUrl}
          images={listing.images}
        />
      </div>

      <div className={styles.info}>
        <h1 className={styles.title}>{listing.name}</h1>

        <div className={styles.price}>
          {discount > 0 && listing.weekdayPrice ? (
            <>
              <s className={styles.oldPrice}>{formatMoneyVnd(listing.weekdayPrice)}</s>
              <span className={styles.discountTag}>-{discount}%</span>
            </>
          ) : null}
          <b>{formatMoneyVnd(displayPrice)}</b>
          <span>/ngày</span>
          {listing.weekendPrice ? (
            <span className={styles.weekend}>Cuối tuần {formatMoneyVnd(listing.weekendPrice)}</span>
          ) : null}
          {listing.hourlyPrice ? (
            <span className={styles.weekend}>
              Thuê giờ {formatMoneyVnd(listing.hourlyPrice)}/giờ
            </span>
          ) : null}
          {/* Giá theo dịch vụ (17/08) — tham chiếu; giá chốt do gian hàng xác nhận khi duyệt. */}
          {listing.monthlyPrice ? (
            <span className={styles.weekend}>
              Dài hạn {formatMoneyVnd(listing.monthlyPrice)}/tháng
            </span>
          ) : null}
          {listing.withDriverDailyPrice ? (
            <span className={styles.weekend}>
              Có tài xế {formatMoneyVnd(listing.withDriverDailyPrice)}/ngày
            </span>
          ) : null}
        </div>

        {listing.deliveryEnabled || listing.noCollateral ? (
          <div className={styles.amenities}>
            {listing.deliveryEnabled ? (
              <span className={styles.amenityBadge}>Giao xe tận nơi</span>
            ) : null}
            {listing.noCollateral ? (
              <span className={styles.amenityBadge}>Miễn thế chấp</span>
            ) : null}
          </div>
        ) : null}

        <dl className={styles.specs}>
          {specs.map((s) => (
            <div key={s.label} className={styles.specRow}>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </div>
          ))}
        </dl>

        {listing.features.length > 0 ? (
          <div className={styles.features}>
            {listing.features.map((key) => (
              <span key={key} className={styles.featureChip}>
                {catalogLabel(catalog[CATALOG_TYPE.VEHICLE_FEATURE], key)}
              </span>
            ))}
          </div>
        ) : null}

        <div className={styles.shop}>
          <Link href={shopPath.detail(listing.shopSlug)} className={styles.shopName}>
            {listing.shopName}
          </Link>
          {listing.shopProvince ? (
            <div className={styles.shopMeta}>{listing.shopProvince}</div>
          ) : null}
          {listing.shopBio ? <p className={styles.shopBio}>{listing.shopBio}</p> : null}
        </div>

        <div className={styles.actions}>
          {/* Trang này đã có hồ sơ xe đầy đủ — truyền xuống để overlay khỏi tải lại. */}
          <RequestBookingButton
            vehicleId={listing.id}
            vehicleName={listing.name}
            vehicleImageUrl={listing.mainImageUrl}
            listing={listing}
            pickupAt={pickupAt}
            returnAt={returnAt}
            serviceType={serviceType}
            routeType={routeType}
            size="large"
            className={styles.cta}
          />
          <ChatWithShopButton vehicleId={listing.id} size="large" />
        </div>

        {listing.description ? (
          <section className={styles.description}>
            <h2 className={styles.descTitle}>Mô tả</h2>
            <p>{listing.description}</p>
          </section>
        ) : null}

        <ListingReviews vehicleId={listing.id} />
      </div>
    </div>
  );
}
