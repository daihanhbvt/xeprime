import { Redirect, useLocalSearchParams } from 'expo-router';
import { PERMISSION, TENANT_ROLE } from '@xeprime/types';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { OwnerProfileScreen } from '@/features/account/OwnerProfileScreen';
import { isCommissionOwner } from '@/features/shell/partner-track';
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
  const { has } = usePermissions();

  // Link payout cũ và bản cá nhân/gian hàng đều cần biết vai + tuyến trước khi quyết — chờ phiên,
  // không dựng trang Cửa hàng rồi nhảy sang Hồ sơ chủ xe.
  if (isLoading) return <ScreenLoading />;

  // `?section=payout` CŨ (thông báo, bookmark): tài khoản nhận tiền đã sang trang Số dư — PR #159,
  // đúng web `ShopPage` chuyển `SHOP_LEGACY_PAYOUT_SECTION` sang `balancePayoutPath()`. CHỈ với CHỦ — người
  // khác chưa bao giờ thấy khối đó; họ ở lại đầu trang Cửa hàng như mọi giá trị lạ.
  if (section === SHOP_SECTION.PAYOUT && user?.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER)
    return <Redirect href={ROUTES.manage.balancePayout()} />;

  /*
   * Mặt tiền CÁ NHÂN — "Hồ sơ chủ xe" (ADR 0085 điều 2, web `ShopPage` + `ownerProfile`): CHỦ xe
   * tuyến hoa hồng dùng CHÍNH trang Thông tin này, nội dung thẻ là danh tính TÀI KHOẢN (ADR 0054).
   * Đọc từ người đăng nhập; thành viên luôn ở bản gian hàng. Thiếu `tenant.view` thì không tải nổi
   * hồ sơ gian hàng — giữ bản gian hàng để màn tự nói lỗi quyền.
   */
  if (isCommissionOwner(user) && has(PERMISSION.TENANT_VIEW)) {
    return <OwnerProfileScreen {...(isShopSection(section) ? { section } : {})} />;
  }

  return (
    <ShopProfileScreen
      welcome={params[SHOP_WELCOME_PARAM] === '1'}
      {...(isShopSection(section) ? { section } : {})}
    />
  );
}
