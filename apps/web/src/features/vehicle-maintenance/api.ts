import type { components } from '@xeprime/types';
import { apiGet, apiPost, apiPut, apiRequest, type QueryParams } from '@/services/api-client';
import type {
  CompleteMaintenanceInput,
  CorrectOdometerInput,
  MaintenanceBoardFilters,
  MaintenanceBoardItem,
  MaintenanceBoardSummary,
  MaintenanceProfile,
  MaintenanceRecord,
  OdometerReading,
  SaveMaintenanceProfileInput,
  SaveMaintenanceRecordInput,
} from './types';
import type { PaginationMeta } from '@xeprime/types';

type Presign = components['schemas']['SourceContractPresignDto'];
type Download = components['schemas']['SourceContractDownloadDto'];

export const MAINTENANCE_DEFAULT_LIMIT = 20;

/**
 * Bảo dưỡng & KM (Wave 6). Chứng từ là TÀI LIỆU RIÊNG TƯ đi nguyên flow Wave 4.1:
 * presign → PUT bucket riêng tư → đính (server xác minh) → xem qua signed URL ngắn hạn.
 * Không URL nào nằm trong state/DB.
 */
export const fetchMaintenanceProfile = (vehicleId: string): Promise<MaintenanceProfile> =>
  apiGet<MaintenanceProfile>(`/vehicles/${vehicleId}/maintenance/profile`);

export const saveMaintenanceProfile = (
  vehicleId: string,
  body: SaveMaintenanceProfileInput,
): Promise<MaintenanceProfile> =>
  apiPut<MaintenanceProfile>(`/vehicles/${vehicleId}/maintenance/profile`, body);

export const correctOdometer = (
  vehicleId: string,
  body: CorrectOdometerInput,
): Promise<MaintenanceProfile> =>
  apiPost<MaintenanceProfile>(`/vehicles/${vehicleId}/maintenance/odometer/correction`, body);

/** Phân trang: đọc `meta` từ lớp bọc (`apiGet` chỉ trả `data`). */
export async function fetchOdometerHistory(
  vehicleId: string,
  page = 1,
  limit = 20,
): Promise<{ items: OdometerReading[]; meta: PaginationMeta }> {
  const res = await apiRequest<OdometerReading[]>(
    `/vehicles/${vehicleId}/maintenance/odometer/history`,
    { query: { page, limit } },
  );
  return {
    items: res.data,
    meta: (res.meta as PaginationMeta | undefined) ?? {
      page,
      limit,
      total: res.data.length,
      hasNext: false,
    },
  };
}

export const fetchMaintenanceRecords = (vehicleId: string): Promise<MaintenanceRecord[]> =>
  apiGet<MaintenanceRecord[]>(`/vehicles/${vehicleId}/maintenance/records`);

export const createMaintenanceRecord = (
  vehicleId: string,
  body: SaveMaintenanceRecordInput,
): Promise<MaintenanceRecord> =>
  apiPost<MaintenanceRecord>(`/vehicles/${vehicleId}/maintenance/records`, body);

export const updateMaintenanceRecord = (
  vehicleId: string,
  recordId: string,
  body: SaveMaintenanceRecordInput,
): Promise<MaintenanceRecord> =>
  apiPut<MaintenanceRecord>(`/vehicles/${vehicleId}/maintenance/records/${recordId}`, body);

export const startMaintenanceRecord = (
  vehicleId: string,
  recordId: string,
  expectedRowVersion: number,
): Promise<MaintenanceRecord> =>
  apiPost<MaintenanceRecord>(`/vehicles/${vehicleId}/maintenance/records/${recordId}/start`, {
    expectedRowVersion,
  });

export const completeMaintenanceRecord = (
  vehicleId: string,
  recordId: string,
  body: CompleteMaintenanceInput,
): Promise<MaintenanceRecord> =>
  apiPost<MaintenanceRecord>(
    `/vehicles/${vehicleId}/maintenance/records/${recordId}/complete`,
    body,
  );

export const cancelMaintenanceRecord = (
  vehicleId: string,
  recordId: string,
  expectedRowVersion: number,
): Promise<MaintenanceRecord> =>
  apiPost<MaintenanceRecord>(`/vehicles/${vehicleId}/maintenance/records/${recordId}/cancel`, {
    expectedRowVersion,
  });

export const presignMaintenanceAttachment = (
  vehicleId: string,
  recordId: string,
  file: File,
): Promise<Presign> =>
  apiPost<Presign>(`/vehicles/${vehicleId}/maintenance/records/${recordId}/attachments/presign`, {
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size,
  });

export const attachMaintenanceFile = (
  vehicleId: string,
  recordId: string,
  fileId: string,
): Promise<MaintenanceRecord> =>
  apiPost<MaintenanceRecord>(
    `/vehicles/${vehicleId}/maintenance/records/${recordId}/attachments`,
    { fileId },
  );

export const fetchAttachmentDownload = (
  vehicleId: string,
  recordId: string,
  fileId: string,
): Promise<Download> =>
  apiGet<Download>(
    `/vehicles/${vehicleId}/maintenance/records/${recordId}/attachments/${fileId}/download`,
  );

// ── Trung tâm bảo dưỡng ─────────────────────────────────────────────────────

export function boardFiltersToParams(filters: MaintenanceBoardFilters): QueryParams {
  return {
    ...(filters.filter && filters.filter !== 'all' ? { filter: filters.filter } : {}),
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.type && filters.type !== 'all' ? { type: filters.type } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    ...(filters.sort ? { sort: filters.sort } : {}),
    page: filters.page ?? 1,
    limit: filters.limit ?? MAINTENANCE_DEFAULT_LIMIT,
  };
}

export async function fetchMaintenanceBoard(
  params: QueryParams,
): Promise<{ items: MaintenanceBoardItem[]; meta: PaginationMeta }> {
  const res = await apiRequest<MaintenanceBoardItem[]>('/maintenance', { query: params });
  return {
    items: res.data,
    meta: (res.meta as PaginationMeta | undefined) ?? {
      page: 1,
      limit: MAINTENANCE_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
  };
}

export const fetchMaintenanceBoardSummary = (): Promise<MaintenanceBoardSummary> =>
  apiGet<MaintenanceBoardSummary>('/maintenance/summary');
