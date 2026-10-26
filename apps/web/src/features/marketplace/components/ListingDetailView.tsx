import { CATALOG_TYPE, SERVICE_TYPE } from '@xeprime/types';
import { LIST_SEPARATOR, isNewListing, mapExternalUrl, toGeoPoint } from '@xeprime/domain';
import { catalogLabel, type CatalogMap } from '@/features/catalog/types';
import { StaticMapImage } from '@/components/data-display/StaticMapImage';
import { PageBreadcrumb } from '@/components/navigation/PageBreadcrumb';
import { ShopQuickInfoCard } from '@/components/shop/ShopQuickInfoCard';
import { ListingHeaderActions } from './ListingHeaderActions';
import { ListingDescription, type ListingAttribute } from './ListingDescription';
import { VehicleFeatureIcon } from './VehicleFeatureIcons';
import { ROUTES } from '@/constants/routes';
import { cx } from '@/lib/cx';
import { pickupMapSrc } from '../api';
import { marketplaceSearchHref } from '../filter-params';
import type { PublicListingDetail } from '../types';
import { ListingGallery } from './ListingGallery';
import { ListingReviews } from './ListingReviews';
import { ListingSpecsCard, type ListingSpecItem } from './ListingSpecsCard';
import { ListingBenefitsCard } from './ListingBenefitsCard';
import { ListingBookingCard } from './ListingBookingCard';
import { ListingPoliciesTabs } from './ListingPoliciesTabs';
import styles from './ListingDetailView.module.css';
import { getTranslations } from 'next-intl/server';

