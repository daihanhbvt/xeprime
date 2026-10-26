import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { cx } from '@/lib/cx';
import { Reveal } from '@/components/motion/Reveal';
import { SectionHeading } from './SectionHeading';
import styles from './RentalSteps.module.css';

/**
 * Bốn bước theo thứ tự đặt xe thật (ADR 0044: gửi yêu cầu → duyệt → giữ chỗ → nhận xe). Hình minh
 * hoạ là các ô cắt của MỘT tấm sprite — vị trí cắt nằm ở CSS (`.art*`), cùng tấm với mũi tên nối.
 */
const STEPS = [
  { key: 'search', artClass: styles.artSearch },
  { key: 'request', artClass: styles.artRequest },
  { key: 'pickup', artClass: styles.artPickup },
  { key: 'return', artClass: styles.artReturn },
] as const;

/** Một ô cắt của sprite các bước — ảnh phủ đúng khung lớn hơn ô, ô cắt phần cần thấy. */
function SpriteCrop({ className, sizes }: { className: string | undefined; sizes: string }) {
  return (
    <span className={cx(styles.sprite, className)}>
      <Image
        src="/home/steps-sprite.webp"
        alt=""
        fill
        sizes={sizes}
        className={styles.spriteImage}
      />
    </span>
  );
}

/** "Các bước thuê xe — Thuê xe đơn giản chỉ với 4 bước" (design v2 `19695:40905`, ADR 0062). */
export async function RentalSteps() {
  const t = await getTranslations('Home.steps');

  return (
    <section className={styles.section} aria-labelledby="home-steps">
      <SectionHeading
        id="home-steps"
        kicker={t('kicker')}
        title={t('title')}
        align="center"
        divider
      />
      {/* Các bước lần lượt trượt lên khi cuộn tới (≈ `.single-process-item wow fadeInUp`). */}
      <Reveal as="ol" effect="stagger" className={styles.steps}>
        {STEPS.map((step, index) => (
          <li key={step.key} className={styles.step}>
            <span className={styles.artFrame} aria-hidden="true">
              <span className={styles.art}>
                <SpriteCrop className={step.artClass} sizes="1300px" />
              </span>
              {/* Mũi tên nối từ bước trước — trang trí, nằm giữa khe hai bước. */}
              {index > 0 ? (
                <span className={styles.arrow}>
                  <SpriteCrop className={styles.artArrow} sizes="1100px" />
                </span>
              ) : null}
            </span>
            <div className={styles.copy}>
              <h3 className={styles.stepTitle}>{t(`items.${step.key}.title`)}</h3>
              <p className={styles.desc}>{t(`items.${step.key}.desc`)}</p>
            </div>
          </li>
        ))}
      </Reveal>
    </section>
  );
}
