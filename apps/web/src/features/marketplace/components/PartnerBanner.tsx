import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { SUPPORT_HOTLINE } from '@/constants/contact';
import { resolveOwnerCtaHref } from '@/features/auth/post-auth-destination';
import type { PublicBanner } from '@/features/banners/types';
import { CtaButton } from './CtaButton';
import { Magnetic } from '@/components/motion/Magnetic';
import { ParallaxBackdrop } from '@/components/motion/ParallaxBackdrop';
import { cx } from '@/lib/cx';
import styles from './PartnerBanner.module.css';

const BENEFITS = ['income', 'support', 'customers'] as const;

/**
 * "Đăng ký trở thành ĐỐI TÁC ĐỘC QUYỀN" — dải mời chủ xe của trang chủ v2 (Figma `21965:5337`,
 * ADR 0062), thay khối `OwnerCta` cũ.
 *
 * Nút dẫn tới trang chọn cách cho thuê của SITE KHÁCH (`resolveOwnerCtaHref`) — đăng ký thật diễn
 * ra ở site partner, bằng một tài khoản riêng (ADR 0051 điều 3 · ADR 0053).
 *
 * ẢNH NỀN do admin cấu hình (banner vị trí `partner` — dùng banner ĐẦU TIÊN đang hiển thị, ảnh máy
 * tính/tablet/mobile qua `<picture>`); chưa có banner nào thì dùng ảnh mặc định của bản vẽ. Chữ, nút
 * và lớp phủ tối luôn do trang dựng.
 */
export async function PartnerBanner({ banner }: { banner?: PublicBanner | null }) {
  const t = await getTranslations('Home.partner');

  return (
    <section className={styles.banner} aria-labelledby="home-partner">
      {/* Ảnh nền trôi theo vị trí của dải (parallax `view()`), CSS thuần nên an toàn với SSR. */}
      <ParallaxBackdrop className={styles.backdrop} speed={0.3}>
        {banner ? (
          // Không dùng next/image: host R2/URL do admin nhập không nằm trong remotePatterns.
          <picture>
            {banner.mobileImageUrl ? (
              <source media="(max-width: 640px)" srcSet={banner.mobileImageUrl} />
            ) : null}
            {banner.tabletImageUrl ? (
              <source media="(max-width: 1024px)" srcSet={banner.tabletImageUrl} />
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh admin từ storage ngoài */}
            <img src={banner.imageUrl} alt="" loading="lazy" className={styles.adminImage} />
          </picture>
        ) : (
          <>
        {/* Ảnh mặc định MỘT xe theo ba khổ (dư trên/dưới cho hiệu ứng trôi): PC 1440×900, tablet 1024×768, mobile 390×585. */}
        <Image
          src="/home/partner-v7-desktop.webp"
          alt=""
          fill
          sizes="100vw"
          className={cx(styles.backdropImage, styles.backdropDesktop)}
        />
        <Image
          src="/home/partner-v7-tablet.webp"
          alt=""
          fill
          sizes="100vw"
          className={cx(styles.backdropImage, styles.backdropTablet)}
        />
        <Image
          src="/home/partner-v7-mobile.webp"
          alt=""
          fill
          sizes="100vw"
          className={cx(styles.backdropImage, styles.backdropMobile)}
        />
          </>
        )}
      </ParallaxBackdrop>

      <div className={styles.inner}>
        <Image
          src="/home/logo-gold-large.svg"
          alt=""
          width={342}
          height={107}
          unoptimized
          className={styles.logo}
        />

        <h2 id="home-partner" className={styles.title}>
          <span className={styles.titleLead}>{t('titleLead')}</span>{' '}
          <span className={styles.titleAccent}>{t('titleAccent')}</span>
        </h2>

        <Magnetic className={styles.cta}>
          <CtaButton
            href={resolveOwnerCtaHref()}
            size="xl"
            shape="pill"
            iconEnd={
              <span className={styles.ctaIcon}>
                <Image src="/home/partner-arrow.svg" alt="" width={6} height={12} unoptimized />
              </span>
            }
          >
            {t('cta')}
          </CtaButton>
        </Magnetic>

        <ul className={styles.benefits} aria-label={t('benefitsLabel')}>
          {BENEFITS.map((key) => (
            <li key={key} className={styles.benefit}>
              <span className={styles.check} aria-hidden="true">
                <Image src="/home/partner-check.svg" alt="" width={12} height={12} unoptimized />
              </span>
              {t(`benefits.${key}`)}
            </li>
          ))}
        </ul>

        <p className={styles.help}>
          {t.rich('help', {
            phone: SUPPORT_HOTLINE.display,
            // Số tổng đài là dữ liệu — thẻ `tel` bọc nó thành liên kết gọi được.
            tel: (chunks) => (
              <a href={`tel:${SUPPORT_HOTLINE.tel}`} className={styles.phone}>
                {chunks}
              </a>
            ),
          })}
        </p>
      </div>
    </section>
  );
}
