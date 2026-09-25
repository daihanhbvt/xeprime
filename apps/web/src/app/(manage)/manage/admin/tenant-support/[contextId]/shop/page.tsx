import { SUPPORT_CAPABILITY, SUPPORT_WORKSPACE } from '@xeprime/types';
import { ShopPage } from '@/features/shop/components/ShopPage';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Mặt tiền gian hàng — CHÍNH `ShopPage`, chỉ đọc; MST/giấy phép và tài khoản nhận tiền không mở. */
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
