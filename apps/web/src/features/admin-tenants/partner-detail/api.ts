import type { components } from '@xeprime/types';
import { apiGet, fetchPage, type Paged, type QueryParams } from '@/services/api-client';

/**
 * Lời gọi của drawer CHI TIẾT đối tác — CHỈ GET (ADR 0031: lời gọi theo nghiệp vụ nằm trong
 * feature). Drawer không có hàm ghi nào ở đây; hai thao tác quản trị nền tảng dùng lại hook sẵn
 * có của `admin-tenants`/`admin-plans`.
 */
type Schemas = components['schemas'];

export type PartnerOverview = Schemas['PartnerOverviewDto'];
export type PartnerVehicle = Schemas['PartnerVehicleDto'];
export type PartnerBooking = Schemas['PartnerBookingDto'];
export type PartnerBookingRequest = Schemas['PartnerBookingRequestDto'];
export type PartnerBookingSummary = Schemas['PartnerBookingSummaryDto'];
export type PartnerProfile = Schemas['PartnerProfileDto'];
export type PartnerBilling = Schemas['PartnerBillingDto'];
export type PartnerCommission = Schemas['PartnerCommissionDto'];
export type PartnerActivity = Schemas['PartnerActivityDto'];
export type PartnerSupportSession = Schemas['PartnerSupportSessionDto'];
export type PartnerBranch = Schemas['PartnerBranchDto'];
export type PartnerQuotaItem = Schemas['PartnerQuotaItemDto'];

/** Cỡ trang của các bảng trong drawer — khớp mặc định API (`PARTNER_DETAIL_DEFAULT_LIMIT`). */
export const PARTNER_DETAIL_PAGE_SIZE = 10;

const base = (tenantId: string) => `/platform/partners/${encodeURIComponent(tenantId)}`;

export interface PartnerVehicleFilters {
  q?: string;
  operationStatus?: string;
  publicStatus?: string;
  serviceType?: string;
  branchId?: string;
  sort?: string;
  page?: number;
}

export interface PartnerBookingFilters {
  q?: string;
  status?: string;
  serviceType?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
}

export interface PartnerActivityFilters {
  q?: string;
  actorScope?: string;
  category?: string;
  dateFrom?: string;
  page?: number;
}

function params(filters: object): QueryParams {
  const out: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(filters)) {
    out[key] = value === undefined || value === '' ? null : (value as string | number);
  }
  return out;
}

export const fetchPartnerOverview = (tenantId: string) =>
  apiGet<PartnerOverview>(`${base(tenantId)}/overview`);

export const fetchPartnerVehicles = (
  tenantId: string,
  filters: PartnerVehicleFilters,
): Promise<Paged<PartnerVehicle>> =>
  fetchPage<PartnerVehicle>(
    `${base(tenantId)}/vehicles`,
    params(filters),
    PARTNER_DETAIL_PAGE_SIZE,
  );

export const fetchPartnerBookings = (
  tenantId: string,
  filters: PartnerBookingFilters,
): Promise<Paged<PartnerBooking>> =>
  fetchPage<PartnerBooking>(
    `${base(tenantId)}/bookings`,
    params(filters),
    PARTNER_DETAIL_PAGE_SIZE,
  );

export const fetchPartnerBookingSummary = (
  tenantId: string,
  range: Pick<PartnerBookingFilters, 'dateFrom' | 'dateTo'>,
) => apiGet<PartnerBookingSummary>(`${base(tenantId)}/bookings/summary`, params(range));

export const fetchPartnerBookingRequests = (
  tenantId: string,
  filters: { status?: string; page?: number },
): Promise<Paged<PartnerBookingRequest>> =>
  fetchPage<PartnerBookingRequest>(
    `${base(tenantId)}/booking-requests`,
    params(filters),
    PARTNER_DETAIL_PAGE_SIZE,
  );

export const fetchPartnerProfile = (tenantId: string) =>
  apiGet<PartnerProfile>(`${base(tenantId)}/profile`);

export const fetchPartnerBilling = (tenantId: string) =>
  apiGet<PartnerBilling>(`${base(tenantId)}/billing`);

export const fetchPartnerCommission = (tenantId: string) =>
  apiGet<PartnerCommission>(`${base(tenantId)}/commission`);

export const fetchPartnerActivity = (
  tenantId: string,
  filters: PartnerActivityFilters,
): Promise<Paged<PartnerActivity>> =>
  fetchPage<PartnerActivity>(
    `${base(tenantId)}/activity`,
    params(filters),
    PARTNER_DETAIL_PAGE_SIZE,
  );

export const fetchPartnerSupportSessions = (
  tenantId: string,
  filters: { page?: number },
): Promise<Paged<PartnerSupportSession>> =>
  fetchPage<PartnerSupportSession>(
    `${base(tenantId)}/support-sessions`,
    params(filters),
    PARTNER_DETAIL_PAGE_SIZE,
  );
