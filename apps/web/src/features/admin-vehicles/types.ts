import type { components, PlatformVehicleSort } from '@xeprime/types';

/** Type xe toàn hệ thống (admin nền tảng) lấy từ contract OpenAPI (ADR 0007). */
type Schemas = components['schemas'];

export type AdminVehicle = Schemas['PlatformVehicleDto'];
export type AdminVehicleDetail = Schemas['PlatformVehicleDetailDto'];
export type AdminVehicleCounts = Schemas['PlatformVehicleCountsDto'];

/** Bộ lọc + sắp xếp danh sách xe — ở URL searchParams (ADR 0004). */
export interface AdminVehicleFilters {
  q?: string;
  tenantId?: string;
  publicStatus?: string;
  operationStatus?: string;
  vehicleType?: string;
  serviceType?: string;
  /** Mã tỉnh/thành của CHI NHÁNH gắn xe (`provinces.code`). */
  provinceCode?: string;
  tenantStatus?: string;
  /**
   * Kết quả hiển thị HIỆU LỰC ngoài chợ (ADR 0048) — `'true'` · `'false'` · `'all'`.
   *
   * Chuỗi chứ không boolean vì nó sống ở URL cùng các filter khác, và `'all'` là cách cả module
   * này diễn đạt "không lọc chiều đó" (xem `pickFilter`). Nó KHÔNG suy được từ `publicStatus`:
   * một chiếc `approved_public` vẫn biến khỏi chợ khi chủ xe tắt công tắc hoặc gian hàng bị khoá.
   */
  marketplaceVisible?: string;
  /** `undefined` = mặc định của server (mới tạo gần nhất) — URL trần không mang `?sort=`. */
  sort?: PlatformVehicleSort;
  page?: number;
  limit?: number;
}

/** Bộ lọc + xe đang mở ở panel chi tiết — toàn bộ sống ở URL để F5/link giữ nguyên chỗ đang xem. */
export interface AdminVehicleUrlState extends AdminVehicleFilters {
  open?: string;
}
