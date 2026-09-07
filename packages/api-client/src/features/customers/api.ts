import type { components } from '@xeprime/types';
import { getApiClient, type Paged } from '../../client';
import { ApiClientError } from '../../errors';
import type { QueryParams } from '../../url';

/** Shape lấy từ contract OpenAPI (ADR 0007) — KHÔNG viết tay lại DTO của backend. */
type Schemas = components['schemas'];

export type TenantCustomer = Schemas['TenantCustomerListItemDto'];
export type TenantCustomerDetail = Schemas['TenantCustomerDetailDto'];
export type TenantCustomerSummary = Schemas['TenantCustomerSummaryDto'];
export type CreateTenantCustomerInput = Schemas['CreateTenantCustomerDto'];
export type UpdateTenantCustomerInput = Schemas['UpdateTenantCustomerDto'];
export type UpdateCustomerRiskInput = Schemas['UpdateCustomerRiskDto'];
export type CustomerBooking = Schemas['CustomerBookingItemDto'];
export type CustomerNote = Schemas['CustomerNoteDto'];
export type CreateCustomerNoteInput = Schemas['CreateCustomerNoteDto'];
export type CustomerDocument = Schemas['CustomerDocumentDto'];
export type CustomerDocumentPresign = Schemas['CustomerDocumentPresignDto'];
export type CustomerDocumentDownload = Schemas['CustomerDocumentDownloadDto'];
export type VerifyCustomerDocumentInput = Schemas['VerifyCustomerDocumentDto'];
export type PresignCustomerDocumentInput = Schemas['PresignCustomerDocumentDto'];

/** Cùng `CUSTOMER_DEFAULT_LIMIT` của DTO backend. */
export const CUSTOMERS_DEFAULT_LIMIT = 20;
/** Lịch sử thuê / ghi chú hiện trong MỘT tab hẹp — trang ngắn hơn danh sách chính. */
export const CUSTOMER_HISTORY_DEFAULT_LIMIT = 10;

/**
 * Bộ lọc của danh sách khách.
 *
 * KHÔNG có trong contract vì đó là trạng thái của MÀN HÌNH, không phải của API. Web đặt nó lên
 * URL searchParams (ADR 0004), app native giữ ở state màn — nhưng cả hai serialize qua ĐÚNG một
 * hàm bên dưới, nếu không thì query key của hai client lệch nhau ngay ở tham số đầu tiên.
 */
