import { DEFAULT_PAGE_SIZE } from '@/constants/filters';
import { apiGet, apiPost, fetchPage, type Paged, type QueryParams } from '@/services/api-client';
import type {
  TripBooking,
  TripBookingFilters,
  TripRemindResult,
  TripRequest,
  TripRequestFilters,
  TripSummary,
} from './types';

const BASE = '/platform/trips';

export const TRIPS_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

export function summaryParams(tenantId?: string): QueryParams {
  return { tenantId: tenantId ?? null };
}

export function queueParams(filters: TripRequestFilters | TripBookingFilters): QueryParams {
  return {
    queue: filters.queue,
    q: filters.q ?? null,
    tenantId: filters.tenantId ?? null,
    page: filters.page ?? 1,
    limit: filters.limit ?? TRIPS_DEFAULT_LIMIT,
  };
}

export const fetchTripSummary = (tenantId?: string): Promise<TripSummary> =>
  apiGet<TripSummary>(`${BASE}/summary`, summaryParams(tenantId));

export const fetchTripRequests = (filters: TripRequestFilters): Promise<Paged<TripRequest>> =>
  fetchPage<TripRequest>(`${BASE}/requests`, queueParams(filters), TRIPS_DEFAULT_LIMIT);

export const fetchTripBookings = (filters: TripBookingFilters): Promise<Paged<TripBooking>> =>
  fetchPage<TripBooking>(`${BASE}/bookings`, queueParams(filters), TRIPS_DEFAULT_LIMIT);

/** Nhắc tay chủ xe — một thông báo + một dòng audit ở backend; có cooldown (`TRIP_REMIND_TOO_SOON`). */
export const remindTripRequest = (id: string): Promise<TripRemindResult> =>
  apiPost<TripRemindResult>(`${BASE}/requests/${id}/remind`);
