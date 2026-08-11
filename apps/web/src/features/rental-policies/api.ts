import { apiGet, apiPut } from '@/services/api-client';
import type {
  PublicQuote,
  SaveRentalPolicyInput,
  SaveVehiclePricingInput,
  ShopRentalPolicy,
  VehiclePricing,
} from './types';

export const fetchShopPolicy = (): Promise<ShopRentalPolicy> =>
  apiGet<ShopRentalPolicy>('/shop/rental-policies');

export const saveShopPolicy = (body: SaveRentalPolicyInput): Promise<ShopRentalPolicy> =>
  apiPut<ShopRentalPolicy>('/shop/rental-policies', body);

export const fetchVehiclePricing = (vehicleId: string): Promise<VehiclePricing> =>
  apiGet<VehiclePricing>(`/vehicles/${vehicleId}/pricing`);

export const saveVehiclePricing = (
  vehicleId: string,
  body: SaveVehiclePricingInput,
): Promise<VehiclePricing> => apiPut<VehiclePricing>(`/vehicles/${vehicleId}/pricing`, body);

/** Báo giá công khai cho khách (marketplace) — cùng nguồn tính giá với luồng duyệt của shop. */
export const fetchPublicQuote = (
  vehicleId: string,
  params: { pickupAt: string; returnAt: string },
): Promise<PublicQuote> => apiGet<PublicQuote>(`/public/listings/${vehicleId}/quote`, params);
