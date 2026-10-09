import { Redirect, useLocalSearchParams } from 'expo-router';
import { TENANT_ROLE } from '@xeprime/types';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { ShopProfileScreen } from '@/features/shop/ShopProfileScreen';
import {
  ROUTES,
  SHOP_SECTION,
  SHOP_SECTION_PARAM,
  SHOP_WELCOME_PARAM,
  isShopSection,
} from '@/navigation/routes';

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
  const { data: user, isLoading } = useCurrentUser();

  // Link payout cũ cần biết vai trước khi quyết — chờ phiên, không dựng trang Cửa hàng rồi nhảy.
  if (section === SHOP_SECTION.PAYOUT && isLoading) return <ScreenLoading />;

  // `?section=payout` CŨ (thông báo, bookmark): tài khoản nhận tiền đã sang trang Số dư — PR #159,
  // đúng web `ShopPage` chuyển `SHOP_LEGACY_PAYOUT_SECTION` sang `balancePayoutPath()`. CHỈ với CHỦ — người
  // khác chưa bao giờ thấy khối đó; họ ở lại đầu trang Cửa hàng như mọi giá trị lạ.
  if (section === SHOP_SECTION.PAYOUT && user?.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER)
    return <Redirect href={ROUTES.manage.balancePayout()} />;

  return (
    <ShopProfileScreen
      welcome={params[SHOP_WELCOME_PARAM] === '1'}
      {...(isShopSection(section) ? { section } : {})}
    />
  );
}
