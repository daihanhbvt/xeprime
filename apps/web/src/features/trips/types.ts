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

/**
 * Biên bản bàn giao mà khách được xem — bản CỦA KHÁCH, không phải `HandoverDto` của gian hàng.
 *
 * Khác biệt nằm ở những gì KHÔNG có: không `fileId`, không tên file gốc, không ghi chú nội bộ,
 * không tên người xác nhận. Đó là chủ ý ở backend, và việc dùng đúng type này (thay vì mượn tạm
 * type của gian hàng) là cách giữ cho một lần "tiện thể hiển thị thêm" không lọt qua typecheck.
 */
export type CustomerTripHandoverEvidence = Schemas['CustomerTripHandoverEvidenceDto'];
export type CustomerTripHandoverEvidencePhoto = Schemas['CustomerTripHandoverEvidencePhotoDto'];
/** Vé xem ảnh riêng tư: URL ký + hạn dùng. Dùng chung shape với kho tài liệu (Wave 4.1). */
export type PrivateFileTicket = Schemas['SourceContractDownloadDto'];
