import { apiGet, apiPost, apiPut } from '@/services/api-client';
import type { SaveSellerProfileInput, SellerProfile } from './types';

export const fetchSellerProfile = (): Promise<SellerProfile> =>
  apiGet<SellerProfile>('/seller-profile');

export const saveSellerProfile = (body: SaveSellerProfileInput): Promise<SellerProfile> =>
  apiPut<SellerProfile>('/seller-profile', body);

export const submitSellerProfile = (): Promise<SellerProfile> =>
  apiPost<SellerProfile>('/seller-profile/submit');
