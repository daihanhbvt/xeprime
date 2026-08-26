import { HomeScreen } from '@/features/marketplace/HomeScreen';

/**
 * Tab "Khám phá" — trang chủ Marketplace, mở được ở chế độ KHÁCH (chưa đăng nhập).
 *
 * Màn hình sống ở `features/marketplace` để test được mà không cần dựng cả router.
 */
export default function ExploreRoute() {
  return <HomeScreen />;
}
