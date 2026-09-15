import { SellerProfileScreen } from '@/features/seller-profile/SellerProfileScreen';

/**
 * Hồ sơ người bán (ADR 0028 release gate 1) — cùng địa chỉ với web.
 *
 * Cổng phiên + phạm vi khu quản lý nằm ở `app/manage/_layout.tsx` (`ScopeGuard`); quyền
 * `seller_profile.view` do guard backend và mục menu lọc.
 */
export default function ManageSellerProfileRoute() {
  return <SellerProfileScreen />;
}
