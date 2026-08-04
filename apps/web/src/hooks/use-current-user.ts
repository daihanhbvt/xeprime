'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { components } from '@xeprime/types';
import { apiGet } from '@/services/api-client';
import { queryKeys } from '@/services/query-keys';

/**
 * Type lấy THẲNG từ contract OpenAPI (ADR 0007) — trước đây file này và
 * `services/auth.service.ts` mỗi nơi viết tay một bản `CurrentUser`, và chúng đã trôi khỏi
 * nhau (bản ở auth.service thiếu `platformRole`, tức là không phân biệt được nhân sự nền tảng
 * ngay sau khi đăng nhập).
 */
type Schemas = components['schemas'];

export type CurrentTenantSummary = Schemas['CurrentTenantSummaryDto'];
export type CurrentUser = Schemas['MeDto'];

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
