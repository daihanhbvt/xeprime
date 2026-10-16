'use client';

import Image from 'next/image';
import Link from 'next/link';
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

/**
 * Một thẻ xe trên marketplace — design v2 (Figma "Vehicle Card", ADR 0062). Chỉ hiển thị trường
 * backend thật sự có — thiếu thì ẩn phần đó.
 *
 * KHÔNG có nút thuê ở đây (Wave 11.1). Thẻ chỉ mang dữ liệu tóm tắt, trong khi quyết định thuê
 * cần giá theo ngày, chính sách cọc, điều kiện giao nhận và đánh giá — tức là trang chi tiết.
 * Mở thẳng luồng thuê từ một thẻ trong lưới là mời khách cam kết trước khi đọc.
 *
 * Cả thẻ là một liên kết tới trang chi tiết; CTA `Chọn thuê` sống ở đó.
 *
 * Một khác biệt có chủ đích so với bản vẽ: hàng nhãn tiện ích (giao tận nơi · miễn thế chấp ·
 * xuất hoá đơn VAT) vẫn hiện khi xe có — ADR 0059 bắt buộc thẻ xe mang nhãn hoá đơn VAT, và hai
 * nhãn kia là chiều lọc khách đang dùng ở trang kết quả.
 */
export function VehicleCard({ listing }: { listing: PublicListing }) {
  const t = useTranslations('Listings.card');
  const fmt = useAppFormat();

  const { filters } = useMarketplaceFilters();
  // Thẻ xe lưu key nhiên liệu — nhãn tra từ danh mục chung với bộ lọc bên cạnh.
  const { fuelTypeLabel } = useCatalogLabels();

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

  /*
   * HAI TUYẾN trên một chợ (ADR 0028) và khách phải đọc được mình đang xem xe của ai. Backend
   * đã chấm tuyến thu tiền hiệu lực; thẻ dựng lại điều đó bằng ba tín hiệu cùng nói một điều —
   * chữ ("Gian hàng" thay cho "Chủ xe"), dấu xác thực ở góc avatar, và tông vàng ở tên + vành
   * avatar.
   *
   * `?? false` chứ không `?? true`: một backend chưa có trường này phải cho ra thẻ THƯỜNG.
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
   * "Không cần xác nhận" theo ĐÚNG dịch vụ đang xem: một xe tự động nhận chuyến tự lái nhưng
   * duyệt tay chuyến có tài xế không được mang nhãn đó ở ngữ cảnh có tài xế.
   */
  const instantBook = Boolean(
    activeService && (listing.instantBookServiceTypes ?? []).some((type) => type === activeService),
  );

  // "+N" là số ảnh THÊM ngoài ảnh đang hiện; một ảnh thì không có gì để hứa.
  const extraPhotos = Math.max(0, (listing.imageCount ?? 0) - 1);

  const location = listing.shopProvince
    ? listing.wardName
      ? t('locationLine', { ward: listing.wardName, province: listing.shopProvince })
      : listing.shopProvince
    : null;

  /*
   * Tiền RÚT GỌN trên thẻ — `870k/ngày` thay cho `870.000 ₫/ngày` (16/09/2026).
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

  const amenities = [
    listing.deliveryEnabled ? t('delivery') : null,
    listing.noCollateral ? t('noCollateral') : null,
    // Nhãn ngắn trên thẻ là yêu cầu của ADR 0059; câu "ai xuất, cho khoản nào" ở trang xe.
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
    // Kích thước là của NÉT VẼ (SVG Figma không giãn được) — đặt nguyên cỡ trong ô 16px.
  ].filter(
    (spec): spec is { key: string; icon: string; width: number; height: number; label: string } =>
      spec !== null,
  );

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

        <div className={styles.badges}>
          {/* % giảm là của giá TỰ LÁI — ngữ cảnh khác (dài hạn, có tài xế) không mang nó (ADR 0011). */}
          {showStrikethrough ? <DiscountTag percent={discount} variant="badge" /> : null}
          {instantBook ? (
            <span className={cx(styles.badge, styles.badgeInstant)}>{t('instantBook')}</span>
          ) : null}
        </div>

        {/*
          Nút "Lưu xe" (trái tim) của bản vẽ CỐ Ý chưa có: tính năng xe yêu thích chưa mở (trang
          `/account/favorites` còn là chỗ giữ chỗ). Một nút bấm không làm gì tệ hơn không có nút.
        */}

        {extraPhotos > 0 ? (
          <span className={styles.photoCount}>
            {/* `aria-label` trên `<span>` trần bị trình đọc màn hình bỏ qua — dùng chữ ẩn. */}
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
            {/* Chưa có đánh giá nào = xe mới lên chợ — cùng luật với bản trước. */}
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
          /*
            `aria-label` trên liên kết THAY THẾ mọi chữ bên trong khi trình đọc màn hình đọc nó —
            nên nhãn xác thực phải ghép vào đây. Ghép ở tầng BẢN DỊCH, không nối chuỗi.
          */
          aria-label={
            isShopTrack ? t('shopVerifiedAria', { name: listing.shopName }) : listing.shopName
          }
        >
          <span
            className={cx(styles.shopAvatar, isShopTrack && styles.shopAvatarShop)}
            aria-hidden="true"
          >
            {listing.shopLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- logo gian hàng từ storage ngoài
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
                {/*
                  Số tiền và ĐƠN VỊ là hai phần tử có style riêng (đơn vị nhỏ và mờ hơn). Dựng
                  bằng rich text của ICU thay vì nối hai chuỗi đã dịch: mỗi ngôn ngữ tự quyết đơn
                  vị đứng đâu, mà thẻ `<b>`/`<span>` vẫn đúng như thiết kế.
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
