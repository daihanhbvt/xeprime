import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { keepPageData } from '@/queries/keep-page-data';
import { queryKeys } from '@/queries/query-keys';
import {
  inviteAnswersApi,
  membersApi,
  rosterFiltersToParams,
  type CreateMemberAccountInput,
  type RosterFilters,
  type UpdateMemberRoleInput,
} from '../api';

/**
 * Số dòng mỗi trang.
 *
 * 10 chứ không phải 20 của contract: `LIST_TUNING` — cửa sổ dựng dùng chung của mọi danh sách
 * trong app — được đặt quanh một trang 10 mục. Cùng lý do với sổ khách.
 */
export const MEMBERS_PAGE_SIZE = 10;

/**
 * MỘT trang của danh sách GỘP thành viên + lời mời cũ còn chờ (`GET /members/roster`, ADR 0086
 * điều 5). Lọc theo tên/SĐT/email, vai, trạng thái và cắt trang đều ở SERVER.
 */
export function useRosterPage(filters: RosterFilters, enabled = true) {
  const withLimit = { ...filters, limit: MEMBERS_PAGE_SIZE };
  const params = rosterFiltersToParams(withLimit);

  return useQuery({
    queryKey: queryKeys.members.roster(params),
    queryFn: () => membersApi.roster(withLimit),
    placeholderData: keepPageData<Awaited<ReturnType<typeof membersApi.roster>>>(params),
    enabled,
  });
}

/** Bốn vai kèm khoá quyền + số người — nuôi ma trận "Vai trò & quyền" (ADR 0086 điều 1). */
export function useMemberRoles(enabled = true) {
  return useQuery({
    queryKey: queryKeys.members.roles(),
    queryFn: () => membersApi.roles(),
    enabled,
  });
}

/** Việc gần đây của một thành viên — chỉ tải khi tấm chi tiết đang mở đúng người đó. */
export function useMemberActivity(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.members.activity(userId ?? ''),
    queryFn: () => membersApi.activity(userId as string),
    enabled: Boolean(userId),
  });
}

/**
 * Mọi thay đổi nhân sự làm mới nhánh `members` — nhánh đó BAO cả danh sách gộp, ma trận vai (số
 * người theo vai đổi) và nhật ký hoạt động.
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

/** Cấp tài khoản nhân viên (ADR 0087) — thay cho gửi lời mời bằng SĐT. */
export function useCreateMemberAccount() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: (body: CreateMemberAccountInput) => membersApi.createAccount(body),
    onSuccess: invalidate,
  });
}

/**
 * Chủ đặt lại mật khẩu cho tài khoản do gian hàng cấp. Mật khẩu chỉ đi qua biến của lượt gọi —
 * không vào cache, không vào log.
 */
export function useResetMemberPassword() {
  return useMutation({
    mutationFn: ({ userId, password }: { userId: string; password: string }) =>
      membersApi.resetPassword(userId, password),
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
    // Chuyển NGUYÊN body (giống web): tự nhặt field là âm thầm nuốt `branchScope`/`branchIds`
    // (ADR 0052) — và mọi trường DTO thêm về sau.
    mutationFn: ({ userId, ...body }: { userId: string } & UpdateMemberRoleInput) =>
      membersApi.updateRole(userId, body),
    onSuccess: invalidate,
  });
}

/** Tạm khoá / mở khoá — `locked = true` là khoá (ADR 0086 điều 7). */
export function useSetMemberLock() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: ({ userId, locked }: { userId: string; locked: boolean }) =>
      locked ? membersApi.lock(userId) : membersApi.unlock(userId),
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

/**
 * Xem trước một lời mời — dùng ở màn `/invites/[token]`.
 *
 * `retry: false`: token sai hoặc lời mời đã bị thu hồi trả 404, và thử lại ba lần chỉ làm người
 * dùng nhìn vòng xoay lâu hơn trước khi nhận cùng một câu trả lời.
 *
 * `staleTime: 0`: trạng thái lời mời đổi được từ phía gian hàng (thu hồi) giữa lúc người dùng mở
 * liên kết và lúc họ bấm — đọc lại là đúng, cache một lời mời thì không.
 */
export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: queryKeys.members.invitePreview(token),
    queryFn: () => inviteAnswersApi.preview(token),
    retry: false,
    staleTime: 0,
    enabled: Boolean(token),
  });
}

/**
 * Trả lời một lời mời.
 *
 * Nhận lời mời làm người dùng có thêm một membership, tức `/auth/me` đổi — và cùng với nó là khu
 * làm việc, menu và mọi cổng quyền. Không làm mới nhánh `auth` thì người vừa bấm "Đồng ý" đứng ở
 * một màn cảm ơn trong khi cả app vẫn tin họ chưa thuộc gian hàng nào.
 */
export function useAnswerInvite(token: string) {
  const queryClient = useQueryClient();
  const onSettled = () => queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });

  const accept = useMutation({
    mutationFn: () => inviteAnswersApi.accept(token),
    onSuccess: onSettled,
  });
  const decline = useMutation({ mutationFn: () => inviteAnswersApi.decline(token) });

  return { accept, decline };
}
