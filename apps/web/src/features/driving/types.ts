import type { components } from '@xeprime/types';

/** Shape từ contract OpenAPI (ADR 0007). Phía TÀI XẾ — tài khoản khách (ADR 0063). */
type Schemas = components['schemas'];

export type MyDriverLink = Schemas['MyDriverLinkDto'];
export type DriverEmployer = Schemas['DriverEmployerDto'];
export type DriverTrip = Schemas['DriverTripDto'];
export type DriverTripDetail = Schemas['DriverTripDetailDto'];
export type DriverPendingCounts = Schemas['DriverPendingCountsDto'];

// Phạm vi liên kết dùng chung với API và app native (@xeprime/types).
export { DRIVER_LINK_SCOPE, type DriverLinkScope } from '@xeprime/types';
