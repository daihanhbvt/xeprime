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
      resetSessionScopedCache(queryClient);
      queryClient.setQueryData(queryKeys.auth.me(), user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: destroySession,
    onSuccess: () => resetSessionScopedCache(queryClient),
  });
}
