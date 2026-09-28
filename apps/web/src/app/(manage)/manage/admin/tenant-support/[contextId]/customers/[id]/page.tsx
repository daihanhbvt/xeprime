import { SUPPORT_CAPABILITY, SUPPORT_WORKSPACE } from '@xeprime/types';
import { CustomerDetailView } from '@/features/customers/components/CustomerDetailView';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Hồ sơ khách — CHÍNH `CustomerDetailView`; ghi chú + giấy tờ không mở trong phiên. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <SupportRoute
      workspace={SUPPORT_WORKSPACE.MANAGE}
      requires={SUPPORT_CAPABILITY.CUSTOMER_VIEW_MASKED}
    >
      <CustomerDetailView customerId={id} />
    </SupportRoute>
  );
}
