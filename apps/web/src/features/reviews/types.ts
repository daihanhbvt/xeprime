import type { components } from '@xeprime/types';

/** Shape review/chuyến lấy từ contract OpenAPI (ADR 0007) — không viết tay lại DTO. */
type Schemas = components['schemas'];

export type MyTrip = Schemas['MyTripDto'];
export type TripReview = Schemas['TripReviewDto'];
export type CreateReviewInput = Schemas['CreateReviewDto'];
