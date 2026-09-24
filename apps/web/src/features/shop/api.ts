import { apiGet, apiPatch, apiPost } from '@/services/api-client';
import type {
  MyShop,
  PaymentSettings,
  RegisterShopInput,
  UpdatePaymentSettingsInput,
  UpdateProfileInput,
} from './types';

export const registerShop = (body: RegisterShopInput): Promise<MyShop> =>
  apiPost<MyShop>('/tenants', body);

export const fetchMyShop = (): Promise<MyShop> => apiGet<MyShop>('/tenants/current/shop');

export const updateShopProfile = (body: UpdateProfileInput): Promise<MyShop> =>
  apiPatch<MyShop>('/tenants/current/profile', body);

/**
 * Công tắc thu cọc (Phase 6).
 *
 * `GET` gọi được ở MỌI gian hàng, kể cả gói thiếu `escrow_hold` — đúng lúc đó màn hình mới cần
 * nói tính năng này thuộc gói nào. `PATCH` mới là đường bị chặn (403).
 */
export const fetchPaymentSettings = (): Promise<PaymentSettings> =>
  apiGet<PaymentSettings>('/shop/payment-settings');

export const updatePaymentSettings = (body: UpdatePaymentSettingsInput): Promise<PaymentSettings> =>
  apiPatch<PaymentSettings>('/shop/payment-settings', body);
