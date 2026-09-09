import { ShopOnboardingScreen } from '@/features/shop/ShopOnboardingScreen';

/**
 * Đăng ký gian hàng (SHP-01).
 *
 * Nằm ở STACK ngoài, không phải trong `(tabs)`: nó không phải một mục của menu quản lý — đây là
 * màn của người CHƯA có gian hàng, và menu lúc đó chưa có gì để dẫn tới.
 */
export default function ManageOnboardingRoute() {
  return <ShopOnboardingScreen />;
}
