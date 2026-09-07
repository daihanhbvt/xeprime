'use client';

import { StarFilled } from '@ant-design/icons';
import { Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CATALOG_TYPE, SERVICE_TYPE } from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { shopPath } from '@/constants/routes';
import { catalogLabel } from '@/features/catalog/types';
import { useCatalog } from '@/features/catalog/use-catalog';
import type { PublicListingDetail } from '@/features/marketplace/types';
import { applyDiscountPercent } from '@/lib/money';
import { PreviewImage } from '@/components/data-display/PreviewImage';
import { DiscountTag } from '@/components/data-display/DiscountTag';
import styles from './VehicleSummaryPanel.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';

interface VehicleSummaryPanelProps {
  /** Đã có đủ dữ liệu (mở từ trang chi tiết) hoặc vừa tải xong; `null` = đang tải. */
  listing: PublicListingDetail | null;
  /** Tên xe biết trước từ thẻ — giữ tiêu đề ổn định trong lúc chi tiết còn đang tải. */
  fallbackName: string;
  fallbackImageUrl?: string | null;
  loading: boolean;
  /**
   * Dịch vụ khách đang đặt. Panel phải nói giá CỦA DỊCH VỤ ĐÓ: trưng giá tự lái và khuyến mãi
   * tự lái trong lúc khách đang mua gói dài hạn là hiển thị sai giá (ADR 0011).
   */
  serviceType?: string;
  /** Gói dài hạn đang chọn — có gói thì hiện giá gói thật thay cho giá cơ sở /tháng. */
  packageMonths?: number | null;
}

/**
 * Cột hồ sơ xe của overlay yêu cầu thuê — **đứng yên suốt cả luồng**.
 *
 * Vì sao tách riêng: cột phải đổi theo từng bước, còn thứ khách cần nhìn để biết mình đang đặt xe
 * nào (ảnh, tên, giá, vài thông số, gian hàng) thì không được nhảy.
 *
 * Cố ý KHÔNG dựng lại cả trang chi tiết xe ở đây. Bản trước có thêm gallery 6 ảnh, chip tiện ích
 * và danh sách đánh giá — đúng những thứ khách vừa xem xong ở trang chi tiết ngay trước khi bấm
 * "Chọn thuê", và chúng đẩy phần thao tác thật xuống dưới. Điểm đánh giá vẫn còn, gọn trong thẻ
 * gian hàng. Panel ngắn nên mobile hiện thẳng, không cần nút "Xem thông tin xe" nữa.
 *
 * Không tự gọi API: dữ liệu do `RequestBookingFlow` cấp. Ảnh thiếu → khối giữ chỗ, không để
 * layout sụp.
 */
