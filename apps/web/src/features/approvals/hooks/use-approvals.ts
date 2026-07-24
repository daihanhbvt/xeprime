'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  approveTask,
  fetchApproval,
  fetchApprovals,
  filtersToParams,
  rejectTask,
  requestRevisionTask,
} from '../api';
import type { ApprovalFilters } from '../types';

export function useApprovals(filters: ApprovalFilters) {
  return useQuery({
    queryKey: queryKeys.approvals.list(filtersToParams(filters)),
    queryFn: () => fetchApprovals(filters),
    placeholderData: keepPreviousData,
  });
}

export function useApproval(id: string | null) {
  return useQuery({
    queryKey: queryKeys.approvals.detail(id ?? ''),
    queryFn: () => fetchApproval(id as string),
    enabled: Boolean(id),
  });
}

type ReviewKind = 'approve' | 'reject' | 'request_revision';

/** Duyệt/từ chối/yêu cầu bổ sung. Sau khi xong, làm mới cả danh sách lẫn chi tiết phiếu. */
export function useReviewActions(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ kind, reason }: { kind: ReviewKind; reason?: string }) => {
      if (kind === 'approve') return approveTask(id, reason);
      if (kind === 'reject') return rejectTask(id, reason ?? '');
      return requestRevisionTask(id, reason ?? '');
    },
    onSuccess: (detail) => {
      queryClient.setQueryData(queryKeys.approvals.detail(id), detail);
      void queryClient.invalidateQueries({ queryKey: queryKeys.approvals.all });
    },
  });
}
