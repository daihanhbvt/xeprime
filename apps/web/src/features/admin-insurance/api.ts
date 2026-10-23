import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import {
  apiGet,
  apiPatch,
  apiPost,
  fetchPage,
  type Paged,
  type QueryParams,
} from '@/services/api-client';
import type {
  CertificateFilters,
  InsurancePolicy,
  InsurancePolicyDetail,
  InsuranceProduct,
  UpdateInsuranceProductInput,
} from './types';

export const CERTIFICATE_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

// ── Danh mục sản phẩm (ADR 0064) ────────────────────────────────────────────

export const fetchInsuranceProducts = (): Promise<InsuranceProduct[]> =>
  apiGet<InsuranceProduct[]>('/platform/insurance/products');

export const updateInsuranceProduct = (
  id: string,
  body: UpdateInsuranceProductInput,
): Promise<InsuranceProduct> =>
  apiPatch<InsuranceProduct>(`/platform/insurance/products/${encodeURIComponent(id)}`, body);

// ── Hàng đợi giấy chứng nhận ────────────────────────────────────────────────

export function certificateFiltersToParams(filters: CertificateFilters): QueryParams {
  return {
    status: filters.status ?? null,
    productKind: filters.productKind ?? null,
    q: filters.q ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? CERTIFICATE_DEFAULT_LIMIT,
  };
}

export const fetchCertificates = (filters: CertificateFilters): Promise<Paged<InsurancePolicy>> =>
  fetchPage<InsurancePolicy>(
    '/platform/money/insurance',
    certificateFiltersToParams(filters),
    CERTIFICATE_DEFAULT_LIMIT,
  );

export const fetchCertificateDetail = (id: string): Promise<InsurancePolicyDetail> =>
  apiGet<InsurancePolicyDetail>(`/platform/money/insurance/${encodeURIComponent(id)}`);

export const retryCertificate = (id: string): Promise<void> =>
  apiPost<void>(`/platform/money/insurance/${encodeURIComponent(id)}/retry`);

export const voidCertificate = (id: string, reason: string): Promise<void> =>
  apiPost<void>(`/platform/money/insurance/${encodeURIComponent(id)}/void`, { reason });
