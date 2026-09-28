'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchSupportContext, openSupportContext, revokeSupportContext } from '../api';
import type { OpenSupportContextInput, SupportContext } from '../types';

/**
 * Bản ghi phiên — đọc ở CACHE CHÍNH (thông tin về phiên, không phải dữ liệu của gian hàng).
 *
 * `retry: false`: 403 hết hạn/không hợp lệ là trạng thái cuối, thử lại chỉ làm chậm màn "phiên
 * đã kết thúc". Làm mới mỗi phút để quyền ghi rơi (gian hàng bị khoá, mất quyền assist) và mốc
 * hết hạn hiện lên banner mà không cần F5.
 */
export function useSupportContext(id: string) {
  return useQuery({
    queryKey: queryKeys.tenantSupport.context(id),
    queryFn: () => fetchSupportContext(id),
    retry: false,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useOpenSupportContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: OpenSupportContextInput) => openSupportContext(body),
    onSuccess: (context: SupportContext) => {
      qc.setQueryData(queryKeys.tenantSupport.context(context.id), context);
    },
  });
}

/**
 * Thoát phiên. KHÔNG dọn cache ở đây: dọn lúc trang phiên còn mount làm nó đọc lại phiên (đã thoát)
 * và nháy màn "phiên đã kết thúc" trước khi kịp điều hướng. `SupportSessionBoundary` dọn khi
 * unmount — tức là sau khi đã rời trang.
 */
export function useRevokeSupportContext(id: string) {
  return useMutation({ mutationFn: () => revokeSupportContext(id) });
}
