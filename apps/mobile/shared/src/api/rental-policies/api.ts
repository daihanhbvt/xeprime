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
/** Thời gian chết mặc định của gian hàng theo loại xe (06/11/2026, PR #280). */
export type ShopOperationDefaults = Schemas['ShopOperationDefaultsDto'];
export type SaveShopOperationDefaultsInput = Schemas['SaveShopOperationDefaultsDto'];

/** Xe kế thừa mà thiếu dữ liệu bảo hiểm bắt buộc (ADR 0091 điều 1) - web `fetchShopInsuranceImpact`. */
export type ShopInsuranceImpact = Schemas['ShopInsuranceImpactDto'];

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

  /** `applies` = nền tảng đang bán bảo hiểm theo bậc cho loại xe này; `vehicles` = xe sẽ ngừng nhận tự lái nếu Bắt buộc. */
  insuranceImpact(vehicleType: string): Promise<ShopInsuranceImpact> {
    return getApiClient().get<ShopInsuranceImpact>(`${PATH}/insurance-impact`, { vehicleType });
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

const OPERATION_DEFAULTS_PATH = '/shop/operation-defaults';

/**
 * Thiết lập vận hành MẶC ĐỊNH của gian hàng theo loại xe — hiện là thời gian chết giữa hai chuyến,
 * đứng cạnh chính sách thuê trên cùng một màn nên cùng quyền (`tenant.view` / `tenant.update`).
 * Áp cho lịch giữ MỚI của các xe đang theo mặc định (ADR 0006). `vehicleType` đi trên QUERY ở cả
 * hai chiều — hợp đồng của `ShopOperationDefaultsController`.
 */
export const shopOperationDefaultsApi = {
  get(vehicleType: string): Promise<ShopOperationDefaults> {
    return getApiClient().get<ShopOperationDefaults>(OPERATION_DEFAULTS_PATH, { vehicleType });
  },

  async save(
    vehicleType: string,
    body: SaveShopOperationDefaultsInput,
  ): Promise<ShopOperationDefaults> {
    const res = await getApiClient().request<ShopOperationDefaults>(OPERATION_DEFAULTS_PATH, {
      method: 'PUT',
      query: { vehicleType },
      body,
    });
    return res.data;
  },
};
