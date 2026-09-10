import {
  ApiClientError,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  fetchPage,
  type Paged,
  type QueryParams,
} from '@/services/api-client';
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
  DuplicatePhoneDetails,
  PresignCustomerDocumentInput,
  TenantCustomer,
  TenantCustomerDetail,
  TenantCustomerSummary,
  UpdateCustomerRiskInput,
  UpdateTenantCustomerInput,
  VerifyCustomerDocumentInput,
} from './types';

/**
 * Lối vào API của sổ khách trên WEB.
 *
 * ADR 0031: app native có bản riêng ở `apps/mobile/src/api/customers/api.ts`. Đường dẫn, query
 * params và cách đọc `details` của lỗi 409 phải khớp nhau vì hai bên gọi cùng một backend —
 * nhưng sửa một bên KHÔNG còn tự động sang bên kia.
 */
export type { Paged };

/** Cùng `CUSTOMER_DEFAULT_LIMIT` của DTO backend. */
export const CUSTOMERS_DEFAULT_LIMIT = 20;
/** Lịch sử thuê / ghi chú hiện trong MỘT tab hẹp — trang ngắn hơn danh sách chính. */
export const CUSTOMER_HISTORY_DEFAULT_LIMIT = 10;

export function filtersToParams(filters: CustomerFilters): QueryParams {
  return {
    q: filters.q ?? null,
    relationship: filters.relationship ?? null,
    sort: filters.sort ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? CUSTOMERS_DEFAULT_LIMIT,
  };
}

/** Id hồ sơ đang giữ SĐT trùng, nếu backend gửi kèm — để UI mở thẳng hồ sơ đang có. */
export function duplicateCustomerId(error: unknown): string | null {
  if (!(error instanceof ApiClientError)) return null;
  const details = error.details as DuplicatePhoneDetails | undefined;
  return details?.customerId ?? null;
}

const base = '/customers';
const one = (id: string) => `${base}/${encodeURIComponent(id)}`;
const docs = (id: string) => `${one(id)}/documents`;

export function fetchCustomers(filters: CustomerFilters): Promise<Paged<TenantCustomer>> {
  return fetchPage<TenantCustomer>(base, filtersToParams(filters), CUSTOMERS_DEFAULT_LIMIT);
}

export function fetchCustomerSummary(): Promise<TenantCustomerSummary> {
  return apiGet<TenantCustomerSummary>(`${base}/summary`);
}

export function fetchCustomer(id: string): Promise<TenantCustomerDetail> {
  return apiGet<TenantCustomerDetail>(one(id));
}

export function createCustomer(body: CreateTenantCustomerInput): Promise<TenantCustomerDetail> {
  return apiPost<TenantCustomerDetail>(base, body);
}

export function updateCustomer(
  id: string,
  body: UpdateTenantCustomerInput,
): Promise<TenantCustomerDetail> {
  return apiPatch<TenantCustomerDetail>(one(id), body);
}

export function archiveCustomer(id: string): Promise<TenantCustomerDetail> {
  return apiPost<TenantCustomerDetail>(`${one(id)}/archive`, {});
}

export function restoreCustomer(id: string): Promise<TenantCustomerDetail> {
  return apiPost<TenantCustomerDetail>(`${one(id)}/restore`, {});
}

export function updateCustomerRisk(
  id: string,
  body: UpdateCustomerRiskInput,
): Promise<TenantCustomerDetail> {
  return apiPost<TenantCustomerDetail>(`${one(id)}/risk`, body);
}

export function fetchCustomerBookings(
  id: string,
  page: number,
  limit = CUSTOMER_HISTORY_DEFAULT_LIMIT,
): Promise<Paged<CustomerBooking>> {
  return fetchPage<CustomerBooking>(`${one(id)}/bookings`, { page, limit }, limit);
}

export function fetchCustomerNotes(
  id: string,
  page: number,
  limit = CUSTOMER_HISTORY_DEFAULT_LIMIT,
): Promise<Paged<CustomerNote>> {
  return fetchPage<CustomerNote>(`${one(id)}/notes`, { page, limit }, limit);
}

export function createCustomerNote(
  id: string,
  body: CreateCustomerNoteInput,
): Promise<CustomerNote> {
  return apiPost<CustomerNote>(`${one(id)}/notes`, body);
}

export function deleteCustomerNote(id: string, noteId: string): Promise<{ ok: true }> {
  return apiDelete<{ ok: true }>(`${one(id)}/notes/${encodeURIComponent(noteId)}`);
}

export function fetchCustomerDocuments(id: string): Promise<CustomerDocument[]> {
  return apiGet<CustomerDocument[]>(docs(id));
}

/** Bước 1 của luồng file riêng tư — tạo bản ghi `pending` + URL PUT ngắn hạn. */
function presignCustomerDocument(
  id: string,
  body: PresignCustomerDocumentInput,
): Promise<CustomerDocumentPresign> {
  return apiPost<CustomerDocumentPresign>(`${docs(id)}/presign`, body);
}

/** Bước 3 — server HEAD + soi chữ ký byte đầu rồi mới chuyển `ready`. */
function completeCustomerDocument(id: string, documentId: string): Promise<CustomerDocument> {
  return apiPost<CustomerDocument>(`${docs(id)}/${encodeURIComponent(documentId)}/complete`, {});
}

/**
 * URL ký NGẮN HẠN để mở giấy tờ — xin ngay lúc bấm, không bao giờ lưu vào state hay cache.
 * Backend kiểm `customers.documents.view_files` và ghi một dòng audit cho mỗi lần gọi.
 */
export function fetchCustomerDocumentDownload(
  id: string,
  documentId: string,
): Promise<CustomerDocumentDownload> {
  return apiGet<CustomerDocumentDownload>(
    `${docs(id)}/${encodeURIComponent(documentId)}/download`,
  );
}

/**
 * Ghi nhận ĐỐI CHIẾU giấy tờ — thao tác thủ công của nhân viên, backend ghi ai/lúc nào + audit.
 * Hệ thống KHÔNG gọi API định danh quốc gia; đây là lời khai có truy vết.
 */
export function verifyCustomerDocument(
  id: string,
  documentId: string,
  body: VerifyCustomerDocumentInput,
): Promise<CustomerDocument> {
  return apiPost<CustomerDocument>(
    `${docs(id)}/${encodeURIComponent(documentId)}/verify`,
    body,
  );
}

export function deleteCustomerDocument(id: string, documentId: string): Promise<{ ok: true }> {
  return apiDelete<{ ok: true }>(`${docs(id)}/${encodeURIComponent(documentId)}`);
}

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

  const ticket = await presignCustomerDocument(id, {
    // Loại giấy tờ đến từ ô chọn (state `string`) và MIME đến từ chính tệp người dùng chọn —
    // cả hai chỉ thu hẹp được ở SERVER (`@IsIn`), nên thu hẹp kiểu ở đây thay vì bịa một lớp
    // kiểm thứ hai ở client rồi để nó trôi khỏi DTO.
    documentType: input.documentType as PresignCustomerDocumentInput['documentType'],
    customTypeName: input.customTypeName ?? null,
    expiresAt: input.expiresAt ?? null,
    fileName: input.file.name,
    contentType: input.file.type as PresignCustomerDocumentInput['contentType'],
    fileSize: input.file.size,
  });
  await uploadToR2(ticket.uploadUrl, input.file, onProgress);
  return completeCustomerDocument(id, ticket.documentId);
}
