import type { components } from '@xeprime/types';
import { apiGet, apiPatch, apiPost } from '@/services/api-client';
import type {
  ApplyOcrFieldsInput,
  SaveVehicleDocumentInput,
  VehicleDocumentDetail,
  VehicleDocumentOcrJob,
  VehicleDocumentSummary,
  VehicleDocumentVersion,
} from './types';

type Presign = components['schemas']['SourceContractPresignDto'];
type Download = components['schemas']['SourceContractDownloadDto'];

/**
 * Giấy tờ xe (Wave 5/5.1) — file là TÀI LIỆU RIÊNG TƯ đi nguyên flow Wave 4.1:
 * presign theo giấy tờ → PUT bucket riêng tư → gắn (server xác minh) → xem qua signed URL
 * ngắn hạn phát sau kiểm quyền. Không URL nào nằm trong state/DB.
 *
 * Quyền bốn mức khớp backend: danh sách = summary (`view`), chi tiết nhạy cảm =
 * `view_details`, lịch sử/mở file = `view_files`, ghi/OCR = `manage`.
 */
export const fetchVehicleDocuments = async (
  vehicleId: string,
): Promise<VehicleDocumentSummary[]> =>
  apiGet<VehicleDocumentSummary[]>(`/vehicles/${vehicleId}/documents`);

export const fetchVehicleDocument = (
  vehicleId: string,
  documentId: string,
): Promise<VehicleDocumentDetail> =>
  apiGet<VehicleDocumentDetail>(`/vehicles/${vehicleId}/documents/${documentId}`);

/** Lịch sử phiên bản — endpoint riêng sau quyền `view_files`. */
export const fetchDocumentVersions = (
  vehicleId: string,
  documentId: string,
): Promise<VehicleDocumentVersion[]> =>
  apiGet<VehicleDocumentVersion[]>(`/vehicles/${vehicleId}/documents/${documentId}/versions`);

export const createVehicleDocument = (
  vehicleId: string,
  body: SaveVehicleDocumentInput,
): Promise<VehicleDocumentDetail> =>
  apiPost<VehicleDocumentDetail>(`/vehicles/${vehicleId}/documents`, body);

export const updateVehicleDocument = (
  vehicleId: string,
  documentId: string,
  body: SaveVehicleDocumentInput,
): Promise<VehicleDocumentDetail> =>
  apiPatch<VehicleDocumentDetail>(`/vehicles/${vehicleId}/documents/${documentId}`, body);

export const archiveVehicleDocument = (
  vehicleId: string,
  documentId: string,
): Promise<{ id: string }> =>
  apiPost<{ id: string }>(`/vehicles/${vehicleId}/documents/${documentId}/archive`, {});

export const presignDocumentVersion = (
  vehicleId: string,
  documentId: string,
  file: File,
): Promise<Presign> =>
  apiPost<Presign>(`/vehicles/${vehicleId}/documents/${documentId}/versions/presign`, {
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size,
  });

export const attachDocumentVersion = (
  vehicleId: string,
  documentId: string,
  fileId: string,
): Promise<VehicleDocumentDetail> =>
  apiPost<VehicleDocumentDetail>(`/vehicles/${vehicleId}/documents/${documentId}/versions`, {
    fileId,
  });

export const fetchDocumentDownload = (
  vehicleId: string,
  documentId: string,
  versionId: string,
): Promise<Download> =>
  apiGet<Download>(
    `/vehicles/${vehicleId}/documents/${documentId}/versions/${versionId}/download`,
  );

export const requestDocumentOcr = (
  vehicleId: string,
  documentId: string,
): Promise<VehicleDocumentOcrJob> =>
  apiPost<VehicleDocumentOcrJob>(`/vehicles/${vehicleId}/documents/${documentId}/ocr`, {});

export const applyDocumentOcr = (
  vehicleId: string,
  documentId: string,
  jobId: string,
  body: ApplyOcrFieldsInput,
): Promise<VehicleDocumentDetail> =>
  apiPost<VehicleDocumentDetail>(
    `/vehicles/${vehicleId}/documents/${documentId}/ocr/${jobId}/apply`,
    body,
  );
