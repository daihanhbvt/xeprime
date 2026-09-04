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
  CreateInviteInput,
  Invite,
  InviteAnswer,
  InviteFilters,
  InvitePreview,
  Member,
  MemberFilters,
  UpdateMemberRoleInput,
} from './types';

export const MEMBERS_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export type MemberListResult = Paged<Member>;
export type InviteListResult = Paged<Invite>;

export function filtersToParams(filters: MemberFilters): QueryParams {
  return {
    q: filters.q ?? null,
    roleKey: filters.roleKey ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? MEMBERS_DEFAULT_LIMIT,
  };
}

export function inviteFiltersToParams(filters: InviteFilters): QueryParams {
  return {
    status: filters.status ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? MEMBERS_DEFAULT_LIMIT,
  };
}

export const fetchMembers = (filters: MemberFilters): Promise<MemberListResult> =>
  fetchPage<Member>('/members', filtersToParams(filters), MEMBERS_DEFAULT_LIMIT);

export const updateMemberRole = (userId: string, body: UpdateMemberRoleInput): Promise<Member> =>
  apiPatch<Member>(`/members/${userId}`, body);

export const removeMember = (userId: string): Promise<{ userId: string }> =>
  apiDelete<{ userId: string }>(`/members/${userId}`);

// --- Thư mời ---------------------------------------------------------------

/**
 * KHÔNG còn `addMember`.
 *
 * `POST /members` đã bị gỡ ở backend ngày 03/09/2026: nó tạo thẳng một membership `active` cho
 * một email bất kỳ, nghĩa là thêm người vào gian hàng mà không hỏi họ. Đường duy nhất để có
 * thành viên mới bây giờ là gửi lời mời và chờ chính người đó bấm đồng ý.
 */
export const fetchInvites = (filters: InviteFilters): Promise<InviteListResult> =>
  fetchPage<Invite>('/members/invites', inviteFiltersToParams(filters), MEMBERS_DEFAULT_LIMIT);

export const createInvite = (body: CreateInviteInput): Promise<Invite> =>
  apiPost<Invite>('/members/invites', body);

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
