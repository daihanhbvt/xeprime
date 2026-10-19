import {
  CATALOG_TYPE,
  SERVICE_TYPE,
} from '@xeprime/types';
import { LIST_SEPARATOR, mapExternalUrl, toGeoPoint } from '@xeprime/domain';
import { catalogLabel, type CatalogMap } from '@/features/catalog/types';
import { MapLink } from '@/components/data-display/MapLink';
import { StaticMapImage } from '@/components/data-display/StaticMapImage';
import { ShopQuickInfoCard } from '@/components/shop/ShopQuickInfoCard';
import { ListingHeaderActions } from './ListingHeaderActions';
import { ListingDescription } from './ListingDescription';
import { VehicleFeatureIcon } from './VehicleFeatureIcons';
import Link from 'next/link';
import { ROUTES } from '@/constants/routes';
import { pickupMapSrc } from '../api';
import type { PublicListingDetail } from '../types';
import { ListingGallery } from './ListingGallery';
import { ListingReviews } from './ListingReviews';
import { ListingSpecsCard } from './ListingSpecsCard';
import { ListingBenefitsCard } from './ListingBenefitsCard';
import { ListingBookingCard } from './ListingBookingCard';
import { ListingPoliciesTabs } from './ListingPoliciesTabs';
import styles from './ListingDetailView.module.css';
import { getAppFormat } from '@/i18n/server-format';
import { getTranslations } from 'next-intl/server';
import { createDomainLabel } from '@/i18n/domain';

/**
 * Trang chi tiết một xe trên Marketplace theo chuẩn Figma v2 (node 19707:83357).
 * - Layout 1200px.
 * - Đầu trang: Breadcrumb và Gallery 1200x309 (ảnh chính 650px + 4 ảnh nhỏ, có overlay +N).
 * - Lưới 2 cột: Cột trái (728px) chi tiết xe, Cột phải (440px sticky) lợi ích + thẻ đặt xe & báo giá.
 */
