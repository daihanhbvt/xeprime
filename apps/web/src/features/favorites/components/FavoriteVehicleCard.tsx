'use client';

import { CarOutlined, ClockCircleOutlined, EyeOutlined, HeartFilled } from '@ant-design/icons';
import { Button, Skeleton } from 'antd';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { isNewListing } from '@xeprime/domain';
import { transmissionFamily, type FavoriteVehicle } from '@xeprime/types';
import { listingPath, shopPath } from '@/constants/routes';
import { useCatalogLabels } from '@/features/catalog/use-catalog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { initialOf } from '@/lib/initials';
import { useFavoriteToggle } from '../hooks/use-favorite';
import { FavoriteButton } from './FavoriteButton';
import styles from './FavoriteVehicleCard.module.css';

/** Trang chi tiết với một dịch vụ cụ thể — trang chi tiết đọc `?serviceType=` (cùng tham số thẻ chợ gửi). */
function detailHref(vehicleId: string, service?: string): string {
  const base = listingPath.detail(vehicleId);
  return service ? `${base}?serviceType=${encodeURIComponent(service)}` : base;
}

interface Spec {
  key: string;
  icon: string;
  width: number;
  height: number;
  label: string;
}

/**
 * Một THẺ NGANG trong trang Xe yêu thích — cùng ngôn ngữ với thẻ xe trang chủ (`VehicleCard`,
 * Figma `19625:43910`): ảnh tràn mép trái (huy hiệu "Không cần xác nhận", trái tim, +N ảnh), khối
 * chi tiết chia ba phần bằng vạch mảnh — tên · vị trí · tag dịch vụ + tiện ích | thông số icon |
 * chủ xe / gian hàng · đánh giá · Bỏ thích · Xem chi tiết. Rê chuột: viền vàng, phủ vàng nhạt, tên
 * chuyển vàng — như thẻ trang chủ.
 *
 * KHÔNG hiện giá (chủ sản phẩm chốt 21/10/2026: giá xem ở trang chi tiết). Bấm một tag dịch vụ ⇒
 * mở chi tiết với ĐÚNG dịch vụ đó; "Xem chi tiết" ⇒ dịch vụ mặc định (giả định BRD §9 câu 4). Bỏ
 * thích lạc quan: thẻ rời danh sách ngay, lỗi thì quay lại đúng vị trí (`favorite-cache.ts`).
 * Thẻ hẹp thì xếp dọc — `@container`, vì thẻ nằm trong cột nội dung cạnh sidebar tài khoản.
 */
