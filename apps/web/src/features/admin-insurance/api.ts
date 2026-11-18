import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import {
  apiGet,
  apiDelete,
  apiPatch,
  apiPost,
  fetchPage,
  type Paged,
  type QueryParams,
} from '@/services/api-client';
import type {
  CertificateFilters,
  InsuranceAttentionPage,
  InsuranceOverview,
  InsurancePremiumCheckInput,
  InsurancePremiumCheckResult,
  InsurancePremiumSyncResult,
  InsuranceVehicleFilters,
  InsuranceVehicleRow,
  InsurancePolicy,
  InsurancePolicyDetail,
  InsurancePolicyPricing,
  InsuranceProduct,
  InsuranceRemittance,
  InsuranceRemittanceLine,
  InsuranceRemittancePending,
  CreateInsuranceRemittanceInput,
  PayInsuranceRemittanceInput,
  RemittanceFilters,
  UpdateInsuranceProductInput,
  VoidInsurancePolicyInput,
  VoidInsurancePolicyResult,
} from './types';
import { browserApiHref } from '@/lib/api-href';

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

/** Phí thực tế của một hợp đồng (ADR 0091 điều 2). */
export const fetchCertificatePricing = (id: string): Promise<InsurancePolicyPricing> =>
  apiGet<InsurancePolicyPricing>(`/platform/money/insurance/${id}/pricing`);

/** Hợp đồng cần xử lý gấp (ADR 0091 điều 7). */
export const fetchInsuranceAttention = (): Promise<InsuranceAttentionPage> =>
  apiGet<InsuranceAttentionPage>('/platform/money/insurance/attention');

export const retryCertificate = (id: string): Promise<void> =>
  apiPost<void>(`/platform/money/insurance/${encodeURIComponent(id)}/retry`);

/** Thu hồi — hai nhánh theo hiệu lực do server quyết (ADR 0093); hợp đồng đã cấp cần mã đối chiếu. */
export const voidCertificate = (
  id: string,
  input: VoidInsurancePolicyInput,
): Promise<VoidInsurancePolicyResult> =>
  apiPost<VoidInsurancePolicyResult>(
    `/platform/money/insurance/${encodeURIComponent(id)}/void`,
    input,
  );

// ── Bảng kê trả phí cho hãng (ADR 0088 điều 6) ──────────────────────────────

const REMITTANCES = '/platform/money/insurance-remittances';
export const REMITTANCE_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export function remittanceFiltersToParams(filters: RemittanceFilters): QueryParams {
  return { page: filters.page ?? 1, limit: filters.limit ?? REMITTANCE_DEFAULT_LIMIT };
}

export const fetchRemittances = (filters: RemittanceFilters): Promise<Paged<InsuranceRemittance>> =>
  fetchPage<InsuranceRemittance>(
    REMITTANCES,
    remittanceFiltersToParams(filters),
    REMITTANCE_DEFAULT_LIMIT,
  );

export const fetchRemittancePending = (): Promise<InsuranceRemittancePending> =>
  apiGet<InsuranceRemittancePending>(`${REMITTANCES}/pending`);

export const fetchRemittance = (id: string): Promise<InsuranceRemittance> =>
  apiGet<InsuranceRemittance>(`${REMITTANCES}/${encodeURIComponent(id)}`);

export const fetchRemittanceLines = (
  id: string,
  params: { page: number; limit: number },
): Promise<Paged<InsuranceRemittanceLine>> =>
  fetchPage<InsuranceRemittanceLine>(
    `${REMITTANCES}/${encodeURIComponent(id)}/lines`,
    params,
    REMITTANCE_DEFAULT_LIMIT,
  );

export const createRemittance = (
  body: CreateInsuranceRemittanceInput,
): Promise<InsuranceRemittance> => apiPost<InsuranceRemittance>(REMITTANCES, body);

export const finalizeRemittance = (id: string): Promise<InsuranceRemittance> =>
  apiPost<InsuranceRemittance>(`${REMITTANCES}/${encodeURIComponent(id)}/finalize`);

export const payRemittance = (
  id: string,
  body: PayInsuranceRemittanceInput,
): Promise<InsuranceRemittance> =>
  apiPost<InsuranceRemittance>(`${REMITTANCES}/${encodeURIComponent(id)}/pay`, body);

export const deleteRemittance = (id: string): Promise<void> =>
  apiDelete<void>(`${REMITTANCES}/${encodeURIComponent(id)}`);

// ── Tổng quan · xe · đối chiếu biểu phí (ADR 0097) ──────────────────────────

export const fetchInsuranceOverview = (month: string): Promise<InsuranceOverview> =>
  apiGet<InsuranceOverview>('/platform/insurance/overview', { month });

export const INSURANCE_VEHICLE_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export function vehicleFiltersToParams(filters: InsuranceVehicleFilters): QueryParams {
  return {
    q: filters.q ?? null,
    eligibility: filters.eligibility ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? INSURANCE_VEHICLE_DEFAULT_LIMIT,
  };
}

export const fetchInsuranceVehicles = (
  filters: InsuranceVehicleFilters,
): Promise<Paged<InsuranceVehicleRow>> =>
  fetchPage<InsuranceVehicleRow>(
    '/platform/insurance/vehicles',
    vehicleFiltersToParams(filters),
    INSURANCE_VEHICLE_DEFAULT_LIMIT,
  );

/** Hỏi hãng phí từng bậc cho một xe / một bộ giá trị — không ghi gì. */
export const checkInsurancePremium = (
  body: InsurancePremiumCheckInput,
): Promise<InsurancePremiumCheckResult> =>
  apiPost<InsurancePremiumCheckResult>('/platform/insurance/premium-check', body);

/** Đồng bộ biểu phí từ hãng ngay (ADR 0106) — được thì khoá biểu phí, hỏng thì mở sửa tay. */
export const syncInsurancePremium = (): Promise<InsurancePremiumSyncResult> =>
  apiPost<InsurancePremiumSyncResult>('/platform/insurance/premium-sync', {});

/** Tải CSV bảng kê — cùng origin, cookie phiên tự đi kèm. */
export const remittanceCsvHref = (id: string): string =>
  browserApiHref(`${REMITTANCES}/${encodeURIComponent(id)}/export.csv`);
