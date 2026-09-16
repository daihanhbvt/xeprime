import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

export type MyShop = Schemas['MyShopDto'];
export type ShopProfile = Schemas['TenantProfileDto'];
/**
 * Tài khoản CHỦ gian hàng — `tenants.owner_user_id → users`, nguồn DUY NHẤT (16/09/2026).
 *
 * KHÔNG nằm trong `ShopProfile`, và đó là điểm chính: hồ sơ là thứ `tenant.update` sửa được,
 * còn khối này chỉ đổi khi chính người chủ đổi tài khoản của họ (ADR 0038 điều 3).
 */
export type ShopOwnerAccount = Schemas['ShopOwnerAccountDto'];
export type RegisterShopInput = Schemas['RegisterShopDto'];
export type UpdateProfileInput = Schemas['UpdateTenantProfileDto'];

/** Công tắc thu cọc + LÝ DO — Phase 6. Màn hình vẽ theo `reason`, không tự suy từ `editable`. */
export type PaymentSettings = Schemas['PaymentSettingsDto'];
export type UpdatePaymentSettingsInput = Schemas['UpdatePaymentSettingsDto'];
