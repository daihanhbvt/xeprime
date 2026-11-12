'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import {
  addSurcharge,
  correctRefund,
  fetchSettlement,
  previewReturnSettlement,
  recordRefund,
  updateSurcharge,
  voidSurcharge,
} from './api';
import type {
  BookingSettlement,
  CorrectRefundInput,
  PreviewReturnSettlementInput,
  RecordRefundInput,
  SaveSurchargeInput,
} from './types';

/**
 * Quyết toán của một đơn. `enabled` tắt khi thiếu quyền xem đơn — không gọi API rồi mới nhận
 * 403, đúng kỷ luật "UI không có quyền thì không đi lấy dữ liệu".
 */
export function useSettlement(bookingId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.bookings.settlement(bookingId ?? ''),
    queryFn: () => fetchSettlement(bookingId!),
    enabled: Boolean(bookingId) && enabled,
  });
}

/**
 * Mọi mutation quyết toán trả về TRẠNG THÁI MỚI đầy đủ — ghi thẳng vào cache thay vì tự cộng
 * trừ ở client. Đề xuất hoàn cọc là con số của server; tính lại ở trình duyệt là cách chắc
 * chắn nhất để hai bên lệch nhau.
 */
function useSettlementMutation<TInput>(
  bookingId: string,
  fn: (input: TInput) => Promise<BookingSettlement>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (next) => {
      queryClient.setQueryData(queryKeys.bookings.settlement(bookingId), next);
      // Thẻ cọc và chi tiết đơn hiện cạnh nhau — làm mới cả nhánh để không nơi nào kể chuyện cũ.
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      // Phụ phí / quyết toán đổi tiền đơn ⇒ đổi "Còn nợ" và tab Thu chi của hồ sơ khách.
      void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    },
  });
}

export const useAddSurcharge = (bookingId: string) =>
  useSettlementMutation<SaveSurchargeInput>(bookingId, (body) => addSurcharge(bookingId, body));

export const useUpdateSurcharge = (bookingId: string) =>
  useSettlementMutation<{ id: string; body: SaveSurchargeInput }>(bookingId, ({ id, body }) =>
    updateSurcharge(bookingId, id, body),
  );

export const useVoidSurcharge = (bookingId: string) =>
  useSettlementMutation<{ id: string; reason: string }>(bookingId, ({ id, reason }) =>
    voidSurcharge(bookingId, id, reason),
  );

export const useRecordRefund = (bookingId: string) =>
  useSettlementMutation<RecordRefundInput>(bookingId, (body) => recordRefund(bookingId, body));

export const useCorrectRefund = (bookingId: string) =>
  useSettlementMutation<CorrectRefundInput>(bookingId, (body) => correctRefund(bookingId, body));

/**
 * Quyết toán XEM TRƯỚC của hộp nhận lại xe. Nơi gọi truyền bộ số đã DEBOUNCE; giữ câu trả lời trước
 * trong lúc chờ câu mới để khối tiền không nháy về trống mỗi lần gõ một chữ số.
 */
export function useReturnSettlementPreview(
  bookingId: string,
  input: PreviewReturnSettlementInput,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.bookings.returnPreview(bookingId, input),
    queryFn: () => previewReturnSettlement(bookingId, input),
    enabled,
    placeholderData: keepPreviousData,
    retry: false,
  });
}
