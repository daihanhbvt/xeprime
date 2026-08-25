import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import { resetSessionScopedCache } from '@/queries/reset-session-cache';
import { destroySession, fetchCurrentUser, loginWithPassword, type CurrentUser } from '../api';

export function useCurrentUser(): UseQueryResult<CurrentUser> {
  return useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: fetchCurrentUser,
    // 401 = chưa đăng nhập, là trạng thái hợp lệ chứ không phải lỗi cần retry.
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: { identifier: string; password: string }) =>
      loginWithPassword(values.identifier, values.password),
    onSuccess: (user) => {
      // Dọn dữ liệu của người dùng TRƯỚC đó rồi mới gieo hồ sơ mới — đăng nhập bằng tài khoản
      // khác trên cùng máy không được kế thừa cache của tài khoản cũ.
      resetSessionScopedCache(queryClient);
      queryClient.setQueryData(queryKeys.auth.me(), user);
    },
  });
}

/** Dọn cache do `SessionBoundary` lo — đăng xuất phát ra đúng sự kiện "phiên kết thúc" như khi refresh hỏng. */
export function useLogout() {
  return useMutation({ mutationFn: destroySession });
}
