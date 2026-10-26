import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { VEHICLE_TYPE, VEHICLE_TYPE_VALUES, type VehicleType } from '@xeprime/types';
import type { CatalogItem } from '@/features/catalog/types';
import { marketplaceSearchHref } from '../filter-params';
import { CtaButton } from './CtaButton';
import { HomeCarousel } from './HomeCarousel';
import { Reveal } from '@/components/motion/Reveal';
import { SectionHeading } from './SectionHeading';
import styles from './VehicleTypes.module.css';

/**
 * Kiểu dáng được bật "Hiện ở trang chủ" — đúng thứ tự danh mục (API đã sắp theo `sortOrder`).
 * Lọc thêm ảnh cho chắc: DB đã CHECK "bật thì phải có ảnh", nhưng thẻ thiếu ảnh là thẻ hỏng.
 */
export function homeShowcaseBodyTypes(bodyTypes: readonly CatalogItem[]): CatalogItem[] {
  return bodyTypes.filter((item) => item.showOnHome && Boolean(item.showcaseImageUrl));
}

function isVehicleType(value: string | undefined): value is VehicleType {
  return (VEHICLE_TYPE_VALUES as readonly (string | undefined)[]).includes(value);
}

/** Kiểu dáng áp dụng cho đúng MỘT loại xe thì link mang luôn loại xe đó; nhiều loại thì để trống. */
function typeHref(item: CatalogItem): string {
  const only = item.vehicleTypes.length === 1 ? item.vehicleTypes[0] : undefined;
  return marketplaceSearchHref({
    vehicleType: isVehicleType(only) ? only : undefined,
    bodyType: [item.key],
  });
}

/**
 * "Loại xe — Phù hợp cho mọi nhu cầu của bạn" (design v2, ADR 0062): mỗi thẻ là một KIỂU DÁNG
 * của danh mục lọc, bấm là sang kết quả đã lọc.
 *
 * Không còn gán cứng: admin bật "Hiện ở trang chủ", tải ảnh lớn và nhập dòng ví dụ ngay trong
 * "Danh mục lọc" › "Kiểu dáng xe". Tên và thứ tự là của chính danh mục — trang chủ, bộ lọc và form
 * tạo xe không bao giờ gọi một kiểu dáng bằng hai cái tên. Page không dựng khối khi chưa có mục nào.
 */
export async function VehicleTypes({ items }: { items: readonly CatalogItem[] }) {
  const t = await getTranslations('Home.types');
  const viewAllHref = marketplaceSearchHref({ vehicleType: VEHICLE_TYPE.CAR });

  return (
    <section className={styles.section} aria-labelledby="home-types">
      <SectionHeading
        id="home-types"
        kicker={t('kicker')}
        title={t('title')}
        action={
          <CtaButton href={viewAllHref} variant="outline">
            {t('viewAll')}
          </CtaButton>
        }
      />
      {/* Băng chuyền trượt lên sau tiêu đề khi cuộn tới (≈ `.category-slider wow fadeInUp` 0.2s). */}
      <Reveal delay={200}>
        <HomeCarousel ariaLabel={t('title')} perView={4}>
          {items.map((item) => (
            <Link key={item.key} href={typeHref(item)} className={styles.card}>
              <span className={styles.media}>
                {/* eslint-disable-next-line @next/next/no-img-element -- ảnh admin tải lên R2 không nằm trong remotePatterns của next/image */}
                <img
                  src={item.showcaseImageUrl ?? ''}
                  alt=""
                  loading="lazy"
                  className={styles.image}
                />
              </span>
              <span className={styles.details}>
                <span className={styles.name}>{item.label}</span>
                {item.showcaseExamples ? (
                  <span className={styles.examples}>{item.showcaseExamples}</span>
                ) : null}
              </span>
            </Link>
          ))}
        </HomeCarousel>
      </Reveal>
      {/* Mobile: "Xem tất cả" canh giữa dưới slider (nút ở hàng tiêu đề ẩn đi). */}
      <div className={styles.mobileAction}>
        <CtaButton href={viewAllHref} variant="outline">
          {t('viewAll')}
        </CtaButton>
      </div>
    </section>
  );
}
