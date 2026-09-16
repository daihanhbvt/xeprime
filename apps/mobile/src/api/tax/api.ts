import type { components } from '@xeprime/types';
import { getApiClient } from '@xeprime/api-client';

type Schemas = components['schemas'];

/** Một dòng khấu trừ. `amount` ÂM = bút toán đảo; `percent` là SNAPSHOT, không phải tỷ lệ hiện hành. */
export type TaxRow = Schemas['TaxRowDto'];

/** "Thuế đã khấu trừ trong kỳ" nhìn từ CHỦ XE. */
export type TenantTaxSummary = Schemas['TenantTaxSummaryDto'];

/** Kỳ thuế đi trên dây dưới dạng `YYYY-MM` — cùng định dạng web dùng. */
export const TAX_PERIOD_FORMAT = 'YYYY-MM';

export const taxApi = {
  /**
   * Thuế của CHÍNH gian hàng đang đăng nhập.
   *
   * KHÔNG có tham số `tenantId`: backend lấy `tenant_id` từ membership (CLAUDE §6.1). Bỏ trống
   * `period` thì server trả kỳ hiện hành.
   */
  shopSummary(period?: string): Promise<TenantTaxSummary> {
    return getApiClient().get<TenantTaxSummary>('/shop/tax/summary', period ? { period } : {});
  },
};
