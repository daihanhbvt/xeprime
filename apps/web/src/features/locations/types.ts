import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

/**
 * Kiểu sinh từ OpenAPI (ADR 0007) — KHÔNG viết tay lại shape của endpoint.
 * Chạy `pnpm contract` sau khi đổi DTO backend.
 */
export type Province = Schemas['ProvinceDto'];
export type PlatformProvince = Schemas['PlatformProvinceDto'];
export type UpdateProvinceInput = Schemas['UpdateProvinceDto'];
