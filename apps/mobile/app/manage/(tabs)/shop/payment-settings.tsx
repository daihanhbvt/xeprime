import { ShopPaymentSettingsScreen } from '@/features/shop/ShopPaymentSettingsScreen';

/**
 * Công tắc thu cọc qua XePrime (Phase 6 — ADR 0032 điều 2) — cùng địa chỉ với web.
 *
 * Cổng phiên + phạm vi khu quản lý ở `app/manage/_layout.tsx`; quyền `seller_profile.*` do guard
 * backend quyết. KHÔNG gác theo cờ gói: gian hàng thiếu `escrow_hold` phải vào được để ĐỌC.
 */
export default function ManageShopPaymentSettingsRoute() {
  return <ShopPaymentSettingsScreen />;
}
