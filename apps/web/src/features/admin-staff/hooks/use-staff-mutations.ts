'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { addStaff, removeStaff, updateStaffRole } from '../api';
import type { AddStaffInput, UpdateStaffRoleInput } from '../types';

/** Mọi thay đổi nhân sự invalidate nhánh `platform-staff` để bảng tự tải lại. */
function useInvalidateStaff() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.platformStaff.all });
}

export function useAddStaff() {
  const invalidate = useInvalidateStaff();
  return useMutation({
    mutationFn: (body: AddStaffInput) => addStaff(body),
    onSuccess: () => void invalidate(),
  });
}

export function useUpdateStaffRole() {
  const invalidate = useInvalidateStaff();
  return useMutation({
    mutationFn: ({ userId, roleKey }: { userId: string } & UpdateStaffRoleInput) =>
      updateStaffRole(userId, { roleKey }),
    onSuccess: () => void invalidate(),
  });
}

export function useRemoveStaff() {
  const invalidate = useInvalidateStaff();
  return useMutation({
    mutationFn: (userId: string) => removeStaff(userId),
    onSuccess: () => void invalidate(),
  });
}
