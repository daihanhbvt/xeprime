import { CLIENT_ERROR_CODE } from '@xeprime/api-client';
import { API_ERROR_CODE } from '@xeprime/types';
import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import { browserApiHref } from '@/lib/api-href';
import {
  ApiClientError,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiRequest,
  fetchPage,
  supportAwareWebTransport,
  type Paged,
  type QueryParams,
} from '@/services/api-client';
import type {
  CatalogModel,
  VehicleDataDetail,
  VehicleDataFilters,
  VehicleDataImport,
  VehicleDataImportRow,
  VehicleDataInput,
  VehicleDataModelCount,
  VehicleDataOption,
  VehicleDataPage,
  VehicleDataReviewResult,
  VehicleDataSuggestion,
} from './types';

/**
 * Dữ liệu xe chuẩn (ADR 0090) — lời gọi API của web (ADR 0031). Phía QUẢN TRỊ: màn "Dữ liệu xe"
 * (`/platform/vehicle-data`). Phía CHỦ XE: ô "Phiên bản", gợi ý khi đăng xe, dòng xe gõ mới.
 */
const ADMIN = '/platform/vehicle-data';
export const VEHICLE_DATA_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export function vehicleDataFiltersToParams(filters: VehicleDataFilters): QueryParams {
  return {
    search: filters.q ?? null,
    vehicleType: filters.vehicleType ?? null,
    brandKey: filters.brandKey ?? null,
    modelId: filters.modelId ?? null,
    status: filters.status ?? null,
    origin: filters.origin ?? null,
    gap: filters.gap ?? null,
    sort: filters.sort ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? VEHICLE_DATA_DEFAULT_LIMIT,
  };
}

// ── Quản trị ───────────────────────────────────────────────────────────────────────────────────

const EMPTY_SUMMARY = { total: 0, active: 0, hidden: 0, pending: 0, incomplete: 0 };

/**
 * Danh sách + số liệu tổng. KHÔNG dùng `fetchPage` chung: response mang thêm `summary` cạnh
 * `{data, meta}` (dải số liệu đầu màn).
 */
export async function fetchVehicleDataPage(params: QueryParams): Promise<VehicleDataPage> {
  const res = await apiRequest<VehicleDataPage['data']>(ADMIN, { query: params });
  const page = res as unknown as Partial<VehicleDataPage>;
  return {
    data: res.data,
    meta: (res.meta as VehicleDataPage['meta'] | undefined) ?? {
      page: Number(params.page ?? 1),
      limit: VEHICLE_DATA_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
    summary: page.summary ?? EMPTY_SUMMARY,
  };
}

/** Bộ lọc xe của số đếm theo dòng - cùng nghĩa với danh sách, phạm vi bắt buộc là loại xe + hãng. */
export interface VehicleDataModelCountsParams {
  vehicleType: string;
  brandKey: string;
  q?: string;
  status?: string;
  gap?: string;
  origin?: string;
}

export function vehicleDataModelCountsToParams(params: VehicleDataModelCountsParams): QueryParams {
  return {
    vehicleType: params.vehicleType,
    brandKey: params.brandKey,
    search: params.q ?? null,
    status: params.status ?? null,
    gap: params.gap ?? null,
    origin: params.origin ?? null,
  };
}

export const fetchVehicleDataModelCounts = (
  params: QueryParams,
): Promise<VehicleDataModelCount[]> =>
  apiGet<VehicleDataModelCount[]>(`${ADMIN}/model-counts`, params);

export const fetchVehicleDataDetail = (id: string): Promise<VehicleDataDetail> =>
  apiGet<VehicleDataDetail>(`${ADMIN}/${encodeURIComponent(id)}`);

export const createVehicleData = (body: VehicleDataInput): Promise<VehicleDataDetail> =>
  apiPost<VehicleDataDetail>(ADMIN, body);

export const updateVehicleData = (
  id: string,
  body: Partial<VehicleDataInput>,
): Promise<VehicleDataDetail> =>
  apiPatch<VehicleDataDetail>(`${ADMIN}/${encodeURIComponent(id)}`, body);

export const deleteVehicleData = (id: string): Promise<void> =>
  apiDelete<void>(`${ADMIN}/${encodeURIComponent(id)}`);

export const approveVehicleData = (id: string, note?: string): Promise<VehicleDataReviewResult> =>
  apiPost<VehicleDataReviewResult>(
    `${ADMIN}/${encodeURIComponent(id)}/approve`,
    note ? { note } : {},
  );

export const mergeVehicleData = (id: string, targetId: string): Promise<VehicleDataReviewResult> =>
  apiPost<VehicleDataReviewResult>(`${ADMIN}/${encodeURIComponent(id)}/merge`, { targetId });

export const rejectVehicleData = (id: string, reason: string): Promise<VehicleDataReviewResult> =>
  apiPost<VehicleDataReviewResult>(`${ADMIN}/${encodeURIComponent(id)}/reject`, { reason });

export const fetchVehicleDataImports = (params: QueryParams): Promise<Paged<VehicleDataImport>> =>
  fetchPage<VehicleDataImport>(`${ADMIN}/imports`, params, 10);

export const fetchVehicleDataImport = (id: string): Promise<VehicleDataImport> =>
  apiGet<VehicleDataImport>(`${ADMIN}/imports/${encodeURIComponent(id)}`);

export const fetchVehicleDataImportRows = (
  id: string,
  params: QueryParams,
): Promise<Paged<VehicleDataImportRow>> =>
  fetchPage<VehicleDataImportRow>(`${ADMIN}/imports/${encodeURIComponent(id)}/rows`, params, 20);

export const applyVehicleDataImport = (id: string): Promise<VehicleDataImport> =>
  apiPost<VehicleDataImport>(`${ADMIN}/imports/${encodeURIComponent(id)}/apply`);

export const discardVehicleDataImport = (id: string): Promise<VehicleDataImport> =>
  apiPost<VehicleDataImport>(`${ADMIN}/imports/${encodeURIComponent(id)}/discard`);

/** Link tải (GET, cookie phiên đi kèm) — file mẫu và file xuất theo đúng bộ lọc đang xem. */
export const vehicleDataHref = {
  template: () => browserApiHref(`${ADMIN}/template`),
  export: (filters: VehicleDataFilters) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(vehicleDataFiltersToParams(filters))) {
      if (value != null && key !== 'page' && key !== 'limit') params.set(key, String(value));
    }
    const query = params.toString();
    return browserApiHref(`${ADMIN}/export${query ? `?${query}` : ''}`);
  },
};

