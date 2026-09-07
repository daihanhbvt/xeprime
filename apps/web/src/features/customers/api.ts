// Side-effect import, KHÔNG xoá: nạp module này là lúc client mặc định của WEB được cấu hình.
import '@/services/api-client';

import {
  ApiClientError,
  CUSTOMERS_DEFAULT_LIMIT,
  CUSTOMER_HISTORY_DEFAULT_LIMIT,
  customerFiltersToParams,
  customersApi,
  duplicateCustomerId,
  type Paged,
} from '@xeprime/api-client';
import { uploadToR2, validateDocumentFile } from '@/services/upload';
import type { CustomerDocument, PresignCustomerDocumentInput } from './types';

/**
 * Lối vào API của sổ khách trên WEB — lớp vỏ mỏng quanh `@xeprime/api-client`.
 *
 * Toàn bộ phần gọi mạng đã ở package dùng chung để app native dùng lại đúng một bộ đường dẫn,
 * một bộ query params và một cách đọc `details` của lỗi 409. Ở lại đây đúng MỘT thứ: bước tải
 * tệp, vì nó dùng `File` + `XMLHttpRequest` — hai thứ Metro không đọc được, và cũng là lý do
 * `packages/*` cấm import chúng.
 */
export {
  CUSTOMERS_DEFAULT_LIMIT,
  CUSTOMER_HISTORY_DEFAULT_LIMIT,
  customerFiltersToParams as filtersToParams,
  duplicateCustomerId,
  type Paged,
};

export const fetchCustomers = customersApi.list;
export const fetchCustomerSummary = customersApi.summary;
export const fetchCustomer = customersApi.detail;
export const createCustomer = customersApi.create;
export const updateCustomer = customersApi.update;
export const archiveCustomer = customersApi.archive;
export const restoreCustomer = customersApi.restore;
export const updateCustomerRisk = customersApi.updateRisk;
export const fetchCustomerBookings = customersApi.bookings;
export const fetchCustomerNotes = customersApi.notes;
export const createCustomerNote = customersApi.addNote;
export const deleteCustomerNote = customersApi.deleteNote;
export const fetchCustomerDocuments = customersApi.documents;
export const deleteCustomerDocument = customersApi.deleteDocument;
export const verifyCustomerDocument = customersApi.verifyDocument;
export const fetchCustomerDocumentDownload = customersApi.documentDownload;

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

  const ticket = await customersApi.presignDocument(id, {
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
  return customersApi.completeDocument(id, ticket.documentId);
}
