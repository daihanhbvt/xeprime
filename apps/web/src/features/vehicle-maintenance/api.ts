import type { components } from '@xeprime/types';
import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import {
  apiGet,
  apiPost,
  apiPut,
  fetchPage,
  type Paged,
  type QueryParams,
} from '@/services/api-client';
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

type Presign = components['schemas']['SourceContractPresignDto'];
type Download = components['schemas']['SourceContractDownloadDto'];

export const MAINTENANCE_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

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

export const fetchOdometerHistory = (
  vehicleId: string,
  page = 1,
  limit = DEFAULT_PAGE_SIZE,
): Promise<Paged<OdometerReading>> =>
  fetchPage<OdometerReading>(
    `/vehicles/${vehicleId}/maintenance/odometer/history`,
    { page, limit },
    limit,
  );

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

export const fetchMaintenanceBoard = (
  params: QueryParams,
): Promise<Paged<MaintenanceBoardItem>> =>
  fetchPage<MaintenanceBoardItem>('/maintenance', params, MAINTENANCE_DEFAULT_LIMIT);

export const fetchMaintenanceBoardSummary = (): Promise<MaintenanceBoardSummary> =>
  apiGet<MaintenanceBoardSummary>('/maintenance/summary');
