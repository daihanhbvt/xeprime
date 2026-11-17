import type { components } from '@xeprime/types';
import { getApiClient, type Paged, type QueryParams } from '@xeprime/api-client';

type Schemas = components['schemas'];

/** Shape lấy từ contract OpenAPI (ADR 0007) — KHÔNG viết tay lại DTO của backend. */
export type Member = Schemas['MemberDto'];
export type UpdateMemberRoleInput = Schemas['UpdateMemberRoleDto'];
/** Lời mời nhìn từ phía GIAN HÀNG — cố ý KHÔNG mang token (xem `InviteDto` ở backend). */
export type Invite = Schemas['InviteDto'];
/** Lời mời nhìn từ phía NGƯỜI ĐƯỢC MỜI, trước khi họ quyết định. */
export type InvitePreview = Schemas['InvitePreviewDto'];
export type InviteAnswer = Schemas['InviteAnswerDto'];
/** Một dòng của danh sách GỘP: thành viên hoặc lời mời cũ còn chờ (ADR 0086 điều 5). */
export type MemberRosterItem = Schemas['MemberRosterItemDto'];
/** Một vai cho ma trận "Vai trò & quyền" — khoá quyền thật + số người. */
export type MemberRoleSummary = Schemas['MemberRoleSummaryDto'];
/** Chủ CẤP tài khoản nhân viên — tên đăng nhập + mật khẩu (ADR 0087). */
export type CreateMemberAccountInput = Schemas['CreateMemberAccountDto'];
/** Một việc thành viên đã làm trong gian hàng — tấm chi tiết. */
export type MemberActivity = Schemas['MemberActivityDto'];

/** Cùng `DEFAULT_PAGE_SIZE` mà web dùng cho bảng này. */
export const MEMBERS_DEFAULT_LIMIT = 20;

/** Bộ lọc của danh sách gộp — bản native của `RosterFilters` bên web. */
export interface RosterFilters {
  q?: string;
  roleKey?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export function rosterFiltersToParams(filters: RosterFilters): QueryParams {
  return {
    q: filters.q ?? null,
    roleKey: filters.roleKey ?? null,
    status: filters.status ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? MEMBERS_DEFAULT_LIMIT,
  };
}

const base = '/members';
const invitesBase = `${base}/invites`;
const memberPath = (userId: string) => `${base}/${encodeURIComponent(userId)}`;

/**
 * Nhân viên & phân quyền (ADR 0086 · ADR 0087) — gương của `apps/web/src/features/members/api.ts`.
 *
 * Thành viên mới đến từ CẤP TÀI KHOẢN (`POST /members/accounts`): mời bằng SĐT đã gỡ
 * (`POST /members/invites` trả 410 `MEMBER_INVITE_RETIRED`), lời mời cũ còn chờ chỉ còn THU HỒI được.
 * Luật "không tự nâng quyền", "không chạm chủ / chính mình", phạm vi chi nhánh nằm ở backend — UI
 * ẩn nút cho gọn, lớp chặn thật là guard (CLAUDE.md mục 6).
 */
export const membersApi = {
  /** Danh sách GỘP thành viên + lời mời còn chờ — lọc, phân trang ở server. */
  roster(filters: RosterFilters): Promise<Paged<MemberRosterItem>> {
    return getApiClient().fetchPage<MemberRosterItem>(
      `${base}/roster`,
      rosterFiltersToParams(filters),
      MEMBERS_DEFAULT_LIMIT,
    );
  },

  roles(): Promise<MemberRoleSummary[]> {
    return getApiClient().get<MemberRoleSummary[]>(`${base}/roles`);
  },

  activity(userId: string, limit = 10): Promise<MemberActivity[]> {
    return getApiClient().get<MemberActivity[]>(`${memberPath(userId)}/activity`, { limit });
  },

  createAccount(body: CreateMemberAccountInput): Promise<Member> {
    return getApiClient().post<Member>(`${base}/accounts`, body);
  },

  /** Chủ đặt lại mật khẩu tài khoản do gian hàng cấp — server đăng xuất nhân viên khỏi mọi thiết bị. */
  resetPassword(userId: string, password: string): Promise<{ ok: boolean }> {
    return getApiClient().post<{ ok: boolean }>(`${memberPath(userId)}/password`, { password });
  },

  updateRole(userId: string, body: UpdateMemberRoleInput): Promise<Member> {
    return getApiClient().patch<Member>(memberPath(userId), body);
  },

  lock(userId: string): Promise<Member> {
    return getApiClient().post<Member>(`${memberPath(userId)}/lock`, {});
  },

  unlock(userId: string): Promise<Member> {
    return getApiClient().post<Member>(`${memberPath(userId)}/unlock`, {});
  },

  remove(userId: string): Promise<{ userId: string }> {
    return getApiClient().delete<{ userId: string }>(memberPath(userId));
  },

  revokeInvite(id: string): Promise<Invite> {
    return getApiClient().post<Invite>(`${invitesBase}/${encodeURIComponent(id)}/revoke`, {});
  },
};

/**
 * Phía NGƯỜI ĐƯỢC MỜI — `/invites/:token`, một controller khác hẳn. Lời mời CŨ (trước ADR 0087) vẫn
 * trả lời được tới khi hết hạn.
 *
 * `preview` không cần đăng nhập; `accept`/`decline` cần đúng tài khoản đối tác có SĐT ĐÃ XÁC MINH
 * trùng số được mời (ADR 0060 — sai ⇒ `INVITE_PHONE_MISMATCH`).
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
