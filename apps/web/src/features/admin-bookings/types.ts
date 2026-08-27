import type { components } from '@xeprime/types';

/** Type đơn thuê toàn hệ thống (admin nền tảng) lấy từ contract OpenAPI (ADR 0007). */
type Schemas = components['schemas'];

export type AdminBooking = Schemas['PlatformBookingDto'];
export type AdminBookingDetail = Schemas['PlatformBookingDetailDto'];
export type BookingContact = Schemas['BookingContactDto'];

/** Filter danh sách đơn — ở URL searchParams (ADR 0004). */
export interface AdminBookingFilters {
  q?: string;
  phone?: string;
  tenantId?: string;
  vehicleId?: string;
  status?: string;
  dateField?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}
