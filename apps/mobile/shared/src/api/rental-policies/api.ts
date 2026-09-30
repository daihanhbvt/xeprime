import type { components } from '@xeprime/types';
import { getApiClient } from '@xeprime/api-client';

type Schemas = components['schemas'];

/** Shape lấy từ contract OpenAPI (ADR 0007) — KHÔNG viết tay lại DTO của backend. */
export type RentalPolicyValues = Schemas['RentalPolicyValuesDto'];
export type ShopRentalPolicy = Schemas['ShopRentalPolicyDto'];
export type SaveRentalPolicyInput = Schemas['SaveRentalPolicyDto'];
export type DeliveryTier = Schemas['DeliveryTierDto'];
export type DiscountTier = Schemas['DiscountTierDto'];
/** Mốc ưu đãi cũ tính theo NGÀY — chỉ để cảnh báo, không còn tham gia tính giá (ADR 0011). */
export type LegacyDiscountTier = Schemas['LegacyDiscountTierDto'];

const PATH = '/shop/rental-policies';

/**
 * Chính sách thuê MẶC ĐỊNH của gian hàng (SHP-04) — tách theo LOẠI XE.
 *
 * `tenantId` KHÔNG đi trên dây: backend lấy từ membership của phiên (CLAUDE.md mục 5).
 *
 * `vehicleType` là tham số BẮT BUỘC ở cả hai chiều. Backend vẫn nhận thiếu nó (hàng legacy toàn
 * gian hàng), nhưng giao diện mới luôn gửi — đọc bằng loại xe này rồi ghi đè bằng bản không loại
 * là ghi vào một hàng khác hẳn hàng vừa đọc.
 */
export const shopPoliciesApi = {
  get(vehicleType: string): Promise<ShopRentalPolicy> {
    return getApiClient().get<ShopRentalPolicy>(PATH, { vehicleType });
  },

  /**
   * `PUT` mang `vehicleType` trên QUERY, không trong thân — đó là hợp đồng của
   * `ShopPoliciesController`. Dùng `request()` vì `put()` không nhận query.
   */
  async save(vehicleType: string, body: SaveRentalPolicyInput): Promise<ShopRentalPolicy> {
    const res = await getApiClient().request<ShopRentalPolicy>(PATH, {
      method: 'PUT',
      query: { vehicleType },
      body,
    });
    return res.data;
  },
};
