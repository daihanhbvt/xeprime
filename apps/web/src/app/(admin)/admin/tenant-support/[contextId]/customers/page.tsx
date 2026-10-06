import { SUPPORT_CAPABILITY, SUPPORT_WORKSPACE } from '@xeprime/types';
import { CustomersPage } from '@/features/customers/components/CustomersPage';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Sổ khách — CHÍNH `CustomersPage`; SĐT/email/địa chỉ bị che ở server. */
export default function Page() {
  return (
    <SupportRoute
      workspace={SUPPORT_WORKSPACE.MANAGE}
      requires={SUPPORT_CAPABILITY.CUSTOMER_VIEW_MASKED}
    >
      <CustomersPage />
    </SupportRoute>
  );
}
