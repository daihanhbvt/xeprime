'use client';

import { Alert, Skeleton } from 'antd';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { shopPath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { initialOf } from '@/lib/initials';
import { useFeaturedShops } from '../hooks/use-featured-shops';
import type { PublicShopSummary } from '../types';
import { HomeCarousel } from './HomeCarousel';
import { SectionHeading } from './SectionHeading';
import styles from './FeaturedHosts.module.css';

/** Ba trang × ba thẻ — nhiều hơn là thành danh bạ, không còn là "nổi bật". */
const LIMIT = 9;

/**
 * "Gian hàng nổi bật — Những chủ xe được khách đánh giá cao" (design v2, ADR 0062).
 *
 * Shop đang hoạt động có xe công khai, sắp theo điểm đánh giá (`/public/shops`). Điểm, số xe,
 * số chuyến đã hoàn thành và ảnh xe đại diện đều từ backend — không biên tập tay. Chưa có gian
 * hàng nào đủ điều kiện thì ẩn cả khối, không để một tiêu đề trên khoảng trống.
 */
export function FeaturedHosts() {
  const t = useTranslations('Home.owners');
  const errorMessage = useErrorMessage();
  const { data, isLoading, isError, error } = useFeaturedShops(LIMIT);
  const shops = data?.shops ?? [];

  if (!isLoading && !isError && shops.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="home-hosts">
      <SectionHeading id="home-hosts" kicker={t('kicker')} title={t('title')} />

      {isError ? (
        <Alert type="error" showIcon title={t('loadError')} description={errorMessage(error)} />
      ) : isLoading ? (
        <div className={styles.skeletonRow} aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className={styles.card}>
              <Skeleton active avatar={{ size: 48 }} paragraph={{ rows: 3 }} />
            </div>
          ))}
        </div>
      ) : (
        <HomeCarousel ariaLabel={t('title')} perView={3} overhang>
          {shops.map((shop) => (
            <HostCard key={shop.slug} shop={shop} />
          ))}
        </HomeCarousel>
      )}
    </section>
  );
}

function HostCard({ shop }: { shop: PublicShopSummary }) {
  const t = useTranslations('Home.owners');
  // Cùng một cách viết điểm "4,9 (12)" với thẻ xe — một câu, một bản dịch.
  const tCard = useTranslations('Listings.card');
  const fmt = useAppFormat();
  const rating = Number(shop.ratingAvg);
  const hasRating = shop.ratingCount > 0 && Number.isFinite(rating);

  return (
    <Link
      href={shopPath.detail(shop.slug)}
      className={styles.card}
      aria-label={t('viewShopAria', { name: shop.name })}
    >
      <span className={styles.head}>
        <span
          className={cx(styles.avatar, shop.verified && styles.avatarVerified)}
          aria-hidden="true"
        >
          {shop.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo gian hàng từ storage ngoài
            <img src={shop.logoUrl} alt="" loading="lazy" className={styles.logo} />
          ) : (
            initialOf(shop.name)
          )}
          {shop.verified ? (
            <span className={styles.mark}>
              <Image src="/home/card-verified.svg" alt="" width={10} height={10} unoptimized />
            </span>
          ) : null}
        </span>
        <span className={styles.identity}>
          <span className={styles.name}>{shop.name}</span>
          <span className={styles.meta}>
            <span>{t('vehicleCount', { count: shop.vehicleCount })}</span>
            {shop.provinceName ? (
              <>
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.province}>
                  <span className={styles.icon16} aria-hidden="true">
                    <Image
                      src="/home/card-location.svg"
                      alt=""
                      width={12}
                      height={15}
                      unoptimized
                    />
                  </span>
                  <span className={styles.provinceText}>{shop.provinceName}</span>
                </span>
              </>
            ) : null}
          </span>
        </span>
      </span>

      {/*
        Ảnh xe đại diện nhô lên khỏi mép thẻ như bản vẽ. Đây là ảnh THẬT của xe xếp hạng cao nhất
        đang công khai — gian hàng chưa có ảnh nào thì thôi, không đặt ảnh minh hoạ giả.
      */}
      {shop.featuredVehicleImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh xe từ storage ngoài
        <img
          src={shop.featuredVehicleImageUrl}
          alt=""
          loading="lazy"
          className={styles.vehicle}
          aria-hidden="true"
        />
      ) : null}

      {/* Giới thiệu là dữ liệu gian hàng tự viết — chưa viết thì giữ chỗ để các thẻ thẳng hàng. */}
      <span className={styles.bio}>{shop.bio}</span>

      <span className={styles.footer}>
        <span className={styles.stats}>
          {hasRating ? (
            <span className={styles.rating}>
              <Image src="/home/star-16.svg" alt="" width={16} height={16} unoptimized />
              <span>
                {tCard.rich('ratingValue', {
                  rating: fmt.rating(rating),
                  count: shop.ratingCount,
                  muted: (chunks) => <span className={styles.muted}>{chunks}</span>,
                })}
              </span>
            </span>
          ) : null}
          {shop.completedTripCount > 0 ? (
            <span className={styles.rentals}>
              {t.rich('rentals', {
                count: shop.completedTripCount,
                label: (chunks) => <span className={styles.muted}>{chunks}</span>,
              })}
            </span>
          ) : null}
        </span>
        <span className={styles.viewShop}>{t('viewShop')}</span>
      </span>
    </Link>
  );
}
