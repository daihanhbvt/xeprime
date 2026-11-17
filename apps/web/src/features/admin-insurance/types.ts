import type { components, InsuranceProductKind, InsuranceQueueStatusFilter } from '@xeprime/types';

type Schemas = components['schemas'];

export type InsuranceProduct = Schemas['InsuranceProductDto'];
export type UpdateInsuranceProductInput = Schemas['UpdateInsuranceProductDto'];
export type InsurancePolicy = Schemas['PlatformInsurancePolicyDto'];
export type InsurancePolicyDetail = Schemas['PlatformInsurancePolicyDetailDto'];
/** Lượt thu hồi sẽ làm gì (ADR 0093) — server tính, hộp thu hồi chỉ hiện. */
export type InsuranceVoidPlan = Schemas['InsuranceVoidPlanDto'];
export type VoidInsurancePolicyInput = Schemas['VoidInsurancePolicyDto'];
export type VoidInsurancePolicyResult = Schemas['VoidInsurancePolicyResultDto'];
/** Phí thực tế của một hợp đồng (ADR 0091 điều 2). */
export type InsurancePolicyPricing = Schemas['InsurancePolicyPricingDto'];
/** Hợp đồng cần xử lý gấp (ADR 0091 điều 7). */
export type InsuranceAttentionPage = Schemas['InsuranceAttentionPageDto'];

export interface CertificateFilters {
  /**
   * Trạng thái của hàng đợi GCN trên URL. Bỏ trống = góc nhìn "Cần xử lý" (server trả `failed`);
   * `INSURANCE_QUEUE_STATUS_ANY` = góc nhìn "Tất cả"; một trạng thái cụ thể = lọc TRONG "Tất cả".
   * Không dùng `'all'`, vì `useUrlFilters` xoá giá trị đó khỏi URL.
   */
  status?: InsuranceQueueStatusFilter;
  productKind?: InsuranceProductKind;
  q?: string;
  page?: number;
  limit?: number;
  open?: string;
}

// ── Bảng kê trả phí cho hãng (ADR 0088 điều 6) ──
export type InsuranceRemittance = Schemas['InsuranceRemittanceDto'];
export type InsuranceRemittanceLine = Schemas['InsuranceRemittanceLineDto'];
export type InsuranceRemittancePending = Schemas['InsuranceRemittancePendingDto'];
export type CreateInsuranceRemittanceInput = Schemas['CreateInsuranceRemittanceDto'];
export type PayInsuranceRemittanceInput = Schemas['PayInsuranceRemittanceDto'];

export interface RemittanceFilters {
  page?: number;
  limit?: number;
  /** Bảng kê đang mở trong drawer (`?remittance=`). */
  remittance?: string;
}
