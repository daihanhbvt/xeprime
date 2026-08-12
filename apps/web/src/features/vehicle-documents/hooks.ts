'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/query-keys';
import { fetchDocumentVersions, fetchVehicleDocument, fetchVehicleDocuments } from './api';

/** Danh sách TÓM TẮT giấy tờ của xe — `enabled` tắt khi thiếu `vehicles.documents.view`. */
export function useVehicleDocuments(vehicleId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.vehicles.documents(vehicleId ?? ''),
    queryFn: () => fetchVehicleDocuments(vehicleId!),
    enabled: Boolean(vehicleId) && enabled,
  });
}

/**
 * Chi tiết metadata NHẠY CẢM của một giấy tờ — chỉ gọi khi có
 * `vehicles.documents.view_details` (`enabled`); thiếu quyền thì KHÔNG request.
 */
export function useVehicleDocument(
  vehicleId: string,
  documentId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.vehicles.document(vehicleId, documentId ?? ''),
    queryFn: () => fetchVehicleDocument(vehicleId, documentId!),
    enabled: Boolean(documentId) && enabled,
    retry: false, // 403/404 là câu trả lời, không phải lỗi tạm để thử lại
  });
}

/** Lịch sử phiên bản — chỉ gọi khi có `vehicles.documents.view_files`. */
export function useVehicleDocumentVersions(
  vehicleId: string,
  documentId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.vehicles.documentVersions(vehicleId, documentId ?? ''),
    queryFn: () => fetchDocumentVersions(vehicleId, documentId!),
    enabled: Boolean(documentId) && enabled,
    retry: false,
  });
}

/** Invalidate nhánh giấy tờ sau mọi mutation — dùng chung cho create/update/attach/OCR. */
export function useInvalidateVehicleDocuments(vehicleId: string) {
  const queryClient = useQueryClient();
  return () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.documents(vehicleId) });
}

export function useDocumentMutation<TInput, TResult>(
  vehicleId: string,
  mutationFn: (input: TInput) => Promise<TResult>,
) {
  const invalidate = useInvalidateVehicleDocuments(vehicleId);
  return useMutation({ mutationFn, onSuccess: invalidate });
}
