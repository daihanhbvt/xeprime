'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { approveReceipt, cancelReceipt, createReceipt } from '../api';
import type { CreateReceiptInput } from '../types';

/** Sau mỗi thay đổi phiếu, invalidate `receipts` + `dashboard` (số liệu tài chính đổi theo). */
function invalidate(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.receipts.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
}

export function useCreateReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateReceiptInput) => createReceipt(body),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useApproveReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => approveReceipt(id),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useCancelReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => cancelReceipt(id, reason),
    onSuccess: () => invalidate(queryClient),
  });
}
