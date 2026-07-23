import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Spin } from 'antd';
import { HeroSearch } from '@/features/marketplace/components/HeroSearch';
import { VehicleRecommendations } from '@/features/marketplace/components/VehicleRecommendations';
import { FeaturedLocations } from '@/features/marketplace/components/FeaturedLocations';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Thuê xe tự lái & có tài xế trên toàn quốc',
  description:
    'XePrime — thuê ô tô tự lái, có tài xế và xe máy khắp Việt Nam. Đặt xe nhanh, thanh toán sau khi chủ xe xác nhận.',
};

/**
 * Trang chủ Marketplace.
 *
 * Page là Server Component (SEO); các khối bên trong là client island. HeroSearch/
 * VehicleRecommendations/FeaturedLocations dùng `useSearchParams` (filter ở URL — ADR 0004),
 * nên Next yêu cầu bọc trong <Suspense>.
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
      </div>
    </Suspense>
  );
}

function HomeFallback() {
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
      <Spin size="large" />
    </div>
  );
}
