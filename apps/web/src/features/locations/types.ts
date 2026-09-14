import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

/**
 * Kiểu sinh từ OpenAPI (ADR 0007) — KHÔNG viết tay lại shape của endpoint.
 * Chạy `pnpm contract` sau khi đổi DTO backend.
 */
export type Province = Schemas['ProvinceDto'];
export type PlatformProvince = Schemas['PlatformProvinceDto'];
export type UpdateProvinceInput = Schemas['UpdateProvinceDto'];

/** Xã/phường/đặc khu — cấp thứ hai và cuối cùng của mô hình hành chính hai cấp (01/07/2025). */
export type Ward = Schemas['WardDto'];
export type WardList = Schemas['WardListDto'];

/** Địa chỉ vật lý có cấu trúc như API trả về. */
export type AddressView = Schemas['AddressViewDto'];

/** Gợi ý địa điểm và chi tiết địa điểm — proxy qua backend (khoá bản đồ không rời server). */
export type PlaceSuggestion = Schemas['PlaceSuggestionDto'];
export type PlaceDetail = Schemas['PlaceDetailDto'];
