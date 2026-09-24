import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

/** Một dòng hàng đợi "Duyệt xe" — giá trị chụp lúc gửi, không phải xe sống. */
export type VehicleApprovalRow = Schemas['VehicleApprovalListItemDto'];
export type VehicleApprovalCounts = Schemas['VehicleApprovalCountsDto'];
/** Hồ sơ một phiếu duyệt xe — dựng từ snapshot v2 (hoặc dữ liệu sống cho phiếu cũ). */
export type VehicleApprovalDetail = Schemas['VehicleApprovalDetailDto'];
export type VehicleApprovalCheck = Schemas['VehicleApprovalCheckDto'];
export type VehicleApprovalInternalNote = Schemas['VehicleApprovalInternalNoteDto'];
export type VehicleApprovalLog = Schemas['ApprovalLogEntryDto'];

/**
 * Bộ lọc hàng đợi ở URL searchParams (ADR 0004). Giá trị `'all'` nghĩa là không lọc chiều đó —
 * `useUrlFilters` tự xoá nó khỏi URL, và `filtersToParams` không gửi nó lên server.
 *
 * `submittedFrom`/`submittedTo` là NGÀY (`YYYY-MM-DD`, giờ Việt Nam) như `FilterBar` ghi; mốc ISO
 * gửi lên server được dựng ở `filtersToParams`.
 */
export interface VehicleApprovalFilters {
  status: string;
  vehicleType: string;
  storefrontKind: string;
  q?: string;
  submittedFrom?: string;
  submittedTo?: string;
  page?: number;
  limit?: number;
}

/** Ba quyết định — mã dùng chung ở @xeprime/types (ADR 0005). */
export type { ApprovalDecision } from '@xeprime/types';
