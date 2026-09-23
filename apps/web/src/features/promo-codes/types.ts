import type { components } from '@xeprime/types';

/**
 * MÃ KHUYẾN MÃI NỀN TẢNG — shape đi trên dây (ADR 0046).
 *
 * Mọi type ở đây lấy từ OpenAPI (ADR 0007), không viết tay: một trường mới ở DTO backend phải
 * xuất hiện ở đây sau `pnpm contract`, không phải sau khi ai đó nhớ ra.
 */

/** Kết quả xem trước MỘT mã — cũng là shape của từng dòng trong danh sách mã khả dụng. */
export type PromoPreview = components['schemas']['PromoPreviewDto'];

/** Mã đã áp + điều kiện đóng băng, đọc lại từ báo giá / snapshot của đơn. */
export type PromoCodeSnapshotView = components['schemas']['PromoCodeSnapshotDto'];

/** Chiến dịch trong màn quản trị nền tảng. */
export type AdminPromoCode = components['schemas']['PromoCodeDto'];
export type AdminPromoCodePage = components['schemas']['PromoCodePageDto'];
export type AdminPromoCodeStats = components['schemas']['PromoCodeStatsDto'];
export type UpsertPromoCodeInput = components['schemas']['UpsertPromoCodeDto'];
export type PromoRedemptionRow = components['schemas']['PromoRedemptionDto'];
export type PromoRedemptionPage = components['schemas']['PromoRedemptionPageDto'];

/**
 * Bộ lọc màn quản trị — giữ trên URL (ADR 0004).
 *
 * `'all'` là trạng thái của Ô CHỌN, không phải một mã nghiệp vụ: nó được dịch thành *không gửi*
 * tham số, đúng khuôn với inbox yêu cầu thuê.
 */
export interface AdminPromoFilters {
  q?: string | undefined;
  discountType: string;
  state: string;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  page: number;
}

/**
 * Tham số một chuyến để hỏi mã — CHÍNH xác những gì server cần dựng lại báo giá.
 *
 * Cố ý KHÔNG có SĐT hay tên khách: danh tính đến từ phiên (cookie), không từ payload
 * (ADR 0046 điều 5) — và một endpoint công khai nhận SĐT là một cách tra "số nào đã từng thuê xe".
 */
export interface PromoTripParams {
  vehicleId: string;
  serviceType?: string | undefined;
  pickupAt?: string | undefined;
  returnAt?: string | undefined;
  packageMonths?: number | undefined;
  routeType?: string | undefined;
  personalAccidentSelected?: boolean | undefined;
}
