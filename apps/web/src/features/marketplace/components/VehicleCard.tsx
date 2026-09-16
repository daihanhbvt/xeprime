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
import { cx } from '@/lib/cx';
import { DiscountTag } from '@/components/data-display/DiscountTag';
import { VerifiedMark } from '@/components/common/VerifiedMark';
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

  /*
   * HAI TUYẾN trên một chợ (ADR 0028) và khách phải đọc được mình đang xem xe của ai. Backend
   * đã chấm tuyến thu tiền hiệu lực; thẻ chỉ dựng lại điều đó bằng ba tín hiệu cùng nói một
   * điều — chữ ("Gian hàng" thay cho "Chủ xe"), dấu xác thực, và tông vàng cam ở tên + vành
   * avatar. Ba tín hiệu vì một mình dấu tick thì quá nhỏ ở cỡ 34px của footer thẻ.
   *
   * `?? false` chứ không `?? true`: một backend chưa có trường này phải cho ra thẻ THƯỜNG.
   * Mặc định ngược lại là gắn dấu xác thực cho mọi chủ xe cá nhân trong suốt lần deploy lệch.
   */
  const isShopTrack = listing.shopVerified ?? false;

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

  /*
   * Tiền RÚT GỌN trên thẻ — `600k/ngày` thay cho `600.000 ₫/ngày` (16/09/2026).
   *
   * Chân thẻ chỉ có một hàng cho hai thứ cùng muốn rộng: tên gian hàng bên trái và giá bên
   * phải. Dạng đầy đủ chiếm quá nửa hàng đó, nên tên bị cắt còn `XePrime Sà…` ngay cả trên
   * màn hình rộng. Rút gọn trả lại khoảng một nửa bề rộng cho bên trái.
   *
   * `price: true`: ở bậc triệu, một chữ số lẻ biến `1.050.000` thành `1tr`. Trên một cái thẻ
   * mà việc duy nhất của nó là giúp khách SO GIÁ giữa các xe, sai 50.000đ là sai ở đúng chỗ
   * không được phép sai. Dạng đầy đủ vẫn nằm ở trang chi tiết và trong mọi báo giá.
   */
  const compactPrice = (value: string) => fmt.moneyCompact(value, { price: true });

  // Mang ngữ cảnh sang trang chi tiết để prefill luồng đặt xe: ngày giờ + dịch vụ đang active
  // + lộ trình có tài xế — card và detail không bao giờ nói hai dịch vụ khác nhau.
  const dateQs = new URLSearchParams();
  // Tỉnh đang lọc đi cùng: khách tìm xe ở Đà Nẵng thì ô địa chỉ giao xe mở ra đã ở Đà Nẵng.
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
            /*
              `aria-label` trên liên kết THAY THẾ mọi chữ bên trong khi trình đọc màn hình đọc
              nó — nên nhãn của dấu xác thực bên dưới sẽ không bao giờ tới tai người dùng nếu
              nhãn này chỉ có mỗi tên. Ghép ở tầng BẢN DỊCH, không nối chuỗi: dấu nối và thứ tự
              hai vế là quyết định của từng ngôn ngữ.
            */
            aria-label={
              isShopTrack
                ? t('shopVerifiedAria', { name: listing.shopName })
                : listing.shopName
            }
          >
            <span
              className={cx(styles.shopAvatar, isShopTrack && styles.shopAvatarShop)}
              aria-hidden="true"
            >
              {listing.shopLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo gian hàng từ storage ngoài
                <img src={listing.shopLogoUrl} alt="" loading="lazy" />
              ) : (
                initialOf(listing.shopName)
              )}
            </span>
            <span className={styles.shopCopy}>
              <span className={styles.shopCaption}>{t(isShopTrack ? 'shop' : 'owner')}</span>
              <span className={styles.shopNameRow}>
                <span className={cx(styles.shopName, isShopTrack && styles.shopNameShop)}>
                  {listing.shopName}
                </span>
                {/* Dấu nằm NGOÀI phần tử cắt chữ: tên dài bị ellipsis thì dấu vẫn còn. */}
                {isShopTrack ? (
                  <VerifiedMark label={t('shopVerified')} size={13} className={styles.shopMark} />
                ) : null}
              </span>
            </span>
          </Link>

          <div className={styles.price}>
            {displayPrice ? (
              <>
                {showStrikethrough && listing.weekdayPrice ? (
                  <s className={styles.oldPrice}>{compactPrice(listing.weekdayPrice)}</s>
                ) : null}
                {/*
                  Số tiền và ĐƠN VỊ là hai phần tử có style riêng (đơn vị nhỏ và mờ hơn).
                  Dựng bằng rich text của ICU thay vì nối hai chuỗi đã dịch: mỗi ngôn ngữ tự
                  quyết đơn vị đứng đâu, mà thẻ `<b>`/`<span>` vẫn đúng như thiết kế.
                */}
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
