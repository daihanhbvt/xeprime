import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  fetchPage,
  type Paged,
  type QueryParams,
} from '@/services/api-client';
import type {
  Invite,
  InviteAnswer,
  InvitePreview,
  CreateMemberAccountInput,
  Member,
  MemberActivity,
  MemberFilters,
  MemberRoleSummary,
  MemberRosterItem,
  RosterFilters,
  UpdateMemberRoleInput,
} from './types';

export const MEMBERS_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export type MemberListResult = Paged<Member>;

export function filtersToParams(filters: MemberFilters): QueryParams {
  return {
    q: filters.q ?? null,
    roleKey: filters.roleKey ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? MEMBERS_DEFAULT_LIMIT,
  };
}

export const fetchMembers = (filters: MemberFilters): Promise<MemberListResult> =>
  fetchPage<Member>('/members', filtersToParams(filters), MEMBERS_DEFAULT_LIMIT);

export function rosterFiltersToParams(filters: RosterFilters): QueryParams {
  return {
    q: filters.q ?? null,
    roleKey: filters.roleKey ?? null,
    status: filters.status ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? MEMBERS_DEFAULT_LIMIT,
  };
}

/** Danh sách GỘP thành viên + lời mời còn chờ — màn Nhân viên & phân quyền (ADR 0086). */
export const fetchRoster = (filters: RosterFilters): Promise<Paged<MemberRosterItem>> =>
  fetchPage<MemberRosterItem>('/members/roster', rosterFiltersToParams(filters), MEMBERS_DEFAULT_LIMIT);

export const fetchMemberRoles = (): Promise<MemberRoleSummary[]> =>
  apiGet<MemberRoleSummary[]>('/members/roles');

export const updateMemberRole = (userId: string, body: UpdateMemberRoleInput): Promise<Member> =>
  apiPatch<Member>(`/members/${userId}`, body);

/** Cấp tài khoản nhân viên — tên đăng nhập + mật khẩu (ADR 0087). */
export const createMemberAccount = (body: CreateMemberAccountInput): Promise<Member> =>
  apiPost<Member>('/members/accounts', body);

/** Chủ đặt lại mật khẩu tài khoản do gian hàng cấp — đăng xuất nhân viên khỏi mọi thiết bị. */
export const resetMemberPassword = (userId: string, password: string): Promise<{ ok: boolean }> =>
  apiPost<{ ok: boolean }>(`/members/${userId}/password`, { password });

export const fetchMemberActivity = (userId: string, limit = 10): Promise<MemberActivity[]> =>
  apiGet<MemberActivity[]>(`/members/${userId}/activity`, { limit });

export const lockMember = (userId: string): Promise<Member> =>
  apiPost<Member>(`/members/${userId}/lock`, {});

export const unlockMember = (userId: string): Promise<Member> =>
  apiPost<Member>(`/members/${userId}/unlock`, {});

export const removeMember = (userId: string): Promise<{ userId: string }> =>
  apiDelete<{ userId: string }>(`/members/${userId}`);

// --- Thư mời ---------------------------------------------------------------

export const revokeInvite = (id: string): Promise<Invite> =>
  apiPost<Invite>(`/members/invites/${id}/revoke`, {});

// --- Phía người được mời ---------------------------------------------------

/** Xem trước — không cần đăng nhập, nên gọi được từ trang `/invites/[token]` khi chưa có phiên. */
export const fetchInvitePreview = (token: string): Promise<InvitePreview> =>
  apiGet<InvitePreview>(`/invites/${token}`);

export const acceptInvite = (token: string): Promise<InviteAnswer> =>
  apiPost<InviteAnswer>(`/invites/${token}/accept`, {});

export const declineInvite = (token: string): Promise<InviteAnswer> =>
  apiPost<InviteAnswer>(`/invites/${token}/decline`, {});
