'use client';

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { fetchCurrentUser } from '@/services/auth.service';
import type { components } from '@xeprime/types';
import { queryKeys } from '@/services/query-keys';

/**
 * Type lấy THẲNG từ contract OpenAPI (ADR 0007) — trước đây file này và
 * `services/auth.service.ts` mỗi nơi viết tay một bản `CurrentUser`, và chúng đã trôi khỏi
 * nhau (bản ở auth.service thiếu `platformRole`, tức là không phân biệt được nhân sự nền tảng
 * ngay sau khi đăng nhập).
 *
 * Khai ở ĐÂY và chỉ ở đây (ADR 0031 — web và native không dùng chung feature client nữa): một
 * alias thứ hai của cùng `MeDto` là đúng lỗi mà docblock trên đang kể lại.
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
    queryFn: fetchCurrentUser,
    // 401 nghĩa là chưa đăng nhập — đó là trạng thái hợp lệ, không phải lỗi cần retry.
    retry: false,
    /*
     * Observer MỚI mount KHÔNG tự hỏi lại khi lượt trước đã lỗi (401 = chưa đăng nhập). Mặc định
     * của TanStack là hỏi lại, và lượt hỏi lại đưa một query CHƯA có data về `pending` ⇒
     * `isLoading` bật ⇒ màn nào dựng spinner thay cây con (vd `PartnerRegisterView`) tháo cây đó;
     * cây mount lại kèm observer mới ⇒ hỏi lại ⇒ … vòng `/auth/me` vô tận cho người chưa đăng
     * nhập. Phiên đổi qua đường TƯỜNG MINH (`refreshAfterAuth` / `invalidateQueries(auth)`); lỗi
     * tạm thời vẫn được hỏi lại khi focus cửa sổ / hết stale.
     */
    retryOnMount: false,
    staleTime: 60_000,
  });
}
