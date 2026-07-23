'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { apiGet } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';

export interface CurrentTenantSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  roleKey: string;
}

export interface CurrentUser {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
  phoneVerified: boolean;
  tenant: CurrentTenantSummary | null;
  platformRole: string | null;
  permissions: string[];
}

/**
 * Nguồn duy nhất cho "tôi là ai" ở client.
 *
 * ADR 0002: không đọc token, không decode JWT — session là httpOnly cookie, client không
 * thấy được. Muốn biết mình là ai thì phải hỏi backend.
 */
export function useCurrentUser(): UseQueryResult<CurrentUser> {
  return useQuery({
    queryKey: queryKeys.auth.me(),
    queryFn: () => apiGet<CurrentUser>('/auth/me'),
    // 401 nghĩa là chưa đăng nhập — đó là trạng thái hợp lệ, không phải lỗi cần retry.
    retry: false,
    staleTime: 60_000,
  });
}
