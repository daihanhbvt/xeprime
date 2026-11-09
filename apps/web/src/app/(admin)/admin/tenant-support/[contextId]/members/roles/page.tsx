'use client';

import { SUPPORT_CAPABILITY, SUPPORT_WORKSPACE } from '@xeprime/types';
import { RolePermissionsPage } from '@/features/members/components/RolePermissionsPage';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Vai trò & quyền — CHÍNH `RolePermissionsPage`; bảng vốn chỉ để xem. */
export default function Page() {
  return (
    <SupportRoute workspace={SUPPORT_WORKSPACE.MANAGE} requires={SUPPORT_CAPABILITY.MEMBER_VIEW}>
      <RolePermissionsPage />
    </SupportRoute>
  );
}