/**
 * Trang chi tiết một xe trên Marketplace theo chuẩn Figma v2.
 *
 * PC (node `19707:83357`) — khung 1200px:
 * - Đầu trang: đường dẫn và gallery 1200×309 (ảnh chính 650px + 4 ảnh nhỏ, có overlay +N).
 * - Lưới 2 cột: cột trái (728px) chi tiết xe, cột phải (440px sticky) lợi ích + thẻ đặt xe & báo giá.
 *
 * Mobile (node `19771:71482`, khung 390) — MỘT cột, cùng các khối nhưng xếp theo việc khách làm:
 * thanh "quay lại + đường dẫn" → ảnh trượt có chấm → tên + vị trí + thông số → "Tự nhận xe" → thẻ
 * đặt xe + thành tiền (tràn mép) → mô tả → tiện ích → vị trí xe → chủ xe → điều khoản, đánh giá.
 * Thứ tự đó dựng bằng `order` trên CÙNG một cây (cột tan ra bằng `display: contents`), không có cây
 * riêng cho mobile. Dưới 1024px (một cột) đã áp thứ tự này, để thẻ đặt xe không bị đẩy xuống cuối.
 * Đánh đổi có chủ đích: thứ tự Tab/trình đọc màn hình vẫn là thứ tự DOM (thứ tự đọc của PC) — một
 * cây thứ hai cho mobile sẽ nhân đôi thẻ đặt xe và mọi state của nó.
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
  const [t, tCard] = await Promise.all([
    getTranslations('Listings.detail'),
    getTranslations('Listings.card'),
  ]);
  const pickupGeo = listing.pickupPoint
    ? toGeoPoint(listing.pickupPoint.latitude, listing.pickupPoint.longitude)
    : null;

  /*
   * Quay lại = trang kết quả mang lại ngữ cảnh tìm kiếm khách vừa dùng (lịch, dịch vụ, tỉnh) —
   * một đường dẫn thật, không phải `router.back()`: vào thẳng từ link chia sẻ vẫn về đúng chỗ.
   */
  const searchHref = marketplaceSearchHref({
    pickupAt,
    returnAt,
    serviceType,
    routeType,
    provinceCode: searchProvinceCode,
  });

  /*
   * 4 thông số tiêu biểu dạng icon tròn. Thông số xe chưa khai thì BỎ, không điền một giá trị mẫu:
   * "5 chỗ · Xăng" cho một chiếc xe không ai khai là thông tin sai trên trang người ta quyết thuê.
   */
  const specs: ListingSpecItem[] = [
    {
      key: 'seatCount',
      label: t('specs.seats'),
      value: listing.seatCount ? tCard('seats', { count: listing.seatCount }) : null,
    },
    {
      key: 'bodyType',
      label: t('specs.bodyType'),
      value: listing.bodyType
        ? catalogLabel(catalog[CATALOG_TYPE.BODY_TYPE], listing.bodyType)
        : null,
    },
    {
      key: 'fuelType',
      label: t('specs.fuelType'),
      value: listing.fuelType
        ? catalogLabel(catalog[CATALOG_TYPE.FUEL_TYPE], listing.fuelType)
        : null,
    },
    {
      key: 'manufactureYear',
      label: t('specs.year'),
      value: listing.manufactureYear ? String(listing.manufactureYear) : null,
    },
  ].filter((spec): spec is ListingSpecItem => Boolean(spec.value));

  // Hãng + màu đầu khối mô tả (Figma mobile `19771:72580`) — thiếu cái nào thì bỏ cái đó.
  const brandLabel = listing.brand
    ? catalogLabel(catalog[CATALOG_TYPE.VEHICLE_BRAND], listing.brand)
    : null;
  const colorLabel = listing.color?.trim() || null;
  const attributes: ListingAttribute[] = [
    ...(brandLabel ? [{ key: 'brand' as const, value: brandLabel }] : []),
    ...(colorLabel ? [{ key: 'color' as const, value: colorLabel }] : []),
  ];

  const locationLine = [
    listing.pickupPoint?.address,
    listing.pickupPoint?.provinceName || listing.shopProvince,
  ]
    .filter(Boolean)
    .join(', ');

  const services: readonly string[] = listing.serviceTypes ?? [];
  const activeService =
    serviceType && services.includes(serviceType)
      ? serviceType
      : services.includes(SERVICE_TYPE.SELF_DRIVE)
        ? SERVICE_TYPE.SELF_DRIVE
        : (services[0] ?? SERVICE_TYPE.SELF_DRIVE);

  return (
    <div className={styles.wrap}>
      {/* 1. Đường dẫn — mobile là thanh trắng có nút quay lại (Figma `19771:72104`) */}
      <PageBreadcrumb
        ariaLabel={t('breadcrumb.label')}
        className={styles.breadcrumb}
        back={{ href: searchHref, label: t('breadcrumb.back'), mobileOnly: true }}
        crumbs={[
          { key: 'home', label: t('breadcrumb.home'), href: ROUTES.HOME },
          { key: 'search', label: t('breadcrumb.search'), href: searchHref, hideOnMobile: true },
          { key: 'current', label: t('breadcrumb.current') },
        ]}
      />

      {/* 2. Gallery 5 ảnh (PC 1200 × 309px) — mobile là ảnh trượt có chấm */}
      <ListingGallery
        name={listing.name}
        mainImageUrl={listing.mainImageUrl}
        images={listing.images}
      />

      {/* 3. Lưới 2 cột chính: Cột trái 728px, Cột phải 440px sticky */}
      <div className={styles.layout}>
        {/* CỘT TRÁI (728px) */}
        <div className={styles.leftCol}>
          {/* Tiêu đề, vị trí và thông số — luôn đứng đầu */}
          <div className={styles.intro}>
            <div className={styles.headerBlock}>
              <div className={styles.titleRow}>
                <div className={styles.titleWithBadge}>
                  <h1 className={styles.title}>{listing.name}</h1>
                  {/* Cùng luật với thẻ xe ở trang kết quả: chưa có đánh giá nào là xe mới lên sàn. */}
                  {isNewListing(listing) ? (
                    <span className={styles.badgeNew}>{tCard('newVehicle')}</span>
                  ) : null}
                  {listing.vatInvoiceSupported ? (
                    <span className={styles.amenityBadge}>{t('vatInvoice.badge')}</span>
                  ) : null}
                </div>
                <ListingHeaderActions vehicleId={listing.id} vehicleName={listing.name} />
              </div>

              {locationLine ? (
                <div className={styles.locationRow}>
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={styles.locationPinIcon}
                    aria-hidden="true"
                  >
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span>{locationLine}</span>
                </div>
              ) : null}
            </div>

            {/* 4 thông số icon 48px dạng hàng ngang (mobile: lưới 2 × 2) */}
            {specs.length > 0 ? <ListingSpecsCard specs={specs} /> : null}
          </div>

          {/* Mô tả xe với tính năng xem tiếp / thu gọn khi > 3 dòng */}
          <ListingDescription
            title={t('description')}
            description={listing.description ?? null}
            emptyText={t('descriptionEmpty')}
            attributes={attributes}
            className={styles.descriptionSection}
          />

          {/* Tiện ích trên xe (features) */}
          {listing.features && listing.features.length > 0 ? (
            <section
              className={cx(styles.sectionCard, styles.featuresSection)}
              aria-labelledby="features-heading"
            >
              <h2 id="features-heading" className={styles.sectionTitle}>
                {t('featuresTitle')}
              </h2>
              <div className={styles.featuresGrid}>
                {listing.features.map((key) => {
                  const label = catalogLabel(catalog[CATALOG_TYPE.VEHICLE_FEATURE], key) || key;
                  return (
                    <div key={key} className={styles.featureItem}>
                      <VehicleFeatureIcon featureKey={key} className={styles.featureIcon} />
                      <span className={styles.featureLabel}>{label}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* Thẻ gian hàng / chủ xe với 3 chỉ số uy tín inline (ADR 0045) */}
          <section
            className={cx(styles.sectionCard, styles.hostSection)}
            aria-labelledby="host-heading"
          >
            <h2 id="host-heading" className={styles.sectionTitle}>
              {t('hostTitle')}
            </h2>
            {/*
              Khung thẻ "Chủ xe" (viền vàng, nền vàng nhạt — Figma `19707:83457`) do lớp bọc này vẽ:
              biến thể `inline` của thẻ dùng chung để nền/viền trong suốt ở PC. Ở mobile thẻ tự vẽ
              khung riêng (`ShopQuickInfoCard.module.css`) nên lớp bọc nhường lại, không viền đôi.
            */}
            <div className={styles.hostCard}>
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
            </div>
          </section>

          {/* Điểm nhận xe & Bản đồ tĩnh */}
          {listing.pickupPoint ? (
            <section
              className={cx(styles.sectionCard, styles.locationSection)}
              aria-labelledby="pickup-point-heading"
            >
              <div className={styles.sectionHeaderRow}>
                <h2 id="pickup-point-heading" className={styles.sectionTitle}>
                  {t('location.title')}
                </h2>
                {pickupGeo ? (
                  <a
                    href={mapExternalUrl(pickupGeo)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.openMapLink}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={styles.mapIcon}
                      aria-hidden="true"
                    >
                      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
                      <line x1="9" y1="3" x2="9" y2="18" />
                      <line x1="15" y1="6" x2="15" y2="21" />
                    </svg>
                    <span>{t('location.openMap')}</span>
                  </a>
                ) : null}
              </div>
              <p className={styles.pickupAddress}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={styles.addressPinIcon}
                  aria-hidden="true"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {[
                  listing.pickupPoint.branchName,
                  listing.pickupPoint.address,
                  listing.pickupPoint.provinceName,
                ]
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
          <div className={styles.policiesSection}>
            <ListingPoliciesTabs listing={listing} activeService={activeService} />
          </div>

          {/* Đánh giá xe */}
          <section className={cx(styles.sectionCard, styles.reviewsSection)}>
            <ListingReviews vehicleId={listing.id} />
          </section>
        </div>

        {/* CỘT PHẢI (440px sticky) — một cột thì đứng ngay sau tên + thông số */}
        <aside className={styles.rightCol}>
          {/* Thẻ 1: Lợi ích tự phục vụ theo Figma v2 (node 19707:83510) */}
          <ListingBenefitsCard listing={listing} activeService={activeService} />

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
