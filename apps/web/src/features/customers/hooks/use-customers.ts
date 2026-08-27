'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { isPreviewableImage } from '../constants';
import {
  archiveCustomer,
  createCustomer,
  createCustomerNote,
  deleteCustomerDocument,
  verifyCustomerDocument,
  deleteCustomerNote,
  fetchCustomer,
  fetchCustomerBookings,
  fetchCustomerDocumentDownload,
  fetchCustomerDocuments,
  fetchCustomerNotes,
  fetchCustomerSummary,
  fetchCustomers,
  filtersToParams,
  restoreCustomer,
  updateCustomer,
  updateCustomerRisk,
  uploadCustomerDocument,
  type UploadCustomerDocumentInput,
} from '../api';
import type {
  CreateCustomerNoteInput,
  VerifyCustomerDocumentInput,
  CustomerDocument,
  CreateTenantCustomerInput,
  CustomerFilters,
  UpdateCustomerRiskInput,
  UpdateTenantCustomerInput,
} from '../types';

/**
 * Danh sách khách. `placeholderData: prev` giữ nguyên dữ liệu cũ khi đổi trang/lọc — bảng mờ đi
 * rồi thay nội dung, thay vì nháy về skeleton mỗi lần gõ một ký tự vào ô tìm kiếm.
 */
export function useCustomers(filters: CustomerFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.customers.list(filtersToParams(filters)),
    queryFn: () => fetchCustomers(filters),
    placeholderData: (prev) => prev,
    enabled,
  });
}

export function useCustomerSummary(enabled = true) {
  return useQuery({
    queryKey: queryKeys.customers.summary(),
    queryFn: fetchCustomerSummary,
    enabled,
  });
}

export function useCustomer(id: string | null) {
  return useQuery({
    queryKey: queryKeys.customers.detail(id ?? ''),
    queryFn: () => fetchCustomer(id as string),
    enabled: Boolean(id),
  });
}

export function useCustomerBookings(id: string | null, page: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.customers.bookings(id ?? '', page),
    queryFn: () => fetchCustomerBookings(id as string, page),
    placeholderData: (prev) => prev,
    enabled: Boolean(id) && enabled,
  });
}

export function useCustomerNotes(id: string | null, page: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.customers.notes(id ?? '', page),
    queryFn: () => fetchCustomerNotes(id as string, page),
    placeholderData: (prev) => prev,
    enabled: Boolean(id) && enabled,
  });
}

export function useCustomerDocuments(id: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.customers.documents(id ?? ''),
    queryFn: () => fetchCustomerDocuments(id as string),
    enabled: Boolean(id) && enabled,
  });
}

/**
 * Làm mới MỌI bề mặt của sổ khách sau một mutation.
 *
 * Một hàm, một danh sách key — đừng để mỗi component tự nhớ phải invalidate những gì (cùng lý
 * do với `useInvalidateVehicleSurfaces`). Danh sách/KPI/hồ sơ luôn phải đổi cùng lúc: một hồ sơ
 * vừa bị lưu trữ mà vẫn nằm trong danh sách "đang hoạt động" là bug người dùng nhìn thấy ngay.
 */
export function useInvalidateCustomers() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
  };
}

export function useCreateCustomer() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: (body: CreateTenantCustomerInput) => createCustomer(body),
    onSuccess: invalidate,
  });
}

export function useUpdateCustomer() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateTenantCustomerInput }) =>
      updateCustomer(id, body),
    onSuccess: invalidate,
  });
}

export function useUpdateCustomerRisk() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCustomerRiskInput }) =>
      updateCustomerRisk(id, body),
    onSuccess: invalidate,
  });
}

export function useSetCustomerArchived() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      archived ? archiveCustomer(id) : restoreCustomer(id),
    onSuccess: invalidate,
  });
}

export function useAddCustomerNote() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: CreateCustomerNoteInput }) =>
      createCustomerNote(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteCustomerNote() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, noteId }: { id: string; noteId: string }) => deleteCustomerNote(id, noteId),
    onSuccess: invalidate,
  });
}

export function useUploadCustomerDocument() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UploadCustomerDocumentInput }) =>
      uploadCustomerDocument(id, input),
    onSuccess: invalidate,
  });
}

export function useVerifyCustomerDocument() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({
      id,
      documentId,
      input,
    }: {
      id: string;
      documentId: string;
      input: VerifyCustomerDocumentInput;
    }) => verifyCustomerDocument(id, documentId, input),
    onSuccess: invalidate,
  });
}

export function useDeleteCustomerDocument() {
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, documentId }: { id: string; documentId: string }) =>
      deleteCustomerDocument(id, documentId),
    onSuccess: invalidate,
  });
}

/**
 * URL ký để hiện ẢNH THU NHỎ của giấy tờ — một query cho cả danh sách, không phải N query rời.
 *
 * Vì sao nạp sẵn thay vì đợi bấm: nhận ra CCCD/GPLX bằng mắt là việc chính của tab này, và một
 * lưới ô xám không nói được gì. Đánh đổi đã cân nhắc: mỗi URL phát ra là một dòng `audit_logs`,
 * nên mở tab Giấy tờ ≈ "đã xem giấy tờ của khách này" — đúng nghĩa đen, chỉ nhiều dòng hơn.
 * Chỉ chạy khi người dùng có `customers.documents.view_files`; thiếu quyền thì không request nào
 * rời khỏi trình duyệt.
 *
 * `staleTime` ngắn hơn hạn 2 phút của URL ký để quay lại tab là có link còn sống, không phải
 * một ô ảnh vỡ.
 */
export function useCustomerDocumentPreviews(
  customerId: string | null,
  documents: CustomerDocument[],
  enabled: boolean,
) {
  const previewable = documents.filter((document) => isPreviewableImage(document.mimeType));
  const ids = previewable.map((document) => document.id);

  return useQuery({
    queryKey: queryKeys.customers.documentPreviews(customerId ?? '', ids),
    queryFn: async () => {
      const tickets = await Promise.all(
        ids.map(async (documentId) => {
          try {
            const ticket = await fetchCustomerDocumentDownload(customerId as string, documentId);
            return [documentId, ticket.downloadUrl] as const;
          } catch {
            // Một ảnh hỏng KHÔNG được kéo cả lưới về trạng thái lỗi — ô đó rơi về icon loại tệp.
            return [documentId, null] as const;
          }
        }),
      );
      return Object.fromEntries(tickets) as Record<string, string | null>;
    },
    enabled: Boolean(customerId) && enabled && ids.length > 0,
    staleTime: 90_000,
  });
}
