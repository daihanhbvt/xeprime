import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import {
  paymentsApi,
  settlementApi,
  type BookingSettlement,
  type CorrectRefundInput,
  type Payment,
  type RecordPaymentInput,
  type RecordRefundInput,
  type SaveSurchargeInput,
} from '../api';

/**
 * Quyết toán cuối chuyến — SERVER tính hết.
 *
 * DTO mang sẵn `proposedRefund = max(cọc đã thu − phụ phí, 0)` và
 * `additionalDue = max(phụ phí − cọc đã thu, 0)`. Client không bao giờ tự cộng trừ hai con số
 * này: chúng phải khớp từng đồng với `apps/api/src/common/booking-money.ts`, và một phép tính
 * thứ hai ở đây là một dịp để chúng trôi khỏi nhau.
 */
export function useSettlement(bookingId: string, enabled = true) {
  return useQuery<BookingSettlement>({
    queryKey: queryKeys.bookings.settlement(bookingId),
    queryFn: () => settlementApi.get(bookingId),
    enabled: enabled && Boolean(bookingId),
  });
}

/**
 * Mọi mutation của quyết toán trả về NGUYÊN trạng thái mới — ghi thẳng vào cache thay vì đọc
 * lần thứ hai chỉ để biết kết quả việc mình vừa làm.
 *
 * Nhánh `bookings` cũng phải làm mới: phụ phí đổi là `amountDue`/`debtAmount` trên đơn đổi theo.
 */
function adoptSettlement(queryClient: QueryClient, bookingId: string) {
  return (settlement: BookingSettlement) => {
    queryClient.setQueryData(queryKeys.bookings.settlement(bookingId), settlement);
    void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.finance.all });
  };
}

export function useAddSurcharge(bookingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveSurchargeInput) => settlementApi.addSurcharge(bookingId, body),
    onSuccess: adoptSettlement(queryClient, bookingId),
  });
}

export function useUpdateSurcharge(bookingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; body: SaveSurchargeInput }) =>
      settlementApi.updateSurcharge(bookingId, input.id, input.body),
    onSuccess: adoptSettlement(queryClient, bookingId),
  });
}

/** Gỡ một khoản — huỷ MỀM kèm lý do; bản ghi vẫn còn để đối chiếu về sau. */
export function useVoidSurcharge(bookingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; reason: string }) =>
      settlementApi.voidSurcharge(bookingId, input.id, input.reason),
    onSuccess: adoptSettlement(queryClient, bookingId),
  });
}

/**
 * Ghi nhận chủ xe ĐÃ hoàn tiền ngoài hệ thống — XePrime không chuyển tiền (ADR 0013).
 *
 * Đây là ghi SỔ, không phải lệnh chuyển khoản. Nút này không làm tiền chạy đi đâu cả.
 */
export function useRecordRefund(bookingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RecordRefundInput) => settlementApi.recordRefund(bookingId, body),
    onSuccess: adoptSettlement(queryClient, bookingId),
  });
}

/** Điều chỉnh bản ghi hoàn cọc — cần `payments.void` + `rowVersion` + lý do vào audit. */
export function useCorrectRefund(bookingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CorrectRefundInput) => settlementApi.correctRefund(bookingId, body),
    onSuccess: adoptSettlement(queryClient, bookingId),
  });
}

/** Lịch sử tiền của một đơn (FIN-06) — cả tiền thuê lẫn tiền cọc, kèm phiếu đã huỷ. */
export function usePaymentHistory(bookingId: string, enabled = true) {
  return useQuery<Payment[]>({
    queryKey: queryKeys.payments.history(bookingId),
    queryFn: () => paymentsApi.history(bookingId),
    enabled: enabled && Boolean(bookingId),
  });
}

/**
 * Ghi nhận thu tiền (FIN-05).
 *
 * **Cọc KHÔNG cộng vào "đã trả"** — nó là tài sản giữ hộ, và cộng nó vào tiền thuê đã thu là
 * báo cho chủ xe rằng khách đã trả một khoản họ chưa trả. Server phân biệt bằng `kind`; client
 * chỉ việc gửi đúng.
 *
 * Trả về ĐƠN với đã trả/còn nợ đã cập nhật, nên ghi thẳng vào cache chi tiết đơn.
 */
export function useRecordPayment(bookingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: RecordPaymentInput) => paymentsApi.record(bookingId, body),
    onSuccess: (booking) => {
      queryClient.setQueryData(queryKeys.bookings.detail(bookingId), booking);
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.history(bookingId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.settlement(bookingId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.finance.all });
    },
  });
}

/** Huỷ một phiếu thu đã ghi nhầm — cần `payments.void`. Phiếu vẫn còn, chỉ đổi trạng thái. */
export function useVoidPayment(bookingId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paymentId: string) => paymentsApi.void(paymentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.payments.history(bookingId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.settlement(bookingId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.finance.all });
    },
  });
}
