import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

export type MyShop = Schemas['MyShopDto'];
export type ShopProfile = Schemas['TenantProfileDto'];
export type RegisterShopInput = Schemas['RegisterShopDto'];
export type UpdateProfileInput = Schemas['UpdateTenantProfileDto'];
