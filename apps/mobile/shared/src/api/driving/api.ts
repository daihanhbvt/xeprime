import type { components, DriverTripTab } from '@xeprime/types';
import { getApiClient, type Paged } from '@xeprime/api-client';

type Schemas = components['schemas'];

/** Phía TÀI XẾ — tài khoản khách (ADR 0063). Shape từ contract OpenAPI (ADR 0007). */
export type MyDriverLink = Schemas['MyDriverLinkDto'];
export type DriverEmployer = Schemas['DriverEmployerDto'];
export type DriverTrip = Schemas['DriverTripDto'];
export type DriverTripDetail = Schemas['DriverTripDetailDto'];
export type DriverPendingCounts = Schemas['DriverPendingCountsDto'];

// Phạm vi liên kết dùng chung với API và app native (@xeprime/types).
import type { DriverLinkScope } from '@xeprime/types';
export { DRIVER_LINK_SCOPE, type DriverLinkScope } from '@xeprime/types';

/** Cùng `DEFAULT_PAGE_SIZE` mà web dùng. */
export const DRIVING_DEFAULT_LIMIT = 20;

const one = (base: string, id: string) => `${base}/${encodeURIComponent(id)}`;

/**
 * Lời gọi phía TÀI XẾ (`/driver/*`, realm `customer`) — bản native của
 * `apps/web/src/features/driving/api.ts` (ADR 0031 — sửa hợp đồng là sửa CẢ HAI).
 */
export const drivingApi = {
  links(
    scope: DriverLinkScope,
    page: number,
    limit = DRIVING_DEFAULT_LIMIT,
  ): Promise<Paged<MyDriverLink>> {
    return getApiClient().fetchPage<MyDriverLink>(
      '/driver/links',
      { scope, page, limit },
      DRIVING_DEFAULT_LIMIT,
    );
  },

  pendingCounts(): Promise<DriverPendingCounts> {
    return getApiClient().get<DriverPendingCounts>('/driver/pending-counts');
  },

  acceptLink: (id: string) => getApiClient().post<unknown>(`${one('/driver/links', id)}/accept`),
  declineLink: (id: string) => getApiClient().post<unknown>(`${one('/driver/links', id)}/decline`),
  leaveLink: (id: string) => getApiClient().post<unknown>(`${one('/driver/links', id)}/leave`),

  trips(tab: DriverTripTab, page: number): Promise<Paged<DriverTrip>> {
    return getApiClient().fetchPage<DriverTrip>(
      '/driver/trips',
      { tab, page, limit: DRIVING_DEFAULT_LIMIT },
      DRIVING_DEFAULT_LIMIT,
    );
  },

  trip(id: string): Promise<DriverTripDetail> {
    return getApiClient().get<DriverTripDetail>(one('/driver/trips', id));
  },

  acceptTrip: (id: string) =>
    getApiClient().post<DriverTripDetail>(`${one('/driver/trips', id)}/accept`),
  declineTrip: (id: string) => getApiClient().post<unknown>(`${one('/driver/trips', id)}/decline`),
};
