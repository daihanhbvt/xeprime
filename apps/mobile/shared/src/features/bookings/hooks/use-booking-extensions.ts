import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BOOKING_EXTENSION_STATUS } from '@xeprime/types';
import { queryKeys } from '@/queries/query-keys';
import {
  bookingsApi,
  type BookingDetail,
  type BookingExtension,
  type SetHandoverPrepCheckInput,
} from '../api';

/**
 * Bản native của `use-booking-extensions.ts` (web, ADR 0077).
 *
 * Nhịp hỏi lại khi có phụ lục đang chờ tiền: phụ lục tự lật `active` lúc webhook SePay đối soát đủ
 * (ADR 0077 điều 5) — màn thanh toán phải tự đổi theo, không có nút "khách đã chuyển khoản".
 */
const AWAITING_REFETCH_MS = 5_000;

/** Phụ lục gia hạn của một đơn (cũ trước). */
export function useBookingExtensions(bookingId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.bookings.extensions(bookingId),
    queryFn: () => bookingsApi.extensions(bookingId),
    enabled,
    refetchInterval: (query) =>
      query.state.data?.some((e) => e.status === BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT)
        ? AWAITING_REFETCH_MS
        : false,
  });
}

/** Phụ lục đang chờ khách thanh toán — tối đa MỘT mỗi đơn (unique ở DB). */
export function pendingExtensionOf(
  extensions: readonly BookingExtension[] | undefined,
): BookingExtension | null {
  return extensions?.find((e) => e.status === BOOKING_EXTENSION_STATUS.AWAITING_PAYMENT) ?? null;
}

/** Xem trước giá + lịch trống của N tháng. Giữ số cũ khi đổi mốc để tấm không nhảy. */
export function useBookingExtensionQuote(bookingId: string, months: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.bookings.extensionQuote(bookingId, months),
    queryFn: () => bookingsApi.extensionQuote(bookingId, months),
    enabled,
    placeholderData: keepPreviousData,
  });
}

/**
 * Tạo / huỷ phụ lục làm đổi lịch xe và (khi hiệu lực) giờ trả của đơn — làm mới cùng bộ với web.
 */
function invalidateAfterExtensionChange(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
}

export function useCreateBookingExtension(bookingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (months: number) => bookingsApi.createExtension(bookingId, months),
    onSuccess: () => invalidateAfterExtensionChange(queryClient),
  });
}

export function useCancelBookingExtension(bookingId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (extensionId: string) => bookingsApi.cancelExtension(bookingId, extensionId),
    onSuccess: () => invalidateAfterExtensionChange(queryClient),
  });
}

/**
 * Đánh dấu tay một việc chuẩn bị bàn giao (03/11/2026). Response là khối checklist mới — vá thẳng
 * vào cache chi tiết đơn, không tải lại cả đơn cho một dấu tick.
 */
export function useSetHandoverPrepCheck(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: SetHandoverPrepCheckInput) => bookingsApi.setHandoverPrepCheck(id, body),
    onSuccess: (handoverPrep) => {
      queryClient.setQueryData<BookingDetail>(queryKeys.bookings.detail(id), (current) =>
        current ? { ...current, handoverPrep } : current,
      );
    },
  });
}
