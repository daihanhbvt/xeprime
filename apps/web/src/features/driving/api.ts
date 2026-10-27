import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import { apiGet, apiPost, fetchPage, type Paged } from '@/services/api-client';
import type { DriverTripTab } from '@xeprime/types';
import type {
  DriverLinkScope,
  DriverPendingCounts,
  DriverTrip,
  DriverTripDetail,
  MyDriverLink,
} from './types';

/** Lời gọi phía TÀI XẾ ở site khách (`/driver/*`, realm `customer` — ADR 0063). */
export const DRIVING_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export const fetchMyDriverLinks = (
  scope: DriverLinkScope,
  page: number,
  limit = DRIVING_DEFAULT_LIMIT,
): Promise<Paged<MyDriverLink>> =>
  fetchPage<MyDriverLink>('/driver/links', { scope, page, limit }, DRIVING_DEFAULT_LIMIT);

export const fetchDriverPendingCounts = (): Promise<DriverPendingCounts> =>
  apiGet<DriverPendingCounts>('/driver/pending-counts');

export const acceptDriverLink = (id: string): Promise<unknown> =>
  apiPost<unknown>(`/driver/links/${id}/accept`);
export const declineDriverLink = (id: string): Promise<unknown> =>
  apiPost<unknown>(`/driver/links/${id}/decline`);
export const leaveDriverLink = (id: string): Promise<unknown> =>
  apiPost<unknown>(`/driver/links/${id}/leave`);

export const fetchDriverTrips = (tab: DriverTripTab, page: number): Promise<Paged<DriverTrip>> =>
  fetchPage<DriverTrip>(
    '/driver/trips',
    { tab, page, limit: DRIVING_DEFAULT_LIMIT },
    DRIVING_DEFAULT_LIMIT,
  );

export const fetchDriverTrip = (id: string): Promise<DriverTripDetail> =>
  apiGet<DriverTripDetail>(`/driver/trips/${id}`);

export const acceptDriverTrip = (id: string): Promise<DriverTripDetail> =>
  apiPost<DriverTripDetail>(`/driver/trips/${id}/accept`);
export const declineDriverTrip = (id: string): Promise<unknown> =>
  apiPost<unknown>(`/driver/trips/${id}/decline`);
/** Trả lại chuyến đã nhận — trong cửa sổ `releaseUntil` (sửa ADR 0063 điều 6). Đơn không bị huỷ. */
export const releaseDriverTrip = (id: string): Promise<unknown> =>
  apiPost<unknown>(`/driver/trips/${id}/release`);
