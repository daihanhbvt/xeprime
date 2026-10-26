import { Suspense } from 'react';
import type { Metadata } from 'next';
import { fetchBannersServer } from '@/features/banners/api';
import { HomeHero } from '@/features/marketplace/components/HomeHero';
import { SearchExperience } from '@/features/marketplace/search/SearchExperience';
import { WhyChooseUs } from '@/features/marketplace/components/WhyChooseUs';
import { VehiclePreview } from '@/features/marketplace/components/VehiclePreview';
import { PromoBanners } from '@/features/marketplace/components/PromoBanners';
import {
  VehicleTypes,
  homeShowcaseBodyTypes,
} from '@/features/marketplace/components/VehicleTypes';
import { fetchCatalogServer } from '@/features/catalog/api';
import { FeaturedLocations } from '@/features/marketplace/components/FeaturedLocations';
import { FeaturedHosts } from '@/features/marketplace/components/FeaturedHosts';
import { PartnerBanner } from '@/features/marketplace/components/PartnerBanner';
import { RentalSteps } from '@/features/marketplace/components/RentalSteps';
import { CustomerReviews } from '@/features/marketplace/components/CustomerReviews';
import { AppBanner } from '@/features/marketplace/components/AppBanner';
import { BANNER_PLACEMENT, CATALOG_TYPE } from '@xeprime/types';
import { Reveal } from '@/components/motion/Reveal';
import { JsonLd } from '@/components/seo/JsonLd';
import { APP_NAME } from '@/constants/app-name';
import { ROUTES } from '@/constants/routes';
import { cx } from '@/lib/cx';
import { absoluteUrl, openGraphFor } from '@/lib/seo';
import styles from './page.module.css';
import { getLocale, getTranslations } from 'next-intl/server';
import { resolveAppLocale } from '@/i18n/config';

/** Logo thương hiệu dạng ảnh tĩnh, đường dẫn ổn định (không hash) — dùng cho Open Graph + JSON-LD. */
const BRAND_LOGO_PATH = '/brand/xeprime-logo.png';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Marketplace.meta.home');
  const title = t('title');
  const description = t('description');
  // Canonical là `/` trần: `?auth=login`, `?serviceType=` chỉ đổi trạng thái giao diện.
  return {
    title,
    description,
    alternates: { canonical: ROUTES.HOME },
    openGraph: openGraphFor({ title, description, path: ROUTES.HOME, images: [BRAND_LOGO_PATH] }),
  };
}

/**
 * Trang chủ Marketplace — design v2 (Figma `19695:40693`, ADR 0062).
 *
 * Thứ tự khối: dải banner admin (khổ cũ, giữ nguyên khi ráp design) → thẻ tìm kiếm đè mép dưới dải banner → Vì sao chọn
 * XePrime + Xe nổi bật → hai banner khuyến mãi → Loại xe → Địa điểm + Gian hàng nổi bật → dải
 * đối tác (tràn ngang) → Các bước thuê xe → Đánh giá + banner ứng dụng (nền xám nhạt). Mỗi khối
 * đệm trên/dưới 80px; khối khuyến mãi (banner admin, vị trí `promo`) dính vào khối trên nên chỉ đệm
 * dưới, và không có banner khuyến mãi nào thì khối không tồn tại.
 *
 * Page là Server Component: banner fetch server-side (cache 60s) nên slide đầu có trong HTML —
 * LCP không chờ client island. Mỗi khu còn lại là island độc lập tự lo skeleton/lỗi của mình —
 * một mục hỏng không kéo cả trang chủ về một cái Spin.
 *
 * `SearchExperience` gồm thẻ tìm kiếm ở hero VÀ thanh thu gọn dính dưới header — hai trình bày
 * của cùng một trạng thái, nên chúng phải nằm trong cùng một island.
 *
 * **Mọi island đọc `useSearchParams` phải có Suspense RIÊNG** — `SearchExperience` (ngữ cảnh tìm
 * kiếm) và `VehiclePreview` (đọc `?serviceType=` để lọc lại). Thiếu một cái là Next huỷ prerender TOÀN TRANG với
 * `missing-suspense-with-csr-bailout` và `next build` fail — không phải cảnh báo, là lỗi build.
 */
export default async function MarketplacePage() {
  const [banners, promoBanners, catalog] = await Promise.all([
    fetchBannersServer(BANNER_PLACEMENT.HERO),
    fetchBannersServer(BANNER_PLACEMENT.PROMO),
    fetchCatalogServer(resolveAppLocale(await getLocale())),
  ]);
  const showcaseTypes = homeShowcaseBodyTypes(catalog[CATALOG_TYPE.BODY_TYPE]);

  return (
    <div className={styles.page}>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: APP_NAME,
          url: absoluteUrl(ROUTES.HOME),
          logo: absoluteUrl(BRAND_LOGO_PATH),
        }}
      />
      <HomeHero banners={banners} />
      <Suspense fallback={<SearchCardFallback />}>
        <SearchExperience />
      </Suspense>

      {/* Các island client tự dựng khung chờ của mình ngay khi gắn vào; fallback của Suspense chỉ
          tồn tại trong HTML tĩnh nên để rỗng là đúng, không phải bỏ sót. */}
      <div className={cx(styles.container, styles.block, styles.intro)}>
        <WhyChooseUs />
        <Suspense fallback={null}>
          <VehiclePreview />
        </Suspense>
      </div>

      {/* Banner khuyến mãi do admin quản lý — chưa có banner nào đang hiển thị thì không dựng khối. */}
      {promoBanners.length > 0 ? (
        <Reveal className={cx(styles.container, styles.blockBottom)}>
          <PromoBanners banners={promoBanners} />
        </Reveal>
      ) : null}

      {/* Kiểu dáng bật "Hiện ở trang chủ" trong Danh mục lọc — chưa có mục nào thì không dựng khối. */}
      {showcaseTypes.length > 0 ? (
        <div className={styles.typesBand}>
          <div className={cx(styles.container, styles.block)}>
            <VehicleTypes items={showcaseTypes} />
          </div>
        </div>
      ) : null}

      <div className={cx(styles.container, styles.block, styles.discover)}>
        <FeaturedLocations />
        <FeaturedHosts />
      </div>

      <Reveal>
        <PartnerBanner />
      </Reveal>

      <div className={cx(styles.container, styles.block)}>
        <RentalSteps />
      </div>

      <div className={styles.testimonialsBand}>
        <div className={cx(styles.container, styles.block, styles.testimonials)}>
          <CustomerReviews className={styles.reviews} />
          <AppBanner className={styles.appBanner} />
        </div>
      </div>
    </div>
  );
}

function SearchCardFallback() {
  return (
    <div className={styles.searchFallback}>
      <div className={styles.searchFallbackInner} aria-hidden />
    </div>
  );
}
