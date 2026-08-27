import type { components } from '@xeprime/types';

/** Shape lấy từ contract OpenAPI (ADR 0007) — KHÔNG viết tay lại DTO. */
type Schemas = components['schemas'];

/** Bản TÓM TẮT (quyền `view`) — chỉ trạng thái, không PII/tên file/OCR (Wave 5.1). */
export type VehicleDocumentSummary = Schemas['VehicleDocumentSummaryDto'];
/** Bản CHI TIẾT (quyền `view_details`) — metadata nhạy cảm + bản active. */
export type VehicleDocumentDetail = Schemas['VehicleDocumentDetailDto'];
export type VehicleDocumentVersion = Schemas['VehicleDocumentVersionDto'];
export type VehicleDocumentOcrJob = Schemas['VehicleDocumentOcrJobDto'];
export type VehicleDocumentOcrField = Schemas['VehicleDocumentOcrFieldDto'];
export type SaveVehicleDocumentInput = Schemas['SaveVehicleDocumentDto'];
export type ApplyOcrFieldsInput = Schemas['ApplyOcrFieldsDto'];
