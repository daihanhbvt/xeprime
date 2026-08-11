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
export type DeliveryQuotePreview = components['schemas']['DeliveryQuotePreviewDto'];
export type SaveDeliveryQuoteInput = components['schemas']['SaveDeliveryQuoteDto'];
export type BookingRequestDeliveryQuote = components['schemas']['BookingRequestDeliveryQuoteDto'];
