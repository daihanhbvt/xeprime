import type { components } from '@xeprime/types';
import { getApiClient, type Paged, type QueryParams } from '@xeprime/api-client';

type Schemas = components['schemas'];

/** Shape lấy từ contract OpenAPI (ADR 0007) — KHÔNG viết tay lại DTO của backend. */
export type Member = Schemas['MemberDto'];
export type UpdateMemberRoleInput = Schemas['UpdateMemberRoleDto'];
/** Lời mời nhìn từ phía GIAN HÀNG — cố ý KHÔNG mang token (xem `InviteDto` ở backend). */
export type Invite = Schemas['InviteDto'];
export type CreateInviteInput = Schemas['CreateInviteDto'];
/** Kết quả TẠO lời mời — thêm `emailSent`, cờ nói thư có thật sự đi được không. */
export type CreateInviteResult = Schemas['CreateInviteResultDto'];
/** Lời mời nhìn từ phía NGƯỜI ĐƯỢC MỜI, trước khi họ quyết định. */
export type InvitePreview = Schemas['InvitePreviewDto'];
export type InviteAnswer = Schemas['InviteAnswerDto'];

/** Cùng `DEFAULT_PAGE_SIZE` mà web dùng cho hai bảng này. */
export const MEMBERS_DEFAULT_LIMIT = 20;

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

export function memberFiltersToParams(filters: MemberFilters): QueryParams {
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

const base = '/members';
const invitesBase = `${base}/invites`;

/**
 * Nhân sự gian hàng (SHP-05).
 *
 * **KHÔNG có `add`.** `POST /members` đã bị gỡ ở backend (03/09/2026): nó tạo thẳng một
 * membership `active` cho một email bất kỳ, tức thêm người vào gian hàng mà không hỏi họ. Đường
 * duy nhất để có thành viên mới là gửi LỜI MỜI và chờ chính người đó bấm đồng ý.
 *
 * Luật "không tự nâng quyền", "không hạ vai chủ gian hàng" nằm ở backend — UI ẩn nút cho gọn,
 * nhưng lớp chặn thật là guard (CLAUDE.md mục 6).
 */
export const membersApi = {
  list(filters: MemberFilters): Promise<Paged<Member>> {
    return getApiClient().fetchPage<Member>(
      base,
      memberFiltersToParams(filters),
      MEMBERS_DEFAULT_LIMIT,
    );
  },

  updateRole(userId: string, body: UpdateMemberRoleInput): Promise<Member> {
    return getApiClient().patch<Member>(`${base}/${encodeURIComponent(userId)}`, body);
  },

  remove(userId: string): Promise<{ userId: string }> {
    return getApiClient().delete<{ userId: string }>(`${base}/${encodeURIComponent(userId)}`);
  },

  invites(filters: InviteFilters): Promise<Paged<Invite>> {
    return getApiClient().fetchPage<Invite>(
      invitesBase,
      inviteFiltersToParams(filters),
      MEMBERS_DEFAULT_LIMIT,
    );
  },

  createInvite(body: CreateInviteInput): Promise<CreateInviteResult> {
    return getApiClient().post<CreateInviteResult>(invitesBase, body);
  },

  revokeInvite(id: string): Promise<Invite> {
    return getApiClient().post<Invite>(`${invitesBase}/${encodeURIComponent(id)}/revoke`, {});
  },
};

/**
 * Phía NGƯỜI ĐƯỢC MỜI — `/invites/:token`, một controller khác hẳn.
 *
 * `preview` không cần đăng nhập (mở được từ liên kết trong thư); `accept`/`decline` thì cần, và
 * cần đúng tài khoản mang email được mời. Quyền ở đây không đến từ vai trong một gian hàng, nên
 * không có `RequirePermissions` nào để gương lại ở client.
 */
export const inviteAnswersApi = {
  preview(token: string): Promise<InvitePreview> {
    return getApiClient().get<InvitePreview>(`/invites/${encodeURIComponent(token)}`);
  },

  accept(token: string): Promise<InviteAnswer> {
    return getApiClient().post<InviteAnswer>(`/invites/${encodeURIComponent(token)}/accept`, {});
  },

  decline(token: string): Promise<InviteAnswer> {
    return getApiClient().post<InviteAnswer>(`/invites/${encodeURIComponent(token)}/decline`, {});
  },
};
