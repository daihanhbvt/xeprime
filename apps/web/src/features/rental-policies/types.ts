import type { components } from '@xeprime/types';

/**
 * Shape lấy từ OpenAPI (ADR 0007) — KHÔNG viết tay lại DTO.
 * Đổi backend → `pnpm contract` → lỗi type ở đây là hợp đồng đã lệch.
 */
export type RentalPolicyValues = components['schemas']['RentalPolicyValuesDto'];
export type ShopRentalPolicy = components['schemas']['ShopRentalPolicyDto'];
export type SaveRentalPolicyInput = components['schemas']['SaveRentalPolicyDto'];
export type DeliveryTier = components['schemas']['DeliveryTierDto'];
export type DiscountTier = components['schemas']['DiscountTierDto'];

export type VehiclePricing = components['schemas']['VehiclePricingDto'];
export type SaveVehiclePricingInput = components['schemas']['SaveVehiclePricingDto'];

export type PriceBreakdownRow = components['schemas']['PriceBreakdownRowDto'];
export type QuoteBreakdown = components['schemas']['QuoteBreakdownDto'];
export type PublicQuote = components['schemas']['PublicQuoteDto'];
/** Khoảng cách giao xe + phí dự kiến tra từ bản đồ — luôn 200, mọi ngả hỏng là một `status`. */
export type DeliveryDistance = components['schemas']['DeliveryDistanceDto'];
/**
 * LỊCH SỬ (Wave 9): báo giá giao nhận theo khoảng cách đã bị bỏ. Kiểu này chỉ còn để ĐỌC dữ
 * liệu của các yêu cầu tạo trước đó — không có đường ghi mới. Phí giao nhận nay chốt trên ĐƠN
 * (`PATCH /bookings/:id/delivery-fee`).
 */
export type BookingRequestDeliveryQuote = components['schemas']['BookingRequestDeliveryQuoteDto'];
