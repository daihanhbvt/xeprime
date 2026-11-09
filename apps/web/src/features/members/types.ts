import type { components } from '@xeprime/types';

/** Shape thành viên lấy từ contract OpenAPI (ADR 0007) — không viết tay lại DTO. */
type Schemas = components['schemas'];

export type Member = Schemas['MemberDto'];
export type UpdateMemberRoleInput = Schemas['UpdateMemberRoleDto'];

/** Lời mời nhìn từ phía gian hàng — KHÔNG mang token (xem `InviteDto` ở backend). */
export type Invite = Schemas['InviteDto'];
/** Lời mời nhìn từ phía người được mời, trước khi họ quyết định. */
export type InvitePreview = Schemas['InvitePreviewDto'];
export type InviteAnswer = Schemas['InviteAnswerDto'];

/** Một dòng của danh sách gộp: thành viên hoặc lời mời còn chờ (ADR 0086 điều 5). */
export type MemberRosterItem = Schemas['MemberRosterItemDto'];
/** Một vai cho ma trận "Vai trò & quyền". */
export type MemberRoleSummary = Schemas['MemberRoleSummaryDto'];
/** Chủ CẤP tài khoản nhân viên (ADR 0087). */
export type CreateMemberAccountInput = Schemas['CreateMemberAccountDto'];
/** Một việc thành viên đã làm trong gian hàng — ngăn chi tiết. */
export type MemberActivity = Schemas['MemberActivityDto'];

/** Bộ lọc của danh sách gộp — sống trên URL (ADR 0004). */
export interface RosterFilters {
  q?: string;
  roleKey?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface MemberFilters {
  q?: string;
  roleKey?: string;
  page?: number;
  limit?: number;
}

