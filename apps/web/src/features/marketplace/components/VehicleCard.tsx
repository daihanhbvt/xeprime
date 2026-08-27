'use client';

import {
  BarChartOutlined,
  DashboardOutlined,
  EnvironmentOutlined,
  HeartOutlined,
  StarFilled,
  TeamOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { SERVICE_TYPE, VEHICLE_TYPE, VEHICLE_TYPE_LABEL, type VehicleType } from '@xeprime/types';
import { listingPath, shopPath } from '@/constants/routes';
import { DiscountTag } from '@/components/data-display/DiscountTag';
import { applyDiscountPercent } from '@/lib/money';
import { initialOf } from '@/lib/initials';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import type { PublicListing } from '../types';
import styles from './VehicleCard.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useTranslations } from 'next-intl';
import { useDomainLabel } from '@/i18n/use-domain-label';

/**
 * Một thẻ xe trên marketplace. Chỉ hiển thị trường backend thật sự có — thiếu thì ẩn dòng đó.
 *
 * KHÔNG có nút thuê ở đây (Wave 11.1). Thẻ chỉ mang dữ liệu tóm tắt, trong khi quyết định thuê
 * cần giá theo ngày, chính sách cọc, điều kiện giao nhận và đánh giá — tức là trang chi tiết.
 * Mở thẳng luồng thuê từ một thẻ trong lưới là mời khách cam kết trước khi đọc.
 *
 * Cả thẻ là một liên kết tới trang chi tiết; CTA `Chọn thuê` sống ở đó.
 */
export function VehicleCard({ listing }: { listing: PublicListing }) {
  const t = useTranslations('Listings.card');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();

  const { filters } = useMarketplaceFilters();
  // Thẻ xe lưu key hãng/nhiên liệu — nhãn tra từ danh mục chung với bộ lọc bên cạnh.
  const { brandLabel, fuelTypeLabel } = useCatalogLabels();

  const typeLabel = domainLabel(
    'vehicleType',
    listing.vehicleType,
    VEHICLE_TYPE_LABEL[listing.vehicleType as VehicleType] ?? listing.vehicleType,
  );
  const brandLine = [brandLabel(listing.brand), listing.model].filter(Boolean).join(' ');
  const specs = brandLine || typeLabel;

  /*
   * MỘT `activeService` duy nhất cho cả thẻ (17/08) — badge, giá, đơn vị, ghi chú và link
   * chi tiết cùng đọc từ đây, không bao giờ badge nói một dịch vụ mà giá nói dịch vụ khác:
   *   1. dịch vụ đang lọc (nếu xe phục vụ được);
   *   2. không lọc → ưu tiên tự lái nếu xe hỗ trợ;
   *   3. xe không có tự lái → dịch vụ đầu tiên xe đăng.
   */
  const serviceTypes: string[] = listing.serviceTypes ?? [];
  const serviceContext =
    filters.serviceType && serviceTypes.includes(filters.serviceType) ? filters.serviceType : null;
  const activeService =
    serviceContext ??
    (serviceTypes.includes(SERVICE_TYPE.SELF_DRIVE) ? SERVICE_TYPE.SELF_DRIVE : serviceTypes[0]);
  const fuel = fuelTypeLabel(listing.fuelType);
  const rating = Number(listing.ratingAvg);
  const hasRating = listing.ratingCount > 0 && Number.isFinite(rating);
  const completedTripCount = listing.completedTripCount ?? 0;

  // Preview cùng công thức với PricingService; báo giá server vẫn là nguồn chốt.
  const discount = listing.discountPercent ?? 0;

  /*
   * Giá theo `activeService` (17/08):
   *   - dài hạn → giá tháng; CHƯA niêm yết → "Liên hệ báo giá" (không lấy giá tự lái trưng
   *     như giá dài hạn);
   *   - có tài xế → giá/ngày đã gồm tài xế; chưa niêm yết → "Liên hệ báo giá";
   *   - tự lái → giá ngày sau khuyến mãi (báo giá server cũng áp cùng mức giảm).
   */
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

  // Mang ngữ cảnh sang trang chi tiết để prefill luồng đặt xe: ngày giờ + dịch vụ đang active
  // + lộ trình có tài xế — card và detail không bao giờ nói hai dịch vụ khác nhau.
  const dateQs = new URLSearchParams();
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

  return (
    <article className={styles.card}>
      {/* Stretched-link: cả thẻ dẫn tới trang chi tiết, trừ các nút z-index cao hơn. */}
      <Link
        href={detailHref}
        className={styles.stretch}
        aria-label={t('viewDetail', { name: listing.name })}
      />

      <div className={styles.media}>
        {listing.mainImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- ảnh xe từ storage ngoài, chưa qua next/image
          <img
            src={listing.mainImageUrl}
            alt={listing.name}
            className={styles.photo}
            loading="lazy"
          />
        ) : (
          <CarGlyph type={listing.vehicleType as VehicleType} />
        )}
        {discount > 0 ? <DiscountTag percent={discount} className={styles.discountBadge} /> : null}
        <button className={styles.fav} type="button" aria-label={t('save')}>
          <HeartOutlined />
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.heading}>
          <h3 className={styles.title}>{listing.name}</h3>
          <p className={styles.specs}>{specs}</p>
        </div>

        <div className={styles.metaRow}>
          {listing.shopProvince ? (
            <span className={styles.metaItem}>
              <EnvironmentOutlined /> {listing.shopProvince}
            </span>
          ) : null}
          {fuel ? (
            <span className={styles.metaItem}>
              <DashboardOutlined /> {fuel}
            </span>
          ) : null}
          {listing.seatCount ? (
            <span className={styles.metaItem}>
              <TeamOutlined /> {t('seats', { count: listing.seatCount })}
            </span>
          ) : null}
        </div>

        <div className={styles.amenityRow}>
          {listing.deliveryEnabled ? (
            <span className={styles.amenityTag}>{t('delivery')}</span>
          ) : null}
          {listing.noCollateral ? (
            <span className={styles.amenityTag}>{t('noCollateral')}</span>
          ) : null}
        </div>

        <div className={styles.reputationRow}>
          {hasRating ? (
            <span
              className={styles.rating}
              title={t('ratingCount', { count: listing.ratingCount })}
            >
              <StarFilled className={styles.star} /> {fmt.rating(rating)}
            </span>
          ) : (
            <span className={styles.newVehicle}>{t('newVehicle')}</span>
          )}
          <span className={styles.reputationDivider} aria-hidden="true" />
          <span className={styles.tripCount}>
            <BarChartOutlined /> {t('completedTrips', { count: completedTripCount })}
          </span>
        </div>

        <div className={styles.footer}>
          <Link
            href={shopPath.detail(listing.shopSlug)}
            className={styles.shop}
            title={listing.shopName}
            aria-label={listing.shopName}
          >
            <span className={styles.shopAvatar} aria-hidden="true">
              {listing.shopLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo gian hàng từ storage ngoài
                <img src={listing.shopLogoUrl} alt="" loading="lazy" />
              ) : (
                initialOf(listing.shopName)
              )}
            </span>
            <span className={styles.shopCopy}>
              <span className={styles.shopCaption}>{t('owner')}</span>
              <span className={styles.shopName}>{listing.shopName}</span>
            </span>
          </Link>

          <div className={styles.price}>
            {displayPrice ? (
              <>
                {showStrikethrough && listing.weekdayPrice ? (
                  <s className={styles.oldPrice}>{fmt.money(listing.weekdayPrice)}</s>
                ) : null}
                {/*
                  Số tiền và ĐƠN VỊ là hai phần tử có style riêng (đơn vị nhỏ và mờ hơn).
                  Dựng bằng rich text của ICU thay vì nối hai chuỗi đã dịch: mỗi ngôn ngữ tự
                  quyết đơn vị đứng đâu, mà thẻ `<b>`/`<span>` vẫn đúng như thiết kế.
                */}
                <span className={styles.currentPrice}>
                  {t.rich(priceMessage, {
                    value: fmt.money(displayPrice),
                    amount: (chunks) => <b>{chunks}</b>,
                    unit: (chunks) => <span>{chunks}</span>,
                  })}
                </span>
                {driverContext ? (
                  <span className={styles.priceNote}>{t('includesDriver')}</span>
                ) : null}
              </>
            ) : (
              // Dịch vụ đang active chưa niêm yết giá chuyên biệt — KHÔNG lấy giá tự lái
              // trưng như tổng tiền của dịch vụ khác (17/08).
              <b className={styles.priceContact}>{t('contactForQuote')}</b>
            )}
          </div>
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
