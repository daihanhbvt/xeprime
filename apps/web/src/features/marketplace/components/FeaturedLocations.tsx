'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { marketplaceSearchHref } from '../filter-params';
import { useAllDestinations } from '../hooks/use-destinations';
import { HomeCarousel } from './HomeCarousel';
import { SectionHeading } from './SectionHeading';
import styles from './FeaturedLocations.module.css';

/**
 * Bốn điểm đến của bản vẽ v2 (Figma `19695:40795`) — mỗi thành phố là một mã tỉnh THẬT (danh mục
 * 34 tỉnh sau sáp nhập) và một ô cắt của tranh minh hoạ chung. Vị trí cắt nằm ở CSS (`.city*`),
 * không ở đây: đó là chi tiết trình bày của cùng một tấm tranh.
 */
const CITIES = [
  { key: 'danang', provinceCode: '48', className: styles.cityDanang },
  { key: 'hanoi', provinceCode: '01', className: styles.cityHanoi },
  { key: 'hcm', provinceCode: '79', className: styles.cityHcm },
  { key: 'hue', provinceCode: '46', className: styles.cityHue },
] as const;

/**
 * "Địa điểm nổi bật — Khám phá xe thuê tại các điểm đến phổ biến" (design v2, ADR 0062).
 *
 * Số xe và giá "chỉ từ" là số THẬT của `/public/destinations` (giá tự lái theo ngày thấp nhất,
 * đã trừ khuyến mãi). Thành phố chưa có xe nào vẫn hiện thẻ — đây là khối giới thiệu điểm đến —
 * nhưng không bịa số: dòng số liệu chỉ hiện khi API trả về tỉnh đó.
 */
export function FeaturedLocations() {
  const t = useTranslations('Home.destinations');
  const fmt = useAppFormat();
  const { data } = useAllDestinations();
  const byCode = new Map((data ?? []).map((d) => [d.provinceCode, d]));

  return (
    <section className={styles.section} aria-labelledby="home-destinations">
      <SectionHeading
        id="home-destinations"
        kicker={t('kicker')}
        title={t('title')}
        align="center"
        divider
      />
      {/* Lưới 4 thẻ từ tablet trở lên; mobile là slider thẻ-ở-giữa (bản vẽ mobile v2). */}
      <HomeCarousel ariaLabel={t('title')} perView={4} layout="grid" gap={24}>
        {CITIES.map((city) => {
          const name = t(`cities.${city.key}`);
          const stats = byCode.get(city.provinceCode);
          return (
            <Link
              key={city.key}
              href={marketplaceSearchHref({ provinceCode: city.provinceCode })}
              className={styles.card}
              aria-label={t('exploreAria', { city: name })}
            >
              <span className={styles.art} aria-hidden="true">
                <span className={styles.backdrop}>
                  <Image
                    src="/home/dest-bg.webp"
                    alt=""
                    fill
                    sizes="470px"
                    className={styles.layer}
                  />
                </span>
                <span className={cx(styles.illustration, city.className)}>
                  <Image
                    src="/home/dest-cities.webp"
                    alt=""
                    fill
                    sizes="1300px"
                    className={styles.layer}
                  />
                </span>
              </span>

              <span className={styles.details}>
                <span className={styles.city}>{name}</span>
                {stats ? (
                  <span className={styles.meta}>
                    <span>{t('available', { count: stats.vehicleCount })}</span>
                    {stats.minDailyPrice ? (
                      <span>
                        {t.rich('fromPrice', {
                          price: fmt.moneyCompact(stats.minDailyPrice, { price: true }),
                          strong: (chunks) => <b>{chunks}</b>,
                        })}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </span>

              <span className={styles.footer} aria-hidden="true">
                <Image
                  src="/home/dest-wave-1.svg"
                  alt=""
                  width={282}
                  height={128}
                  unoptimized
                  className={styles.waveBack}
                />
                <Image
                  src="/home/dest-wave-2.svg"
                  alt=""
                  width={270}
                  height={65}
                  unoptimized
                  className={styles.waveFront}
                />
                <span className={styles.explore}>
                  {t('explore')}
                  <Image
                    src="/home/arrow-right-dark.svg"
                    alt=""
                    width={5}
                    height={10}
                    unoptimized
                  />
                </span>
              </span>
            </Link>
          );
        })}
      </HomeCarousel>
    </section>
  );
}
