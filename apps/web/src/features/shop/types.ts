import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

export type MyShop = Schemas['MyShopDto'];
export type ShopProfile = Schemas['TenantProfileDto'];
export type RegisterShopInput = Schemas['RegisterShopDto'];
export type UpdateProfileInput = Schemas['UpdateTenantProfileDto'];

/** Công tắc thu cọc + LÝ DO — Phase 6. Màn hình vẽ theo `reason`, không tự suy từ `editable`. */
export type PaymentSettings = Schemas['PaymentSettingsDto'];
export type UpdatePaymentSettingsInput = Schemas['UpdatePaymentSettingsDto'];
