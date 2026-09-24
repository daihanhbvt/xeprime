import type { components } from '@xeprime/types';

/** Type xe toàn hệ thống (admin nền tảng) lấy từ contract OpenAPI (ADR 0007). */
type Schemas = components['schemas'];

export type AdminVehicle = Schemas['PlatformVehicleDto'];
export type AdminVehicleDetail = Schemas['PlatformVehicleDetailDto'];

/** Filter danh sách xe — ở URL searchParams (ADR 0004). */
export interface AdminVehicleFilters {
  q?: string;
  tenantId?: string;
  publicStatus?: string;
  operationStatus?: string;
  vehicleType?: string;
  tenantStatus?: string;
  /**
   * Kết quả hiển thị HIỆU LỰC ngoài chợ (ADR 0048) — `'true'` · `'false'` · `'all'`.
   *
   * Chuỗi chứ không boolean vì nó sống ở URL cùng các filter khác, và `'all'` là cách cả module
   * này diễn đạt "không lọc chiều đó" (xem `pickFilter`). Nó KHÔNG suy được từ `publicStatus`:
   * một chiếc `approved_public` vẫn biến khỏi chợ khi chủ xe tắt công tắc hoặc gian hàng bị khoá.
   */
  marketplaceVisible?: string;
  page?: number;
  limit?: number;
}
