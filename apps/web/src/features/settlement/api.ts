import { apiDelete, apiGet, apiPatch, apiPost } from '@/services/api-client';
import type {
  BookingSettlement,
  CorrectRefundInput,
  PreviewReturnSettlementInput,
  RecordRefundInput,
  ReturnSettlementPreview,
  SaveSurchargeInput,
} from './types';

/**
 * Quyết toán cuối chuyến (Wave 10) — gắn thẳng vào route đơn thuê, không có "đơn" thứ hai.
 *
 * MỌI endpoint trả về nguyên trạng thái quyết toán mới: đề xuất hoàn cọc và "cần thu thêm" do
 * SERVER tính, client không bao giờ tự cộng trừ tiền (ADR 0007).
 */
const base = (bookingId: string) => `/bookings/${bookingId}`;

export const fetchSettlement = (bookingId: string): Promise<BookingSettlement> =>
  apiGet<BookingSettlement>(`${base(bookingId)}/settlement`);

export const addSurcharge = (
  bookingId: string,
  body: SaveSurchargeInput,
): Promise<BookingSettlement> => apiPost<BookingSettlement>(`${base(bookingId)}/surcharges`, body);

export const updateSurcharge = (
  bookingId: string,
  surchargeId: string,
  body: SaveSurchargeInput,
): Promise<BookingSettlement> =>
  apiPatch<BookingSettlement>(`${base(bookingId)}/surcharges/${surchargeId}`, body);

/** Gỡ một khoản — huỷ MỀM kèm lý do, bản ghi vẫn còn để đối chiếu về sau. */
export const voidSurcharge = (
  bookingId: string,
  surchargeId: string,
  reason: string,
): Promise<BookingSettlement> =>
  apiDelete<BookingSettlement>(`${base(bookingId)}/surcharges/${surchargeId}`, { reason });

/** Ghi nhận chủ xe ĐÃ hoàn tiền ngoài hệ thống. XePrime không chuyển tiền. */
export const recordRefund = (
  bookingId: string,
  body: RecordRefundInput,
): Promise<BookingSettlement> =>
  apiPost<BookingSettlement>(`${base(bookingId)}/settlement/refund`, body);

export const correctRefund = (
  bookingId: string,
  body: CorrectRefundInput,
): Promise<BookingSettlement> =>
  apiPatch<BookingSettlement>(`${base(bookingId)}/settlement/refund`, body);

/**
 * Quyết toán XEM TRƯỚC lúc nhận lại xe — server cộng các khoản nháp như thể đã ghi và tính lại cọc,
 * hoàn cọc, số khách còn phải trả, gợi ý quá giờ / vượt km theo giờ và Odo đang gõ. Không ghi gì.
 */
export const previewReturnSettlement = (
  bookingId: string,
  body: PreviewReturnSettlementInput,
): Promise<ReturnSettlementPreview> =>
  apiPost<ReturnSettlementPreview>(`${base(bookingId)}/settlement/return-preview`, body);
