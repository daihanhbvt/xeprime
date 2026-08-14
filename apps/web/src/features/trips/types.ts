import type { components } from '@xeprime/types';

/**
 * Chuyến của khách (Wave 11) — type sinh từ OpenAPI (ADR 0007), không viết tay.
 *
 * Mọi con số tiền ở đây đã được server tính xong (chuỗi thập phân). Component chỉ định dạng và
 * hiển thị; không nơi nào ở client cộng trừ lại — đó là chỗ hoá đơn bắt đầu lệch với sổ sách.
 */
type Schemas = components['schemas'];

export type CustomerTrip = Schemas['CustomerTripListItemDto'];
export type CustomerTripDetail = Schemas['CustomerTripDetailDto'];
export type CustomerTripFinance = Schemas['CustomerTripFinanceDto'];
export type CustomerTripCounts = Schemas['CustomerTripCountsDto'];
export type CustomerSurcharge = Schemas['CustomerSurchargeDto'];
export type CustomerTripReview = Schemas['CustomerTripReviewDto'];
