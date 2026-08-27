import type { components } from '@xeprime/types';

/** Shape lấy từ contract OpenAPI (ADR 0007) — KHÔNG viết tay lại DTO. */
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

/** Bộ lọc của Trung tâm bảo dưỡng — sống trên URL searchParams (ADR 0004). */
export interface MaintenanceBoardFilters {
  filter: string;
  q?: string;
  type: string;
  from?: string;
  to?: string;
  sort: string;
  page?: number;
  limit?: number;
}
