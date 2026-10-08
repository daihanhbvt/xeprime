import { SUPPORT_CAPABILITY, SUPPORT_WORKSPACE } from '@xeprime/types';
import { ShopPage } from '@/features/shop/components/ShopPage';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/**
 * Mặt tiền gian hàng — CHÍNH `ShopPage`, chỉ đọc; MST/giấy phép không mở. (Tài khoản nhận tiền đã
 * rời trang này về "Số dư & rút tiền" — trang của CHỦ, không mở trong phiên.)
 */
export default function Page() {
  return (
    <SupportRoute
      workspace={SUPPORT_WORKSPACE.MANAGE}
      requires={SUPPORT_CAPABILITY.TENANT_PROFILE_VIEW}
    >
      <ShopPage />
    </SupportRoute>
  );
}
