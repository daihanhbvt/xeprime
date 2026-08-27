import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

/**
 * Kiểu sinh từ OpenAPI (ADR 0007) — không viết tay lại shape endpoint.
 * Chạy `pnpm contract` sau khi đổi DTO backend.
 */
export type Branch = Schemas['BranchDto'];
export type BranchList = Schemas['BranchListDto'];
export type CreateBranchInput = Schemas['CreateBranchDto'];
export type UpdateBranchInput = Schemas['UpdateBranchDto'];
