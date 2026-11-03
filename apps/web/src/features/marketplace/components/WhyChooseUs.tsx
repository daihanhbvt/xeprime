import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Reveal } from '@/components/motion/Reveal';
import { SectionHeading } from './SectionHeading';
import styles from './WhyChooseUs.module.css';

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
 * Hai cột: trái là tiêu đề + hai đoạn giới thiệu + lưới 2 × 2 cam kết; phải là ảnh tĩnh 532×488
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

        {/* Bốn ý lần lượt trượt lên khi cuộn tới. */}
        <Reveal as="ul" effect="stagger" className={styles.list}>
          {ITEMS.map((item) => (
            <li key={item.key} className={styles.item}>
              <span className={styles.iconWrap} aria-hidden="true">
                <span className={styles.iconBox}>
                  <Image src={item.icon} alt="" width={item.width} height={item.height} unoptimized />
                </span>
              </span>
              <div className={styles.copy}>
                <h3 className={styles.title}>{t(`items.${item.key}.title`)}</h3>
                <p className={styles.desc}>{t(`items.${item.key}.desc`)}</p>
              </div>
            </li>
          ))}
        </Reveal>
      </div>

      <Reveal className={styles.media}>
        <Image
          src="/home/why-image.png"
          alt={t('imageAlt')}
          width={532}
          height={488}
          sizes="(max-width: 1024px) 100vw, 532px"
          className={styles.image}
        />
        <div className={styles.stat}>
          <p className={styles.statValue}>{t('statValue')}</p>
          <p className={styles.statLabel}>{t('statLabel')}</p>
        </div>
      </Reveal>
    </section>
  );
}
