import { Redirect } from 'expo-router';
import { ROUTES } from '@/navigation/routes';

/**
 * Mở app là vào thẳng trang chủ ở chế độ KHÁCH — không chặn bằng màn đăng nhập.
 *
 * Marketplace là khu công khai (web cũng vậy): bắt đăng nhập trước khi cho xem xe là dựng
 * tường trước cửa hàng.
 */
export default function IndexRoute() {
  return <Redirect href={ROUTES.explore.home()} />;
}