export interface CustomerFilters {
  q?: string;
  relationship?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export function customerFiltersToParams(filters: CustomerFilters): QueryParams {
  return {
    q: filters.q ?? null,
    relationship: filters.relationship ?? null,
    sort: filters.sort ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? CUSTOMERS_DEFAULT_LIMIT,
  };
}

/**
 * `details` của lỗi 409 trùng SĐT — backend trả id hồ sơ đang giữ số đó để UI mở thẳng hồ sơ ấy
 * thay vì bắt người dùng đi tìm. Không có trong contract (OpenAPI không mô tả `details`).
 */
export interface DuplicatePhoneDetails {
  customerId?: string;
}

/**
 * Id hồ sơ đang giữ SĐT trùng, nếu backend gửi kèm.
 *
 * Ở package dùng chung chứ không ở từng client: đây là cách ĐỌC một payload lỗi của API, và hai
 * client đọc nó khác nhau thì một bên sẽ mất lối "Mở hồ sơ đang có" mà không ai nhận ra.
 */
export function duplicateCustomerId(error: unknown): string | null {
  if (!(error instanceof ApiClientError)) return null;
  const details = error.details as DuplicatePhoneDetails | undefined;
  return details?.customerId ?? null;
}

const base = '/customers';
const one = (id: string) => `${base}/${encodeURIComponent(id)}`;
const docs = (id: string) => `${one(id)}/documents`;

export const customersApi = {
  list(filters: CustomerFilters): Promise<Paged<TenantCustomer>> {
    return getApiClient().fetchPage<TenantCustomer>(
      base,
      customerFiltersToParams(filters),
      CUSTOMERS_DEFAULT_LIMIT,
    );
  },

  summary(): Promise<TenantCustomerSummary> {
    return getApiClient().get<TenantCustomerSummary>(`${base}/summary`);
  },

  detail(id: string): Promise<TenantCustomerDetail> {
    return getApiClient().get<TenantCustomerDetail>(one(id));
  },

  create(body: CreateTenantCustomerInput): Promise<TenantCustomerDetail> {
    return getApiClient().post<TenantCustomerDetail>(base, body);
  },

  update(id: string, body: UpdateTenantCustomerInput): Promise<TenantCustomerDetail> {
    return getApiClient().patch<TenantCustomerDetail>(one(id), body);
  },

  archive(id: string): Promise<TenantCustomerDetail> {
    return getApiClient().post<TenantCustomerDetail>(`${one(id)}/archive`, {});
  },

  restore(id: string): Promise<TenantCustomerDetail> {
    return getApiClient().post<TenantCustomerDetail>(`${one(id)}/restore`, {});
  },

  updateRisk(id: string, body: UpdateCustomerRiskInput): Promise<TenantCustomerDetail> {
    return getApiClient().post<TenantCustomerDetail>(`${one(id)}/risk`, body);
  },

  bookings(
    id: string,
    page: number,
    limit = CUSTOMER_HISTORY_DEFAULT_LIMIT,
  ): Promise<Paged<CustomerBooking>> {
    return getApiClient().fetchPage<CustomerBooking>(
      `${one(id)}/bookings`,
      { page, limit },
      limit,
    );
  },

  notes(
    id: string,
    page: number,
    limit = CUSTOMER_HISTORY_DEFAULT_LIMIT,
  ): Promise<Paged<CustomerNote>> {
    return getApiClient().fetchPage<CustomerNote>(`${one(id)}/notes`, { page, limit }, limit);
  },

  addNote(id: string, body: CreateCustomerNoteInput): Promise<CustomerNote> {
    return getApiClient().post<CustomerNote>(`${one(id)}/notes`, body);
  },

  deleteNote(id: string, noteId: string): Promise<{ ok: true }> {
    return getApiClient().delete<{ ok: true }>(
      `${one(id)}/notes/${encodeURIComponent(noteId)}`,
    );
  },

  documents(id: string): Promise<CustomerDocument[]> {
    return getApiClient().get<CustomerDocument[]>(docs(id));
  },

  /** Bước 1 của luồng file riêng tư — tạo bản ghi `pending` + URL PUT ngắn hạn. */
  presignDocument(
    id: string,
    body: PresignCustomerDocumentInput,
  ): Promise<CustomerDocumentPresign> {
    return getApiClient().post<CustomerDocumentPresign>(`${docs(id)}/presign`, body);
  },

  /** Bước 3 — server HEAD + soi chữ ký byte đầu rồi mới chuyển `ready`. */
  completeDocument(id: string, documentId: string): Promise<CustomerDocument> {
    return getApiClient().post<CustomerDocument>(
      `${docs(id)}/${encodeURIComponent(documentId)}/complete`,
      {},
    );
  },

  /**
   * URL ký NGẮN HẠN để mở giấy tờ — xin ngay lúc bấm, không bao giờ lưu vào state hay cache.
   * Backend kiểm `customers.documents.view_files` và ghi một dòng audit cho mỗi lần gọi.
   */
  documentDownload(id: string, documentId: string): Promise<CustomerDocumentDownload> {
    return getApiClient().get<CustomerDocumentDownload>(
      `${docs(id)}/${encodeURIComponent(documentId)}/download`,
    );
  },

  /**
   * Ghi nhận ĐỐI CHIẾU giấy tờ — thao tác thủ công của nhân viên, backend ghi ai/lúc nào + audit.
   * Hệ thống KHÔNG gọi API định danh quốc gia; đây là lời khai có truy vết.
   */
  verifyDocument(
    id: string,
    documentId: string,
    body: VerifyCustomerDocumentInput,
  ): Promise<CustomerDocument> {
    return getApiClient().post<CustomerDocument>(
      `${docs(id)}/${encodeURIComponent(documentId)}/verify`,
      body,
    );
  },

  deleteDocument(id: string, documentId: string): Promise<{ ok: true }> {
    return getApiClient().delete<{ ok: true }>(
      `${docs(id)}/${encodeURIComponent(documentId)}`,
    );
  },
};