export function VehicleSummaryPanel({
  listing,
  fallbackName,
  fallbackImageUrl,
  loading,
  serviceType,
  packageMonths = null,
}: VehicleSummaryPanelProps) {
  const t = useTranslations('BookingRequests.flow');
  const dl = useDomainLabel();
  const fmt = useAppFormat();
  const { catalog } = useCatalog();

  const name = listing?.name ?? fallbackName;
  const mainImage = listing?.mainImageUrl ?? fallbackImageUrl ?? null;

  const isLongTerm = serviceType === SERVICE_TYPE.LONG_TERM;
  const isWithDriver = serviceType === SERVICE_TYPE.WITH_DRIVER;
  /*
   * `discountPercent` là khuyến mãi trực tiếp của dịch vụ TỰ LÁI — không áp và không hiển thị
   * cho dịch vụ khác. Giá ngày cũng vậy: khách mua gói dài hạn không trả theo ngày.
   */
  const discount = !isLongTerm && !isWithDriver ? (listing?.discountPercent ?? 0) : 0;
  const dailyPrice =
    listing && discount > 0
      ? applyDiscountPercent(listing.weekdayPrice, discount)
      : (listing?.weekdayPrice ?? null);

  /** Gói đang chọn (giá do server tính) — chưa chọn thì chỉ nói giá dài hạn cơ sở /tháng. */
  const selectedPackage =
    isLongTerm && packageMonths != null
      ? ((listing?.longTermPackages ?? []).find((pkg) => pkg.packageMonths === packageMonths) ??
        null)
      : null;
  const displayPrice = isLongTerm
    ? (selectedPackage?.finalPackageAmount ?? listing?.monthlyPrice ?? null)
    : isWithDriver
      ? (listing?.withDriverDailyPrice ?? dailyPrice)
      : dailyPrice;
  const priceUnit = isLongTerm
    ? selectedPackage
      ? `/${t('packageMonths', { months: selectedPackage.packageMonths })}`
      : t('price.perMonth')
    : t('price.perDay');

  const location = [listing?.shopProvince].filter(Boolean).join(LIST_SEPARATOR);

  const specs = listing
    ? ([
        listing.manufactureYear
          ? { label: t('panel.specYear'), value: String(listing.manufactureYear) }
          : null,
        listing.seatCount
          ? {
              label: t('panel.specSeats'),
              value: t('panel.seatCount', { count: listing.seatCount }),
            }
          : null,
        listing.bodyType
          ? {
              label: t('panel.specBody'),
              value: catalogLabel(catalog[CATALOG_TYPE.BODY_TYPE], listing.bodyType) ?? '—',
            }
          : null,
        listing.fuelType
          ? {
              label: t('panel.specFuel'),
              value: catalogLabel(catalog[CATALOG_TYPE.FUEL_TYPE], listing.fuelType) ?? '—',
            }
          : null,
      ].filter(Boolean) as Array<{ label: string; value: string }>)
    : [];

  const pending = loading && !listing;

  /*
   * Đang tải thì KHÔNG che cả cột bằng skeleton: tên xe và ảnh đại diện đã biết từ thẻ vừa bấm,
   * giấu chúng đi làm khách mất mốc "mình đang đặt xe nào". Chỉ phần chưa biết (thông số, gian
   * hàng) mới là skeleton.
   */
  return (
    <aside className={styles.panel} aria-busy={pending || undefined}>
      <div className={styles.hero}>
        {mainImage ? (
          <PreviewImage src={mainImage} alt={name} className={styles.heroImg} />
        ) : (
          <div className={styles.heroPlaceholder} aria-hidden="true" />
        )}
      </div>

      <div className={styles.head}>
        <div className={styles.badges}>
          {listing ? (
            <span className={styles.badge}>
              {(listing.serviceTypes ?? []).map((s) => dl('serviceType', s)).join(LIST_SEPARATOR)}
            </span>
          ) : null}
          {discount > 0 ? <DiscountTag percent={discount} size="sm" /> : null}
        </div>
        <h3 className={styles.name}>{name}</h3>
        {listing ? (
          <p className={styles.meta}>
            {[dl('vehicleType', listing.vehicleType), location].filter(Boolean).join(LIST_SEPARATOR)}
          </p>
        ) : null}

        {/* Giá 0đ là giá thật; chỉ ẩn khi backend KHÔNG có giá. */}
        {displayPrice != null && displayPrice !== '' ? (
          <div className={styles.price}>
            <b>{fmt.money(displayPrice)}</b>
            <span>{priceUnit}</span>
            {/* Gói 1 tháng: giá bình quân tháng BẰNG tổng gói — lặp lại chỉ là nhiễu. */}
            {selectedPackage && selectedPackage.packageMonths > 1 ? (
              <span className={styles.priceAlt}>
                {fmt.money(selectedPackage.effectiveMonthlyAmount)}
                {t('price.perMonth')}
              </span>
            ) : !isLongTerm && !isWithDriver && listing?.hourlyPrice ? (
              <span className={styles.priceAlt}>
                {fmt.money(listing.hourlyPrice)}
                {t('price.perHour')}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {pending ? (
        <div className={styles.details}>
          <Skeleton active title={false} paragraph={{ rows: 4 }} />
        </div>
      ) : null}

      {listing ? (
        <div className={styles.details}>
          {specs.length > 0 ? (
            <dl className={styles.specs}>
              {specs.map((s) => (
                <div key={s.label} className={styles.specRow}>
                  <dt>{s.label}</dt>
                  <dd>{s.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <div className={styles.shop}>
            <span className={styles.shopAvatar} aria-hidden="true">
              {listing.shopLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- logo shop từ storage ngoài
                <img src={listing.shopLogoUrl} alt="" className={styles.shopLogo} />
              ) : (
                listing.shopName.charAt(0).toUpperCase()
              )}
            </span>
            <span className={styles.shopBody}>
              <span className={styles.shopName}>{listing.shopName}</span>
              {/* Chỉ hiện đánh giá khi CÓ số thật — không dựng "0.0 · 0 chuyến" giả. */}
              {listing.ratingAvg != null && listing.ratingCount > 0 ? (
                <span className={styles.shopRating}>
                  <StarFilled />{' '}
                  {t('panel.ratingSummary', {
                    avg: listing.ratingAvg,
                    count: listing.ratingCount,
                  })}
                </span>
              ) : null}
            </span>
            <Link
              href={shopPath.detail(listing.shopSlug)}
              className={styles.shopLink}
              target="_blank"
              rel="noreferrer"
            >
              {t('panel.viewShop')}
            </Link>
          </div>
        </div>
      ) : null}

    </aside>
  );
}