export function FavoriteVehicleCard({ vehicle }: { vehicle: FavoriteVehicle }) {
  const t = useTranslations('Favorites.card');
  const tCard = useTranslations('Listings.card');
  const dl = useDomainLabel();
  const fmt = useAppFormat();
  const { fuelTypeLabel } = useCatalogLabels();
  const { apply } = useFavoriteToggle(vehicle.id, { initialFavorite: true });

  const isShopTrack = vehicle.shopVerified ?? false;
  const hasRating = !isNewListing(vehicle);
  const instantBook = (vehicle.instantBookServiceTypes ?? []).length > 0;
  const extraPhotos = Math.max(0, (vehicle.imageCount ?? 0) - 1);
  const fuel = fuelTypeLabel(vehicle.fuelType);
  const location = vehicle.shopProvince
    ? vehicle.wardName
      ? tCard('locationLine', { ward: vehicle.wardName, province: vehicle.shopProvince })
      : vehicle.shopProvince
    : null;

  const amenities = [
    vehicle.deliveryEnabled ? tCard('delivery') : null,
    vehicle.noCollateral ? tCard('noCollateral') : null,
    vehicle.vatInvoiceSupported ? tCard('vatInvoice') : null,
  ].filter((label): label is string => label !== null);

  const specs = [
    vehicle.seatCount
      ? {
          key: 'seats',
          icon: '/home/card-seats.svg',
          width: 12,
          height: 11,
          label: tCard('seats', { count: vehicle.seatCount }),
        }
      : null,
    vehicle.transmission
      ? {
          key: 'transmission',
          icon: '/home/card-transmission.svg',
          width: 13,
          height: 13,
          label: tCard(`transmissionFamily.${transmissionFamily(vehicle.transmission)}`),
        }
      : null,
    fuel ? { key: 'fuel', icon: '/home/card-fuel.svg', width: 16, height: 16, label: fuel } : null,
  ].filter((spec): spec is Spec => spec !== null);

  return (
    <article className={styles.card}>
      <div className={styles.inner}>
        <div className={styles.media}>
          <Link
            href={detailHref(vehicle.id)}
            className={styles.mediaLink}
            aria-label={t('viewDetailAria', { name: vehicle.name })}
            tabIndex={-1}
          >
            {vehicle.mainImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={vehicle.mainImageUrl}
                alt={vehicle.name}
                className={styles.photo}
                loading="lazy"
              />
            ) : (
              <span className={styles.glyph} aria-hidden="true">
                <CarOutlined />
              </span>
            )}
          </Link>

          {instantBook ? <span className={styles.badgeInstant}>{tCard('instantBook')}</span> : null}

          <FavoriteButton
            vehicleId={vehicle.id}
            vehicleName={vehicle.name}
            className={styles.heartBtn}
            activeClassName={styles.heartActive}
          />

          {extraPhotos > 0 ? (
            <span className={styles.photoCount}>
              <span className={styles.srOnly}>
                {tCard('photoCountAria', { count: vehicle.imageCount ?? 0 })}
              </span>
              <Image src="/home/card-photos.svg" alt="" width={11} height={11} unoptimized />
              <span aria-hidden="true">{tCard('photoCount', { count: extraPhotos })}</span>
            </span>
          ) : null}
        </div>

        <div className={styles.body}>
          <div className={styles.info}>
            <div className={styles.nameRow}>
              <h3 className={styles.title}>
                <Link href={detailHref(vehicle.id)} className={styles.titleLink}>
                  {vehicle.name}
                </Link>
              </h3>
              {!hasRating ? <span className={styles.newBadge}>{tCard('newVehicle')}</span> : null}
              <span className={styles.savedAt}>
                <ClockCircleOutlined aria-hidden="true" />
                {t('savedAt', { dateTime: fmt.dateTime(vehicle.favoritedAt) })}
              </span>
            </div>

            {location ? (
              <p className={styles.location}>
                <Image src="/home/card-location.svg" alt="" width={15} height={19} unoptimized />
                <span className={styles.locationText}>{location}</span>
              </p>
            ) : null}

            {vehicle.serviceTypes.length > 0 || amenities.length > 0 ? (
              <div className={styles.chipRow}>
                {vehicle.serviceTypes.length > 0 ? (
                  <ul className={styles.chips} aria-label={t('servicesLabel')}>
                    {vehicle.serviceTypes.map((service) => {
                      const label = dl('serviceType', service);
                      return (
                        <li key={service}>
                          <Link
                            href={detailHref(vehicle.id, service)}
                            className={styles.serviceChip}
                            aria-label={t('serviceLinkAria', {
                              name: vehicle.name,
                              service: label,
                            })}
                          >
                            {label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {amenities.length > 0 ? (
                  <ul className={styles.chips} aria-label={t('highlightsLabel')}>
                    {amenities.map((label) => (
                      <li key={label} className={styles.amenityChip}>
                        {label}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>

          {specs.length > 0 ? (
            <ul className={styles.specs} aria-label={tCard('specsLabel')}>
              {specs.map((spec) => (
                <li key={spec.key} className={styles.spec}>
                  <span className={styles.specIcon}>
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

          <div className={styles.footer}>
            <Link
              href={shopPath.detail(vehicle.shopSlug)}
              className={styles.shop}
              title={vehicle.shopName}
              aria-label={
                isShopTrack
                  ? tCard('shopVerifiedAria', { name: vehicle.shopName })
                  : vehicle.shopName
              }
            >
              <span
                className={cx(styles.shopAvatar, isShopTrack && styles.shopAvatarShop)}
                aria-hidden="true"
              >
                {vehicle.shopLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={vehicle.shopLogoUrl}
                    alt=""
                    loading="lazy"
                    className={styles.shopLogo}
                  />
                ) : (
                  initialOf(vehicle.shopName)
                )}
                {isShopTrack ? (
                  <span className={styles.shopMark}>
                    <Image
                      src="/home/card-verified.svg"
                      alt=""
                      width={10}
                      height={10}
                      unoptimized
                    />
                  </span>
                ) : null}
              </span>
              <span className={styles.shopCopy}>
                <span className={styles.shopCaption}>{tCard(isShopTrack ? 'shop' : 'owner')}</span>
                <span className={cx(styles.shopName, isShopTrack && styles.shopNameShop)}>
                  {vehicle.shopName}
                </span>
              </span>
            </Link>

            {hasRating ? (
              <span className={styles.rating}>
                <Image src="/home/star-16.svg" alt="" width={16} height={16} unoptimized />
                <span>
                  {tCard.rich('ratingValue', {
                    rating: fmt.rating(Number(vehicle.ratingAvg)),
                    count: vehicle.ratingCount,
                    muted: (chunks) => <span className={styles.ratingCount}>{chunks}</span>,
                  })}
                </span>
                {vehicle.completedTripCount > 0 ? (
                  <span className={styles.trips}>
                    {tCard('completedTrips', { count: vehicle.completedTripCount })}
                  </span>
                ) : null}
              </span>
            ) : null}

            <div className={styles.actions}>
              <Button
                className={styles.removeBtn}
                icon={<HeartFilled aria-hidden />}
                aria-label={t('removeAria', { name: vehicle.name })}
                onClick={() => apply(false)}
              >
                {t('remove')}
              </Button>
              <Link href={detailHref(vehicle.id)} className={styles.detailBtn}>
                <EyeOutlined aria-hidden="true" />
                {t('viewDetail')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

/** Khung chờ cùng dáng thẻ ngang (ảnh · ba phần chi tiết) — dữ liệu về không làm nhảy bố cục. */
export function FavoriteVehicleCardSkeleton() {
  return (
    <div className={styles.card} aria-hidden="true">
      <div className={styles.inner}>
        <div className={styles.media}>
          <Skeleton.Image active className={styles.skeletonImg} />
        </div>
        <div className={styles.body}>
          <Skeleton
            active
            title={{ width: '45%' }}
            paragraph={{ rows: 2, width: ['60%', '35%'] }}
          />
          <div className={styles.footer}>
            <Skeleton avatar active title={false} paragraph={{ rows: 1, width: 140 }} />
            <Skeleton.Button active />
          </div>
        </div>
      </div>
    </div>
  );
}
