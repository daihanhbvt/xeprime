import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { keepPageData } from '@/queries/keep-page-data';
import { queryKeys } from '@/queries/query-keys';
import {
  inviteFiltersToParams,
  membersApi,
  memberFiltersToParams,
  type CreateInviteInput,
  type InviteFilters,
  type MemberFilters,
  type UpdateMemberRoleInput,
} from '../api';

/**
 * Số thành viên mỗi trang.
 *
 * 10 chứ không phải 20 của contract: `LIST_TUNING` — cửa sổ dựng dùng chung của mọi danh sách
 * trong app — được đặt quanh một trang 10 mục. Cùng lý do với sổ khách.
 */
export const MEMBERS_PAGE_SIZE = 10;

/** MỘT trang thành viên. Lọc và cắt trang đều ở SERVER. */
export function useMembersPage(filters: MemberFilters, enabled = true) {
  const withLimit = { ...filters, limit: MEMBERS_PAGE_SIZE };
  const params = memberFiltersToParams(withLimit);

  return useQuery({
    queryKey: queryKeys.members.list(params),
    queryFn: () => membersApi.list(withLimit),
    placeholderData: keepPageData<Awaited<ReturnType<typeof membersApi.list>>>(params),
    enabled,
  });
}

/** Lời mời của gian hàng — mặc định server chỉ trả những lời ĐANG CHỜ. */
export function useInvites(filters: InviteFilters, enabled = true) {
  const withLimit = { ...filters, limit: MEMBERS_PAGE_SIZE };
  const params = inviteFiltersToParams(withLimit);

  return useQuery({
    queryKey: queryKeys.members.invites(params),
    queryFn: () => membersApi.invites(withLimit),
    placeholderData: keepPageData<Awaited<ReturnType<typeof membersApi.invites>>>(params),
    enabled,
  });
}

/**
 * Mọi thay đổi nhân sự làm mới nhánh `members` — nhánh đó BAO cả lời mời
 * (`queryKeys.members.invites`): gửi/thu hồi một lời mời đổi danh sách mời, còn nhận một lời mời
 * đổi danh sách thành viên. Một cổng invalidate cho cả hai.
 *
 * `auth.me` cũng phải làm mới: đổi vai trò hay gỡ người có thể đụng vào CHÍNH người đang đăng
 * nhập, và quyền của họ đọc từ đó. Không có bước này thì người vừa bị hạ vai vẫn thấy đủ nút cho
 * tới lần refetch kế tiếp — rồi bấm và nhận 403.
 */
function useInvalidateMembers() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.members.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
  };
}

export function useCreateInvite() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: (body: CreateInviteInput) => membersApi.createInvite(body),
    onSuccess: invalidate,
  });
}

export function useRevokeInvite() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: (id: string) => membersApi.revokeInvite(id),
    onSuccess: invalidate,
  });
}

export function useUpdateMemberRole() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: ({ userId, roleKey }: { userId: string } & UpdateMemberRoleInput) =>
      membersApi.updateRole(userId, { roleKey }),
    onSuccess: invalidate,
  });
}

export function useRemoveMember() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: (userId: string) => membersApi.remove(userId),
    onSuccess: invalidate,
  });
}
