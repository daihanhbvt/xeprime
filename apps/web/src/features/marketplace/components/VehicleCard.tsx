'use client';

import {
  ArrowRightOutlined,
  CompassOutlined,
  ControlOutlined,
  HeartFilled,
  HeartOutlined,
  StarFilled,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { isNewListing } from '@xeprime/domain';
import { SERVICE_TYPE, VEHICLE_TYPE, transmissionFamily, type VehicleType } from '@xeprime/types';
import { listingPath, shopPath } from '@/constants/routes';
import { cx } from '@/lib/cx';
import { applyDiscountPercent } from '@/lib/money';
import { initialOf } from '@/lib/initials';
import { DiscountTag } from '@/components/data-display/DiscountTag';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import type { PublicListing } from '../types';
import styles from './VehicleCard.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useTranslations } from 'next-intl';

export interface VehicleCardProps {
  listing: PublicListing;
  variant?: 'grid' | 'list';
}

/**
 * Một thẻ xe trên marketplace — design v2 (Figma "Vehicle Card", ADR 0062).
 * Hỗ trợ 2 dạng:
 * - 'grid' (mặc định): dạng thẻ đứng 4 cột
 * - 'list': dạng thẻ ngang 1200x206px
 */
export function VehicleCard({ listing, variant = 'grid' }: VehicleCardProps) {
  const t = useTranslations('Listings.card');
  const tResults = useTranslations('Marketplace.results');
  const fmt = useAppFormat();

  const [isFavorite, setIsFavorite] = useState(false);
  const handleFavoriteToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFavorite((prev) => !prev);
  };

  const { filters } = useMarketplaceFilters();
  const { fuelTypeLabel, bodyTypeLabel } = useCatalogLabels();

  const serviceTypes: string[] = listing.serviceTypes ?? [];
  const serviceContext =
    filters.serviceType && serviceTypes.includes(filters.serviceType) ? filters.serviceType : null;
  const activeService =
    serviceContext ??
    (serviceTypes.includes(SERVICE_TYPE.SELF_DRIVE) ? SERVICE_TYPE.SELF_DRIVE : serviceTypes[0]);
  const fuel = fuelTypeLabel(listing.fuelType);
  const rating = Number(listing.ratingAvg);
  const hasRating = !isNewListing(listing);

  const isShopTrack = listing.shopVerified ?? false;
  const discount = listing.discountPercent ?? 0;

  const monthlyContext =
    activeService === SERVICE_TYPE.LONG_TERM && listing.monthlyPrice ? listing.monthlyPrice : null;
  const driverContext =
    activeService === SERVICE_TYPE.WITH_DRIVER && listing.withDriverDailyPrice
      ? listing.withDriverDailyPrice
      : null;
  const selfDriveContext = activeService === SERVICE_TYPE.SELF_DRIVE;
  const displayPrice = selfDriveContext
    ? discount > 0
      ? applyDiscountPercent(listing.weekdayPrice, discount)
      : listing.weekdayPrice
    : (monthlyContext ?? driverContext);
  const priceMessage = monthlyContext ? 'priceMonthly' : 'priceDaily';
  const showStrikethrough = selfDriveContext && discount > 0;

  const instantBook = Boolean(
    activeService && (listing.instantBookServiceTypes ?? []).some((type) => type === activeService),
  );

  const extraPhotos = Math.max(0, (listing.imageCount ?? 0) - 1);

  const location = listing.shopProvince
    ? listing.wardName
      ? t('locationLine', { ward: listing.wardName, province: listing.shopProvince })
      : listing.shopProvince
    : null;

  const compactPrice = (value: string) => fmt.moneyCompact(value, { price: true });

  const dateQs = new URLSearchParams();
  if (filters.provinceCode) dateQs.set('provinceCode', filters.provinceCode);
  if (filters.pickupAt) dateQs.set('pickupAt', filters.pickupAt);
  if (filters.returnAt) dateQs.set('returnAt', filters.returnAt);
  if (activeService) {
    dateQs.set('serviceType', activeService);
    if (activeService === SERVICE_TYPE.WITH_DRIVER && filters.routeType) {
      dateQs.set('routeType', filters.routeType);
    }
  }
  const detailHref = dateQs.toString()
    ? `${listingPath.detail(listing.id)}?${dateQs.toString()}`
    : listingPath.detail(listing.id);

  const amenities = [
    listing.deliveryEnabled ? t('delivery') : null,
    listing.noCollateral ? t('noCollateral') : null,
    listing.vatInvoiceSupported ? t('vatInvoice') : null,
  ].filter((label): label is string => label !== null);

  const specs = [
    listing.seatCount
      ? {
          key: 'seats',
          icon: '/home/card-seats.svg',
          width: 12,
          height: 11,
          label: t('seats', { count: listing.seatCount }),
        }
      : null,
    listing.transmission
      ? {
          key: 'transmission',
          icon: '/home/card-transmission.svg',
          width: 13,
          height: 13,
          label: t(`transmissionFamily.${transmissionFamily(listing.transmission)}`),
        }
      : null,
    fuel ? { key: 'fuel', icon: '/home/card-fuel.svg', width: 16, height: 16, label: fuel } : null,
  ].filter(
    (spec): spec is { key: string; icon: string; width: number; height: number; label: string } =>
      spec !== null,
  );

  // -------------------------
  // LIST VARIANT (Figma 1200x206 horizontal card)
  // -------------------------
  if (variant === 'list') {
    const bodyTypeName = listing.bodyType ? (bodyTypeLabel(listing.bodyType) ?? listing.bodyType) : null;
    const transmissionText = listing.transmission
      ? t(`transmissionFamily.${transmissionFamily(listing.transmission)}`)
      : 'Số tự động';

    return (
      <article className={styles.listCard}>
        <Link
          href={detailHref}
          className={styles.stretch}
          aria-label={t('viewDetail', { name: listing.name })}
        />

        <div className={styles.listMedia}>
          {listing.mainImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={listing.mainImageUrl}
              alt={listing.name}
              className={styles.listPhoto}
              loading="lazy"
            />
          ) : (
            <CarGlyph type={listing.vehicleType as VehicleType} />
          )}

          {extraPhotos > 0 ? (
            <span className={styles.photoCount}>
              <span className={styles.srOnly}>
                {t('photoCountAria', { count: listing.imageCount ?? 0 })}
              </span>
              <span className={styles.icon14}>
                <Image src="/home/card-photos.svg" alt="" width={11} height={11} unoptimized />
              </span>
              <span aria-hidden="true">{t('photoCount', { count: extraPhotos })}</span>
            </span>
          ) : null}
        </div>

        <div className={styles.listBody}>
          <div>
            <div className={styles.listTopRow}>
              <div className={styles.listTitleGroup}>
                <h3 className={styles.listTitle}>{listing.name}</h3>
                {showStrikethrough ? <DiscountTag percent={discount} variant="badge" /> : null}
                {instantBook ? (
                  <span className={styles.badgeInstantBlue}>{t('instantBook')}</span>
                ) : null}
                {!hasRating ? <span className={styles.badgeNewGreen}>{t('newVehicle')}</span> : null}
              </div>

              <div className={styles.listPriceAndRating}>
                {hasRating ? (
                  <span className={styles.listRating}>
                    <StarFilled className={styles.starIcon} aria-hidden />
                    <span>{fmt.rating(rating)}</span>
                    <span className={styles.listRatingCount}>({listing.ratingCount})</span>
                  </span>
                ) : null}

                <div className={styles.listPrice}>
                  {showStrikethrough && listing.weekdayPrice ? (
                    <s className={styles.listOldPrice}>{compactPrice(listing.weekdayPrice)}</s>
                  ) : null}
                  {displayPrice ? (
                    <>
                      <span className={styles.listCurrentPrice}>{compactPrice(displayPrice)}</span>
                      <span className={styles.priceUnit}>{t('perDayUnit')}</span>
                    </>
                  ) : (
                    <span className={styles.listCurrentPrice}>{t('contactForQuote')}</span>
                  )}
                </div>

                <button
                  type="button"
                  className={cx(styles.listFavoriteBtn, isFavorite && styles.heartActive)}
                  onClick={handleFavoriteToggle}
                  aria-label={t('save')}
                >
                  {isFavorite ? <HeartFilled /> : <HeartOutlined />}
                </button>
              </div>
            </div>

            {location ? (
              <p className={styles.listLocation}>
                <Image src="/home/card-location.svg" alt="" width={14} height={17} unoptimized />
                <span>{location}</span>
              </p>
            ) : null}

            <div className={styles.listSpecsRow}>
              <div className={styles.specBox}>
                <TeamOutlined className={styles.specBoxIcon} aria-hidden />
                <span>{t('seats', { count: listing.seatCount ?? 4 })}</span>
              </div>
              <div className={styles.specBox}>
                <ControlOutlined className={styles.specBoxIcon} aria-hidden />
                <span>{transmissionText}</span>
              </div>
              <div className={styles.specBox}>
                <ThunderboltOutlined className={styles.specBoxIcon} aria-hidden />
                <span>{fuel ?? 'Xăng'}</span>
              </div>
              <div className={styles.specBox}>
                <CompassOutlined className={styles.specBoxIcon} aria-hidden />
                <span>{bodyTypeName ?? '60 kwh/100km'}</span>
              </div>
            </div>
          </div>

          <div className={styles.listBottomRow}>
            <Link
              href={shopPath.detail(listing.shopSlug)}
              className={styles.listShopInfo}
              aria-label={
                isShopTrack ? t('shopVerifiedAria', { name: listing.shopName }) : listing.shopName
              }
            >
              <span
                className={cx(styles.shopAvatar, isShopTrack && styles.shopAvatarShop)}
                aria-hidden="true"
              >
                {listing.shopLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={listing.shopLogoUrl} alt="" loading="lazy" className={styles.shopLogo} />
                ) : (
                  initialOf(listing.shopName)
                )}
                {isShopTrack ? (
                  <span className={styles.shopMark}>
                    <Image src="/home/card-verified.svg" alt="" width={10} height={10} unoptimized />
                  </span>
                ) : null}
              </span>
              <span className={styles.shopCopy}>
                <span className={styles.shopCaption}>{t(isShopTrack ? 'shop' : 'owner')}</span>
                <span className={cx(styles.shopName, isShopTrack && styles.shopNameShop)}>
                  {listing.shopName}
                </span>
              </span>
            </Link>

            <div className={styles.listMetrics}>
              <div className={styles.metricItem}>
                <span>{tResults('responseRate')}</span>
                <span className={styles.metricVal}>100%</span>
              </div>
              <div className={styles.metricItem}>
                <span>{tResults('responseTime')}</span>
                <span className={styles.metricVal}>10 phút</span>
              </div>
              <div className={styles.metricItem}>
                <span>{tResults('acceptRate')}</span>
                <span className={styles.metricVal}>100%</span>
              </div>
            </div>

            <Link href={detailHref} className={styles.listDetailBtn}>
              <span>{tResults('viewDetail')}</span>
              <ArrowRightOutlined aria-hidden />
            </Link>
          </div>
        </div>
      </article>
    );
  }

  // -------------------------
  // GRID VARIANT (default 4-column vertical card)
  // -------------------------
  return (
    <article className={styles.card}>
      <Link
        href={detailHref}
        className={styles.stretch}
        aria-label={t('viewDetail', { name: listing.name })}
      />

      <div className={styles.media}>
        {listing.mainImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.mainImageUrl}
            alt={listing.name}
            className={styles.photo}
            loading="lazy"
          />
        ) : (
          <CarGlyph type={listing.vehicleType as VehicleType} />
        )}

        <div className={styles.badges}>
          {showStrikethrough ? <DiscountTag percent={discount} variant="badge" /> : null}
          {instantBook ? (
            <span className={cx(styles.badge, styles.badgeInstant)}>{t('instantBook')}</span>
          ) : null}
        </div>

        <span
          className={cx(styles.favoriteBtn, isFavorite && styles.heartActive)}
          onClick={handleFavoriteToggle}
          aria-hidden="true"
        >
          {isFavorite ? <HeartFilled /> : <HeartOutlined />}
        </span>

        {extraPhotos > 0 ? (
          <span className={styles.photoCount}>
            <span className={styles.srOnly}>
              {t('photoCountAria', { count: listing.imageCount ?? 0 })}
            </span>
            <span className={styles.icon14}>
              <Image src="/home/card-photos.svg" alt="" width={11} height={11} unoptimized />
            </span>
            <span aria-hidden="true">{t('photoCount', { count: extraPhotos })}</span>
          </span>
        ) : null}
      </div>

      <div className={styles.body}>
        <div className={styles.info}>
          <div className={styles.nameRow}>
            <h3 className={styles.title}>{listing.name}</h3>
            {!hasRating ? <span className={styles.newBadge}>{t('newVehicle')}</span> : null}
          </div>
          {location ? (
            <p className={styles.location}>
              <span className={styles.icon20}>
                <Image src="/home/card-location.svg" alt="" width={15} height={19} unoptimized />
              </span>
              <span className={styles.locationText}>{location}</span>
            </p>
          ) : null}
          {amenities.length > 0 ? (
            <div className={styles.amenityRow}>
              {amenities.map((label) => (
                <span key={label} className={styles.amenityTag}>
                  {label}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {specs.length > 0 ? (
          <ul className={styles.specs} aria-label={t('specsLabel')}>
            {specs.map((spec) => (
              <li key={spec.key} className={styles.spec}>
                <span className={styles.icon16}>
                  <Image
                    src={spec.icon}
                    alt=""
                    width={spec.width}
                    height={spec.height}
                    unoptimized
                  />
                </span>
                <span>{spec.label}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <Link
          href={shopPath.detail(listing.shopSlug)}
          className={styles.shop}
          title={listing.shopName}
          aria-label={
            isShopTrack ? t('shopVerifiedAria', { name: listing.shopName }) : listing.shopName
          }
        >
          <span
            className={cx(styles.shopAvatar, isShopTrack && styles.shopAvatarShop)}
            aria-hidden="true"
          >
            {listing.shopLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={listing.shopLogoUrl} alt="" loading="lazy" className={styles.shopLogo} />
            ) : (
              initialOf(listing.shopName)
            )}
            {isShopTrack ? (
              <span className={styles.shopMark}>
                <Image src="/home/card-verified.svg" alt="" width={10} height={10} unoptimized />
              </span>
            ) : null}
          </span>
          <span className={styles.shopCopy}>
            <span className={styles.shopCaption}>{t(isShopTrack ? 'shop' : 'owner')}</span>
            <span className={cx(styles.shopName, isShopTrack && styles.shopNameShop)}>
              {listing.shopName}
            </span>
          </span>
        </Link>

        <div className={styles.footer}>
          {hasRating ? (
            <span
              className={styles.rating}
              title={t('ratingCount', { count: listing.ratingCount })}
            >
              <Image src="/home/star-16.svg" alt="" width={16} height={16} unoptimized />
              <span>
                {t.rich('ratingValue', {
                  rating: fmt.rating(rating),
                  count: listing.ratingCount,
                  muted: (chunks) => <span className={styles.ratingCount}>{chunks}</span>,
                })}
              </span>
            </span>
          ) : (
            <span />
          )}

          <div className={styles.price}>
            {displayPrice ? (
              <>
                {showStrikethrough && listing.weekdayPrice ? (
                  <s className={styles.oldPrice}>{compactPrice(listing.weekdayPrice)}</s>
                ) : null}
                <span className={styles.currentPrice}>
                  {t.rich(priceMessage, {
                    value: compactPrice(displayPrice),
                    amount: (chunks) => <b>{chunks}</b>,
                    unit: (chunks) => <span>{chunks}</span>,
                  })}
                </span>
                {driverContext ? (
                  <span className={styles.priceNote}>{t('includesDriver')}</span>
                ) : null}
              </>
            ) : (
              <b className={styles.priceContact}>{t('contactForQuote')}</b>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/** Xe chưa có ảnh — hình minh hoạ theo loại xe. Liên kết của thẻ đã mang tên xe nên glyph câm. */
function CarGlyph({ type }: { type: VehicleType }) {
  return (
    <span className={styles.glyph} aria-hidden="true">
      {type === VEHICLE_TYPE.MOTORBIKE ? (
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4">
          <circle cx="11" cy="34" r="6" />
          <circle cx="37" cy="34" r="6" />
          <path
            d="M11 34l7-12h9l4 6h6M18 22l-3-6h-5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
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
