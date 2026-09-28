import { ShopDashboardScreen } from '@/features/dashboard/ShopDashboardScreen';

/**
 * Màn đầu của khu quản lý — tổng quan GIAN HÀNG (SHP-07).
 *
 * KHÔNG còn nhánh `platformRole` (tách app 25/09/2026): admin nền tảng không được phục vụ trên
 * hai app mobile — cổng đăng nhập XePrime Partner trả 403 `PARTNER_ACCESS_REQUIRED` cho tài
 * khoản chỉ có vai nền tảng, cùng luật `canUsePartnerApp` ở server. `PlatformHomeScreen`
 * (placeholder "đang phát triển") vì thế ra khỏi app thay vì ở lại như một nhánh chết.
 *
 * Gian hàng chưa `active` vẫn VÀO ĐƯỢC: chặn ở cửa là giấu mất chính cái màn giải thích vì sao
 * họ bị chặn (doc 15 §4.4). Cái đổi theo trạng thái là NỘI DUNG dải trên cùng, không phải quyền vào.
 */
export function ManageHomeScreen() {
  return <ShopDashboardScreen />;
}
