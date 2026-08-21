import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import {
  apiDelete,
  apiPatch,
  apiPost,
  fetchPage,
  type Paged,
  type QueryParams,
} from '@/services/api-client';
import type { AddMemberInput, Member, MemberFilters, UpdateMemberRoleInput } from './types';

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

export const addMember = (body: AddMemberInput): Promise<Member> => apiPost<Member>('/members', body);

export const updateMemberRole = (userId: string, body: UpdateMemberRoleInput): Promise<Member> =>
  apiPatch<Member>(`/members/${userId}`, body);

export const removeMember = (userId: string): Promise<{ userId: string }> =>
  apiDelete<{ userId: string }>(`/members/${userId}`);
