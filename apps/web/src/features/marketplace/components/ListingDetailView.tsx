import Link from 'next/link';
import {
  CATALOG_TYPE,
  COLLATERAL_ASSET_TYPE_LABEL,
  COLLATERAL_MODE,
  CUSTOMER_DOCUMENT_TYPE_LABEL,
  requiredIdentityDocuments,
  SERVICE_TYPE,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { RequestBookingButton } from '@/features/booking-requests/components/RequestBookingButton';
import { catalogLabel, type CatalogMap } from '@/features/catalog/types';
import { ChatWithShopButton } from '@/features/chat/components/ChatWithShopButton';
import { DiscountTag } from '@/components/data-display/DiscountTag';
import { EmbedMap } from '@/components/data-display/EmbedMap';
import { shopPath } from '@/constants/routes';
import { mapPlaceUrl, toGeoPoint } from '@/lib/map-embed';
import { applyDiscountPercent } from '@/lib/money';
import type { PublicListingDetail } from '../types';
import { ListingGallery } from './ListingGallery';
import { ListingReviews } from './ListingReviews';
import { ListingServiceSelector } from './ListingServiceSelector';
import { ListingSpecsCard } from './ListingSpecsCard';
import styles from './ListingDetailView.module.css';
import { getAppFormat } from '@/i18n/server-format';
import { getTranslations } from 'next-intl/server';
import { createDomainLabel } from '@/i18n/domain';

/** Trang chi tiết một xe trên Marketplace (server-render). Nút thuê là client island. */
export async function ListingDetailView({
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
  const [fmt, t, tCard, tDomain] = await Promise.all([
    getAppFormat(),
    getTranslations('Listings.detail'),
    getTranslations('Listings.card'),
    getTranslations('Domain'),
  ]);
  const domainLabel = createDomainLabel(tDomain as never);

  const brand = catalogLabel(catalog[CATALOG_TYPE.VEHICLE_BRAND], listing.brand);
  // Thẻ thông số 2 cột kèm icon (mockup đợt 4) — key để client island tra icon.
  const specs: Array<{ key: string; label: string; value: string }> = [
    {
      key: 'vehicleType',
      label: t('specs.vehicleType'),
      value: domainLabel('vehicleType', listing.vehicleType),
    },
    ...(listing.bodyType
      ? [
          {
            key: 'bodyType',
            label: t('specs.bodyType'),
            value: catalogLabel(catalog[CATALOG_TYPE.BODY_TYPE], listing.bodyType) ?? '',
          },
        ]
      : []),
    ...(listing.seatCount
      ? [
          {
            key: 'seatCount',
            label: t('specs.seats'),
            value: tCard('seats', { count: listing.seatCount }),
          },
        ]
      : []),
    ...(listing.fuelType
      ? [
          {
            key: 'fuelType',
            label: t('specs.fuelType'),
            value: catalogLabel(catalog[CATALOG_TYPE.FUEL_TYPE], listing.fuelType) ?? '',
          },
        ]
      : []),
    ...(listing.manufactureYear
      ? [
          {
            key: 'manufactureYear',
            label: t('specs.year'),
            value: String(listing.manufactureYear),
          },
        ]
      : []),
    ...(listing.color ? [{ key: 'color', label: t('specs.color'), value: listing.color }] : []),
    ...(brand
      ? [
          {
            key: 'brand',
            label: t('specs.brand'),
            value: [brand, listing.model].filter(Boolean).join(' '),
          },
        ]
      : []),
  ];

  /*
   * MỘT `activeService` cho cả trang (17/08) — selector, khối giá lớn và popup thuê cùng đọc:
   * dịch vụ từ URL nếu xe phục vụ được → ưu tiên tự lái → dịch vụ đầu tiên xe đăng.
   */
  const services: readonly string[] = listing.serviceTypes ?? [];
  const activeService =
    serviceType && services.includes(serviceType)
      ? serviceType
      : services.includes(SERVICE_TYPE.SELF_DRIVE)
        ? SERVICE_TYPE.SELF_DRIVE
        : (services[0] ?? SERVICE_TYPE.SELF_DRIVE);

  // Preview cùng công thức với PricingService; báo giá server vẫn là nguồn chốt.
  const discount = listing.discountPercent ?? 0;
  const displayPrice =
    discount > 0 ? applyDiscountPercent(listing.weekdayPrice, discount) : listing.weekdayPrice;

  return (
    <div className={styles.wrap}>
      {/*
       * Sticky gallery phải nằm trong RIÊNG khối đầu trang. Nếu đặt nó trực tiếp trong
       * `.wrap` cùng Mô tả/Đánh giá, biên sticky là toàn trang và ảnh sẽ đè lên
       * nội dung hàng dưới khi cuộn.
       */}
      <div className={styles.top}>
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

          {/* Xe nhiều dịch vụ → selector nổi bật ngay trên khối giá; giá lớn đổi theo. */}
          <ListingServiceSelector services={services} active={activeService} />

          {activeService === SERVICE_TYPE.LONG_TERM ? (
            <div className={styles.price}>
              {listing.monthlyPrice ? (
                <>
                  <div className={styles.priceMain}>
                    <b>{fmt.money(listing.monthlyPrice)}</b>
                    <span className={styles.priceUnit}>{tCard('perMonthUnit')}</span>
                  </div>
                </>
              ) : (
                <div className={styles.priceMain}>
                  <b className={styles.priceContact}>{t('longTermQuote')}</b>
                </div>
              )}
            </div>
          ) : activeService === SERVICE_TYPE.WITH_DRIVER ? (
            <div className={styles.price}>
              {listing.withDriverDailyPrice ? (
                <>
                  <div className={styles.priceMain}>
                    <b>{fmt.money(listing.withDriverDailyPrice)}</b>
                    <span className={styles.priceUnit}>{tCard('perDayUnit')}</span>
                  </div>
                </>
              ) : (
                <div className={styles.priceMain}>
                  <b className={styles.priceContact}>{t('withDriverQuote')}</b>
                </div>
              )}
            </div>
          ) : (
            <div className={styles.price}>
              <div className={styles.priceMain}>
                {discount > 0 && listing.weekdayPrice ? (
                  <>
                    <s className={styles.oldPrice}>{fmt.money(listing.weekdayPrice)}</s>
                    <DiscountTag percent={discount} />
                  </>
                ) : null}
                <b>{fmt.money(displayPrice)}</b>
                <span className={styles.priceUnit}>{tCard('perDayUnit')}</span>
              </div>
            </div>
          )}

          {listing.deliveryEnabled || listing.noCollateral ? (
            <div className={styles.amenities}>
              {listing.deliveryEnabled ? (
                <span className={styles.amenityBadge}>{t('delivery')}</span>
              ) : null}
              {listing.noCollateral ? (
                <span className={styles.amenityBadge}>{t('noCollateral')}</span>
              ) : null}
            </div>
          ) : null}

          {/*
            Điều kiện bảo đảm + giấy tờ phải mang theo — khách cần biết TRƯỚC khi gửi yêu cầu,
            không phải lúc đến quầy mới biết mình thiếu cà vẹt. Chỉ hiện khi gian hàng đã cấu
            hình chính sách; chưa có thì im lặng còn hơn hứa sai.
          */}
          {listing.collateral ? (
            <section className={styles.collateral} aria-label={t('collateralTitle')}>
              <h2 className={styles.collateralTitle}>{t('collateralTitle')}</h2>
              <p className={styles.collateralLine}>
                {listing.collateral.mode === COLLATERAL_MODE.CASH
                  ? t('collateralDeposit', { amount: fmt.money(listing.collateral.depositAmount) })
                  : listing.collateral.mode === COLLATERAL_MODE.ASSET
                    ? t('collateralAsset', {
                        types: listing.collateral.assetTypes
                          .map((type) =>
                            domainLabel(
                              'collateralAssetType',
                              type,
                              COLLATERAL_ASSET_TYPE_LABEL[type],
                            ),
                          )
                          .join(', '),
                      })
                    : t('collateralNone')}
              </p>
              <p className={styles.collateralLine}>
                {t('collateralDocuments', {
                  documents: requiredIdentityDocuments(activeService)
                    .map((doc) =>
                      domainLabel('customerDocumentType', doc, CUSTOMER_DOCUMENT_TYPE_LABEL[doc]),
                    )
                    .join(', '),
                })}
              </p>
            </section>
          ) : null}

          <ListingSpecsCard specs={specs} />

          {listing.features.length > 0 ? (
            <div className={styles.features}>
              {listing.features.map((key) => (
                <span key={key} className={styles.featureChip}>
                  {catalogLabel(catalog[CATALOG_TYPE.VEHICLE_FEATURE], key)}
                </span>
              ))}
            </div>
          ) : null}

          {/* Thẻ gian hàng theo mockup: avatar (logo hoặc chữ cái đầu) + tick vàng đã duyệt. */}
          <div className={styles.shop}>
            <span className={styles.shopAvatar} aria-hidden="true">
              {listing.shopLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo từ R2, host theo môi trường
                <img src={listing.shopLogoUrl} alt="" className={styles.shopAvatarImg} />
              ) : (
                listing.shopName.charAt(0).toUpperCase()
              )}
            </span>
            <div className={styles.shopBody}>
              <div className={styles.shopNameRow}>
                <Link href={shopPath.detail(listing.shopSlug)} className={styles.shopName}>
                  {listing.shopName}
                </Link>
                {/* Xe lên chợ đồng nghĩa gian hàng đã qua duyệt nền tảng — tick nói đúng điều đó. */}
                <span className={styles.verified} title={t('shopVerified')}>
                  ✓
                </span>
              </div>
              {listing.shopProvince ? (
                <div className={styles.shopMeta}>{listing.shopProvince}</div>
              ) : null}
              {listing.shopBio ? <p className={styles.shopBio}>{listing.shopBio}</p> : null}
            </div>
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
              // Cùng activeService với selector + khối giá — popup mở đúng dịch vụ đang xem.
              serviceType={activeService}
              routeType={routeType}
              size="large"
              className={styles.cta}
            />
            <ChatWithShopButton vehicleId={listing.id} size="large" />
          </div>
        </div>
      </div>

      {/* Hàng dưới theo mockup: Mô tả và Đánh giá là HAI THẺ full-width dưới khu ảnh + giá. */}
      <div className={styles.bottom}>
        <section id="description" className={styles.bottomCard}>
          <h2 className={styles.descTitle}>{t('description')}</h2>
          <p className={styles.descBody}>{listing.description || t('descriptionEmpty')}</p>
        </section>
        <section className={styles.bottomCard}>
          <ListingReviews vehicleId={listing.id} />
        </section>
        {/*
          Điểm nhận xe: địa chỉ là thông tin CHÍNH, bản đồ chỉ minh hoạ. Khối vẫn hiện đầy đủ khi
          chưa có toạ độ hoặc chưa cấu hình key nhúng — `EmbedMap` tự biến mất, phần chữ ở lại.
          Trải hết chiều ngang (`pickupCard`) để không đẻ ra một ô trống cạnh nó trong lưới 2 cột.
        */}
        {listing.pickupPoint ? (
          <section
            className={`${styles.bottomCard} ${styles.pickupCard}`}
            aria-labelledby="pickup-point-heading"
          >
            <h2 id="pickup-point-heading" className={styles.descTitle}>
              {t('pickupPoint.title')}
            </h2>
            <p className={styles.pickupAddress}>
              {[listing.pickupPoint.branchName, listing.pickupPoint.address]
                .filter(Boolean)
                .join(LIST_SEPARATOR)}
            </p>
            {listing.pickupPoint.provinceName ? (
              <p className={styles.pickupMeta}>{listing.pickupPoint.provinceName}</p>
            ) : null}
            <EmbedMap
              src={mapPlaceUrl(
                toGeoPoint(listing.pickupPoint.latitude, listing.pickupPoint.longitude),
              )}
              title={t('pickupPoint.mapTitle')}
              height={260}
            />
          </section>
        ) : null}
      </div>
    </div>
  );
}
