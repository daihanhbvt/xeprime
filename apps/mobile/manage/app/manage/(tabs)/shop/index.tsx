import { useLocalSearchParams } from 'expo-router';
import { ShopProfileScreen } from '@/features/shop/ShopProfileScreen';
import { SHOP_SECTION_PARAM, SHOP_WELCOME_PARAM, isShopSection } from '@/navigation/routes';

/**
 * Hồ sơ gian hàng (SHP-02).
 *
 * `?welcome=1` chỉ bật một DẢI CHÀO sau lượt thanh toán gói đầu tiên (ADR 0040) — nó không mở hay
 * khoá gì, nên đọc thẳng từ tham số là đủ; quyền vẫn đến từ `/auth/me`.
 */
export default function ManageShopRoute() {
  const params = useLocalSearchParams<{
    [SHOP_WELCOME_PARAM]?: string;
    [SHOP_SECTION_PARAM]?: string;
  }>();
  const section = params[SHOP_SECTION_PARAM];

  return (
    <ShopProfileScreen
      welcome={params[SHOP_WELCOME_PARAM] === '1'}
      {...(isShopSection(section) ? { section } : {})}
    />
  );
}
