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
  SERVICE_TYPE,
  VEHICLE_TYPE,
  VEHICLE_TYPE_LABEL,
  serviceTypeLabel,
  type VehicleType,
} from '@xeprime/types';
import { listingPath, shopPath } from '@/constants/routes';
import { applyDiscountPercent, formatMoneyVnd } from '@/lib/money';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { useMarketplaceFilters } from '../hooks/use-marketplace-filters';
import type { PublicListing } from '../types';
import styles from './VehicleCard.module.css';

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
  const { filters } = useMarketplaceFilters();
  // Thẻ xe lưu key hãng/nhiên liệu — nhãn tra từ danh mục chung với bộ lọc bên cạnh.
  const { brandLabel, fuelTypeLabel } = useCatalogLabels();

  const typeLabel = VEHICLE_TYPE_LABEL[listing.vehicleType as VehicleType] ?? listing.vehicleType;
  const brandLine = [brandLabel(listing.brand), listing.model].filter(Boolean).join(' ');
  const specs = [brandLine || typeLabel, listing.seatCount ? `${listing.seatCount} chỗ` : null]
    .filter(Boolean)
    .join(' · ');

  /*
   * MỘT `activeService` duy nhất cho cả thẻ (17/08) — badge, giá, đơn vị, ghi chú và link
   * chi tiết cùng đọc từ đây, không bao giờ badge nói một dịch vụ mà giá nói dịch vụ khác:
   *   1. dịch vụ đang lọc (nếu xe phục vụ được);
   *   2. không lọc → ưu tiên tự lái nếu xe hỗ trợ;
   *   3. xe không có tự lái → dịch vụ đầu tiên xe đăng.
   */
  const serviceTypes: string[] = listing.serviceTypes ?? [];
  const serviceContext =
    filters.serviceType && serviceTypes.includes(filters.serviceType)
      ? filters.serviceType
      : null;
  const activeService =
    serviceContext ??
    (serviceTypes.includes(SERVICE_TYPE.SELF_DRIVE) ? SERVICE_TYPE.SELF_DRIVE : serviceTypes[0]);
  const extraServiceCount = Math.max(0, serviceTypes.length - 1);

  const fuel = fuelTypeLabel(listing.fuelType);
  const rating = Number(listing.ratingAvg);
  const hasRating = listing.ratingCount > 0 && Number.isFinite(rating);

  // Giá sau giảm chỉ để HIỂN THỊ (marketing) — giá chốt thật do shop quyết khi duyệt yêu cầu.
  const discount = listing.discountPercent ?? 0;

  /*
   * Giá theo `activeService` (17/08):
   *   - dài hạn → giá tháng; CHƯA niêm yết → "Liên hệ báo giá" (không lấy giá tự lái trưng
   *     như giá dài hạn);
   *   - có tài xế → giá/ngày đã gồm tài xế; chưa niêm yết → "Liên hệ báo giá";
   *   - tự lái → giá ngày như cũ (kèm gạch giá khi giảm; % giảm marketing chỉ áp giá tự lái).
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
  const priceUnit = monthlyContext ? '/tháng' : '/ngày';
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
        aria-label={`Xem chi tiết ${listing.name}`}
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
        {activeService ? (
          <span className={styles.serviceBadge}>
            {serviceTypeLabel(activeService)}
            {extraServiceCount > 0 ? ` +${extraServiceCount}` : ''}
          </span>
        ) : null}
        {discount > 0 ? <span className={styles.discountBadge}>-{discount}%</span> : null}
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
          {listing.deliveryEnabled ? <span className={styles.amenityTag}>Giao tận nơi</span> : null}
          {listing.noCollateral ? <span className={styles.amenityTag}>Miễn thế chấp</span> : null}
        </div>

        <div className={styles.footer}>
          <div className={styles.price}>
            {displayPrice ? (
              <>
                {showStrikethrough && listing.weekdayPrice ? (
                  <s className={styles.oldPrice}>{formatMoneyVnd(listing.weekdayPrice)}</s>
                ) : null}
                <b>{formatMoneyVnd(displayPrice)}</b>
                <span>{priceUnit}</span>
                {driverContext ? <span className={styles.priceNote}>đã gồm tài xế</span> : null}
              </>
            ) : (
              // Dịch vụ đang active chưa niêm yết giá chuyên biệt — KHÔNG lấy giá tự lái
              // trưng như tổng tiền của dịch vụ khác (17/08).
              <b className={styles.priceContact}>Liên hệ báo giá</b>
            )}
          </div>
          <Link
            href={shopPath.detail(listing.shopSlug)}
            className={styles.shop}
            title={listing.shopName}
          >
            {listing.shopName}
          </Link>
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
