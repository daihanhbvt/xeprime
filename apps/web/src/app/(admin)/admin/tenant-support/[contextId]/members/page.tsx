import { SUPPORT_CAPABILITY, SUPPORT_WORKSPACE } from '@xeprime/types';
import { MembersPage } from '@/features/members/components/MembersPage';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Thành viên — CHÍNH `MembersPage`, chỉ đọc; email bị che ở server. */
export default function Page() {
  return (
    <SupportRoute workspace={SUPPORT_WORKSPACE.MANAGE} requires={SUPPORT_CAPABILITY.MEMBER_VIEW}>
      <MembersPage />
    </SupportRoute>
  );
}
