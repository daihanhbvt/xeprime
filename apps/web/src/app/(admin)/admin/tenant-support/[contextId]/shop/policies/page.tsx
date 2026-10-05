import { SUPPORT_CAPABILITY, SUPPORT_WORKSPACE } from '@xeprime/types';
import { ShopPoliciesPage } from '@/features/rental-policies/components/ShopPoliciesPage';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Chính sách thuê — CHÍNH `ShopPoliciesPage`, chỉ đọc. */
export default function Page() {
  return (
    <SupportRoute
      workspace={SUPPORT_WORKSPACE.MANAGE}
      requires={SUPPORT_CAPABILITY.RENTAL_POLICY_VIEW}
    >
      <ShopPoliciesPage />
    </SupportRoute>
  );
}
