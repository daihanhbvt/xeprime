import { SUPPORT_CAPABILITY, SUPPORT_WORKSPACE } from '@xeprime/types';
import { BranchesView } from '@/features/branches/components/BranchesView';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Chi nhánh — CHÍNH `BranchesView`, chỉ đọc. */
export default function Page() {
  return (
    <SupportRoute workspace={SUPPORT_WORKSPACE.MANAGE} requires={SUPPORT_CAPABILITY.BRANCH_VIEW}>
      <BranchesView />
    </SupportRoute>
  );
}
