import type { components } from '@xeprime/types';

/** Shape thành viên lấy từ contract OpenAPI (ADR 0007) — không viết tay lại DTO. */
type Schemas = components['schemas'];

export type Member = Schemas['MemberDto'];
export type AddMemberInput = Schemas['AddMemberDto'];
export type UpdateMemberRoleInput = Schemas['UpdateMemberRoleDto'];

export interface MemberFilters {
  q?: string;
  roleKey?: string;
  page?: number;
  limit?: number;
}
