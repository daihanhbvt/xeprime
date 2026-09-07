import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/queries/query-keys';
import {
  vehicleDocumentsApi,
  type ApplyOcrFieldsInput,
  type SaveVehicleDocumentInput,
} from '../api';

/** Danh sách TÓM TẮT giấy tờ của xe — `enabled` tắt khi thiếu `vehicles.documents.view`. */
export function useVehicleDocuments(vehicleId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.vehicles.documents(vehicleId ?? ''),
    queryFn: () => vehicleDocumentsApi.list(vehicleId as string),
    enabled: Boolean(vehicleId) && enabled,
  });
}

/**
 * Metadata NHẠY CẢM của một giấy tờ — chỉ gọi khi có `vehicles.documents.view_details`.
 * Thiếu quyền thì KHÔNG request: gọi để nhận 403 rồi hiện lỗi là trải nghiệm tệ hơn.
 */
export function useVehicleDocument(
  vehicleId: string,
  documentId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: queryKeys.vehicles.document(vehicleId, documentId ?? ''),
    queryFn: () => vehicleDocumentsApi.detail(vehicleId, documentId as string),
    enabled: Boolean(documentId) && enabled,
    // 403/404 là CÂU TRẢ LỜI, không phải lỗi tạm để thử lại.
    retry: false,
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
    queryFn: () => vehicleDocumentsApi.versions(vehicleId, documentId as string),
    enabled: Boolean(documentId) && enabled,
    retry: false,
  });
}

/**
 * Làm mới nhánh giấy tờ sau mọi mutation.
 *
 * Kèm CẢNH BÁO của xe: đổi hạn giấy tờ làm chip "Giấy tờ sắp hết hạn" trên thẻ xe và mục việc
 * cần làm ở Hồ sơ 360 đổi theo. Không mở rộng thì sửa xong hạn mà danh sách vẫn hiện cảnh báo cũ.
 */
export function useInvalidateVehicleDocuments(vehicleId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.documents(vehicleId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.alertsAll() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.summary(vehicleId) });
  };
}

export function useSaveVehicleDocument(vehicleId: string) {
  const invalidate = useInvalidateVehicleDocuments(vehicleId);
  return useMutation({
    mutationFn: ({ documentId, body }: { documentId?: string; body: SaveVehicleDocumentInput }) =>
      documentId
        ? vehicleDocumentsApi.update(vehicleId, documentId, body)
        : vehicleDocumentsApi.create(vehicleId, body),
    onSuccess: invalidate,
  });
}

export function useArchiveVehicleDocument(vehicleId: string) {
  const invalidate = useInvalidateVehicleDocuments(vehicleId);
  return useMutation({
    mutationFn: (documentId: string) => vehicleDocumentsApi.archive(vehicleId, documentId),
    onSuccess: invalidate,
  });
}

/**
 * Áp các trường OCR đã đối soát.
 *
 * Là mutation chứ không phải lời gọi trần vì nút "Cập nhật đã chọn" cần `isPending` để khoá
 * lại — bấm hai lần trên mạng chậm là áp hai lần lên cùng một job.
 */
export function useApplyVehicleDocumentOcr(vehicleId: string) {
  const invalidate = useInvalidateVehicleDocuments(vehicleId);
  return useMutation({
    mutationFn: ({
      documentId,
      jobId,
      body,
    }: {
      documentId: string;
      jobId: string;
      body: ApplyOcrFieldsInput;
    }) => vehicleDocumentsApi.applyOcr(vehicleId, documentId, jobId, body),
    onSuccess: invalidate,
  });
}
