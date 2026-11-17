'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { APP_NAME } from '@/constants/app-name';
import { APP_DOWNLOAD_QR } from '@/features/content-page/app-download';
import { cx } from '@/lib/cx';
import styles from './AuthBrandPanel.module.css';

/** Tên cửa hàng là danh từ riêng — lấy từ cùng nguồn với mã QR tải app, không chép lại. */
const STORE = Object.fromEntries(APP_DOWNLOAD_QR.map((s) => [s.key, s])) as Record<
  (typeof APP_DOWNLOAD_QR)[number]['key'],
  (typeof APP_DOWNLOAD_QR)[number]
>;

/** Hai huy hiệu theo thứ tự bản vẽ: Google Play trên, App Store dưới. */
const BADGES = [
  { key: 'android', icon: '/home/google-play.svg', captionKey: 'googlePlayCaption' },
  { key: 'ios', icon: '/home/apple.svg', captionKey: 'appStoreCaption' },
] as const;

/**
 * Cột ảnh bên trái hộp tài khoản site khách — design v2 (Figma `19786:79192` "Image", 580×782):
 * nền vàng-đen, logo, "Hiện đã có mặt trên GooglePlay & App Store", hai huy hiệu cửa hàng và
 * mockup điện thoại bị khung cắt ở mép phải/dưới.
 *
 * Cùng bộ chữ và cùng đích với banner tải ứng dụng ở trang chủ (`AppBanner`): huy hiệu mở thẳng
 * trang app trên cửa hàng (cùng link với mã QR), tab mới - app đã phát hành.
 * Chỉ hiện từ tablet ngang trở lên; màn hẹp hơn hộp chỉ còn cột form.
 */
export function AuthBrandPanel({ className }: { className?: string }) {
  const t = useTranslations('Home.app');

  return (
    <div className={cx(styles.panel, className)}>
      <span className={styles.backdrop} aria-hidden="true">
        <Image src="/home/partner-bg.webp" alt="" fill sizes="5240px" className={styles.fill} />
      </span>
      {/* Vệt sáng mờ của ảnh xem trước app — xoay ngang, hoà sáng (screen) lên nền. */}
      <span className={styles.glow} aria-hidden="true">
        <span className={styles.glowInner}>
          <span className={styles.glowCrop}>
            <Image
              src="/home/app-preview-blur.webp"
              alt=""
              fill
              sizes="950px"
              className={styles.fill}
            />
          </span>
        </span>
      </span>

      <div className={styles.info}>
        <Image
          src="/home/logo-gold-app.svg"
          alt={APP_NAME}
          width={304}
          height={95}
          unoptimized
          className={styles.logo}
        />
        <p className={styles.title}>{t.rich('title', { br: () => <br /> })}</p>
      </div>

      <ul className={styles.badges}>
        {BADGES.map((badge) => (
          <li key={badge.key}>
            <a
              href={STORE[badge.key].value}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.badge}
            >
              <Image src={badge.icon} alt="" width={36} height={36} unoptimized />
              <span className={styles.badgeText}>
                <span className={styles.badgeCaption}>{t(badge.captionKey)}</span>
                <span className={styles.badgeStore}>{STORE[badge.key].store}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>

      <span className={styles.phone}>
        <Image
          src="/auth/phone-preview.webp"
          alt={t('previewAlt')}
          fill
          sizes="545px"
          className={styles.fill}
        />
      </span>
    </div>
  );
}
