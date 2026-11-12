import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { NumberTicker } from '@/components/motion/NumberTicker';
import { Reveal } from '@/components/motion/Reveal';
import { SectionHeading } from './SectionHeading';
import { cx } from '@/lib/cx';
import styles from './WhyChooseUs.module.css';
import { bounceInClass, seqClass, viewParallaxClass } from '@/components/motion/motion-classes';

/**
 * Bốn cam kết — icon là asset của Figma "Solutions Section" (`21965:5232`). Kích thước là của NÉT
 * VẼ — đặt nguyên cỡ, canh giữa trong ô 32px (SVG Figma không giãn được).
 */
const ITEMS = [
  { key: 'price', icon: '/home/why-price.svg', width: 25, height: 28 },
  { key: 'fleet', icon: '/home/why-fleet.svg', width: 31, height: 22 },
  { key: 'time', icon: '/home/why-time.svg', width: 29, height: 30 },
  { key: 'support', icon: '/home/why-support.svg', width: 28, height: 27 },
] as const;

/**
 * "Lý do nên chọn XePrime" — Figma "Homepage - Updated" › Solutions Section (`21965:5232`, ADR 0062).
 *
 * Hai cột: trái là tiêu đề + hai đoạn giới thiệu + lưới 2 × 2 cam kết; phải là ảnh tĩnh tỉ lệ 532:488 (co theo cột)
 * kèm ô "100+ xe đang cho thuê". Con số là CHỮ TĨNH trong bản dịch (người dùng chốt 02/11/2026),
 * không đếm từ API.
 *
 * Server Component: không có tương tác nào, nên không có lý do gì để đẩy nó xuống client.
 */
export async function WhyChooseUs() {
  const t = await getTranslations('Home.why');
  return (
    <section className={styles.section} aria-labelledby="home-why">
      <div className={styles.content}>
        <div className={styles.intro}>
          <SectionHeading
            id="home-why"
            kicker={t('kicker')}
            title={t.rich('title', {
              accent: (chunks) => <span className={styles.accent}>{chunks}</span>,
            })}
            divider
            className={styles.heading}
          />
          <div className={styles.description}>
            <p className={styles.lead}>{t('intro')}</p>
            <p className={styles.closing}>{t('closing')}</p>
          </div>
        </div>

        {/* Mỗi ý là một cổng riêng: hiện khi CHÍNH NÓ cuộn tới (không theo đầu khối). */}
        <ul className={cx(styles.list, seqClass)}>
          {ITEMS.map((item) => (
            <Reveal as="li" key={item.key} className={styles.item}>
              <span className={cx(styles.iconWrap, bounceInClass)} aria-hidden="true">
                <span className={styles.iconBox}>
                  <Image src={item.icon} alt="" width={item.width} height={item.height} unoptimized />
                </span>
              </span>
              <div className={styles.copy}>
                <h3 className={styles.title}>{t(`items.${item.key}.title`)}</h3>
                <p className={styles.desc}>{t(`items.${item.key}.desc`)}</p>
              </div>
            </Reveal>
          ))}
        </ul>
      </div>

      <Reveal className={styles.media}>
        <Image
          src="/home/why-image.png"
          alt={t('imageAlt')}
          width={532}
          height={488}
          sizes="(max-width: 1024px) min(100vw, 640px), 46vw"
          className={cx(styles.image, viewParallaxClass)}
        />
        <div className={cx(styles.stat, viewParallaxClass)}>
          <p className={styles.statValue}>
            <NumberTicker value={t('statValue')} />
          </p>
          <p className={styles.statLabel}>{t('statLabel')}</p>
        </div>
      </Reveal>
    </section>
  );
}
