import { useMutation, useQuery } from '@tanstack/react-query';
import { STALE_TIME } from '@xeprime/api-client';
import { queryKeys } from '@/queries/query-keys';
import { contractsApi } from '../api';

/**
 * Chi tiết hợp đồng theo id.
 *
 * `staleTime` dài và `retry: false` vì hợp đồng là một BẢN CHỤP đông cứng — nó không đổi sau khi
 * lập, và 404 ở đây nghĩa là "không tồn tại", thử lại ba lần cũng vẫn thế.
 */
export function useContract(id: string) {
  return useQuery({
    queryKey: queryKeys.contracts.detail(id),
    queryFn: () => contractsApi.getOne(id),
    enabled: Boolean(id),
    retry: false,
    staleTime: STALE_TIME.REFERENCE,
  });
}

/** Tạo/lấy hợp đồng từ đơn — idempotent ở server, bấm lại trả đúng bản cũ. */
export function useCreateContract() {
  return useMutation({
    mutationFn: (bookingId: string) => contractsApi.createForBooking(bookingId),
  });
}
