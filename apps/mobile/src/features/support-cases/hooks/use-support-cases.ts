import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { keepPageData } from '@/queries/keep-page-data';
import { queryKeys } from '@/queries/query-keys';
import {
  supportCasesApi,
  supportCasesToParams,
  SUPPORT_SURFACE,
  type OpenSupportCaseInput,
  type PostSupportEventInput,
  type SupportCaseFilters,
  type SupportSurface,
  type TransitionSupportCaseInput,
} from '../api';

/**
 * Yêu cầu hỗ trợ — hai bề mặt, cùng bộ hook, khác nhau ở tham số `surface`.
 *
 * Query key dùng chung với web (`queryKeys.supportCases`) nên hai client không đặt tên khác nhau
 * cho cùng một nhánh dữ liệu; và `surface` nằm TRONG key để màn khách và màn gian hàng không
 * dùng lẫn cache của nhau — cùng một `id` trả về dòng thời gian khác nhau ở hai bề mặt.
 */
export function useSupportCases(surface: SupportSurface, filters: SupportCaseFilters) {
  const params = supportCasesToParams(surface, filters);

  return useQuery({
    queryKey: queryKeys.supportCases.list(params),
    queryFn: () => supportCasesApi.list(surface, filters),
    /*
     * Giữ trang TRƯỚC trong lúc trang/bộ lọc mới đang tải — đúng `keepPreviousData` của web.
     *
     * Thiếu nó thì mỗi ký tự gõ vào ô tìm là một lần danh sách biến mất và khung chờ nhảy vào,
     * trên một màn mà người dùng đang đọc để so sánh.
     */
    placeholderData: keepPageData<Awaited<ReturnType<typeof supportCasesApi.list>>>(params),
  });
}

function useInvalidateSupport() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.supportCases.all });
}

export function useOpenSupportCase(surface: SupportSurface) {
  const invalidate = useInvalidateSupport();
  return useMutation({
    mutationFn: (body: OpenSupportCaseInput) => supportCasesApi.open(surface, body),
    onSuccess: invalidate,
  });
}

/**
 * Rút yêu cầu xoá tài khoản của chính mình — màn "Yêu cầu xoá tài khoản".
 *
 * Không nhận `surface`: xoá tài khoản chỉ tồn tại ở bề mặt KHÁCH.
 */
export function useWithdrawAccountDeletion() {
  const invalidate = useInvalidateSupport();
  return useMutation({
    mutationFn: (id: string) => supportCasesApi.withdrawAccountDeletion(id),
    onSuccess: invalidate,
  });
}

/**
 * Một yêu cầu kèm dòng thời gian.
 *
 * `staleTime: 0` — dòng thời gian là thứ người dùng mở ra ĐỂ xem có ai trả lời chưa; phục vụ một
 * bản cache cũ ở đây là trả lời sai đúng câu hỏi họ đang hỏi.
 */
export function useSupportCase(surface: SupportSurface, id: string | null) {
  return useQuery({
    queryKey: queryKeys.supportCases.detail(`${surface}:${id ?? ''}`),
    queryFn: () => supportCasesApi.detail(surface, id as string),
    enabled: Boolean(id),
    staleTime: 0,
  });
}

export function usePostSupportMessage(surface: SupportSurface) {
  const invalidate = useInvalidateSupport();
  return useMutation({
    mutationFn: ({ id, ...body }: PostSupportEventInput & { id: string }) =>
      supportCasesApi.postMessage(surface, id, body),
    onSuccess: invalidate,
  });
}

/** Đổi trạng thái — ở cả hai bề mặt này chỉ có đúng một đích: đóng yêu cầu. */
export function useTransitionSupportCase(surface: SupportSurface) {
  const invalidate = useInvalidateSupport();
  return useMutation({
    mutationFn: ({ id, ...body }: TransitionSupportCaseInput & { id: string }) =>
      supportCasesApi.transition(surface, id, body),
    onSuccess: invalidate,
  });
}

export { SUPPORT_SURFACE };
