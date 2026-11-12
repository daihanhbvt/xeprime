import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ROUTES } from '@/constants/routes';
import { APP_DOWNLOAD_QR } from '@/features/content-page/app-download';
import { cx } from '@/lib/cx';
import styles from './AppBanner.module.css';

/** Tên cửa hàng lấy từ nguồn chung của trang tải app — không viết lại ở đây. */
const STORE_NAME = Object.fromEntries(APP_DOWNLOAD_QR.map((s) => [s.key, s.store])) as Record<
  (typeof APP_DOWNLOAD_QR)[number]['key'],
  string
>;

const BADGES = [
  { key: 'android', icon: '/home/app-google-play.svg', captionKey: 'googlePlayCaption' },
  { key: 'ios', icon: '/home/app-apple.svg', captionKey: 'appStoreCaption' },
] as const;

/**
 * Banner tải ứng dụng — Figma "App Promotion Banner" (`19786:79519`, ADR 0062): nền ảnh vàng sáng
 * viền `#ffd891`, logo, câu mời chữ tối, hai huy hiệu cửa hàng kính mờ và ảnh điện thoại NHÔ RA khỏi
 * mép trên + mép phải của khung (ảnh nền bị cắt trong khung, điện thoại thì không).
 *
 * Server Component: không có tương tác nào ngoài hai liên kết.
 */
export async function AppBanner({ className }: { className?: string }) {
  const t = await getTranslations('Home.app');
  return (
    <section className={cx(styles.banner, className)} aria-labelledby="home-app">
      {/* Lớp nền cắt theo khung bo góc — điện thoại nằm NGOÀI lớp này nên được nhô ra. */}
      <span className={styles.surface} aria-hidden="true">
        <Image src="/home/app-banner-bg.webp" alt="" fill sizes="480px" className={styles.cover} />
        {/* Vệt sáng mờ của ảnh xem trước app — xoay ngang, hoà sáng (screen) lên nền. */}
        <span className={styles.glow}>
          <span className={styles.glowInner}>
            <span className={styles.glowCrop}>
              <Image
                src="/home/app-preview-blur-v2.webp"
                alt=""
                fill
                sizes="420px"
                className={styles.fill}
              />
            </span>
          </span>
        </span>
      </span>
      <Image
        src="/home/app-logo.svg"
        alt=""
        width={216}
        height={68}
        unoptimized
        className={styles.logo}
      />
      <h2 id="home-app" className={styles.title}>
        {t.rich('title', { br: () => <br /> })}
      </h2>
      <ul className={styles.badges}>
        {BADGES.map((badge) => (
          <li key={badge.key}>
            <Link href={ROUTES.APP} className={styles.badge}>
              <Image src={badge.icon} alt="" width={24} height={24} unoptimized />
              <span className={styles.badgeText}>
                <span className={styles.badgeCaption}>{t(badge.captionKey)}</span>
                <span className={styles.badgeStore}>{STORE_NAME[badge.key]}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <span className={styles.phone}>
        <span className={styles.phoneCrop}>
          <Image
            src="/home/app-phone.webp"
            alt={t('previewAlt')}
            fill
            sizes="375px"
            className={styles.fill}
          />
        </span>
      </span>
    </section>
  );
}
