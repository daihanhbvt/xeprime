'use client';

import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  acceptInvite,
  declineInvite,
  fetchInvitePreview,
  fetchInvites,
  inviteFiltersToParams,
} from '../api';
import type { InviteFilters } from '../types';

/** Lời mời của gian hàng — phân trang server-side, mặc định chỉ những lời đang chờ. */
export function useInvites(filters: InviteFilters) {
  return useQuery({
    queryKey: queryKeys.members.invites(inviteFiltersToParams(filters)),
    queryFn: () => fetchInvites(filters),
    placeholderData: keepPreviousData,
  });
}

/**
 * Xem trước một lời mời — dùng ở trang `/invites/[token]`.
 *
 * `retry: false`: token sai hoặc lời mời đã bị thu hồi trả 404, và thử lại ba lần chỉ làm người
 * dùng nhìn spinner lâu hơn trước khi nhận cùng một câu trả lời.
 *
 * `staleTime: 0`: trạng thái lời mời đổi được từ phía gian hàng (thu hồi) giữa lúc người dùng
 * mở tab và lúc họ bấm — đọc lại là đúng, cache một lời mời thì không.
 */
export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: queryKeys.members.invitePreview(token),
    queryFn: () => fetchInvitePreview(token),
    retry: false,
    staleTime: 0,
    enabled: Boolean(token),
  });
}

export function useAnswerInvite(token: string) {
  const accept = useMutation({ mutationFn: () => acceptInvite(token) });
  const decline = useMutation({ mutationFn: () => declineInvite(token) });
  return { accept, decline };
}
