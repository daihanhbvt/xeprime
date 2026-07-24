'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { addMember, removeMember, updateMemberRole } from '../api';
import type { AddMemberInput, UpdateMemberRoleInput } from '../types';

/** Mọi thay đổi nhân sự invalidate nhánh `members` để bảng tự tải lại. */
function useInvalidateMembers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.members.all });
}

export function useAddMember() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: (body: AddMemberInput) => addMember(body),
    onSuccess: () => void invalidate(),
  });
}

export function useUpdateMemberRole() {
  const invalidate = useInvalidateMembers();
  return useMutation({
    mutationFn: ({ userId, roleKey }: { userId: string } & UpdateMemberRoleInput) =>
      updateMemberRole(userId, { roleKey }),
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
