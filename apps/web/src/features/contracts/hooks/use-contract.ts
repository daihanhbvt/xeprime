'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { createContract, fetchContract } from '../api';

/** Chi tiết hợp đồng theo id (trang xem/in). */
export function useContract(id: string) {
  return useQuery({
    queryKey: ['contract', id],
    queryFn: () => fetchContract(id),
    enabled: Boolean(id),
    retry: false,
    staleTime: 5 * 60_000, // snapshot đông cứng, không cần refetch thường xuyên
  });
}

/** Tạo/lấy hợp đồng từ đơn (idempotent). Dùng ở nút "Hợp đồng" trong chi tiết đơn. */
export function useCreateContract() {
  return useMutation({ mutationFn: (bookingId: string) => createContract(bookingId) });
}
