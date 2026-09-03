import type { components } from '@xeprime/types';
import { getApiClient } from '../../client';

type Schemas = components['schemas'];

export type BookingSettlement = Schemas['BookingSettlementDto'];
export type BookingSurcharge = Schemas['BookingSurchargeDto'];
export type SaveSurchargeInput = Schemas['SaveSurchargeDto'];
export type DepositRefund = Schemas['DepositRefundDto'];
export type RecordRefundInput = Schemas['RecordDepositRefundDto'];
export type CorrectRefundInput = Schemas['CorrectDepositRefundDto'];
export type OvertimeSuggestion = Schemas['OvertimeSuggestionDto'];

/**
 * Quyết toán cuối chuyến — gắn thẳng vào route đơn thuê, không có "đơn" thứ hai.
 *
 * MỌI endpoint trả về nguyên trạng thái quyết toán mới: đề xuất hoàn cọc và "cần thu thêm" do
 * SERVER tính. Client không bao giờ tự cộng trừ tiền (ADR 0007) — `proposedRefund` là
 * `max(cọc đã thu − phụ phí, 0)`, và tái hiện phép đó ở đây là mở đường cho hai con số lệch nhau.
 */
const base = (bookingId: string) => `/bookings/${encodeURIComponent(bookingId)}`;

export const settlementApi = {
  get(bookingId: string): Promise<BookingSettlement> {
    return getApiClient().get<BookingSettlement>(`${base(bookingId)}/settlement`);
  },

  addSurcharge(bookingId: string, body: SaveSurchargeInput): Promise<BookingSettlement> {
    return getApiClient().post<BookingSettlement>(`${base(bookingId)}/surcharges`, body);
  },

  updateSurcharge(
    bookingId: string,
    surchargeId: string,
    body: SaveSurchargeInput,
  ): Promise<BookingSettlement> {
    return getApiClient().patch<BookingSettlement>(
      `${base(bookingId)}/surcharges/${encodeURIComponent(surchargeId)}`,
      body,
    );
  },

  /** Gỡ một khoản — huỷ MỀM kèm lý do, bản ghi vẫn còn để đối chiếu về sau. */
  voidSurcharge(
    bookingId: string,
    surchargeId: string,
    reason: string,
  ): Promise<BookingSettlement> {
    return getApiClient().delete<BookingSettlement>(
      `${base(bookingId)}/surcharges/${encodeURIComponent(surchargeId)}`,
      { reason },
    );
  },

  /** Ghi nhận chủ xe ĐÃ hoàn tiền ngoài hệ thống. XePrime không chuyển tiền (ADR 0013). */
  recordRefund(bookingId: string, body: RecordRefundInput): Promise<BookingSettlement> {
    return getApiClient().post<BookingSettlement>(`${base(bookingId)}/settlement/refund`, body);
  },

  correctRefund(bookingId: string, body: CorrectRefundInput): Promise<BookingSettlement> {
    return getApiClient().patch<BookingSettlement>(`${base(bookingId)}/settlement/refund`, body);
  },
};
