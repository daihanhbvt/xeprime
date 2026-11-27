import { apiGet, apiPost } from '@/services/api-client';
import type { BookingDetail } from '@/features/bookings/types';
import type { AdjustDepositCollectedInput, Payment, RecordPaymentInput } from './types';

/** Ghi nhận thu tiền cho đơn — trả về đơn với đã trả/còn nợ đã cập nhật. */
export const recordPayment = (bookingId: string, body: RecordPaymentInput): Promise<BookingDetail> =>
  apiPost<BookingDetail>(`/bookings/${bookingId}/payments`, body);

/**
 * Sửa số cọc ĐÃ THU bằng bút toán điều chỉnh - server tự tính chênh với cọc ròng hiện tại và ghi
 * thêm một khoản thu cọc hoặc một khoản trả lại khách; không sửa/xoá khoản cũ.
 */
export const adjustDepositCollected = (
  bookingId: string,
  body: AdjustDepositCollectedInput,
): Promise<BookingDetail> =>
  apiPost<BookingDetail>(`/bookings/${bookingId}/deposit-adjustments`, body);

export const fetchPaymentHistory = (bookingId: string): Promise<Payment[]> =>
  apiGet<Payment[]>(`/bookings/${bookingId}/payments`);

export const voidPayment = (paymentId: string): Promise<Payment> =>
  apiPost<Payment>(`/payments/${paymentId}/void`);
