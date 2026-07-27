import type { PaginationMeta } from '@xeprime/types';
import { apiPost, apiRequest, type QueryParams } from '@/services/api-client';
import type { CreateReviewInput, MyTrip } from './types';

export const MY_TRIPS_DEFAULT_LIMIT = 10;

export interface MyTripsResult {
  items: MyTrip[];
  meta: PaginationMeta;
}

export function tripsToParams(page: number, limit: number = MY_TRIPS_DEFAULT_LIMIT): QueryParams {
  return { page, limit };
}

export async function fetchMyTrips(page: number): Promise<MyTripsResult> {
  const res = await apiRequest<MyTrip[]>('/reviews/my-trips', { query: tripsToParams(page) });
  return {
    items: res.data,
    meta: (res.meta as PaginationMeta | undefined) ?? {
      page: 1,
      limit: MY_TRIPS_DEFAULT_LIMIT,
      total: res.data.length,
      hasNext: false,
    },
  };
}

export const createReview = (body: CreateReviewInput): Promise<{ id: string }> =>
  apiPost<{ id: string }>('/reviews', body);
