import { apiGet, apiPatch, apiPost } from '@/services/api-client';
import type { MyShop, RegisterShopInput, UpdateProfileInput } from './types';

export const registerShop = (body: RegisterShopInput): Promise<MyShop> =>
  apiPost<MyShop>('/tenants', body);

export const fetchMyShop = (): Promise<MyShop> => apiGet<MyShop>('/tenants/current/shop');

export const updateShopProfile = (body: UpdateProfileInput): Promise<MyShop> =>
  apiPatch<MyShop>('/tenants/current/profile', body);

export const submitShopReview = (): Promise<MyShop> =>
  apiPost<MyShop>('/tenants/current/submit-review');
