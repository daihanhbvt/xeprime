import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { ROUTES } from '@/constants/routes';
import { APP_DOWNLOAD_QR } from '@/features/content-page/app-download';
import { cx } from '@/lib/cx';
import styles from './AppBanner.module.css';

/** Tên cửa hàng là danh từ riêng — lấy từ cùng nguồn với mã QR tải app, không chép lại. */
const STORE_NAME = Object.fromEntries(APP_DOWNLOAD_QR.map((s) => [s.key, s.store])) as Record<
  (typeof APP_DOWNLOAD_QR)[number]['key'],
  string
>;

/** Hai huy hiệu theo thứ tự bản vẽ: Google Play trên, App Store dưới. */
const BADGES = [
  { key: 'android', icon: '/home/google-play.svg', captionKey: 'googlePlayCaption' },
  { key: 'ios', icon: '/home/apple.svg', captionKey: 'appStoreCaption' },
] as const;

/**
 * Banner "Hiện đã có mặt trên Google Play & App Store" cạnh khối đánh giá (design v2
 * `19695:40877`, ADR 0062).
 *
 * Hai huy hiệu dẫn tới trang `/app` chứ không thẳng ra store: trang đó là nơi DUY NHẤT nói trạng
 * thái phát hành của ứng dụng và giữ mã QR (`APP_DOWNLOAD_QR`). Khi có link store thật, chỉ trang
 * đó và hằng QR đổi — banner này không giữ link riêng nào để quên sửa.
 */
export async function AppBanner({ className }: { className?: string }) {
  const t = await getTranslations('Home.app');

  return (
    <section className={cx(styles.banner, className)} aria-labelledby="home-app">
      <span className={styles.backdrop} aria-hidden="true">
        <Image src="/home/partner-bg.webp" alt="" fill sizes="1550px" className={styles.fill} />
      </span>
      {/* Vệt sáng mờ của ảnh xem trước app — xoay ngang, hoà sáng (screen) lên nền. */}
      <span className={styles.glow} aria-hidden="true">
        <span className={styles.glowInner}>
          <span className={styles.glowCrop}>
            <Image
              src="/home/app-preview-blur.webp"
              alt=""
              fill
              sizes="420px"
              className={styles.fill}
            />
          </span>
        </span>
      </span>

      <Image
        src="/home/logo-gold-app.svg"
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

      <span className={styles.device}>
        <span className={styles.frame} aria-hidden="true">
          <Image
            src="/home/app-iphone-frame.webp"
            alt=""
            fill
            sizes="340px"
            className={styles.fill}
          />
        </span>
        <span className={styles.screen}>
          <Image
            src="/home/app-screen.webp"
            alt={t('previewAlt')}
            fill
            sizes="340px"
            className={styles.fill}
          />
        </span>
      </span>
    </section>
  );
}
