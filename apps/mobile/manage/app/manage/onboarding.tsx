import { useLocalSearchParams } from 'expo-router';
import { registrationTrackOf } from '@xeprime/types';
import { ShopOnboardingScreen } from '@/features/shop/ShopOnboardingScreen';
import { REGISTRATION_TRACK_PARAM } from '@/navigation/routes';

/**
 * Đăng ký người cho thuê xe (SHP-01) — CẢ HAI TUYẾN (ADR 0040).
 *
 * Nằm ở STACK ngoài, không phải trong `(tabs)`: nó không phải một mục của menu quản lý — đây là
 * màn của người CHƯA có gian hàng (hoặc gian hàng trả phí chưa chuyển khoản), và menu lúc đó chưa
 * có gì để dẫn tới.
 *
 * `registrationTrackOf` — không so chuỗi tay: tham số đến từ deep link, nên giá trị lạ phải rơi về
 * cửa mặc định (hoa hồng) đúng như server hiểu, thay vì ném hay mở nhầm tuyến trả phí.
 */
export default function ManageOnboardingRoute() {
  const params = useLocalSearchParams<{ [REGISTRATION_TRACK_PARAM]?: string }>();

  return <ShopOnboardingScreen track={registrationTrackOf(params[REGISTRATION_TRACK_PARAM])} />;
}
