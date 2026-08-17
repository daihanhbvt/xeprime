import type { components } from '@xeprime/types';

/** Shape từ contract OpenAPI (ADR 0007) — không viết tay lại DTO. */
type Schemas = components['schemas'];

export type Driver = Schemas['DriverDto'];
export type CreateDriverInput = Schemas['CreateDriverDto'];
export type UpdateDriverInput = Schemas['UpdateDriverDto'];
/** Tóm tắt tài xế gắn trên đơn thuê. */
export type BookingDriverSummary = Schemas['BookingDriverSummaryDto'];

export interface DriverFilters {
  q?: string;
  status?: string;
  driverType?: string;
  page?: number;
  limit?: number;
}
