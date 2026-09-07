import type { components } from '@xeprime/types';
import { getApiClient, type Paged } from '../../client';
import type { QueryParams } from '../../url';
import type { UploadMeta } from '../vehicles/api';

type Schemas = components['schemas'];

export type MaintenanceProfile = Schemas['MaintenanceProfileDto'];
export type MaintenanceRecord = Schemas['MaintenanceRecordDto'];
export type MaintenanceAttachment = Schemas['MaintenanceAttachmentDto'];
export type OdometerReading = Schemas['OdometerReadingDto'];
export type MaintenanceBoardItem = Schemas['MaintenanceBoardItemDto'];
export type MaintenanceBoardSummary = Schemas['MaintenanceBoardSummaryDto'];
export type SaveMaintenanceProfileInput = Schemas['SaveMaintenanceProfileDto'];
export type SaveMaintenanceRecordInput = Schemas['SaveMaintenanceRecordDto'];
export type CompleteMaintenanceInput = Schemas['CompleteMaintenanceDto'];
export type CorrectOdometerInput = Schemas['CorrectOdometerDto'];
export type MaintenancePresign = Schemas['SourceContractPresignDto'];
export type MaintenanceDownload = Schemas['SourceContractDownloadDto'];

/** Bộ lọc của Trung tâm bảo dưỡng. */
export interface MaintenanceBoardFilters {
  filter?: string;
  q?: string;
  type?: string;
  from?: string;
  to?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export const MAINTENANCE_DEFAULT_LIMIT = 20;

export function maintenanceBoardToParams(filters: MaintenanceBoardFilters): QueryParams {
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

const base = (vehicleId: string) => `/vehicles/${encodeURIComponent(vehicleId)}/maintenance`;

/**
 * Bảo dưỡng & số KM của một xe, và bảng việc của cả đội xe.
 *
 * Chứng từ là TÀI LIỆU RIÊNG TƯ: presign → PUT bucket riêng tư → đính (server xác minh) → xem
 * qua signed URL ngắn hạn. Không URL nào nằm trong state hay DB.
 */
export const maintenanceApi = {
  profile(vehicleId: string): Promise<MaintenanceProfile> {
    return getApiClient().get<MaintenanceProfile>(`${base(vehicleId)}/profile`);
  },

  saveProfile(vehicleId: string, body: SaveMaintenanceProfileInput): Promise<MaintenanceProfile> {
    return getApiClient().put<MaintenanceProfile>(`${base(vehicleId)}/profile`, body);
  },

  /**
   * Điều chỉnh KM thủ công. Lý do là BẮT BUỘC ở cả ba lớp (form, DTO, CHECK ở DB) — một số KM
   * đổi mà không ai biết vì sao là thứ không được phép tồn tại.
   */
  correctOdometer(vehicleId: string, body: CorrectOdometerInput): Promise<MaintenanceProfile> {
    return getApiClient().post<MaintenanceProfile>(`${base(vehicleId)}/odometer/correction`, body);
  },

  odometerHistory(vehicleId: string, page = 1): Promise<Paged<OdometerReading>> {
    return getApiClient().fetchPage<OdometerReading>(
      `${base(vehicleId)}/odometer/history`,
      { page, limit: MAINTENANCE_DEFAULT_LIMIT },
      MAINTENANCE_DEFAULT_LIMIT,
    );
  },

  records(vehicleId: string): Promise<MaintenanceRecord[]> {
    return getApiClient().get<MaintenanceRecord[]>(`${base(vehicleId)}/records`);
  },

  createRecord(vehicleId: string, body: SaveMaintenanceRecordInput): Promise<MaintenanceRecord> {
    return getApiClient().post<MaintenanceRecord>(`${base(vehicleId)}/records`, body);
  },

  updateRecord(
    vehicleId: string,
    recordId: string,
    body: SaveMaintenanceRecordInput,
  ): Promise<MaintenanceRecord> {
    return getApiClient().put<MaintenanceRecord>(
      `${base(vehicleId)}/records/${encodeURIComponent(recordId)}`,
      body,
    );
  },

  /**
   * Ba chuyển trạng thái của một phiếu. `expectedRowVersion` là khoá lạc quan: hai người cùng mở
   * một phiếu thì người sau nhận 409 thay vì lặng lẽ ghi đè thao tác của người trước.
   */
  startRecord(
    vehicleId: string,
    recordId: string,
    expectedRowVersion: number,
  ): Promise<MaintenanceRecord> {
    return getApiClient().post<MaintenanceRecord>(
      `${base(vehicleId)}/records/${encodeURIComponent(recordId)}/start`,
      { expectedRowVersion },
    );
  },

  completeRecord(
    vehicleId: string,
    recordId: string,
    body: CompleteMaintenanceInput,
  ): Promise<MaintenanceRecord> {
    return getApiClient().post<MaintenanceRecord>(
      `${base(vehicleId)}/records/${encodeURIComponent(recordId)}/complete`,
      body,
    );
  },

  cancelRecord(
    vehicleId: string,
    recordId: string,
    expectedRowVersion: number,
  ): Promise<MaintenanceRecord> {
    return getApiClient().post<MaintenanceRecord>(
      `${base(vehicleId)}/records/${encodeURIComponent(recordId)}/cancel`,
      { expectedRowVersion },
    );
  },

  presignAttachment(
    vehicleId: string,
    recordId: string,
    meta: UploadMeta,
  ): Promise<MaintenancePresign> {
    return getApiClient().post<MaintenancePresign>(
      `${base(vehicleId)}/records/${encodeURIComponent(recordId)}/attachments/presign`,
      meta,
    );
  },

  attachFile(vehicleId: string, recordId: string, fileId: string): Promise<MaintenanceRecord> {
    return getApiClient().post<MaintenanceRecord>(
      `${base(vehicleId)}/records/${encodeURIComponent(recordId)}/attachments`,
      { fileId },
    );
  },

  attachmentDownload(
    vehicleId: string,
    recordId: string,
    fileId: string,
  ): Promise<MaintenanceDownload> {
    return getApiClient().get<MaintenanceDownload>(
      `${base(vehicleId)}/records/${encodeURIComponent(recordId)}/attachments/${encodeURIComponent(fileId)}/download`,
    );
  },

  board(filters: MaintenanceBoardFilters): Promise<Paged<MaintenanceBoardItem>> {
    return getApiClient().fetchPage<MaintenanceBoardItem>(
      '/maintenance',
      maintenanceBoardToParams(filters),
      MAINTENANCE_DEFAULT_LIMIT,
    );
  },

  /** Đếm theo nhóm việc — độc lập với trang/bộ lọc hiện tại nên có query key riêng. */
  boardSummary(): Promise<MaintenanceBoardSummary> {
    return getApiClient().get<MaintenanceBoardSummary>('/maintenance/summary');
  },
};
