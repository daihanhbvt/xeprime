import type { QueryParams } from './api-client';

/**
 * Query key tập trung một chỗ để `invalidateQueries` không phải đoán chuỗi.
 *
 * Quy ước: key luôn bắt đầu bằng tên domain, tham số nằm ở phần tử cuối dạng object —
 * nhờ vậy `invalidateQueries({ queryKey: queryKeys.calendar.all })` xoá được cả nhánh.
 */
export const queryKeys = {
  auth: {
    all: ['auth'] as const,
    me: () => ['auth', 'me'] as const,
  },
  tenants: {
    all: ['tenants'] as const,
    current: () => ['tenants', 'current'] as const,
  },
  calendar: {
    all: ['calendar'] as const,
    resources: (params: QueryParams) => ['calendar', 'resources', params] as const,
    events: (params: QueryParams) => ['calendar', 'events', params] as const,
  },
  vehicles: {
    all: ['vehicles'] as const,
    list: (params: QueryParams) => ['vehicles', 'list', params] as const,
  },
  bookings: {
    all: ['bookings'] as const,
    list: (params: QueryParams) => ['bookings', 'list', params] as const,
  },
} as const;
