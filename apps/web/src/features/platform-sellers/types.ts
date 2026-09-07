import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

/** Hàng đợi — PII đã che (`idNumber`/`bankAccountNumber` rút gọn). */
export type PlatformSellerProfile = Schemas['PlatformSellerProfileDto'];
export type ReviewSellerProfileInput = Schemas['ReviewSellerProfileDto'];

export interface PlatformSellerFilters {
  status?: string;
  q?: string;
  page?: number;
  limit?: number;
}
