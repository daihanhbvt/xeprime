import type { components } from '@xeprime/types';

/** Dữ liệu xe chuẩn (ADR 0090) — kiểu lấy từ OpenAPI (ADR 0007). */
export type VehicleDataListItem = components['schemas']['VehicleDataListItemDto'];
export type VehicleDataDetail = components['schemas']['VehicleDataDetailDto'];
export type VehicleDataSummary = components['schemas']['VehicleDataSummaryDto'];
export type VehicleDataPage = components['schemas']['VehicleDataPageDto'];
export type VehicleDataModelCount = components['schemas']['VehicleDataModelCountDto'];
export type VehicleDataMarketStat = components['schemas']['VehicleDataMarketStatDto'];
export type VehicleDataVehicle = components['schemas']['VehicleDataVehicleDto'];
export type VehicleDataSimilar = components['schemas']['VehicleDataSimilarDto'];
export type VehicleDataInput = components['schemas']['SaveVehicleDataDto'];
export type VehicleDataReviewResult = components['schemas']['VehicleDataReviewResultDto'];
export type VehicleDataImport = components['schemas']['VehicleDataImportDto'];
export type VehicleDataImportRow = components['schemas']['VehicleDataImportRowDto'];
export type VehicleDataImportIssue = components['schemas']['VehicleDataImportIssueDto'];
export type VehicleDataImportChange = components['schemas']['VehicleDataImportChangeDto'];

/** Phía chủ xe. */
export type VehicleDataOption = components['schemas']['VehicleDataOptionDto'];
export type VehicleDataSuggestion = components['schemas']['VehicleDataSuggestionDto'];
export type VehicleDataRentSuggestion = components['schemas']['VehicleDataRentSuggestionDto'];
export type VehicleDataValue = components['schemas']['VehicleDataValueDto'];
export type CatalogModel = components['schemas']['CatalogModelDto'];

/** Bộ lọc danh sách trên URL (ADR 0004). `open` = xe chuẩn đang mở ở panel (`new` = thêm mới). */
export interface VehicleDataFilters {
  q?: string;
  vehicleType?: string;
  brandKey?: string;
  /** Chỉ xe của một dòng - danh sách xe khi mở một dòng ở tab Mẫu xe (ADR 0096). Không lên URL. */
  modelId?: string;
  status?: string;
  origin?: string;
  gap?: string;
  sort?: string;
  page?: number;
  limit?: number;
  open?: string;
}