export async function ListingDetailView({
  listing,
  catalog,
  pickupAt,
  returnAt,
  serviceType,
  routeType,
  searchProvinceCode,
}: {
  listing: PublicListingDetail;
  /** Danh mục lọc — trang server không gọi được `useCatalog`, page truyền xuống. */
  catalog: CatalogMap;
  pickupAt?: string;
  returnAt?: string;
  /** Ngữ cảnh dịch vụ/lộ trình từ tab tìm kiếm — prefill luồng đặt. */
  serviceType?: string;
  routeType?: string;
  /** Tỉnh đang lọc ở trang tìm xe — prefill ô địa chỉ giao xe của luồng đặt (ADR 0035). */
  searchProvinceCode?: string;
}) {
  const [fmt, t, tCard, tDomain, tAddress] = await Promise.all([
    getAppFormat(),
    getTranslations('Listings.detail'),
    getTranslations('Listings.card'),
    getTranslations('Domain'),
    getTranslations('Address'),
  ]);
  const domainLabel = createDomainLabel(tDomain as never);
  const pickupGeo = listing.pickupPoint
    ? toGeoPoint(listing.pickupPoint.latitude, listing.pickupPoint.longitude)
    : null;

  const brand = catalogLabel(catalog[CATALOG_TYPE.VEHICLE_BRAND], listing.brand);

  // 4 thông số tiêu biểu dạng card icon 48px theo Figma v2
  const specs = [
    {
      key: 'seatCount',
      label: t('specs.seats'),
      value: listing.seatCount ? tCard('seats', { count: listing.seatCount }) : '5 chỗ',
    },
    {
      key: 'bodyType',
      label: t('specs.bodyType'),
      value: (listing.bodyType && catalogLabel(catalog[CATALOG_TYPE.BODY_TYPE], listing.bodyType)) || 'Tự động',
    },
    {
      key: 'fuelType',
      label: t('specs.fuelType'),
      value: (listing.fuelType && catalogLabel(catalog[CATALOG_TYPE.FUEL_TYPE], listing.fuelType)) || 'Xăng',
    },
    {
      key: 'manufactureYear',
      label: t('specs.year'),
      value: listing.manufactureYear ? String(listing.manufactureYear) : '2023',
    },
  ];

  const services: readonly string[] = listing.serviceTypes ?? [];
  const activeService =
    serviceType && services.includes(serviceType)
      ? serviceType
      : services.includes(SERVICE_TYPE.SELF_DRIVE)
        ? SERVICE_TYPE.SELF_DRIVE
        : (services[0] ?? SERVICE_TYPE.SELF_DRIVE);

  return (
    <div className={styles.wrap}>
      {/* 1. Breadcrumb điều hướng */}
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link href={ROUTES.HOME}>Trang chủ</Link>
        <span>/</span>
        <Link href={ROUTES.SEARCH}>Thuê xe</Link>
        <span>/</span>
        <span className={styles.breadcrumbCurrent}>Chi tiết xe</span>
      </nav>

      {/* 2. Gallery 5 ảnh chuẩn Figma v2 (1200 × 309px) */}
      <ListingGallery
        name={listing.name}
        mainImageUrl={listing.mainImageUrl}
        images={listing.images}
      />

      {/* 3. Lưới 2 cột chính: Cột trái 728px, Cột phải 440px sticky */}
      <div className={styles.layout}>
        {/* CỘT TRÁI (728px) */}
        <div className={styles.leftCol}>
          {/* Tiêu đề & metadata xe */}
          <div className={styles.headerBlock}>
            <div className={styles.titleRow}>
              <div className={styles.titleWithBadge}>
                <h1 className={styles.title}>{listing.name}</h1>
                <span className={styles.badgeNew}>Xe mới</span>
                {listing.vatInvoiceSupported ? (
                  <span className={styles.amenityBadge}>{t('vatInvoice.badge')}</span>
                ) : null}
              </div>
              <ListingHeaderActions />
            </div>

            <div className={styles.locationRow}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#717680" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={styles.locationPinIcon}>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>
                {[listing.pickupPoint?.address, listing.pickupPoint?.provinceName || listing.shopProvince]
                  .filter(Boolean)
                  .join(', ') || '153-155-157 Đường Trần Quốc Thảo, Phường 9, Quận 3, Thành Phố Hồ Chí Minh'}
              </span>
            </div>
            <hr className={styles.headerDivider} />
          </div>

          {/* 4 thông số icon 44px dạng hàng ngang */}
          <ListingSpecsCard specs={specs} />

          {/* Mô tả xe với tính năng xem tiếp / thu gọn khi > 3 dòng */}
          <ListingDescription
            title={t('description')}
            description={listing.description ?? null}
            emptyText={t('descriptionEmpty')}
          />

          {/* Tiện ích trên xe (features) */}
          {listing.features && listing.features.length > 0 ? (
            <section className={styles.sectionCard} aria-labelledby="features-heading">
              <h2 id="features-heading" className={styles.sectionTitle}>Tiện ích trên xe</h2>
              <div className={styles.featuresGrid}>
                {listing.features.map((key) => {
                  const label = catalogLabel(catalog[CATALOG_TYPE.VEHICLE_FEATURE], key) || key;
                  return (
                    <div key={key} className={styles.featureItem}>
                      <VehicleFeatureIcon name={label} className={styles.featureIcon} />
                      <span className={styles.featureLabel}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* Thẻ gian hàng / chủ xe với 3 chỉ số uy tín inline (ADR 0045) */}
          <section className={styles.sectionCard} aria-labelledby="host-heading">
            <h2 id="host-heading" className={styles.sectionTitle}>Chủ xe</h2>
            <ShopQuickInfoCard
              shop={{
                name: listing.shopName,
                slug: listing.shopSlug,
                logoUrl: listing.shopLogoUrl,
                verified: listing.shopVerified,
                province: listing.shopProvince,
                bio: listing.shopBio,
                ratingAvg: listing.shopRatingAvg,
                ratingCount: listing.shopRatingCount,
                completedTripCount: listing.shopCompletedTripCount,
              }}
              metrics={listing.shopMetrics}
              variant="inline"
            />
          </section>

          {/* Điểm nhận xe & Bản đồ tĩnh */}
          {listing.pickupPoint ? (
            <section className={styles.sectionCard} aria-labelledby="pickup-point-heading">
              <div className={styles.sectionHeaderRow}>
                <h2 id="pickup-point-heading" className={styles.sectionTitle}>
                  Vị trí xe
                </h2>
                {pickupGeo ? (
                  <a
                    href={mapExternalUrl(pickupGeo)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.openMapLink}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={styles.mapIcon}>
                      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
                      <line x1="9" y1="3" x2="9" y2="18" />
                      <line x1="15" y1="6" x2="15" y2="21" />
                    </svg>
                    <span>Mở bản đồ</span>
                  </a>
                ) : null}
              </div>
              <p className={styles.pickupAddress}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#717680" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.addressPinIcon}>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {[listing.pickupPoint.branchName, listing.pickupPoint.address, listing.pickupPoint.provinceName]
                  .filter(Boolean)
                  .join(LIST_SEPARATOR)}
              </p>
              {pickupGeo ? (
                <StaticMapImage
                  src={pickupMapSrc(listing.id, pickupGeo, listing.pickupPoint.address)}
                  alt={t('pickupPoint.mapTitle')}
                  className={styles.pickupMap}
                />
              ) : null}
            </section>
          ) : null}

          {/* Quy định & Chính sách dạng tab theo Figma v2 (node 19707:83494) */}
          <ListingPoliciesTabs listing={listing} activeService={activeService} />

          {/* Đánh giá xe */}
          <section className={styles.sectionCard}>
            <ListingReviews vehicleId={listing.id} />
          </section>
        </div>

        {/* CỘT PHẢI (440px sticky) */}
        <aside className={styles.rightCol}>
          {/* Thẻ 1: Lợi ích tự phục vụ theo Figma v2 (node 19707:83510) */}
          <ListingBenefitsCard />

          {/* Thẻ 2: Đặt xe & Báo giá chi tiết theo Figma v2 (node 19707:84080) */}
          <ListingBookingCard
            listing={listing}
            activeService={activeService}
            pickupAt={pickupAt}
            returnAt={returnAt}
            routeType={routeType}
            searchProvinceCode={searchProvinceCode}
          />
        </aside>
      </div>
    </div>
  );
}
