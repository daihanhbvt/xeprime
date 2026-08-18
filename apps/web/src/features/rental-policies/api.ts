import { apiGet, apiPut } from '@/services/api-client';
import type {
  PublicQuote,
  SaveRentalPolicyInput,
  SaveVehiclePricingInput,
  ShopRentalPolicy,
  VehiclePricing,
} from './types';

/** Chính sách mặc định tách theo LOẠI XE (17/08) — UI hai tab luôn truyền vehicleType. */
export const fetchShopPolicy = (vehicleType: string): Promise<ShopRentalPolicy> =>
  apiGet<ShopRentalPolicy>('/shop/rental-policies', { vehicleType });

export const saveShopPolicy = (
  body: SaveRentalPolicyInput,
  vehicleType: string,
): Promise<ShopRentalPolicy> =>
  apiPut<ShopRentalPolicy>(`/shop/rental-policies?vehicleType=${vehicleType}`, body);

export const fetchVehiclePricing = (vehicleId: string): Promise<VehiclePricing> =>
  apiGet<VehiclePricing>(`/vehicles/${vehicleId}/pricing`);

export const saveVehiclePricing = (
  vehicleId: string,
  body: SaveVehiclePricingInput,
): Promise<VehiclePricing> => apiPut<VehiclePricing>(`/vehicles/${vehicleId}/pricing`, body);

/**
 * Báo giá công khai cho khách (marketplace) — cùng nguồn tính giá với luồng duyệt của shop.
 *
 * Hai hình thái tham số, đúng hai mô hình giá: dịch vụ theo NGÀY gửi khoảng nhận–trả; THUÊ DÀI
 * HẠN gửi `packageMonths` và KHÔNG gửi ngày nào (giá gói không phụ thuộc ngày nhận — ADR 0011).
 */
export type PublicQuoteParams =
  | { serviceType: 'long_term'; packageMonths: number }
  | { pickupAt: string; returnAt: string; serviceType?: string; routeType?: string };

export const fetchPublicQuote = (
  vehicleId: string,
  params: PublicQuoteParams,
): Promise<PublicQuote> => apiGet<PublicQuote>(`/public/listings/${vehicleId}/quote`, params);
