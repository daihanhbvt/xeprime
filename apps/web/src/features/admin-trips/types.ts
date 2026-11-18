import type { components, PlatformTripBookingQueue, PlatformTripRequestQueue } from '@xeprime/types';

/** Type vận hành chuyến (admin nền tảng) lấy từ contract OpenAPI (ADR 0007). */
type Schemas = components['schemas'];

export type TripSummary = Schemas['PlatformTripSummaryDto'];
export type TripQueueCount = Schemas['PlatformTripQueueCountDto'];
export type TripRequest = Schemas['PlatformTripRequestDto'];
export type TripRemindResult = Schemas['PlatformTripRemindResultDto'];
/** Dòng đơn trong hai hàng đợi "trong chuyến" — cùng DTO với danh sách đơn thuê toàn hệ thống. */
export type TripBooking = Schemas['PlatformBookingDto'];
/** Dòng của hàng đợi TÀI XẾ — dòng đơn chuẩn kèm vấn đề tài xế và mốc của nó. */
export type TripDriver = Schemas['PlatformTripDriverDto'];

/** Bộ lọc của MỘT hàng đợi — ở URL searchParams (ADR 0004); đổi hàng đợi là bỏ hết. */
export interface TripQueueFilters {
  q?: string;
  tenantId?: string;
  page?: number;
  limit?: number;
}

/**
 * Bỏ trống `queue` = CẢ HAI chặng trước khi có đơn (tab "Chưa giữ chỗ" của Đơn thuê toàn hệ
 * thống), server xếp theo hạn của chặng mỗi dòng.
 */
export interface TripRequestFilters extends TripQueueFilters {
  queue?: PlatformTripRequestQueue;
  /** Tra CHÍNH XÁC SĐT khách. */
  phone?: string;
}

export interface TripBookingFilters extends TripQueueFilters {
  queue: PlatformTripBookingQueue;
}

/** Hàng đợi tài xế không có tham số `queue` — endpoint riêng. */
export type TripDriverFilters = TripQueueFilters;
