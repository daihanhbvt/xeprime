'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { approveReceipt, cancelReceipt, createReceipt } from '../api';
import type { CreateReceiptInput } from '../types';

/**
 * Sau mỗi thay đổi phiếu, invalidate cả ba nhánh đọc lại chính những phiếu đó.
 *
 * `finance` nằm trong danh sách vì duyệt/huỷ một phiếu đổi ngay `/finance/summary`,
 * `/finance/series` và các bảng theo xe/khách — thiếu nó thì màn Tổng quan doanh thu và hai
 * thẻ tiền trên dashboard giữ số cũ cho tới khi cache tự hết hạn, tức người vừa duyệt phiếu
 * nhìn thấy một con số họ biết chắc là sai.
 */
function invalidate(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.receipts.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.finance.all });
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
