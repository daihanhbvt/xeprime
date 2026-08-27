import { useMutation, useQuery, useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { AuthProvider } from '@xeprime/types';
import { queryKeys } from '@/queries/query-keys';
import { resetSessionScopedCache } from '@/queries/reset-session-cache';
import {
  destroySession,
  fetchCurrentUser,
  loginWithOtp,
  loginWithPassword,
  loginWithSocial,
  registerWithPassword,
  type CurrentUser,
  type RegisterInput,
} from '../api';

export function useCurrentUser(): UseQueryResult<CurrentUser> {
  return useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: fetchCurrentUser,
    // 401 = chưa đăng nhập, là trạng thái hợp lệ chứ không phải lỗi cần retry.
    retry: false,
    staleTime: 60_000,
  });
}

function seedSession(queryClient: QueryClient, user: CurrentUser): void {
  resetSessionScopedCache(queryClient);
  queryClient.setQueryData(queryKeys.auth.me(), user);
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: { identifier: string; password: string }) =>
      loginWithPassword(values.identifier, values.password),
    onSuccess: (user) => seedSession(queryClient, user),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: RegisterInput) => registerWithPassword(values),
    onSuccess: (user) => seedSession(queryClient, user),
  });
}

export function useOtpLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: { phone: string; code: string }) =>
      loginWithOtp(values.phone, values.code),
    onSuccess: (user) => seedSession(queryClient, user),
  });
}

export function useSocialLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: { provider: AuthProvider; locale: string }) =>
      loginWithSocial(values.provider, values.locale),
    onSuccess: (user) => {
      if (user) seedSession(queryClient, user);
    },
  });
}

/** Dọn cache do `SessionBoundary` lo — đăng xuất phát ra đúng sự kiện "phiên kết thúc" như khi refresh hỏng. */
export function useLogout() {
  return useMutation({ mutationFn: destroySession });
}
