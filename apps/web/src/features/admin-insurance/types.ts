import type { components, InsuranceProductKind, InsuranceQueueStatusFilter } from '@xeprime/types';

type Schemas = components['schemas'];

export type InsuranceProduct = Schemas['InsuranceProductDto'];
export type UpdateInsuranceProductInput = Schemas['UpdateInsuranceProductDto'];
export type InsurancePolicy = Schemas['PlatformInsurancePolicyDto'];
export type InsurancePolicyDetail = Schemas['PlatformInsurancePolicyDetailDto'];

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
