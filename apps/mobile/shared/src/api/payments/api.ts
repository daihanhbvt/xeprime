import type { components } from '@xeprime/types';
import { getApiClient } from '@xeprime/api-client';
import type { BookingDetail } from '../bookings/api';

type Schemas = components['schemas'];

export type Payment = Schemas['PaymentDto'];
export type RecordPaymentInput = Schemas['RecordPaymentDto'];
export type AdjustDepositCollectedInput = Schemas['AdjustDepositCollectedDto'];

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

  /**
   * Sửa số cọc ĐÃ THU bằng bút toán điều chỉnh - server tính chênh với cọc ròng, ghi thêm một
   * khoản thu cọc hoặc một khoản trả lại khách (không sửa/xoá khoản cũ). Trả về ĐƠN đầy đủ.
   */
  adjustDepositCollected(
    bookingId: string,
    body: AdjustDepositCollectedInput,
  ): Promise<BookingDetail> {
    return getApiClient().post<BookingDetail>(
      `/bookings/${encodeURIComponent(bookingId)}/deposit-adjustments`,
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
