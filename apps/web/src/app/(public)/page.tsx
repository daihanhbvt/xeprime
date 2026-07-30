import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Spin } from 'antd';
import { HeroSearch } from '@/features/marketplace/components/HeroSearch';
import { VehicleRecommendations } from '@/features/marketplace/components/VehicleRecommendations';
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
 * Page là Server Component (SEO). HeroSearch/VehicleRecommendations/FeaturedLocations/
 * FeaturedHosts là client island vì cần state/URL (ADR 0004) — Suspense bọc phần dùng
 * `useSearchParams`. `RentalSteps`/`OwnerCta` có nội dung tĩnh nhưng vẫn là Client Component vì
 * dùng `@ant-design/icons` (đòi hỏi cây Client — xem comment trong từng file); nội dung vẫn được
 * render sẵn ra HTML ở server nên không mất SEO.
 */
export default function MarketplacePage() {
  return (
    <Suspense fallback={<HomeFallback />}>
      <HeroSearch />
      <div className={styles.sections}>
        <div id="recommendations">
          <VehicleRecommendations />
        </div>
        <FeaturedLocations />
        <FeaturedHosts />
        <RentalSteps />
        <OwnerCta />
      </div>
    </Suspense>
  );
}

function HomeFallback() {
  return (
    <div className={styles.fallback}>
      <Spin size="large" />
    </div>
  );
}
