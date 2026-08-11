import { Suspense } from 'react';
import type { Metadata } from 'next';
import { fetchBannersServer } from '@/features/banners/api';
import { HomeHero } from '@/features/marketplace/components/HomeHero';
import { HeroSearch } from '@/features/marketplace/components/HeroSearch';
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
 * LCP không chờ client island. CHỈ `HeroSearch` cần Suspense (đọc `useSearchParams`); các khu
 * còn lại là island độc lập tự lo skeleton/lỗi của mình — một mục hỏng không kéo cả trang chủ
 * về một cái Spin.
 */
export default async function MarketplacePage() {
  const banners = await fetchBannersServer();

  return (
    <>
      <HomeHero banners={banners} />
      <Suspense fallback={<SearchCardFallback />}>
        <HeroSearch />
      </Suspense>
      <div className={styles.sections}>
        <VehiclePreview />
        <FeaturedLocations />
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
