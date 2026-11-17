import { RolePermissionsScreen } from '@/features/members/RolePermissionsScreen';

/** "Vai trò & quyền" — web `/manage/members/roles` (ADR 0086 điều 1), route thật deep-link được. */
export default function ManageMemberRolesRoute() {
  return <RolePermissionsScreen />;
}
