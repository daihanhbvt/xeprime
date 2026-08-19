'use client';

import { CheckCircleFilled, DownOutlined, StarFilled, UpOutlined } from '@ant-design/icons';
import { Skeleton } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import {
  CATALOG_TYPE, longTermPackageLabel, SERVICE_TYPE, serviceTypesLabel, VEHICLE_TYPE, } from '@xeprime/types';
import { shopPath } from '@/constants/routes';
import { catalogLabel } from '@/features/catalog/types';
import { useCatalog } from '@/features/catalog/use-catalog';
import type { PublicListingDetail, ReviewItem, ReviewSummary } from '@/features/marketplace/types';
import { useIsMobile } from '@/hooks/use-media-query';
import { cx } from '@/lib/cx';
import { applyDiscountPercent } from '@/lib/money';
import { maskPhone } from '@/features/phone-verification/mask';
import { PreviewImage, PreviewImageGroup } from '@/components/data-display/PreviewImage';
import { DiscountTag } from '@/components/data-display/DiscountTag';
import styles from './VehicleSummaryPanel.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

interface VerifiedContact {
  name: string;
  phone: string;
}

interface VehicleSummaryPanelProps {
  /** Đã có đủ dữ liệu (mở từ trang chi tiết) hoặc vừa tải xong; `null` = đang tải. */
  listing: PublicListingDetail | null;
  /** Tên xe biết trước từ thẻ — giữ tiêu đề ổn định trong lúc chi tiết còn đang tải. */
  fallbackName: string;
  fallbackImageUrl?: string | null;
  loading: boolean;
  /** Vài đánh giá tiêu biểu + điểm tổng — do flow tải, panel chỉ hiển thị. */
  reviews?: ReviewItem[];
  reviewSummary?: ReviewSummary | null;
  reviewsLoading?: boolean;
  /** Hiện sau khi đã biết liên hệ đã xác thực (bước Xác nhận). */
  verifiedContact?: VerifiedContact | null;
  /**
   * Dịch vụ khách đang đặt. Panel phải nói giá CỦA DỊCH VỤ ĐÓ: trưng giá tự lái và khuyến mãi
   * tự lái trong lúc khách đang mua gói dài hạn là hiển thị sai giá (ADR 0011).
   */
  serviceType?: string;
  /** Gói dài hạn đang chọn — có gói thì hiện giá gói thật thay cho giá cơ sở /tháng. */
  packageMonths?: number | null;
}

function vehicleTypeLabel(type: string): string {
  return type === VEHICLE_TYPE.MOTORBIKE ? 'Xe máy' : 'Ô tô';
}

/**
 * Cột hồ sơ xe của overlay yêu cầu thuê — **đứng yên suốt cả luồng**.
 *
 * Vì sao tách riêng: cột phải đổi theo từng bước, còn thứ khách cần nhìn để yên tâm (ảnh, giá,
 * thông số, tiện ích, gian hàng) thì không được nhảy. Trên mobile không có chỗ cho hai cột nên
 * cùng component này thu thành một thẻ gọn, mở rộng bằng "Xem thông tin xe".
 *
 * Không tự gọi API: dữ liệu do `RequestBookingFlow` cấp (có sẵn từ trang chi tiết, hoặc tải lười
 * khi mở từ thẻ xe). Ảnh thiếu → khối giữ chỗ, không để layout sụp.
 */
