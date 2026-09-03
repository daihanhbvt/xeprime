import type { components } from '@xeprime/types';
import { getApiClient } from '../../client';
import type { BookingDetail } from '../bookings/api';

type Schemas = components['schemas'];

export type Payment = Schemas['PaymentDto'];
export type RecordPaymentInput = Schemas['RecordPaymentDto'];

/**
 * Ghi sổ tiền của một đơn (FIN-05, FIN-06). KHÔNG có thanh toán trực tuyến (ADR 0013) — đây là
 * ghi nhận thủ công những gì đã xảy ra ở quầy.
 *
 * CỌC KHÔNG cộng vào "đã trả": nó là tài sản giữ hộ, và cộng nó vào tiền thuê đã thu là báo
 * cho chủ xe rằng khách đã trả một khoản họ chưa trả.
 */
export const paymentsApi = {
  /** Trả về ĐƠN với đã trả/còn nợ đã cập nhật — server tính, client chỉ hiển thị. */
  record(bookingId: string, body: RecordPaymentInput): Promise<BookingDetail> {
    return getApiClient().post<BookingDetail>(
      `/bookings/${encodeURIComponent(bookingId)}/payments`,
      body,
    );
  },

  history(bookingId: string): Promise<Payment[]> {
    return getApiClient().get<Payment[]>(`/bookings/${encodeURIComponent(bookingId)}/payments`);
  },

  void(paymentId: string): Promise<Payment> {
    return getApiClient().post<Payment>(`/payments/${encodeURIComponent(paymentId)}/void`);
  },
};
