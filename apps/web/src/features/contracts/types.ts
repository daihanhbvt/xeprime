import type { components } from '@xeprime/types';

/** Type hợp đồng lấy từ contract OpenAPI (ADR 0007) — không viết tay lại DTO. */
type Schemas = components['schemas'];

export type Contract = Schemas['ContractDto'];
export type ContractSnapshot = Schemas['ContractSnapshotDto'];
