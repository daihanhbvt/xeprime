import type { components } from '@xeprime/types';

/**
 * Shape xe lấy thẳng từ contract sinh bởi OpenAPI (ADR 0007) — KHÔNG viết tay lại DTO.
 * Đổi DTO backend → chạy `pnpm contract` → các type này tự cập nhật.
 */
type Schemas = components['schemas'];

export type VehicleListItem = Schemas['VehicleListItemDto'];
export type VehicleDetail = Schemas['VehicleDetailDto'];
export type CreateVehicleInput = Schemas['CreateVehicleDto'];
export type UpdateVehicleInput = Schemas['UpdateVehicleDto'];

/** Khớp `VEHICLE_SORT` ở backend DTO. */
export type VehicleSort = 'newest' | 'name_asc' | 'code_asc' | 'price_asc' | 'price_desc';

/**
 * Filter danh sách xe — sống ở URL searchParams (ADR 0004): chia sẻ link được, F5 không mất,
 * nút back hoạt động. `page`/`limit` phân trang server-side.
 */
export interface VehicleFilters {
  q?: string;
  vehicleType?: string;
  serviceType?: string;
  operationStatus?: string;
  publicStatus?: string;
  /** Chi nhánh giữ xe — ghép từ bộ chọn ở thanh trên, không phải một ô lọc riêng trên trang. */
  branchId?: string;
  sort?: VehicleSort;
  page?: number;
  limit?: number;
}

export type VehicleSource = Schemas['VehicleSourceDto'];
export type VehicleSourceDetail = Schemas['VehicleSourceDetailDto'];
export type VehicleSourceContractFile = Schemas['VehicleSourceContractFileDto'];
export type SaveVehicleSourceInput = Schemas['SaveVehicleSourceDto'];
export type SourceContractPresign = Schemas['SourceContractPresignDto'];
export type SourceContractDownload = Schemas['SourceContractDownloadDto'];

export type VehicleStats = Schemas['VehicleStatsDto'];
export type FleetSummary = Schemas['FleetSummaryDto'];
export type Vehicle360Summary = Schemas['Vehicle360SummaryDto'];

/** Việc cần làm + KM hiện tại của một xe (Wave 8) — server tính, FE chỉ hiển thị. */
export type VehicleAlertGroup = Schemas['VehicleAlertsDto'];
export type VehicleAlertItem = Schemas['VehicleAlertDto'];
export type VehicleBookingBrief = Schemas['VehicleBookingBriefDto'];

/**
 * Giá thuê tham khảo khi chủ xe đặt giá — contract sinh từ OpenAPI, `basis`/`sampleSize` là
 * phần nói lên độ tin cậy (xem `MarketPriceSuggestionDto` ở backend).
 */
export type MarketPriceSuggestion = Schemas['MarketPriceSuggestionDto'];

/** Chiều so sánh gửi lên — tất cả tuỳ chọn trừ loại xe; thiếu chiều nào thì backend nới rộng. */
export interface MarketPriceParams {
  vehicleType: string;
  bodyType?: string | null;
  motorbikeCategory?: string | null;
  seatCount?: number | null;
  provinceCode?: string | null;
}
