import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Reveal } from '@/components/motion/Reveal';
import { SectionHeading } from './SectionHeading';
import styles from './WhyChooseUs.module.css';

/**
 * Bốn cam kết — icon là asset của design v2 (Figma `19695:40724`). Kích thước là của NÉT VẼ —
 * đặt nguyên cỡ, canh giữa trong ô 48px (SVG Figma không giãn được).
 */
const ITEMS = [
  { key: 'price', icon: '/home/why-price.svg', width: 37, height: 41 },
  { key: 'fleet', icon: '/home/why-fleet.svg', width: 47, height: 33 },
  { key: 'time', icon: '/home/why-time.svg', width: 43, height: 45 },
  { key: 'support', icon: '/home/why-support.svg', width: 45, height: 43 },
] as const;

/**
 * "Tại sao lại chọn XePrime" — bốn cam kết của sàn, nội dung tĩnh theo design v2 (ADR 0062).
 *
 * Server Component: không có tương tác nào, nên không có lý do gì để đẩy nó xuống client.
 */
export async function WhyChooseUs() {
  const t = await getTranslations('Home.why');

  return (
    <section className={styles.section} aria-labelledby="home-why">
      <SectionHeading
        id="home-why"
        kicker={t('kicker')}
        title={t('title')}
        align="center"
        divider
      />
      {/* Bốn ý lần lượt trượt lên khi cuộn tới (≈ `.single-item wow fadeInUp` 0.2 · 0.4 · 0.6s). */}
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
    </section>
  );
}
