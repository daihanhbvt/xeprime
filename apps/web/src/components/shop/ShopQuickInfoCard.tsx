'use client';

import type { ReactNode } from 'react';
import { EnvironmentOutlined } from '@ant-design/icons';
import Link from 'next/link';
import type { HostMetrics as HostMetricsShape } from '@xeprime/types';
import { useTranslations } from 'next-intl';
import { shopPath } from '@/constants/routes';
import { VerifiedMark } from '@/components/common/VerifiedMark';
import { HostMetrics } from '@/features/marketplace/components/HostMetrics';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { initialOf } from '@/lib/initials';
import { roundedCount } from '@/lib/rounded-count';
import styles from './ShopQuickInfoCard.module.css';
import { RatingStar } from '@/components/data-display/Stars';

export interface ShopQuickInfoCardShop {
  name: string;
  slug: string;
  logoUrl?: string | null;
  verified: boolean;
  province?: string | null;
  bio?: string | null;
  /**
   * `undefined` KHÁC `null`/`0` — body cũ trong Data Cache của Next có thể chưa từng có trường
   * này (xem lý do tương tự ở `HostMetrics`). Component phải im lặng, không vỡ trang.
   */
  ratingAvg?: string | null;
  ratingCount?: number;
  completedTripCount?: number;
}

function TripsIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#12b76a"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={styles.tripsIcon}
      aria-hidden="true"
    >
      <rect x="2.5" y="3.5" width="19" height="17" rx="4" />
      <path d="M7.5 15v-3M12 15v-6M16.5 15v-8" />
    </svg>
  );
}

/**
 * Thẻ "thông tin nhanh gian hàng" DÙNG CHUNG — trang chi tiết xe (`variant="full"`) và cột tóm
 * tắt của luồng gửi yêu cầu thuê (`variant="compact"`). Trước 23/09/2026 mỗi nơi tự dựng avatar +
 * tên + rating riêng, hai bản lệch nhau cả về dữ liệu (rating của XE, không phải của GIAN HÀNG)
 * lẫn kiểu dáng.
 *
 * `compact` bỏ giới thiệu, ba chỉ số và dòng tóm tắt uy tín — cột tóm tắt của luồng đặt xe đã có
 * ảnh xe, giá và thông số ngay phía trên, không phải chỗ để lặp lại cả một hồ sơ gian hàng.
 */