/**
 * Tải file lên để xem trước — multipart, nên đi `fetch` thẳng (client JSON dùng chung không gửi
 * FormData). Vẫn đi qua transport hỗ trợ để cookie/phiên đúng realm.
 */
export async function uploadVehicleDataImport(file: File): Promise<VehicleDataImport> {
  const form = new FormData();
  form.append('file', file, file.name);
  const auth = await supportAwareWebTransport().credentials();
  let response: Response;
  try {
    response = await fetch(browserApiHref(`${ADMIN}/imports`), {
      method: 'POST',
      body: form,
      headers: { Accept: 'application/json', ...auth.headers },
      ...(auth.credentials ? { credentials: auth.credentials } : {}),
    });
  } catch {
    throw new ApiClientError({
      code: CLIENT_ERROR_CODE.NETWORK_ERROR,
      message: 'Network error while uploading the vehicle data file',
      status: 0,
    });
  }
  const body = (await response.json().catch(() => null)) as
    | { data: VehicleDataImport }
    | { error: { code: string; message: string; details?: unknown } }
    | null;
  if (!response.ok || !body || !('data' in body)) {
    const error = body && 'error' in body ? body.error : null;
    throw new ApiClientError({
      code: error?.code ?? API_ERROR_CODE.INTERNAL_ERROR,
      message: error?.message ?? `Upload failed (${response.status})`,
      status: response.status,
      details: error?.details,
    });
  }
  return body.data;
}

// ── Chủ xe ─────────────────────────────────────────────────────────────────────────────────────

export function fetchVehicleDataOptions(params: {
  modelId: string;
  year?: number | null;
  includeId?: string | null;
}): Promise<VehicleDataOption[]> {
  return apiGet<VehicleDataOption[]>('/catalog/variants', {
    modelId: params.modelId,
    ...(params.year ? { year: params.year } : {}),
    ...(params.includeId ? { includeId: params.includeId } : {}),
  });
}

/** Mọi xe chuẩn đã duyệt của một hãng + loại xe - ô 'Mẫu xe' gộp của form đăng xe (ADR 0102). */
export function fetchBrandVehicleDataOptions(params: {
  vehicleType: string;
  brandKey: string;
  includeId?: string | null;
}): Promise<VehicleDataOption[]> {
  return apiGet<VehicleDataOption[]>('/catalog/variants', {
    vehicleType: params.vehicleType,
    brandKey: params.brandKey,
    ...(params.includeId ? { includeId: params.includeId } : {}),
  });
}

export function fetchVehicleDataSuggestion(params: {
  modelId: string;
  variantId?: string | null;
  year?: number | null;
  vehicleId?: string | null;
}): Promise<VehicleDataSuggestion> {
  return apiGet<VehicleDataSuggestion>('/vehicle-catalog/suggestion', {
    modelId: params.modelId,
    ...(params.variantId ? { variantId: params.variantId } : {}),
    ...(params.year ? { year: params.year } : {}),
    ...(params.vehicleId ? { vehicleId: params.vehicleId } : {}),
  });
}

/** Dòng xe chưa có — chủ xe gõ ngay trong ô "Dòng xe" (chờ duyệt, gắn được vào xe ngay). */
export const createOwnerModel = (body: {
  vehicleType: string;
  brandKey: string;
  label: string;
}): Promise<CatalogModel> => apiPost<CatalogModel>('/vehicle-catalog/models', body);

export type { Paged };
