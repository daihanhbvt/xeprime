import type { components } from '@xeprime/types';

/** Shape thành viên lấy từ contract OpenAPI (ADR 0007) — không viết tay lại DTO. */
type Schemas = components['schemas'];

export type Member = Schemas['MemberDto'];
export type UpdateMemberRoleInput = Schemas['UpdateMemberRoleDto'];

/** Lời mời nhìn từ phía gian hàng — KHÔNG mang token (xem `InviteDto` ở backend). */
export type Invite = Schemas['InviteDto'];
export type CreateInviteInput = Schemas['CreateInviteDto'];
/** Lời mời nhìn từ phía người được mời, trước khi họ quyết định. */
export type InvitePreview = Schemas['InvitePreviewDto'];
export type InviteAnswer = Schemas['InviteAnswerDto'];

export interface MemberFilters {
  q?: string;
  roleKey?: string;
  page?: number;
  limit?: number;
}

export interface InviteFilters {
  status?: string;
  page?: number;
  limit?: number;
}
