import { Suspense } from 'react';
import type { Metadata } from 'next';
import { fetchBannersServer } from '@/features/banners/api';
import { HomeHero } from '@/features/marketplace/components/HomeHero';
import { SearchExperience } from '@/features/marketplace/search/SearchExperience';
import { VehiclePreview } from '@/features/marketplace/components/VehiclePreview';
import { FeaturedLocations } from '@/features/marketplace/components/FeaturedLocations';
import { FeaturedHosts } from '@/features/marketplace/components/FeaturedHosts';
import { RentalSteps } from '@/features/marketplace/components/RentalSteps';
import { OwnerCta } from '@/features/marketplace/components/OwnerCta';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Thuê xe tự lái & có tài xế trên toàn quốc',
  description:
    'XePrime — thuê ô tô tự lái, có tài xế và xe máy khắp Việt Nam. Đặt xe nhanh, thanh toán sau khi chủ xe xác nhận.',
};

/**
 * Trang chủ Marketplace.
 *
 * Page là Server Component: banner fetch server-side (cache 60s) nên slide đầu có trong HTML —
 * LCP không chờ client island. Mỗi khu còn lại là island độc lập tự lo skeleton/lỗi của mình —
 * một mục hỏng không kéo cả trang chủ về một cái Spin.
 *
 * `SearchExperience` gồm thẻ tìm kiếm ở hero VÀ thanh thu gọn dính dưới header — hai trình bày
 * của cùng một trạng thái, nên chúng phải nằm trong cùng một island.
 *
 * **Mọi island đọc `useSearchParams` phải có Suspense RIÊNG** — `SearchExperience` (ngữ cảnh tìm
 * kiếm), `VehiclePreview` (đọc `?serviceType=` để lọc lại) và `FeaturedLocations` (ghi
 * `?provinceCode=` khi bấm một địa điểm). Thiếu một cái là Next huỷ prerender TOÀN TRANG với
 * `missing-suspense-with-csr-bailout` và `next build` fail — không phải cảnh báo, là lỗi build.
 */
export default async function MarketplacePage() {
  const banners = await fetchBannersServer();

  return (
    <>
      <HomeHero banners={banners} />
      <Suspense fallback={<SearchCardFallback />}>
        <SearchExperience />
      </Suspense>
      <div className={styles.sections}>
        {/* Hai island dưới đây tự dựng khung chờ của mình ngay khi gắn vào; fallback của
            Suspense chỉ tồn tại trong HTML tĩnh nên để rỗng là đúng, không phải bỏ sót. */}
        <Suspense fallback={null}>
          <VehiclePreview />
        </Suspense>
        <Suspense fallback={null}>
          <FeaturedLocations />
        </Suspense>
        <FeaturedHosts />
        <RentalSteps />
        <OwnerCta />
      </div>
    </>
  );
}

function SearchCardFallback() {
  return (
    <div className={styles.searchFallback}>
      <div className={styles.searchFallbackInner} aria-hidden />
    </div>
  );
}
