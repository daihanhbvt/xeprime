import type { components } from '@xeprime/types';

/** Shape review lấy từ contract OpenAPI (ADR 0007) — không viết tay lại DTO. */
type Schemas = components['schemas'];

export type CreateReviewInput = Schemas['CreateReviewDto'];
