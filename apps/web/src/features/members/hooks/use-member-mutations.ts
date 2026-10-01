'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { createInvite, removeMember, revokeInvite, updateMemberRole } from '../api';
import type { CreateInviteInput, UpdateMemberRoleInput } from '../types';

/**
 * Mọi thay đổi nhân sự invalidate nhánh `members` để bảng tự tải lại.
 *
 * Nhánh đó bao cả lời mời (`queryKeys.members.invites`) — gửi hay thu hồi một lời mời đổi danh
 * sách mời, còn nhận một lời mời đổi danh sách thành viên. Một cổng invalidate cho cả hai.
 */
function useInvalidateMembers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.members.all });
}

export function useCreateInvite() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: (body: CreateInviteInput) => createInvite(body),
    onSuccess: () => void invalidate(),
  });
}

export function useRevokeInvite() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: (id: string) => revokeInvite(id),
    onSuccess: () => void invalidate(),
  });
}

export function useUpdateMemberRole() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    // Chuyển NGUYÊN body: hook mà tự nhặt field là mỗi lần DTO thêm trường (branchScope,
    // branchIds — ADR 0052) lại một chỗ âm thầm nuốt mất nó.
    mutationFn: ({ userId, ...body }: { userId: string } & UpdateMemberRoleInput) =>
      updateMemberRole(userId, body),
    onSuccess: () => void invalidate(),
  });
}

export function useRemoveMember() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: (userId: string) => removeMember(userId),
    onSuccess: () => void invalidate(),
  });
}
