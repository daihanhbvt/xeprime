import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { SUPPORT_HOTLINE } from '@/constants/contact';
import { resolveOwnerCtaHref } from '@/features/auth/post-auth-destination';
import { CtaButton } from './CtaButton';
import styles from './PartnerBanner.module.css';

const BENEFITS = ['income', 'support', 'customers'] as const;

/**
 * "Đăng ký trở thành ĐỐI TÁC ĐỘC QUYỀN" — dải mời chủ xe của trang chủ v2 (Figma `19695:40878`,
 * ADR 0062), thay khối `OwnerCta` cũ.
 *
 * Nút dẫn tới trang chọn cách cho thuê của SITE KHÁCH (`resolveOwnerCtaHref`) — đăng ký thật diễn
 * ra ở site partner, bằng một tài khoản riêng (ADR 0051 điều 3 · ADR 0053).
 */
export async function PartnerBanner() {
  const t = await getTranslations('Home.partner');

  return (
    <section className={styles.banner} aria-labelledby="home-partner">
      <span className={styles.backdrop} aria-hidden="true">
        <Image
          src="/home/partner-bg.webp"
          alt=""
          fill
          sizes="102vw"
          className={styles.backdropImage}
        />
      </span>

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

        <CtaButton
          href={resolveOwnerCtaHref()}
          size="xl"
          shape="pill"
          className={styles.cta}
          iconEnd={
            <span className={styles.ctaIcon}>
              <Image src="/home/partner-arrow.svg" alt="" width={6} height={12} unoptimized />
            </span>
          }
        >
          {t('cta')}
        </CtaButton>

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
