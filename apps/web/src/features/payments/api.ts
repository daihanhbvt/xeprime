import { apiGet, apiPost } from '@/services/api-client';
import type { BookingDetail } from '@/features/bookings/types';
import type { Payment, RecordPaymentInput } from './types';

/** Ghi nhận thu tiền cho đơn — trả về đơn với đã trả/còn nợ đã cập nhật. */
export const recordPayment = (bookingId: string, body: RecordPaymentInput): Promise<BookingDetail> =>
  apiPost<BookingDetail>(`/bookings/${bookingId}/payments`, body);

export const fetchPaymentHistory = (bookingId: string): Promise<Payment[]> =>
  apiGet<Payment[]>(`/bookings/${bookingId}/payments`);

export const voidPayment = (paymentId: string): Promise<Payment> =>
  apiPost<Payment>(`/payments/${paymentId}/void`);
