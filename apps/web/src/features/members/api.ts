import type { PaginationMeta } from '@xeprime/types';
import { apiDelete, apiPatch, apiPost, apiRequest, type QueryParams } from '@/services/api-client';
import type { AddMemberInput, Member, MemberFilters, UpdateMemberRoleInput } from './types';

export const MEMBERS_DEFAULT_LIMIT = 20;

export interface MemberListResult {
  items: Member[];
  meta: PaginationMeta;
}

export function filtersToParams(filters: MemberFilters): QueryParams {
  return {
    q: filters.q ?? null,
    roleKey: filters.roleKey ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? MEMBERS_DEFAULT_LIMIT,
  };
}

export async function fetchMembers(filters: MemberFilters): Promise<MemberListResult> {
  const res = await apiRequest<Member[]>('/members', { query: filtersToParams(filters) });
  return {
    items: res.data,
    meta: (res.meta as PaginationMeta | undefined) ?? {
      page: 1,
      limit: MEMBERS_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
  };
}

export const addMember = (body: AddMemberInput): Promise<Member> => apiPost<Member>('/members', body);

export const updateMemberRole = (userId: string, body: UpdateMemberRoleInput): Promise<Member> =>
  apiPatch<Member>(`/members/${userId}`, body);

export const removeMember = (userId: string): Promise<{ userId: string }> =>
  apiDelete<{ userId: string }>(`/members/${userId}`);
