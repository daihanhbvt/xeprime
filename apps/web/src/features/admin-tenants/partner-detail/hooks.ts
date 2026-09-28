'use client';

import { useQuery, type Query } from '@tanstack/react-query';
import { isClientError } from '@/lib/http-status';
import {
  fetchPartnerActivity,
  fetchPartnerBilling,
  fetchPartnerBookingRequests,
  fetchPartnerBookingSummary,
  fetchPartnerBookings,
  fetchPartnerCommission,
  fetchPartnerOverview,
  fetchPartnerProfile,
  fetchPartnerSupportSessions,
  fetchPartnerVehicles,
  type PartnerActivityFilters,
  type PartnerBookingFilters,
  type PartnerVehicleFilters,
} from './api';

/**
 * Khoá cache của drawer chi tiết đối tác. Phần tử thứ hai LUÔN là `tenantId`: đổi đối tác là
 * đổi khoá, nên không bao giờ có dữ liệu của đối tác trước hiện dưới tên đối tác sau.
 */
export const adminPartnerKeys = {
  all: ['admin-partner'] as const,
  tenant: (tenantId: string) => ['admin-partner', tenantId] as const,
  overview: (tenantId: string) => ['admin-partner', tenantId, 'overview'] as const,
  vehicles: (tenantId: string, filters: PartnerVehicleFilters) =>
    ['admin-partner', tenantId, 'vehicles', filters] as const,
  bookings: (tenantId: string, filters: PartnerBookingFilters) =>
    ['admin-partner', tenantId, 'bookings', filters] as const,
  bookingSummary: (tenantId: string, range: Pick<PartnerBookingFilters, 'dateFrom' | 'dateTo'>) =>
    ['admin-partner', tenantId, 'booking-summary', range] as const,
  bookingRequests: (tenantId: string, filters: { status?: string; page?: number }) =>
    ['admin-partner', tenantId, 'booking-requests', filters] as const,
  profile: (tenantId: string) => ['admin-partner', tenantId, 'profile'] as const,
  billing: (tenantId: string) => ['admin-partner', tenantId, 'billing'] as const,
  commission: (tenantId: string) => ['admin-partner', tenantId, 'commission'] as const,
  activity: (tenantId: string, filters: PartnerActivityFilters) =>
    ['admin-partner', tenantId, 'activity', filters] as const,
  supportSessions: (tenantId: string, filters: { page?: number }) =>
    ['admin-partner', tenantId, 'support-sessions', filters] as const,
};

/**
 * Giữ trang cũ trong lúc tải trang mới — nhưng CHỈ khi vẫn là cùng đối tác. Khoá trước thuộc
 * đối tác khác thì trả `undefined` để tab hiện trạng thái tải, không hiện số liệu của người khác.
 */
function keepSameTenant(tenantId: string) {
  return <T>(
    previous: T | undefined,
    previousQuery: Query<T, Error, T, readonly unknown[]> | undefined,
  ) => (previousQuery?.queryKey[1] === tenantId ? previous : undefined);
}

/** 403/404 là câu trả lời cuối — thử lại chỉ làm chậm màn "không có quyền"/"không tìm thấy". */
function retryUnlessClientError(count: number, error: unknown): boolean {
  return !isClientError(error) && count < 2;
}

export function usePartnerOverview(tenantId: string | null) {
  return useQuery({
    queryKey: adminPartnerKeys.overview(tenantId ?? ''),
    queryFn: () => fetchPartnerOverview(tenantId as string),
    enabled: Boolean(tenantId),
    retry: retryUnlessClientError,
  });
}

export function usePartnerVehicles(
  tenantId: string,
  filters: PartnerVehicleFilters,
  enabled: boolean,
) {
  return useQuery({
    queryKey: adminPartnerKeys.vehicles(tenantId, filters),
    queryFn: () => fetchPartnerVehicles(tenantId, filters),
    enabled,
    retry: retryUnlessClientError,
    placeholderData: keepSameTenant(tenantId),
  });
}

export function usePartnerBookings(
  tenantId: string,
  filters: PartnerBookingFilters,
  enabled: boolean,
) {
  return useQuery({
    queryKey: adminPartnerKeys.bookings(tenantId, filters),
    queryFn: () => fetchPartnerBookings(tenantId, filters),
    enabled,
    retry: retryUnlessClientError,
    placeholderData: keepSameTenant(tenantId),
  });
}

export function usePartnerBookingSummary(
  tenantId: string,
  range: Pick<PartnerBookingFilters, 'dateFrom' | 'dateTo'>,
  enabled: boolean,
) {
  return useQuery({
    queryKey: adminPartnerKeys.bookingSummary(tenantId, range),
    queryFn: () => fetchPartnerBookingSummary(tenantId, range),
    enabled,
    retry: retryUnlessClientError,
  });
}

export function usePartnerBookingRequests(
  tenantId: string,
  filters: { status?: string; page?: number },
  enabled: boolean,
) {
  return useQuery({
    queryKey: adminPartnerKeys.bookingRequests(tenantId, filters),
    queryFn: () => fetchPartnerBookingRequests(tenantId, filters),
    enabled,
    retry: retryUnlessClientError,
    placeholderData: keepSameTenant(tenantId),
  });
}

export function usePartnerProfile(tenantId: string) {
  return useQuery({
    queryKey: adminPartnerKeys.profile(tenantId),
    queryFn: () => fetchPartnerProfile(tenantId),
    retry: retryUnlessClientError,
  });
}

export function usePartnerBilling(tenantId: string, enabled: boolean) {
  return useQuery({
    queryKey: adminPartnerKeys.billing(tenantId),
    queryFn: () => fetchPartnerBilling(tenantId),
    enabled,
    retry: retryUnlessClientError,
  });
}

export function usePartnerCommission(tenantId: string) {
  return useQuery({
    queryKey: adminPartnerKeys.commission(tenantId),
    queryFn: () => fetchPartnerCommission(tenantId),
    retry: retryUnlessClientError,
  });
}

export function usePartnerActivity(
  tenantId: string,
  filters: PartnerActivityFilters,
  enabled: boolean,
) {
  return useQuery({
    queryKey: adminPartnerKeys.activity(tenantId, filters),
    queryFn: () => fetchPartnerActivity(tenantId, filters),
    enabled,
    retry: retryUnlessClientError,
    placeholderData: keepSameTenant(tenantId),
  });
}

export function usePartnerSupportSessions(
  tenantId: string,
  filters: { page?: number },
  enabled: boolean,
) {
  return useQuery({
    queryKey: adminPartnerKeys.supportSessions(tenantId, filters),
    queryFn: () => fetchPartnerSupportSessions(tenantId, filters),
    enabled,
    retry: retryUnlessClientError,
    placeholderData: keepSameTenant(tenantId),
  });
}