export function VehicleSummaryPanel({
  listing,
  fallbackName,
  fallbackImageUrl,
  loading,
  reviews = [],
  reviewSummary = null,
  reviewsLoading = false,
  verifiedContact,
  serviceType,
  packageMonths = null,
}: VehicleSummaryPanelProps) {
  const fmt = useAppFormat();

  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
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
      ? `/${longTermPackageLabel(selectedPackage.packageMonths)}`
      : '/tháng'
    : '/ngày';

  const location = [listing?.shopProvince].filter(Boolean).join(' · ');

  const specs = listing
    ? ([
        listing.manufactureYear
          ? { label: 'Đời xe', value: String(listing.manufactureYear) }
          : null,
        listing.seatCount ? { label: 'Số chỗ', value: `${listing.seatCount} chỗ` } : null,
        listing.bodyType
          ? {
              label: 'Kiểu dáng',
              value: catalogLabel(catalog[CATALOG_TYPE.BODY_TYPE], listing.bodyType) ?? '—',
            }
          : null,
        listing.fuelType
          ? {
              label: 'Năng lượng',
              value: catalogLabel(catalog[CATALOG_TYPE.FUEL_TYPE], listing.fuelType) ?? '—',
            }
          : null,
      ].filter(Boolean) as Array<{ label: string; value: string }>)
    : [];

  /** Phần mở rộng: gallery, thông số, tiện ích, gian hàng. Mobile giấu sau nút; desktop luôn mở. */
  const showDetails = !isMobile || expanded;
  const pending = loading && !listing;

  /*
   * Đang tải thì KHÔNG che cả cột bằng skeleton: tên xe và ảnh đại diện đã biết từ thẻ vừa bấm,
   * giấu chúng đi làm khách mất mốc "mình đang đặt xe nào". Chỉ phần chưa biết (gallery, thông
   * số, tiện ích, gian hàng) mới là skeleton.
   */
  return (
    // Group: ảnh đại diện + gallery vào chung MỘT trình xem toàn màn hình (đếm x/y).
    <PreviewImageGroup>
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
              <span className={styles.badge}>{serviceTypesLabel(listing.serviceTypes ?? [])}</span>
            ) : null}
            {discount > 0 ? <DiscountTag percent={discount} size="sm" /> : null}
          </div>
          <h3 className={styles.name}>{name}</h3>
          {listing ? (
            <p className={styles.meta}>
              {[vehicleTypeLabel(listing.vehicleType), location].filter(Boolean).join(' · ')}
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
                  {fmt.money(selectedPackage.effectiveMonthlyAmount)}/tháng
                </span>
              ) : !isLongTerm && !isWithDriver && listing?.hourlyPrice ? (
                <span className={styles.priceAlt}>{fmt.money(listing.hourlyPrice)}/giờ</span>
              ) : null}
            </div>
          ) : null}
        </div>

        {isMobile && listing ? (
          <button
            type="button"
            className={styles.expandBtn}
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {expanded ? 'Ẩn thông tin xe' : 'Xem thông tin xe'}
            {expanded ? <UpOutlined /> : <DownOutlined />}
          </button>
        ) : null}

        {pending ? (
          <div className={styles.details}>
            <Skeleton active title={false} paragraph={{ rows: 4 }} />
          </div>
        ) : null}

        {showDetails && listing ? (
          <div className={styles.details}>
            {listing.images.length > 0 ? (
              <div className={styles.gallery}>
                {listing.images.slice(0, 6).map((url) => (
                  <PreviewImage key={url} src={url} alt="" className={styles.thumb} />
                ))}
              </div>
            ) : null}

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

            {listing.features.length > 0 ? (
              <div className={styles.features}>
                {listing.features.slice(0, 8).map((key) => (
                  <span key={key} className={styles.featureChip}>
                    {catalogLabel(catalog[CATALOG_TYPE.VEHICLE_FEATURE], key) ?? key}
                  </span>
                ))}
              </div>
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
                    <StarFilled /> {listing.ratingAvg} · {listing.ratingCount} đánh giá
                  </span>
                ) : null}
              </span>
              <Link
                href={shopPath.detail(listing.shopSlug)}
                className={styles.shopLink}
                target="_blank"
                rel="noreferrer"
              >
                Xem gian hàng
              </Link>
            </div>

            {/*
            Vài đánh giá TIÊU BIỂU — thứ khách thật sự đọc trước khi bấm gửi yêu cầu. Tải rời
            khỏi listing để hồ sơ xe hiện ngay; hỏng thì khối này vắng mặt chứ không chặn gì.
          */}
            {reviewsLoading ? (
              <div className={styles.reviews}>
                <Skeleton active title={false} paragraph={{ rows: 3 }} />
              </div>
            ) : reviews.length > 0 ? (
              <div className={styles.reviews}>
                <div className={styles.reviewsHead}>
                  <span className={styles.reviewsTitle}>Khách nói gì về xe này</span>
                  {reviewSummary && reviewSummary.ratingCount > 0 ? (
                    <span className={styles.reviewsScore}>
                      <StarFilled /> {reviewSummary.ratingAvg.toFixed(1)}
                      <span className={styles.reviewsCount}>
                        ({reviewSummary.ratingCount} đánh giá)
                      </span>
                    </span>
                  ) : null}
                </div>
                <ul className={styles.reviewList}>
                  {reviews.map((review) => (
                    <li key={review.id} className={styles.reviewItem}>
                      <div className={styles.reviewMeta}>
                        <span className={styles.reviewAuthor}>{review.customerName}</span>
                        <span className={styles.reviewStars} aria-label={`${review.rating}/5 sao`}>
                          {'★'.repeat(review.rating)}
                          <span className={styles.reviewStarsDim}>
                            {'★'.repeat(Math.max(0, 5 - review.rating))}
                          </span>
                        </span>
                      </div>
                      {review.comment ? (
                        <p className={styles.reviewText}>{review.comment}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {verifiedContact ? (
          <div className={cx(styles.details, styles.contactCard)}>
            <span className={styles.contactTitle}>Người thuê</span>
            <span className={styles.contactName}>{verifiedContact.name}</span>
            <span className={styles.contactPhone}>
              {maskPhone(verifiedContact.phone)}
              <span className={styles.verified}>
                <CheckCircleFilled /> Đã xác thực
              </span>
            </span>
          </div>
        ) : null}
      </aside>
    </PreviewImageGroup>
  );
}
