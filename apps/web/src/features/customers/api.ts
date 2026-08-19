import type { PaginationMeta } from '@xeprime/types';
import {
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiRequest,
  type QueryParams,
} from '@/services/api-client';
import { ApiClientError } from '@/services/api-client';
import { uploadToR2, validateDocumentFile } from '@/services/upload';
import type {
  CreateCustomerNoteInput,
  CreateTenantCustomerInput,
  CustomerBooking,
  CustomerDocument,
  CustomerDocumentDownload,
  CustomerDocumentPresign,
  CustomerFilters,
  CustomerNote,
  TenantCustomer,
  TenantCustomerDetail,
  TenantCustomerSummary,
  UpdateCustomerRiskInput,
  UpdateTenantCustomerInput,
} from './types';

export const CUSTOMERS_DEFAULT_LIMIT = 20;
export const CUSTOMER_HISTORY_DEFAULT_LIMIT = 10;

export interface Paged<T> {
  items: T[];
  meta: PaginationMeta;
}

export function filtersToParams(filters: CustomerFilters): QueryParams {
  return {
    q: filters.q ?? null,
    relationship: filters.relationship ?? null,
    sort: filters.sort ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? CUSTOMERS_DEFAULT_LIMIT,
  };
}

function emptyMeta(limit: number, count: number): PaginationMeta {
  return { page: 1, limit, total: count, hasNext: false };
}

async function fetchPage<T>(
  path: string,
  query: QueryParams,
  fallbackLimit: number,
): Promise<Paged<T>> {
  const res = await apiRequest<T[]>(path, { query });
  return {
    items: res.data,
    meta: (res.meta as PaginationMeta | undefined) ?? emptyMeta(fallbackLimit, res.data.length),
  };
}

export const fetchCustomers = (filters: CustomerFilters): Promise<Paged<TenantCustomer>> =>
  fetchPage<TenantCustomer>('/customers', filtersToParams(filters), CUSTOMERS_DEFAULT_LIMIT);

export const fetchCustomerSummary = (): Promise<TenantCustomerSummary> =>
  apiGet<TenantCustomerSummary>('/customers/summary');

export const fetchCustomer = (id: string): Promise<TenantCustomerDetail> =>
  apiGet<TenantCustomerDetail>(`/customers/${id}`);

export const createCustomer = (body: CreateTenantCustomerInput): Promise<TenantCustomerDetail> =>
  apiPost<TenantCustomerDetail>('/customers', body);

export const updateCustomer = (
  id: string,
  body: UpdateTenantCustomerInput,
): Promise<TenantCustomerDetail> => apiPatch<TenantCustomerDetail>(`/customers/${id}`, body);

export const archiveCustomer = (id: string): Promise<TenantCustomerDetail> =>
  apiPost<TenantCustomerDetail>(`/customers/${id}/archive`, {});

export const restoreCustomer = (id: string): Promise<TenantCustomerDetail> =>
  apiPost<TenantCustomerDetail>(`/customers/${id}/restore`, {});

export const updateCustomerRisk = (
  id: string,
  body: UpdateCustomerRiskInput,
): Promise<TenantCustomerDetail> => apiPost<TenantCustomerDetail>(`/customers/${id}/risk`, body);

export const fetchCustomerBookings = (
  id: string,
  page: number,
  limit = CUSTOMER_HISTORY_DEFAULT_LIMIT,
): Promise<Paged<CustomerBooking>> =>
  fetchPage<CustomerBooking>(`/customers/${id}/bookings`, { page, limit }, limit);

export const fetchCustomerNotes = (
  id: string,
  page: number,
  limit = CUSTOMER_HISTORY_DEFAULT_LIMIT,
): Promise<Paged<CustomerNote>> =>
  fetchPage<CustomerNote>(`/customers/${id}/notes`, { page, limit }, limit);

export const createCustomerNote = (
  id: string,
  body: CreateCustomerNoteInput,
): Promise<CustomerNote> => apiPost<CustomerNote>(`/customers/${id}/notes`, body);

export const deleteCustomerNote = (id: string, noteId: string): Promise<{ ok: true }> =>
  apiDelete<{ ok: true }>(`/customers/${id}/notes/${noteId}`);

export const fetchCustomerDocuments = (id: string): Promise<CustomerDocument[]> =>
  apiGet<CustomerDocument[]>(`/customers/${id}/documents`);

export const deleteCustomerDocument = (id: string, documentId: string): Promise<{ ok: true }> =>
  apiDelete<{ ok: true }>(`/customers/${id}/documents/${documentId}`);

/**
 * Mở giấy tờ: URL ký NGẮN HẠN xin ngay lúc bấm, không bao giờ lưu vào state hay cache.
 * Backend kiểm quyền `customers.documents.view_files` và ghi một dòng audit cho mỗi lần gọi.
 */
export const fetchCustomerDocumentDownload = (
  id: string,
  documentId: string,
): Promise<CustomerDocumentDownload> =>
  apiGet<CustomerDocumentDownload>(`/customers/${id}/documents/${documentId}/download`);

export interface UploadCustomerDocumentInput {
  documentType: string;
  customTypeName?: string | null;
  expiresAt?: string | null;
  file: File;
}

/**
 * Tải giấy tờ khách theo flow file riêng tư dùng chung: presign → PUT thẳng lên bucket riêng tư
 * → complete (server HEAD + kiểm chữ ký byte đầu). Nhị phân KHÔNG đi qua API, và không bước nào
 * sinh ra một URL công khai.
 *
 * Hỏng ở bước PUT thì bản ghi `pending` ở lại và không tải về được — người dùng chỉ việc chọn
 * lại tệp; không có file nửa vời nào lọt vào danh sách.
 */
export async function uploadCustomerDocument(
  id: string,
  input: UploadCustomerDocumentInput,
  onProgress?: (percent: number) => void,
): Promise<CustomerDocument> {
  const invalid = validateDocumentFile(input.file);
  // Hàm thuần: ném LÝ DO có mã, nơi gọi (component) mới dịch — xem `useUploadRejectionMessage`.
  if (invalid) {
    throw new ApiClientError({
      code: `UPLOAD_REJECTED_${invalid.reason}`,
      message: `Upload rejected: ${invalid.reason}`,
      status: 0,
    });
  }

  const ticket = await apiPost<CustomerDocumentPresign>(`/customers/${id}/documents/presign`, {
    documentType: input.documentType,
    customTypeName: input.customTypeName ?? null,
    expiresAt: input.expiresAt ?? null,
    fileName: input.file.name,
    contentType: input.file.type,
    fileSize: input.file.size,
  });
  await uploadToR2(ticket.uploadUrl, input.file, onProgress);
  return apiPost<CustomerDocument>(`/customers/${id}/documents/${ticket.documentId}/complete`, {});
}