export function ShopQuickInfoCard({
  shop,
  metrics,
  variant = 'full',
  actions,
  className,
}: {
  shop: ShopQuickInfoCardShop;
  metrics: HostMetricsShape | null | undefined;
  variant?: 'full' | 'compact' | 'inline';
  actions?: ReactNode;
  className?: string;
}) {
  const t = useTranslations('Shops');
  const fmt = useAppFormat();

  const ratingAvg = shop.ratingAvg != null ? Number(shop.ratingAvg) : null;
  const hasRating =
    typeof shop.ratingCount === 'number' &&
    shop.ratingCount > 0 &&
    ratingAvg != null &&
    Number.isFinite(ratingAvg);
  const hasTrips = typeof shop.completedTripCount === 'number';
  const trips = hasTrips ? roundedCount(shop.completedTripCount as number) : null;

  // Dòng ghi chú "Chủ xe được khách đánh giá…" đã GỠ theo yêu cầu người dùng (04/11/2026).

  if (variant === 'inline') {
    return (
      <div className={cx(styles.card, styles.inlineCard, !shop.verified && styles.inlineCardOwner, className)}>
        <div className={styles.inlineMainRow}>
          <div className={styles.row}>
            <div className={styles.avatarWrap}>
              <span className={styles.avatar} aria-hidden="true">
                {shop.logoUrl ? (
                  <img src={shop.logoUrl} alt="" className={styles.avatarImg} />
                ) : (
                  initialOf(shop.name)
                )}
              </span>
              {shop.verified ? (
                // Cùng dấu tích xanh của thẻ xe trang chủ (`/home/card-verified.svg` trong đĩa trắng).
                <span className={styles.verifiedBadgeInline} role="img" aria-label={t('header.verified')}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- SVG tĩnh 12px */}
                  <img src="/home/card-verified.svg" alt="" width={12} height={12} />
                </span>
              ) : null}
            </div>

            <div className={styles.body}>
              {/*
                Hai tuyến trên một chợ (ADR 0028): cùng tín hiệu với thẻ xe ở trang kết quả — đã xác
                minh là gian hàng, còn lại là chủ xe cá nhân.
              */}
              <span className={styles.shopTypeLabel}>
                {shop.verified ? t('card.type.shop') : t('card.type.owner')}
              </span>
              <div className={styles.nameRow}>
                <Link href={shopPath.detail(shop.slug)} className={styles.name}>
                  {shop.name}
                </Link>
              </div>
            </div>
          </div>

          <HostMetrics metrics={metrics} variant="inline" className={styles.inlineMetrics} />
        </div>

        {/* Figma "Owner Activity": điểm + số chuyến là HÀNG RIÊNG dưới cả khối, không nằm dưới tên. */}
        {hasRating || hasTrips ? (
          <div className={styles.summary}>
            {hasRating ? (
              <span className={styles.rating}>
                <RatingStar size={20} className={styles.star} />
                {fmt.rating(ratingAvg as number)}
                {/* Figma: "4.7 (Đã cho thuê 28 lần)" — số lần cho thuê = chuyến đã hoàn thành. */}
                {trips ? (
                  <span className={styles.ratingCount}>
                    {' ('}
                    {t('card.rentedTimes', {
                      count: trips.display,
                      plus: trips.approximate ? '+' : '',
                    })}
                    {')'}
                  </span>
                ) : null}
              </span>
            ) : null}
            {hasTrips && trips ? (
              <span className={styles.trips}>
                <TripsIcon />
                {t('card.trips', {
                  count: trips.display,
                  plus: trips.approximate ? '+' : '',
                })}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cx(styles.card, variant === 'compact' && styles.compact, className)}>
      <div className={styles.row}>
        <span
          className={cx(styles.avatar, variant === 'compact' && styles.avatarSm)}
          aria-hidden="true"
        >
          {shop.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo gian hàng từ R2, host theo môi trường
            <img src={shop.logoUrl} alt="" className={styles.avatarImg} />
          ) : (
            initialOf(shop.name)
          )}
        </span>
        <div className={styles.body}>
          <div className={styles.nameRow}>
            <Link href={shopPath.detail(shop.slug)} className={styles.name}>
              {shop.name}
            </Link>
            {shop.verified ? (
              <VerifiedMark label={t('header.verified')} size={16} className={styles.verified} />
            ) : null}
          </div>
          {variant === 'full' && shop.province ? (
            <div className={styles.meta}>
              <EnvironmentOutlined aria-hidden="true" /> {shop.province}
            </div>
          ) : null}
          {/*
            Giới thiệu nằm TRONG cột chữ (thụt vào ngang tên), không phải một dải full-width dưới
            avatar: tên · vị trí · giới thiệu · điểm đánh giá là MỘT khối danh tính đọc liền mạch.
            Ô số liệu và các nút mới là thứ trải hết bề ngang thẻ.
          */}
          {variant === 'full' && shop.bio ? <p className={styles.bio}>{shop.bio}</p> : null}
          {hasRating || hasTrips ? (
            <div className={styles.summary}>
              {hasRating ? (
                <span className={styles.rating}>
                  <RatingStar size={16} className={styles.star} />
                  {fmt.rating(ratingAvg as number)}
                </span>
              ) : null}
              {hasRating && hasTrips ? (
                <span className={styles.divider} aria-hidden="true" />
              ) : null}
              {hasTrips && trips ? (
                <span className={styles.trips}>
                  {t('card.trips', { count: trips.display, plus: trips.approximate ? '+' : '' })}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {variant === 'compact' && actions ? (
          <div className={styles.inlineActions}>{actions}</div>
        ) : null}
      </div>

      {variant === 'full' ? <HostMetrics metrics={metrics} className={styles.metrics} /> : null}
      {variant === 'full' && actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
}
